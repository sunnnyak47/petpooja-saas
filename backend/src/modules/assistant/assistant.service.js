/**
 * @fileoverview Read-only AI assistant orchestrator (Phase 1).
 *
 * Flow: pick ONE read tool for the question → run it (scoped to the user's
 * outlet + permissions) → compose a grounded answer from the tool's data.
 * The LLM only chooses a tool and phrases the answer; it never touches the DB,
 * never invents numbers, and can only call tools the user is allowed to use.
 * A deterministic keyword router + per-tool summarizer make it work with no LLM.
 *
 * @module modules/assistant/assistant.service
 */

const { callLLM } = require('../../utils/llm');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { TOOLS, SUGGESTIONS } = require('./assistant.tools');
const xport = require('./assistant.export');
const actions = require('./assistant.actions');
const alertsModule = require('./assistant.alerts');
const mail = require('../../utils/mail.service');
const guard = require('./assistant.guard');
const lang = require('./assistant.lang');
const reason = require('./assistant.reason');
const docs = require('./assistant.docs');
const metric = require('./assistant.metric');
const { CORES } = require('./assistant.querybank');

/** Attach the outlet's currency + name to the user context (for money formatting). */
async function resolveOutletContext(userCtx) {
  userCtx.currency = 'AUD';
  if (!userCtx.outletId) return userCtx;
  try {
    const o = await getDbClient().outlet.findUnique({ where: { id: userCtx.outletId }, select: { currency: true, name: true, head_office_id: true } });
    if (o) { userCtx.currency = o.currency || 'AUD'; userCtx.outletName = o.name; userCtx.headOfficeId = o.head_office_id || null; }
  } catch (err) {
    logger.warn('assistant: could not resolve outlet currency', { error: err.message });
  }
  return userCtx;
}

/**
 * Tools this user may use — mirrors rbac.middleware.hasPermission exactly:
 * super_admin and owner bypass; everyone else needs the permission key.
 */
function allowedTools(userCtx) {
  const role = userCtx.role;
  const perms = Array.isArray(userCtx.permissions) ? userCtx.permissions : [];
  return TOOLS.filter((t) => {
    if (!t.permission) return true;
    if (role === 'super_admin' || role === 'owner') return true;
    return perms.includes(t.permission);
  });
}

/**
 * Deterministic keyword router used when the LLM is unavailable.
 * Multi-word keywords score higher (a 2-word match like "sold today" is more
 * specific than a bare "sales"), which disambiguates overlapping topics.
 */
/** Levenshtein-distance-1 check (single-typo tolerance for OOV words). */
function within1(a, b) {
  if (a === b) return true;
  const la = a.length; const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i += 1;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
  const [sh, lo] = la < lb ? [a, b] : [b, a];
  return sh.slice(i) === lo.slice(i + 1);
}

function keywordSelect(question, toolList) {
  const q = String(question || '').toLowerCase();
  // Typo tolerance: question words that appear NOWHERE in any tool's keyword
  // vocabulary are treated as possible typos and fuzzy-matched (edit distance 1)
  // against keyword words. Real vocabulary words never fuzz, so exact scoring
  // is untouched — this only rescues queries like "sel todya" / "custmer".
  const qWords = [...new Set(q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4))];
  const vocab = new Set();
  for (const t of toolList) for (const k of (t.keywords || [])) for (const w of String(k).split(/\s+/)) vocab.add(w);
  // A plural/singular variant of a known word is NOT a typo ("alerts" vs
  // "alert") — fuzzing those would let one tool's vocabulary steal another's.
  const oov = qWords.filter((w) => !vocab.has(w) && !vocab.has(w.endsWith('s') ? w.slice(0, -1) : `${w}s`));

  let best = null;
  let bestScore = 0;
  for (const t of toolList) {
    let score = 0;
    const kwWords = new Set();
    for (const k of (t.keywords || [])) {
      if (q.includes(k)) score += String(k).trim().split(/\s+/).length;
      for (const w of String(k).split(/\s+/)) if (w.length >= 5) kwWords.add(w);
    }
    for (const term of oov) {
      // Typos virtually never alter the FIRST letter ('todya','custmer','runing');
      // requiring it blocks filler-word fuzzing like 'there'→'where'.
      for (const w of kwWords) { if (term[0] === w[0] && within1(term, w)) { score += 1; break; } }
    }
    if (score > bestScore) { bestScore = score; best = t.name; }
  }
  return bestScore > 0 ? best : null;
}

// ── Conversation memory ──────────────────────────────────────────────────────
const HISTORY_MAX_TURNS = 6;   // keep the last 3 exchanges
const HISTORY_MAX_LEN = 500;   // clamp each turn's text

/**
 * Normalize client-supplied chat history into a bounded, trusted shape:
 * [{ role:'user'|'assistant', text, tool? }]. Accepts {role:'bot'} and
 * {content} aliases; drops anything malformed. Never throws.
 * @param {any} history
 * @returns {{role:string,text:string,tool?:string}[]}
 */
function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const h of history) {
    if (!h || typeof h !== 'object') continue;
    let role = h.role;
    if (role === 'bot') role = 'assistant';
    if (role !== 'user' && role !== 'assistant') continue;
    const raw = typeof h.text === 'string' ? h.text : (typeof h.content === 'string' ? h.content : '');
    const text = raw.trim().slice(0, HISTORY_MAX_LEN);
    if (!text) continue;
    const e = { role, text };
    if (typeof h.tool === 'string' && h.tool) e.tool = h.tool;
    out.push(e);
  }
  return out.slice(-HISTORY_MAX_TURNS);
}

/** Render normalized history as a prompt preamble (empty string when none). */
function historyText(history) {
  const h = normalizeHistory(history);
  if (!h.length) return '';
  const lines = h.map((e) => `${e.role === 'user' ? 'Owner' : 'Assistant'}: ${e.text}`).join('\n');
  return `CONVERSATION SO FAR:\n${lines}\n\n`;
}

/** True for elliptical follow-ups ("what about last month?", "and yesterday?"). */
function isFollowup(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return false;
  if (/^(what about|how about|and\b|also\b|then\b|same for|what of|ok\b|okay\b|now\b|what if)/.test(s)) return true;
  return s.split(/\s+/).length <= 3; // short elliptical phrases
}

/** The tool used in the most recent assistant turn, if it's still allowed. */
function lastToolFromHistory(history, toolList) {
  const h = normalizeHistory(history);
  const names = new Set(toolList.map((t) => t.name));
  for (let i = h.length - 1; i >= 0; i -= 1) {
    if (h[i].role === 'assistant' && h[i].tool && names.has(h[i].tool)) return h[i].tool;
  }
  return null;
}

/** Choose a tool (LLM first, keyword fallback). Returns a tool name or null. */
async function selectTool(question, toolList, history = []) {
  const catalog = toolList.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const sys = [
    'You route a restaurant owner\'s question to exactly ONE tool from the list, or null.',
    'The owner types casually, briefly, with typos, slang or vague wording — INFER the underlying intent; never require exact keywords.',
    'Questions about HOW to do something in the app ("how do I…", "where is…", "how to…") go to "help_howto".',
    'Use the CONVERSATION SO FAR (if present) to resolve follow-ups like "what about last month?" or "and non-veg?" — infer the intent from the previous turns and route to the tool that answers it.',
    'Only return null for greetings, thanks, or clearly off-topic chit-chat.',
    'If the question is clearly about their business but you are unsure which tool fits best, choose "finance_summary" (the overall health overview) rather than null.',
    'Pick only a tool name that appears in the list. Do not invent tools.',
    'Examples: "how much did we sell today" → sales_today · "hows business" / "am i doin ok" → finance_summary · "what will tomrw be like" → sales_forecast · "how many non veg" → menu_overview · "who owes me money" → finance_summary · "whats runnin low" → low_stock · "my best regulars" → top_customers · "any orders open right now" / "whats cooking" → active_orders · "close the day" / "cash in drawer" → eod_summary · "how much did i pay staff" / "super this run" → payroll_summary · "anything suspicious" / "void abuse" → fraud_alerts · "who worked this week" / "staff hours" → staff_hours · "how do i split a bill" / "where do i 86 an item" → help_howto · "hi there" → null.',
    guard.GUARD_SYSTEM,
    'Respond as strict JSON: {"tool": "<tool name or null>"}',
  ].join('\n');
  const safeQ = guard.sanitizeForPrompt(question).text;
  try {
    const out = await callLLM(sys, `${historyText(history)}TOOLS:\n${catalog}\n\nQUESTION: ${safeQ}`);
    const t = out ? out.tool : undefined;
    if (t === null) return null;
    if (typeof t === 'string' && toolList.some((x) => x.name === t)) return t;
  } catch (err) {
    logger.warn('assistant: tool selection LLM failed, using keywords', { error: err.message });
  }
  // Deterministic fallback. If keywords match nothing but this reads as a
  // follow-up, reuse the previous turn's tool so the thread stays on topic.
  const kw = keywordSelect(question, toolList);
  if (kw) return kw;
  if (isFollowup(question)) {
    const prev = lastToolFromHistory(history, toolList);
    if (prev) return prev;
  }
  return null;
}

/** Compose the final answer grounded in the tool's data (LLM, else summarize). */
async function compose(question, tool, data, history = []) {
  const sys = [
    'You are a warm, helpful restaurant back-office assistant.',
    'Answer ONLY using facts/numbers present in DATA. NEVER invent or estimate anything not in DATA.',
    'Be concise and friendly: 1-3 short sentences, plain language, no jargon, no markdown. Include the currency where money is shown.',
    'DATA often holds more than the exact question asks — use whatever fields are relevant to give the most useful answer (e.g. if asked "how many non-veg items", read the non_veg count).',
    'A CONVERSATION SO FAR may precede the question — use it to interpret a follow-up, but still answer ONLY from DATA.',
    'If DATA truly does not contain what was asked, say so in ONE friendly line and offer a closely related fact you CAN see from the same DATA.',
    guard.GUARD_SYSTEM,
    // Multilingual: answer in the owner's requested language, numbers/names intact.
    lang.detect(question) ? `Respond ONLY in ${lang.detect(question)}. Keep every number, currency amount and name exactly as it appears in DATA.` : null,
    'Respond as strict JSON: {"answer": "<your answer>"}',
  ].filter(Boolean).join('\n');
  const safeQ = guard.sanitizeForPrompt(question).text;
  try {
    const out = await callLLM(sys, `${historyText(history)}QUESTION: ${safeQ}\n\nDATA:\n${JSON.stringify(data)}`);
    if (out && typeof out.answer === 'string' && out.answer.trim()) {
      const answer = out.answer.trim();
      // Anti-hallucination: if the model's answer contains a significant number
      // that isn't in DATA, don't trust it — fall back to the grounded summary.
      if (guard.isGrounded(answer, data)) return { answer, source: 'ai' };
      logger.warn('assistant: ungrounded LLM answer, using summarizer', { tool: tool && tool.name });
    }
  } catch (err) {
    logger.warn('assistant: compose LLM failed, using summarizer', { error: err.message });
  }
  return { answer: tool.summarize(data, question), source: 'rules' };
}

/**
 * Generate a report and EMAIL it to the requesting user's own address (never a
 * third party — the recipient is always req.user's email on file). Reuses the
 * export generator + the transactional mail service. Returns a chat result.
 */
async function emailReport(userCtx, question, intent) {
  let user = null;
  try { user = await getDbClient().user.findUnique({ where: { id: userCtx.id }, select: { email: true, full_name: true } }); }
  catch (_) { user = null; }
  const to = user && user.email;
  const moduleLabel = xport.MODULE_LABEL[intent.module] || 'report';
  if (!to) {
    return { answer: `I don't have an email address on file for your account, so I can't email it — but you can download it: just ask me to "download the ${moduleLabel} report".`, source: 'email', tool: 'email_report', suggestions: SUGGESTIONS };
  }
  const { from, to: rangeTo, label } = xport.parseDateRange(question);
  // Default emailed reports to a readable PDF unless the user named a format.
  const fmt = /\b(csv|excel|xlsx|xls|spreadsheet|pdf)\b/.test(String(question).toLowerCase()) ? intent.format : 'pdf';
  try {
    const file = await xport.generate(
      { outletId: userCtx.outletId, module: intent.module, from, to: rangeTo, format: fmt, currency: userCtx.currency || 'AUD' },
      userCtx.outletName,
      new Date().toISOString().slice(0, 16).replace('T', ' '),
    );
    await mail.sendMail({
      to,
      subject: `${moduleLabel} report — ${from} to ${rangeTo}`,
      text: `Hi${user.full_name ? ` ${user.full_name.split(' ')[0]}` : ''},\n\nAttached is your ${moduleLabel} report for ${label} (${from} to ${rangeTo}).\n\n— MS-RM Assistant`,
      attachments: [{ filename: file.filename, content: file.body, contentType: file.contentType }],
    });
    return { answer: `Done — I've emailed the ${moduleLabel} report for ${label} (${from} to ${rangeTo}) to ${to}.`, source: 'email', tool: 'email_report', suggestions: SUGGESTIONS };
  } catch (err) {
    logger.error('assistant: email report failed', { error: err.message });
    return { answer: "I couldn't email that just now — please try downloading it instead.", source: 'email', tool: 'email_report', suggestions: SUGGESTIONS };
  }
}

// Greetings / pleasantries — answered warmly, NOT turned into "did you mean".
const GREETING_RE = /^\s*(hi+|hey+|hello|yo|sup|thanks|thank you|thankyou|cheers|good (morning|afternoon|evening|day)|namaste|ok|okay)\b/i;

/** Capitalize + ensure a trailing question mark, for a suggestion chip label. */
function asQuestion(s) {
  const t = String(s || '').trim();
  if (!t) return t;
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return /[?.!]$/.test(c) ? c : `${c}?`;
}

/**
 * When the router is UNSURE (no confident tool), rank the user's ALLOWED tools by
 * a soft token overlap with their keywords/description and return the top N as
 * "did you mean" options (a canonical example question each, from the querybank).
 * Zero signal → falls back to the natural tool order (sensible defaults).
 */
function suggestTools(question, toolList, n = 3) {
  const q = String(question || '').toLowerCase();
  const qtokens = [...new Set(q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3))];
  const scored = toolList
    .filter((t) => t.name !== 'help_howto')
    .map((t) => {
      const hay = `${(t.keywords || []).join(' ')} ${t.description}`.toLowerCase();
      let s = 0;
      for (const tok of qtokens) if (hay.includes(tok)) s += 1;
      return { name: t.name, s };
    })
    .sort((a, b) => b.s - a.s);
  const out = [];
  for (const x of scored) {
    const ex = CORES[x.name] && CORES[x.name][0];
    if (ex) out.push({ label: asQuestion(ex), query: ex });
    if (out.length >= n) break;
  }
  return out;
}

/** Friendly capabilities message (null-tool path / when nothing matches). */
function helpAnswer(toolList) {
  const caps = toolList.map((t) => `• ${t.description}`).join('\n');
  return `I can answer questions about your live data — read-only, I can't change anything. For example:\n${caps}\nTry asking one of those, or ask me "how am I doing this month?"`;
}

/**
 * Answer a question for the given user, scoped to their outlet + permissions.
 * @param {{ id: string, role: string, outletId: string|null, permissions: string[] }} userCtx
 * @param {string} question
 * @returns {Promise<{ answer: string, source: string, tool: string|null, suggestions: string[] }>}
 */
/**
 * Best-effort audit of an assistant READ (mirrors the write-action audit). Never
 * blocks or breaks the response; the question is PII-redacted + truncated.
 */
function auditAsk(userCtx, question, result) {
  try {
    if (!userCtx || !userCtx.outletId) return;
    const s = guard.sanitizeForPrompt(question);
    getDbClient().auditLog.create({
      data: {
        user_id: userCtx.id || null,
        outlet_id: userCtx.outletId,
        action: 'ASSISTANT_ASK',
        entity_type: 'assistant',
        entity_id: null, // reads have no entity UUID; tool/source live in new_values
        new_values: {
          tool: (result && result.tool) || null,
          source: (result && result.source) || null,
          question: guard.redactPII(s.text).slice(0, 200),
          injection_flagged: s.flagged,
        },
      },
    }).catch(() => {});
  } catch (_) { /* audit is best-effort */ }
}

async function ask(userCtx, question, history = []) {
  const result = await answer(userCtx, question, history);
  auditAsk(userCtx, question, result); // fire-and-forget
  return result;
}

async function answer(userCtx, question, history = []) {
  const hist = normalizeHistory(history);
  // Export short-circuit: if the user is asking to download a report (EOD / P&L /
  // sales) and may view reports, hand back a signed download link instead of text.
  const canReport =
    userCtx.role === 'super_admin' ||
    userCtx.role === 'owner' ||
    (Array.isArray(userCtx.permissions) && userCtx.permissions.includes('VIEW_REPORTS'));
  // Email short-circuit: "email me the P&L" → generate + email the report to the
  // user's OWN address (checked before the download short-circuit so an email
  // request sends a file rather than returning a link).
  const ql = String(question).toLowerCase();
  const emailIntent = /\bemail\b/.test(ql) || /\be-mail\b/.test(ql) || /\bmail (me|it|this|the|my)\b/.test(ql) || /to my (email|inbox)/.test(ql);
  if (canReport && userCtx.outletId && emailIntent) {
    const intent = xport.detectExport(`export ${question}`); // prefix a file verb so the module resolves
    if (intent) {
      await resolveOutletContext(userCtx);
      return emailReport(userCtx, question, intent);
    }
  }

  if (canReport && userCtx.outletId && xport.detectExport(question)) {
    await resolveOutletContext(userCtx);
    const download = xport.buildDescriptor({ outletId: userCtx.outletId, currency: userCtx.currency }, question);
    if (download) {
      return {
        answer: `Here's your ${download.module_label} report for ${download.range_label} (${download.from} to ${download.to}) as ${download.format.toUpperCase()}. Tap Download to save it.`,
        source: 'export',
        tool: 'export_report',
        download,
        suggestions: SUGGESTIONS,
      };
    }
  }

  // Write-action short-circuit (Phase 2 agentic). If the question is a write
  // intent ("86 the paneer tikka", "set table 5 clean") — or a pronoun follow-up
  // to one ("change it by 10%") — return a PREVIEW + signed token and wait for
  // confirmation; never mutate on this turn.
  if ((actions.detectAction(question) || actions.inferPronounAction(question)) && userCtx.outletId) {
    await resolveOutletContext(userCtx);
    // Batch first: a compound message with 2+ write actions ("86 X and set Y
    // price to 12") returns ONE combined preview + one token. Falls through to
    // the single-action path (UNCHANGED) when it's just one action. History lets
    // a pronoun sub-action resolve off the previous turn.
    const batch = await actions.buildBatchPreview(userCtx, question, hist);
    if (batch) {
      const list = batch.items.map((it, i) => `${i + 1}) ${it.summary}`).join(' ');
      return {
        answer: `I'll do these ${batch.items.length} things: ${list}. Shall I go ahead?`,
        source: 'action_preview',
        tool: null,
        action: { name: 'batch', token: batch.token, summary: batch.summary, warn: !!batch.warn, items: batch.items },
        requires_confirmation: true,
        suggestions: SUGGESTIONS,
      };
    }
    const preview = await actions.buildActionPreview(userCtx, question, hist);
    if (preview) {
      if (preview.denied) return { answer: preview.message, source: 'denied', tool: null, suggestions: SUGGESTIONS };
      if (preview.clarify) return { answer: preview.message, source: 'clarify', tool: null, suggestions: SUGGESTIONS };
      return {
        answer: `${preview.summary}. Shall I go ahead?`,
        source: 'action_preview',
        tool: null,
        action: { name: preview.action, token: preview.token, summary: preview.summary, warn: !!preview.warn },
        requires_confirmation: true,
        suggestions: SUGGESTIONS,
      };
    }
  }

  // Multi-tool reasoning: "why did profit drop", "this month vs last month" — fan
  // out across several read tools and synthesize ONE grounded answer. Returns null
  // (→ single-tool path below) unless it's a genuine multi-part/causal question.
  if (userCtx.outletId && reason.detectMultiIntent(question)) {
    await resolveOutletContext(userCtx);
    const multi = await reason.answerMulti(userCtx, question, hist, allowedTools(userCtx));
    if (multi) return multi;
  }

  const toolList = allowedTools(userCtx);
  const toolName = await selectTool(question, toolList, hist);

  if (!toolName) {
    // Text-to-metric: a "<metric> by <breakdown>" question the fixed tools don't
    // cover (e.g. "revenue by channel last week") — compute it safely + grounded.
    if (userCtx.outletId) {
      const mspec = metric.detectMetricQuery(question);
      if (mspec) {
        await resolveOutletContext(userCtx);
        const m = await metric.answerMetric(userCtx, question, mspec);
        if (m) return { ...m, suggestions: SUGGESTIONS };
      }
    }
    // Custom-knowledge RAG: before giving up, try the owner's OWN documents
    // (SOPs / policies they've added) and answer with a citation if relevant.
    if (userCtx.outletId && !GREETING_RE.test(question)) {
      const fromDocs = await docs.answerFromDocs(userCtx, question);
      if (fromDocs) return { ...fromDocs, suggestions: SUGGESTIONS };
    }
    // Low confidence (router unsure) on a non-greeting → offer "did you mean"
    // options instead of a wall of capabilities. Selecting one re-asks it.
    if (!GREETING_RE.test(question)) {
      const options = suggestTools(question, toolList, 3);
      if (options.length) {
        return {
          answer: "I'm not quite sure what you're after — did you mean one of these?",
          source: 'suggest',
          tool: null,
          clarify: { options },
          suggestions: SUGGESTIONS,
        };
      }
    }
    return { answer: helpAnswer(toolList), source: 'rules', tool: null, suggestions: SUGGESTIONS };
  }

  const tool = toolList.find((t) => t.name === toolName);
  await resolveOutletContext(userCtx);

  // Clarify-before-read: if the chosen tool needs a detail the question didn't
  // give (e.g. WHICH customer), ask for it — with tappable options — instead of
  // guessing or searching an empty string. Read tools opt in via tool.clarify().
  if (typeof tool.clarify === 'function') {
    let clarification = null;
    try { clarification = await tool.clarify(userCtx, question); }
    catch (err) { logger.warn('assistant: clarify check failed', { tool: toolName, error: err.message }); }
    if (clarification && clarification.message) {
      return {
        answer: clarification.message,
        source: 'clarify',
        tool: toolName,
        clarify: { options: Array.isArray(clarification.options) ? clarification.options : [] },
        suggestions: SUGGESTIONS,
      };
    }
  }

  let data;
  try {
    data = await tool.run(userCtx, question);
  } catch (err) {
    logger.error('assistant: tool run failed', { tool: toolName, error: err.message });
    return { answer: "I couldn't fetch that just now — please try again in a moment.", source: 'error', tool: toolName, suggestions: SUGGESTIONS };
  }

  const { answer, source } = await compose(question, tool, data, hist);
  return { answer, source, tool: toolName, suggestions: SUGGESTIONS };
}

/**
 * Confirm + execute a previously previewed write action.
 * @param {object} userCtx  same shape as ask()'s userCtx
 * @param {string} token     the signed action token from the preview
 * @returns {Promise<{answer:string, source:string, done:boolean}>}
 */
async function confirmAction(userCtx, token) {
  await resolveOutletContext(userCtx);
  const res = await actions.runAction(userCtx, token);
  const out = { answer: res.message, source: res.ok ? 'action_done' : 'action_error', done: res.ok };
  // Batch confirmations carry a per-item breakdown; surface it to the client.
  if (Array.isArray(res.results)) out.results = res.results;
  return out;
}

/**
 * Proactive alerts for the user's outlet (severity-sorted). Read-only.
 * @param {object} userCtx  same shape as ask()'s userCtx
 * @returns {Promise<Array>}
 */
async function alerts(userCtx) {
  if (!userCtx.outletId) return [];
  await resolveOutletContext(userCtx); // for currency (region) + name
  return alertsModule.computeAlerts(userCtx);
}

module.exports = { ask, confirmAction, alerts, allowedTools, keywordSelect, helpAnswer, normalizeHistory, isFollowup, lastToolFromHistory };
