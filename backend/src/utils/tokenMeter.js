/**
 * @fileoverview LLM token accounting — captures the token `usage` every provider
 * returns, attributes it to the current request's outlet/user via AsyncLocalStorage
 * (so callers don't have to thread metadata), and aggregates today / month / total
 * with a rough cost estimate. Read via snapshot() and surfaced at GET /assistant/usage.
 *
 * Storage: in-memory is the live truth during the process; a debounced flush mirrors
 * each outlet's aggregate into the existing OutletSetting KV table (key
 * `assistant_token_usage`) so counts survive restarts — migration-free, matching
 * assistant.docs. All DB access is best-effort and guarded (metering never breaks a chat).
 * @module utils/tokenMeter
 */

const { AsyncLocalStorage } = require('async_hooks');
const logger = require('../config/logger');

const als = new AsyncLocalStorage();
const SETTING_KEY = 'assistant_token_usage';
const FLUSH_MS = 15000;

// ── attribution context ──────────────────────────────────────────────────────
/** Run `fn` with an attribution context ({ outletId, userId, feature }) in scope. */
function withContext(ctx, fn) { return als.run({ ...ctx }, fn); }
/** Express middleware: attribute every LLM call in this request to req.user's outlet. */
function contextMiddleware(req, _res, next) {
  const outletId = (req.query && req.query.outlet_id) || (req.body && req.body.outlet_id) || (req.user && req.user.outlet_id) || null;
  als.run({ outletId, userId: req.user && req.user.id, feature: 'assistant' }, next);
}
function currentContext() { return als.getStore() || {}; }

// ── pricing (rough, for a "cost so far" display; override via TOKEN_PRICES_JSON) ─
// $ per 1,000,000 tokens.
const DEFAULT_PRICES = {
  'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 },
  'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
  default: { in: 0.50, out: 0.75 },
};
function prices() {
  if (process.env.TOKEN_PRICES_JSON) {
    try { return { ...DEFAULT_PRICES, ...JSON.parse(process.env.TOKEN_PRICES_JSON) }; } catch (_) { /* keep defaults */ }
  }
  return DEFAULT_PRICES;
}
function costFor(model, inTok, outTok) {
  const p = prices()[model] || prices().default;
  return Math.round((((inTok || 0) / 1e6) * p.in + ((outTok || 0) / 1e6) * p.out) * 1e6) / 1e6;
}

/** Normalize any provider's usage object → { in, out, total }. */
function normalizeUsage(u) {
  if (!u || typeof u !== 'object') return { in: 0, out: 0, total: 0 };
  const inTok = Number(u.prompt_tokens ?? u.promptTokenCount ?? u.input_tokens ?? 0) || 0;
  const outTok = Number(u.completion_tokens ?? u.candidatesTokenCount ?? u.output_tokens ?? 0) || 0;
  const total = Number(u.total_tokens ?? u.totalTokenCount ?? 0) || (inTok + outTok);
  return { in: inTok, out: outTok, total };
}

// ── aggregation ──────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function blankWindow() { return { in: 0, out: 0, total: 0, calls: 0, cost: 0 }; }
function blankAgg() {
  return {
    today: { date: null, ...blankWindow() },
    month: { ym: null, ...blankWindow() },
    total: { ...blankWindow() },
    features: {}, models: {}, updated_at: null,
  };
}
function addInto(w, inTok, outTok, total, cost) {
  w.in += inTok; w.out += outTok; w.total += total; w.calls += 1; w.cost = Math.round((w.cost + cost) * 1e6) / 1e6;
}

const _mem = new Map();  // outletKey -> agg
const _dirty = new Set();
const _loaded = new Set();

/**
 * Record one LLM call's usage. Never throws.
 * @param {object} usage - raw provider usage ({prompt_tokens,…} or {promptTokenCount,…})
 * @param {{model?:string, provider?:string, outletId?:string, userId?:string, feature?:string, now?:Date}} [meta]
 */
function record(usage, meta = {}) {
  try {
    const ctx = currentContext();
    const outletKey = meta.outletId || ctx.outletId || 'global';
    const feature = meta.feature || ctx.feature || 'assistant';
    const model = meta.model || 'default';
    const { in: inTok, out: outTok, total } = normalizeUsage(usage);
    if (total <= 0) return;
    const cost = costFor(model, inTok, outTok);
    const now = meta.now || new Date();

    if (!_loaded.has(outletKey)) _seed(outletKey); // lazy-load persisted totals once
    const agg = _mem.get(outletKey) || blankAgg();

    if (agg.today.date !== dayKey(now)) agg.today = { date: dayKey(now), ...blankWindow() };
    if (agg.month.ym !== monthKey(now)) agg.month = { ym: monthKey(now), ...blankWindow() };
    addInto(agg.today, inTok, outTok, total, cost);
    addInto(agg.month, inTok, outTok, total, cost);
    addInto(agg.total, inTok, outTok, total, cost);
    agg.features[feature] = (agg.features[feature] || 0) + total;
    agg.models[model] = (agg.models[model] || 0) + total;
    agg.updated_at = now.toISOString();

    _mem.set(outletKey, agg);
    _dirty.add(outletKey);
    _scheduleFlush();
  } catch (e) {
    logger.warn && logger.warn('tokenMeter.record failed', { error: e.message });
  }
}

/** Current aggregate for an outlet (in-memory, seeded from KV on first read). */
function snapshot(outletId) {
  const key = outletId || 'global';
  if (!_loaded.has(key)) _seed(key);
  const agg = _mem.get(key) || blankAgg();
  // Zero out a stale today/month window so a read the next day doesn't over-report.
  const now = new Date();
  const today = agg.today.date === dayKey(now) ? agg.today : { date: dayKey(now), ...blankWindow() };
  const month = agg.month.ym === monthKey(now) ? agg.month : { ym: monthKey(now), ...blankWindow() };
  return { outlet_id: key, today, month, total: agg.total, features: agg.features, models: agg.models, updated_at: agg.updated_at };
}

// ── persistence (best-effort KV mirror) ──────────────────────────────────────
function _db() { return require('../config/database').getDbClient(); }

function _seed(outletKey) {
  _loaded.add(outletKey);
  if (outletKey === 'global') return; // global bucket is process-local only
  try {
    // Fire-and-forget load; if it resolves after a record, merge conservatively.
    _db().outletSetting.findUnique({ where: { outlet_id_setting_key: { outlet_id: outletKey, setting_key: SETTING_KEY } } })
      .then((row) => {
        if (!row || !row.setting_value) return;
        const saved = JSON.parse(row.setting_value);
        const cur = _mem.get(outletKey);
        if (!cur) { _mem.set(outletKey, saved); return; }
        // Keep the larger running totals if the process already recorded some.
        if ((saved.total?.total || 0) > (cur.total.total || 0)) _mem.set(outletKey, saved);
      })
      .catch(() => {});
  } catch (_) { /* no DB in this context */ }
}

let _flushTimer = null;
function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; flush().catch(() => {}); }, FLUSH_MS);
  if (_flushTimer.unref) _flushTimer.unref();
}

/** Persist all dirty outlet aggregates to the KV table. Best-effort. */
async function flush() {
  const keys = [..._dirty];
  _dirty.clear();
  for (const key of keys) {
    if (key === 'global') continue;
    const agg = _mem.get(key);
    if (!agg) continue;
    try {
      const value = JSON.stringify(agg);
      await _db().outletSetting.upsert({
        where: { outlet_id_setting_key: { outlet_id: key, setting_key: SETTING_KEY } },
        create: { outlet_id: key, setting_key: SETTING_KEY, setting_value: value, data_type: 'json' },
        update: { setting_value: value },
      });
    } catch (e) { logger.warn && logger.warn('tokenMeter.flush failed', { key, error: e.message }); _dirty.add(key); }
  }
}

/** Test hook: clear all in-memory state. */
function _reset() { _mem.clear(); _dirty.clear(); _loaded.clear(); if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; } }

module.exports = {
  withContext, contextMiddleware, currentContext,
  record, snapshot, normalizeUsage, costFor, flush,
  _reset,
};
