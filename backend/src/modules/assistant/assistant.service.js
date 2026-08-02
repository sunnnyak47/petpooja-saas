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

/** Attach the outlet's currency + name to the user context (for money formatting). */
async function resolveOutletContext(userCtx) {
  userCtx.currency = 'AUD';
  if (!userCtx.outletId) return userCtx;
  try {
    const o = await getDbClient().outlet.findUnique({ where: { id: userCtx.outletId }, select: { currency: true, name: true } });
    if (o) { userCtx.currency = o.currency || 'AUD'; userCtx.outletName = o.name; }
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
    'Respond as strict JSON: {"tool": "<tool name or null>"}',
  ].join('\n');
  try {
    const out = await callLLM(sys, `${historyText(history)}TOOLS:\n${catalog}\n\nQUESTION: ${question}`);
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
    'Respond as strict JSON: {"answer": "<your answer>"}',
  ].join('\n');
  try {
    const out = await callLLM(sys, `${historyText(history)}QUESTION: ${question}\n\nDATA:\n${JSON.stringify(data)}`);
    if (out && typeof out.answer === 'string' && out.answer.trim()) {
      return { answer: out.answer.trim(), source: 'ai' };
    }
  } catch (err) {
    logger.warn('assistant: compose LLM failed, using summarizer', { error: err.message });
  }
  return { answer: tool.summarize(data, question), source: 'rules' };
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
async function ask(userCtx, question, history = []) {
  const hist = normalizeHistory(history);
  // Export short-circuit: if the user is asking to download a report (EOD / P&L /
  // sales) and may view reports, hand back a signed download link instead of text.
  const canReport =
    userCtx.role === 'super_admin' ||
    userCtx.role === 'owner' ||
    (Array.isArray(userCtx.permissions) && userCtx.permissions.includes('VIEW_REPORTS'));
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

  const toolList = allowedTools(userCtx);
  const toolName = await selectTool(question, toolList, hist);

  if (!toolName) {
    return { answer: helpAnswer(toolList), source: 'rules', tool: null, suggestions: SUGGESTIONS };
  }

  const tool = toolList.find((t) => t.name === toolName);
  await resolveOutletContext(userCtx);
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

module.exports = { ask, allowedTools, keywordSelect, helpAnswer, normalizeHistory, isFollowup, lastToolFromHistory };
