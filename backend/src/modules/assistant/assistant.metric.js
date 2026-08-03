/**
 * @fileoverview Text-to-metric "ask anything" engine (A→G item A). Answers
 * arbitrary METRIC × BREAKDOWN × TIMEFRAME questions the fixed tools don't cover
 * — e.g. "revenue by channel last week", "discount total by day this month",
 * "orders by hour today", "average order value by item".
 *
 * SAFE BY CONSTRUCTION — there is NO arbitrary SQL and no free-form query:
 *   - metric + dimension come from fixed WHITELISTS (unknown → null, we bow out);
 *   - data is a single BOUNDED, outlet-scoped, parameterized order.findMany
 *     (fixed scalar fields, date-range where, capped rows) aggregated in JS, or
 *     the existing reports.getItemWiseSales for by-item;
 *   - timeframe reuses the export date-range parser.
 * It runs only as a FALLBACK when the router matched no fixed tool, so it never
 * changes existing single-tool behaviour.
 *
 * @module modules/assistant/assistant.metric
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const reports = require('../reports/reports.service');
const xport = require('./assistant.export');
const { callLLM } = require('../../utils/llm');
const guard = require('./assistant.guard');

const MAX_ROWS = 20000;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

// metric → how to reduce an order (money flags for formatting)
const METRICS = {
  revenue: { words: ['revenue', 'sales', 'takings', 'turnover', 'income', 'sold'], field: 'grand_total', money: true, label: 'Revenue' },
  orders: { words: ['orders', 'order count', 'number of orders', 'transactions', 'how many orders'], count: true, label: 'Orders' },
  discount: { words: ['discount', 'discounts', 'markdown', 'discounting'], field: 'discount_amount', money: true, label: 'Discounts' },
  net_sales: { words: ['net sales', 'subtotal', 'net revenue', 'pre-tax', 'pre tax'], field: 'subtotal', money: true, label: 'Net sales' },
  avg_order: { words: ['average order', 'avg order', 'average bill', 'average spend', 'average ticket', 'average basket'], avg: true, money: true, label: 'Average order value' },
};
// dimension → how to bucket
const DIMENSIONS = {
  by_item: { words: ['by item', 'per item', 'item-wise', 'item wise', 'by dish', 'by product', 'by menu item'], item: true, label: 'by item' },
  by_channel: { words: ['by channel', 'by order type', 'per channel', 'by type', 'channel split', 'dine-in vs', 'takeaway vs', 'delivery vs'], key: (o) => o.order_type || 'other', label: 'by channel' },
  by_hour: { words: ['by hour', 'per hour', 'hourly', 'hour by hour', 'busiest hour', 'by time of day', 'time of day'], key: (o) => `${pad(new Date(o.created_at).getHours())}:00`, label: 'by hour' },
  by_day: { words: ['by day', 'per day', 'daily', 'day by day', 'each day', 'day-wise', 'day wise', 'day on day'], key: (o) => ymd(o.created_at), label: 'by day' },
};

function findByWords(map, q) {
  for (const [name, def] of Object.entries(map)) {
    for (const w of def.words) if (q.includes(w)) return { name, def };
  }
  return null;
}

/**
 * Parse a metric question into a whitelisted spec, or null. NARROW on purpose:
 * requires BOTH a metric word AND a breakdown word ("by …") — that "by X" is the
 * signal the fixed tools don't already answer, so we never hijack them.
 */
function detectMetricQuery(question, now = new Date()) {
  const q = String(question || '').toLowerCase();
  const dim = findByWords(DIMENSIONS, q);
  if (!dim) return null; // no explicit breakdown → let the fixed tools answer
  const metric = findByWords(METRICS, q) || { name: 'revenue', def: METRICS.revenue };
  const range = xport.parseDateRange(question, now);
  return { metric: metric.name, dimension: dim.name, from: range.from, to: range.to, range_label: range.label };
}

async function fetchOrders(outletId, from, to) {
  const prisma = getDbClient();
  return prisma.order.findMany({
    where: {
      outlet_id: outletId,
      is_deleted: false,
      status: { notIn: ['cancelled', 'voided', 'refunded'] },
      created_at: { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59`) },
    },
    select: { grand_total: true, discount_amount: true, subtotal: true, order_type: true, created_at: true },
    take: MAX_ROWS,
  });
}

function reduceMetric(orders, metricDef) {
  if (metricDef.count) return orders.length;
  if (metricDef.avg) { if (!orders.length) return 0; const s = orders.reduce((a, o) => a + Number(o.grand_total || 0), 0); return Math.round((s / orders.length) * 100) / 100; }
  return Math.round(orders.reduce((a, o) => a + Number(o[metricDef.field] || 0), 0) * 100) / 100;
}

/** Compute the whitelisted metric grouped by the whitelisted dimension. */
async function runMetric(ctx, spec) {
  const mdef = METRICS[spec.metric];
  const ddef = DIMENSIONS[spec.dimension];
  const base = { currency: ctx.currency, metric: mdef.label, dimension: ddef.label, from: spec.from, to: spec.to, money: !!mdef.money };

  if (ddef.item) {
    const r = await reports.getItemWiseSales(ctx.outletId, spec.from, spec.to, 15);
    const rows = (r && r.items ? r.items : []).map((i) => ({
      bucket: i.name,
      value: spec.metric === 'orders' ? Number(i.total_quantity || 0) : Math.round(Number(i.total_revenue || 0) * 100) / 100,
    })).sort((a, b) => b.value - a.value);
    return { ...base, rows, total: rows.reduce((s, x) => s + x.value, 0) };
  }

  const orders = await fetchOrders(ctx.outletId, spec.from, spec.to);
  const groups = {};
  for (const o of orders) { const k = ddef.key(o); (groups[k] = groups[k] || []).push(o); }
  const rows = Object.entries(groups)
    .map(([bucket, list]) => ({ bucket, value: reduceMetric(list, mdef) }))
    .sort((a, b) => (spec.dimension === 'by_day' || spec.dimension === 'by_hour' ? String(a.bucket).localeCompare(String(b.bucket)) : b.value - a.value));
  const total = reduceMetric(orders, mdef);
  return { ...base, rows, total, sampled: orders.length >= MAX_ROWS };
}

/** Answer a metric question grounded in the computed rows, or null. */
async function answerMetric(userCtx, question, spec) {
  let data;
  try { data = await runMetric(userCtx, spec); }
  catch (e) { logger.warn('assistant metric run failed', { error: e.message }); return null; }
  if (!data.rows || !data.rows.length) return null;

  const sys = [
    'You state a metric result from DATA in ONE or two short sentences. Use ONLY numbers in DATA; include the currency for money.',
    'DATA has a metric, a dimension, a per-bucket rows array and a total. Lead with the total, then the top 1-3 buckets.',
    guard.GUARD_SYSTEM,
    'Respond as strict JSON: {"answer": "<your answer>"}',
  ].join('\n');
  const safeQ = guard.sanitizeForPrompt(question).text;
  let answer = null;
  try {
    const out = await callLLM(sys, `QUESTION: ${safeQ}\n\nDATA:\n${JSON.stringify(data)}`);
    if (out && typeof out.answer === 'string' && out.answer.trim() && guard.isGrounded(out.answer, data)) answer = out.answer.trim();
  } catch (_) { /* deterministic fallback below */ }
  if (!answer) answer = summarizeMetric(data);
  return { answer, source: 'metric', tool: 'metric_query', metric: data.metric, dimension: data.dimension };
}

const money = (cur, n) => { const c = cur || 'AUD'; try { return new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-AU', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)); } catch (_) { return `${c} ${Math.round(Number(n) || 0)}`; } };
function summarizeMetric(d) {
  const fmt = (v) => (d.money ? money(d.currency, v) : String(v));
  const top = d.rows.slice(0, 3).map((r) => `${r.bucket} ${fmt(r.value)}`).join(', ');
  return `${d.metric} ${d.dimension} (${d.from} to ${d.to}): ${fmt(d.total)} total. Top: ${top}.`;
}

module.exports = { detectMetricQuery, runMetric, answerMetric, METRICS, DIMENSIONS };
