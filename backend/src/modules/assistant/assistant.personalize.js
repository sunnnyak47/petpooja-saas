/**
 * @fileoverview Personalization shortcuts. Turns a user's OWN assistant history
 * into quick re-ask chips: the questions they ask most and that the assistant
 * actually answered (a real tool ran). Powers the clarify.options chip UI so a
 * returning user can re-run "what were sales today" with one tap instead of
 * retyping it.
 *
 * Privacy + grounding: reads only the caller's own ASSISTANT_ASK audit rows
 * (user_id scoped, and outlet-scoped when a ctx.outletId is given). It re-uses
 * the SAME answered/miss/error taxonomy as the usage miner (assistant.insights
 * classify) so a question only becomes a shortcut when it was genuinely handled
 * — misses ("did you mean…"), help fallbacks, errors and injection-flagged
 * prompts are never re-surfaced.
 *
 * @module modules/assistant/assistant.personalize
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { classify } = require('./assistant.insights');

/** Frequency key: case- and whitespace-insensitive so "Sales today" == "sales  today". */
function normalizeKey(q) {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Chip label: the question with its first letter capitalised (question-cased). */
function labelCase(q) {
  const s = String(q || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Only ANSWERED asks that ran a real tool are worth re-surfacing as a shortcut. */
function isAnsweredWithTool(nv) {
  if (!nv || nv.injection_flagged) return false;       // never re-suggest a flagged prompt
  if (!nv.tool) return false;                          // null-tool (help/suggest/clarify) → not a shortcut
  return classify(nv) === 'answered';                  // excludes source 'suggest' (miss) and 'error'
}

/**
 * The caller's most-frequent answered questions, ready for the clarify chip UI.
 * @param {{outletId?:string}} ctx  scopes to the outlet when provided
 * @param {{userId:string, days?:number, limit?:number, now?:Date|string, max?:number}} [opts]
 * @returns {Promise<Array<{label:string, query:string}>>} [] when no userId / on failure
 */
async function topQuestions(ctx = {}, opts = {}) {
  const userId = opts.userId;
  if (!userId) return [];
  const days = Number(opts.days) || 30;
  const limit = Math.max(1, Number(opts.limit) || 5);
  const to = opts.now ? new Date(opts.now) : new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);

  const where = { action: 'ASSISTANT_ASK', user_id: userId, created_at: { gte: from, lte: to } };
  if (ctx && ctx.outletId) where.outlet_id = ctx.outletId;

  let rows = [];
  try {
    rows = await getDbClient().auditLog.findMany({
      where, orderBy: { created_at: 'desc' }, take: opts.max || 2000,
      select: { new_values: true, created_at: true },
    });
  } catch (e) {
    logger.warn('assistant personalize query failed', { error: e.message });
    return [];
  }

  // Aggregate by normalized question; the first (most-recent, since rows are
  // desc) phrasing seen for a key becomes its display question.
  const agg = new Map(); // key -> { question, count }
  for (const r of rows) {
    const nv = r.new_values || {};
    if (!isAnsweredWithTool(nv)) continue;
    const q = String(nv.question || '').replace(/\s+/g, ' ').trim();
    const key = normalizeKey(q);
    if (!key) continue;
    const cur = agg.get(key);
    if (cur) cur.count += 1;
    else agg.set(key, { question: q, count: 1 });
  }

  // Rank by frequency; ties keep insertion order (most-recent first) because
  // both Map iteration and Array.sort are stable.
  return [...agg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((e) => ({ label: labelCase(e.question), query: e.question }));
}

module.exports = { topQuestions, isAnsweredWithTool, normalizeKey, labelCase };
