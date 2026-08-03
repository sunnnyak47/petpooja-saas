/**
 * @fileoverview Multi-tool reasoning for the assistant (agentic Phase).
 *
 * Most owner questions map to ONE read tool (assistant.service.selectTool). A
 * small, HIGH-VALUE minority need several tools stitched together:
 *   - DIAGNOSE  ("why is profit down?") — pull sales trend + top items + stock +
 *                wastage and let the model join the dots.
 *   - COMPARE   ("this week vs last week") — compute the two periods' figures and
 *                compare them.
 *
 * detectMultiIntent is deliberately NARROW: it fires only on an explicit WHY +
 * business-metric diagnosis, or an explicit period-vs-period comparison. It
 * returns null for greetings and for metric-vs-metric phrasings that name NO
 * period ("expenses vs revenue", "veg vs non-veg", "cash in vs cash out") — those
 * are single tools, handled by the normal router. When answerMulti returns null,
 * the orchestrator falls back to the single-tool path.
 *
 * Everything here is READ-ONLY, permission-scoped (it only ever runs tools from
 * the caller's already-allowed toolList) and grounded (the LLM's phrasing is kept
 * ONLY if guard.isGrounded passes against the gathered DATA, else we join the
 * per-tool deterministic summaries).
 *
 * @module modules/assistant/assistant.reason
 */

const { callLLM } = require('../../utils/llm');
const logger = require('../../config/logger');
const guard = require('./assistant.guard');
const reports = require('../reports/reports.service');

// ── formatting helpers (kept local so this module stays lightweight) ─────────────
const money = (cur, n) => {
  const c = cur || 'AUD';
  const locale = c === 'INR' ? 'en-IN' : 'en-AU';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)); }
  catch (_) { return `${c} ${Math.round(Number(n) || 0)}`; }
};
const num = (n) => Number(n) || 0;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

// ── Intent detection (NARROW) ────────────────────────────────────────────────────
// Greetings / pleasantries are never a multi-tool intent.
const GREETING_RE = /^\s*(hi+|hey+|hello|yo|sup|thanks|thank you|thankyou|cheers|good (morning|afternoon|evening|day)|namaste|ok|okay)\b/i;
// "why is profit/sales/... down/dropping/slow" — a business-health diagnosis.
const DIAGNOSE_RE = /\bwhy\b.*(profit|sales|revenue|takings|business|margin|orders|down|dropp?|fell|slow)/i;
// "... vs ...", "compared to ...", "against ..." — only a COMPARISON if it also
// names a period; a metric-vs-metric with no period is a single tool.
const COMPARE_VS_RE = /(vs\.?|versus|compared? (to|with)|against)/i;
const COMPARE_PERIOD_RE = /\b(this|last|previous|past)\s+(week|month|quarter|year)\b/i;

/**
 * Classify a question as a multi-tool intent, or null.
 * @param {string} question
 * @returns {('diagnose'|'compare'|null)}
 */
function detectMultiIntent(question) {
  const q = String(question || '');
  if (!q.trim()) return null;
  if (GREETING_RE.test(q)) return null;
  if (DIAGNOSE_RE.test(q)) return 'diagnose';
  // COMPARE needs BOTH a comparison word AND an explicit period — this is what
  // keeps "expenses vs revenue" / "veg vs non-veg" (no period) out.
  if (COMPARE_VS_RE.test(q) && COMPARE_PERIOD_RE.test(q)) return 'compare';
  return null;
}

// ── Tool planning ────────────────────────────────────────────────────────────────
/**
 * Choose the SET of tools to gather for a multi-intent question, drawn ONLY from
 * the caller's allowed toolList (so this is inherently permission-scoped). Returns
 * [] when none of the relevant tools are available to this user — the orchestrator
 * then degrades to the single-tool path.
 * @param {string} question
 * @param {Array} toolList  the user's ALREADY-ALLOWED tools
 * @param {Array} [history] normalized chat history (unused today; kept for parity)
 * @returns {Array} subset of toolList (max 4)
 */
function planTools(question, toolList, history) { // eslint-disable-line no-unused-vars
  const intent = detectMultiIntent(question);
  if (!intent || !Array.isArray(toolList) || !toolList.length) return [];
  const byName = new Map(toolList.map((t) => [t.name, t]));
  const q = String(question || '').toLowerCase();

  let names;
  if (intent === 'compare') {
    // Headline period figures come from comparePeriods; these add texture.
    names = ['finance_summary', 'top_items', 'sales_trend'];
  } else {
    // DIAGNOSE. Profit/margin questions lead with the money picture; pure
    // sales/orders questions lead with the trend.
    const profitFocus = /(profit|margin|business|takings)/.test(q);
    names = profitFocus
      ? ['finance_summary', 'sales_trend', 'top_items', 'low_stock', 'wastage']
      : ['sales_trend', 'top_items', 'low_stock', 'sales_today'];
  }

  const picked = [];
  for (const n of names) {
    const t = byName.get(n);
    if (t && !picked.includes(t)) picked.push(t);
    if (picked.length >= 4) break;
  }
  return picked;
}

// ── Tool execution (resilient) ────────────────────────────────────────────────────
/**
 * Run several tools concurrently, scoped to the user's outlet. Resilient: a tool
 * that rejects (or throws synchronously) is simply omitted from the result — the
 * others still return. Never throws.
 * @returns {Promise<Object<string, any>>} map of toolName → data (only successes)
 */
async function runTools(userCtx, question, tools) {
  const list = Array.isArray(tools) ? tools : [];
  const settled = await Promise.allSettled(
    list.map((t) => Promise.resolve().then(() => t.run(userCtx, question))),
  );
  const dataMap = {};
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value != null) dataMap[list[i].name] = r.value;
    else if (r.status === 'rejected') logger.warn('assistant.reason: tool failed', { tool: list[i] && list[i].name, error: r.reason && r.reason.message });
  });
  return dataMap;
}

// ── Period comparison ──────────────────────────────────────────────────────────────
const UNIT_DAYS = { week: 7, month: 30, quarter: 91, year: 365 };

function periodUnit(question) {
  const m = String(question || '').toLowerCase().match(/\b(this|last|previous|past)\s+(week|month|quarter|year)\b/);
  return (m && m[2]) || 'week';
}

/**
 * Compute revenue + orders for the current period and the immediately-preceding
 * period of the same length, and the deltas between them. Reuses the existing
 * reports.getRevenueTrendRange read (grounded). Returns null on any failure.
 */
async function comparePeriods(userCtx, question) {
  const unit = periodUnit(question);
  const span = UNIT_DAYS[unit] || 7;
  const now = new Date();
  const curFrom = addDays(now, -(span - 1));
  const prevTo = addDays(now, -span);
  const prevFrom = addDays(now, -(2 * span - 1));
  const currency = userCtx.currency || 'AUD';

  let curSeries; let prevSeries;
  try {
    [curSeries, prevSeries] = await Promise.all([
      reports.getRevenueTrendRange(userCtx.outletId, ymd(curFrom), ymd(now)),
      reports.getRevenueTrendRange(userCtx.outletId, ymd(prevFrom), ymd(prevTo)),
    ]);
  } catch (err) {
    logger.warn('assistant.reason: comparePeriods failed', { error: err.message });
    return null;
  }

  const sum = (s) => (Array.isArray(s) ? s : []).reduce(
    (a, d) => ({ revenue: a.revenue + num(d.revenue), orders: a.orders + num(d.orders) }),
    { revenue: 0, orders: 0 },
  );
  const cur = sum(curSeries);
  const prev = sum(prevSeries);
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    currency,
    unit,
    current: { from: ymd(curFrom), to: ymd(now), revenue: round2(cur.revenue), orders: cur.orders },
    previous: { from: ymd(prevFrom), to: ymd(prevTo), revenue: round2(prev.revenue), orders: prev.orders },
    revenue_change: round2(cur.revenue - prev.revenue),
    revenue_change_pct: pct(cur.revenue, prev.revenue),
    orders_change: cur.orders - prev.orders,
    orders_change_pct: pct(cur.orders, prev.orders),
  };
}

function summarizeComparison(c) {
  if (!c) return '';
  const cur = c.current || {};
  const prev = c.previous || {};
  let s = `This ${c.unit}: ${money(c.currency, cur.revenue)} from ${cur.orders} order${cur.orders === 1 ? '' : 's'}, vs ${money(c.currency, prev.revenue)} from ${prev.orders} the ${c.unit} before`;
  if (c.revenue_change_pct != null) {
    s += ` — revenue ${c.revenue_change >= 0 ? 'up' : 'down'} ${Math.abs(c.revenue_change_pct)}%`;
  }
  s += '.';
  return s;
}

// ── History preamble (self-contained; avoids a circular require of the service) ──
function historyPreamble(history) {
  if (!Array.isArray(history) || !history.length) return '';
  const lines = [];
  for (const h of history.slice(-6)) {
    if (!h || typeof h !== 'object') continue;
    let role = h.role === 'bot' ? 'assistant' : h.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const raw = typeof h.text === 'string' ? h.text : (typeof h.content === 'string' ? h.content : '');
    const text = raw.trim().slice(0, 500);
    if (!text) continue;
    lines.push(`${role === 'user' ? 'Owner' : 'Assistant'}: ${text}`);
  }
  return lines.length ? `CONVERSATION SO FAR:\n${lines.join('\n')}\n\n` : '';
}

// ── Grounded multi-tool composition ────────────────────────────────────────────────
/** Deterministic answer: period comparison line (if any) + each tool's own summary. */
function buildFallback(question, dataMap, toolList) {
  const parts = [];
  if (dataMap && dataMap.period_comparison) parts.push(summarizeComparison(dataMap.period_comparison));
  for (const t of (Array.isArray(toolList) ? toolList : [])) {
    if (!t || typeof t.summarize !== 'function') continue;
    const d = dataMap && dataMap[t.name];
    if (d == null) continue;
    try { const s = t.summarize(d, question); if (s) parts.push(String(s)); }
    catch (_) { /* one bad summarizer must not sink the whole answer */ }
  }
  return parts.join(' ');
}

/**
 * Compose ONE connected answer from the multi-tool DATA. LLM phrasing is accepted
 * ONLY if guard.isGrounded passes; otherwise (or with no LLM) we return the joined
 * deterministic summaries. Returns a string.
 */
async function composeMulti(question, dataMap, toolList, history) {
  const fallback = () => buildFallback(question, dataMap, toolList);
  if (!dataMap || !Object.keys(dataMap).length) return fallback();

  const sys = [
    'You are a warm, sharp restaurant back-office analyst.',
    'The owner asked a WHY / COMPARISON question. Use ALL the DATA sections together to give ONE connected, plain-language explanation — join the dots between the figures (e.g. sales trend + top items + low stock + wastage).',
    'Answer ONLY using facts/numbers present in DATA. NEVER invent or estimate anything not in DATA.',
    'Be concise: 2-4 short sentences, no jargon, no markdown. Include the currency where money is shown.',
    'If DATA does not clearly explain the cause, say what the figures DO show rather than guessing.',
    'A CONVERSATION SO FAR may precede the question — use it to interpret the question, but still answer ONLY from DATA.',
    guard.GUARD_SYSTEM,
    'Respond as strict JSON: {"answer": "<your answer>"}',
  ].join('\n');
  const safeQ = guard.sanitizeForPrompt(question).text;

  try {
    const out = await callLLM(sys, `${historyPreamble(history)}QUESTION: ${safeQ}\n\nDATA:\n${JSON.stringify(dataMap)}`);
    if (out && typeof out.answer === 'string' && out.answer.trim()) {
      const answer = out.answer.trim();
      if (guard.isGrounded(answer, dataMap)) return answer;
      logger.warn('assistant.reason: ungrounded multi answer, using summaries');
    }
  } catch (err) {
    logger.warn('assistant.reason: composeMulti LLM failed, using summaries', { error: err.message });
  }
  return fallback();
}

/**
 * Full multi-tool answer, or null to signal the single-tool fallback.
 * @returns {Promise<{answer:string,source:'multi',tool:string|null,tools:string[],suggestions:any[]}|null>}
 */
async function answerMulti(userCtx, question, history, toolList) {
  const intent = detectMultiIntent(question);
  if (!intent || !userCtx || !userCtx.outletId) return null;

  // Permission scoping: plan only from the user's allowed tools. Empty plan means
  // this user can't see the relevant data → let the normal router handle it.
  const tools = planTools(question, toolList, history);
  if (!tools.length) return null;

  const dataMap = await runTools(userCtx, question, tools);
  const usedTools = tools.filter((t) => dataMap[t.name] != null);

  // Period comparisons also need the two-period headline figures. Gated by the
  // non-empty plan above (the user has at least one revenue-capable tool).
  if (intent === 'compare') {
    const cmp = await comparePeriods(userCtx, question);
    if (cmp) dataMap.period_comparison = cmp;
  }

  if (!usedTools.length && !dataMap.period_comparison) return null;

  const answer = await composeMulti(question, dataMap, usedTools, history);
  if (!answer || !answer.trim()) return null;

  const primary = (usedTools[0] && usedTools[0].name) || (tools[0] && tools[0].name) || null;
  return {
    answer: answer.trim(),
    source: 'multi',
    tool: primary,
    tools: usedTools.map((t) => t.name),
    suggestions: [],
  };
}

module.exports = {
  detectMultiIntent,
  planTools,
  runTools,
  comparePeriods,
  composeMulti,
  answerMulti,
  // exported for reuse/testing
  summarizeComparison,
};
