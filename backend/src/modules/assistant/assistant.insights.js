/**
 * @fileoverview Assistant usage-learning loop (Item 7). Mines the privacy-safe
 * ASSISTANT_ASK audit rows (written by assistant.service — tool, source and a
 * PII-redacted question) to surface what the assistant is being asked and, most
 * importantly, the MISSES: questions it couldn't confidently answer.
 *
 * ── Fold-back path (how a mined miss becomes coverage) ───────────────────────
 * 1. Run the weekly report (GET /assistant/insights, or the Monday cron log).
 * 2. For each recurring entry in `top_misses`:
 *    - phrasing that SHOULD route to an existing tool → add it to
 *      assistant.querybank.js CORES[tool] (and a keyword on the tool if needed);
 *    - a how-to / troubleshooting question → add a KB entry in
 *      assistant.knowledge.js + a phrasing to tests/fixtures/…-question-banks.json.
 * 3. Re-run `npx jest assistant-coverage` (must stay 100%) and
 *    `npx jest assistant-bank-coverage` (gates hold). Commit.
 * This is the same loop the eval banks were built with — now fed by real traffic.
 *
 * @module modules/assistant/assistant.insights
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/** Classify one audit row's outcome from its new_values {tool, source}. */
function classify(nv) {
  const source = nv && nv.source;
  const tool = nv && nv.tool;
  if (source === 'error') return 'error';
  if (source === 'suggest') return 'miss';           // router was unsure → "did you mean"
  if (!tool && (source === 'rules' || source == null)) return 'miss'; // help/capabilities fallback
  return 'answered';                                  // a tool/export/email/action/clarify handled it
}

function normalizeQ(q) {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

function emptyReport(from, to, days) {
  return { period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days },
    total: 0, answered: 0, misses_count: 0, errors: 0, miss_rate: 0, top_misses: [], by_tool: [], injection_flagged: 0 };
}

/**
 * Aggregate assistant usage over the last N days.
 * @param {{outletId?:string}} ctx  omit outletId to mine ALL outlets (weekly cron)
 * @param {{days?:number, now?:Date|string, limit?:number}} [opts]
 */
async function mineUsage(ctx = {}, opts = {}) {
  const days = Number(opts.days) || 7;
  const to = opts.now ? new Date(opts.now) : new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  const where = { action: 'ASSISTANT_ASK', created_at: { gte: from, lte: to } };
  if (ctx && ctx.outletId) where.outlet_id = ctx.outletId;

  let rows = [];
  try {
    rows = await getDbClient().auditLog.findMany({
      where, orderBy: { created_at: 'desc' }, take: opts.limit || 5000,
      select: { new_values: true, created_at: true },
    });
  } catch (e) {
    logger.warn('assistant insights query failed', { error: e.message });
    return emptyReport(from, to, days);
  }

  let answered = 0; let miss = 0; let error = 0; let flagged = 0;
  const byTool = {}; const missQ = {};
  for (const r of rows) {
    const nv = r.new_values || {};
    const cls = classify(nv);
    if (cls === 'answered') { answered += 1; if (nv.tool) byTool[nv.tool] = (byTool[nv.tool] || 0) + 1; }
    else if (cls === 'error') { error += 1; }
    else { miss += 1; const k = normalizeQ(nv.question); if (k) missQ[k] = (missQ[k] || 0) + 1; }
    if (nv.injection_flagged) flagged += 1;
  }
  const total = rows.length;
  return {
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days },
    total, answered, misses_count: miss, errors: error,
    miss_rate: total ? Math.round((miss / total) * 1000) / 10 : 0,
    top_misses: Object.entries(missQ).map(([question, count]) => ({ question, count })).sort((a, b) => b.count - a.count).slice(0, 50),
    by_tool: Object.entries(byTool).map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
    injection_flagged: flagged,
  };
}

module.exports = { mineUsage, classify, normalizeQ };
