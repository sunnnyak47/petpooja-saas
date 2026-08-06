/**
 * @fileoverview Text-to-metric "ask anything" engine (A→G item A). Answers
 * arbitrary METRIC × BREAKDOWN × TIMEFRAME questions the fixed tools don't cover
 * — e.g. "revenue by channel last week", "discount total by day this month",
 * "orders by hour today", "average order value by item".
 *
 * SAFE BY CONSTRUCTION — there is NO arbitrary SQL and no free-form query:
 *   - metric + dimension come from fixed WHITELISTS (unknown → null, we bow out);
 *   - data is a single BOUNDED, outlet-scoped, parameterized order.findMany
 *     (fixed scalar fields, date-range where, capped rows) aggregated in JS —
 *     with a bounded, soft-delete-filtered payments/staff include for the
 *     by-payment / by-staff breakdowns — or the existing
 *     reports.getItemWiseSales (by-item) / reports.getCategoryWiseSales
 *     (by-category) services;
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
// Attribute a (possibly split-payment) order to its dominant tender — the
// payment with the largest amount — so each order lands in exactly ONE payment
// bucket, keeping the same one-order-one-bucket shape as the other JS dims.
// Orders with no payment fall into 'unpaid'; a payment missing a method → 'other'.
function primaryPaymentMethod(o) {
  const ps = Array.isArray(o.payments) ? o.payments : [];
  if (!ps.length) return 'unpaid';
  let best = ps[0];
  for (const p of ps) if (Number(p.amount || 0) > Number(best.amount || 0)) best = p;
  return best.method || 'other';
}
// dimension → how to bucket
const DIMENSIONS = {
  by_item: { words: ['by item', 'per item', 'item-wise', 'item wise', 'by dish', 'by product', 'by menu item'], item: true, label: 'by item' },
  by_category: { words: ['by category', 'per category', 'category-wise', 'category wise', 'by menu category', 'by section'], category: true, label: 'by category' },
  by_channel: { words: ['by channel', 'by order type', 'per channel', 'by type', 'channel split', 'dine-in vs', 'takeaway vs', 'delivery vs'], key: (o) => o.order_type || 'other', label: 'by channel' },
  by_payment: { words: ['by payment method', 'by payment', 'by payment type', 'by tender', 'by mode of payment', 'payment method split', 'payment split', 'payment-wise', 'payment wise'], key: (o) => primaryPaymentMethod(o), needsPayments: true, label: 'by payment method' },
  by_staff: { words: ['by staff', 'by employee', 'by cashier', 'by server', 'by waiter', 'by team member', 'per staff', 'per employee', 'staff-wise', 'staff wise'], key: (o) => (o.staff && o.staff.full_name ? o.staff.full_name : 'Unassigned'), needsStaff: true, label: 'by staff' },
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

async function fetchOrders(outletId, from, to, ddef) {
  const prisma = getDbClient();
  // Base scalars every dimension needs; the payment/staff dims add one bounded,
  // soft-delete-filtered relation each (fixed fields only — still no free SQL).
  const select = { grand_total: true, discount_amount: true, subtotal: true, order_type: true, created_at: true };
  if (ddef && ddef.needsStaff) select.staff = { select: { full_name: true } };
  if (ddef && ddef.needsPayments) select.payments = { where: { is_deleted: false }, select: { method: true, amount: true } };
  return prisma.order.findMany({
    where: {
      outlet_id: outletId,
      is_deleted: false,
      status: { notIn: ['cancelled', 'voided', 'refunded'] },
      created_at: { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T23:59:59`) },
    },
    select,
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
    // The item-wise service only exposes revenue (and quantity for the orders
    // metric). Any other metric would be revenue mislabeled as e.g. Discounts /
    // Net sales, so bow out with empty rows — answerMetric then defers to the
    // docs/suggest path instead of answering with a wrong-labelled figure.
    if (spec.metric !== 'revenue' && spec.metric !== 'orders') return { ...base, rows: [], total: 0 };
    const r = await reports.getItemWiseSales(ctx.outletId, spec.from, spec.to, 15);
    const rows = (r && r.items ? r.items : []).map((i) => ({
      bucket: i.name,
      value: spec.metric === 'orders' ? Number(i.total_quantity || 0) : Math.round(Number(i.total_revenue || 0) * 100) / 100,
    })).sort((a, b) => b.value - a.value);
    return { ...base, rows, total: rows.reduce((s, x) => s + x.value, 0) };
  }

  if (ddef.category) {
    // The category-wise service exposes revenue only, so any non-revenue metric
    // (discount / net_sales / avg_order) would be revenue mislabeled — bow out
    // with empty rows so answerMetric defers instead of returning wrong figures.
    if (spec.metric !== 'revenue') return { ...base, rows: [], total: 0 };
    // Revenue-native breakdown from the bounded category-wise groupBy service
    // (per-item item_total rolled up to category). It returns revenue only, so
    // that is the value regardless of metric — we never fabricate other fields.
    const r = await reports.getCategoryWiseSales(ctx.outletId, spec.from, spec.to);
    const rows = (Array.isArray(r) ? r : []).map((c) => ({
      bucket: c.category,
      value: Math.round(Number(c.revenue || 0) * 100) / 100,
    })).sort((a, b) => b.value - a.value);
    return { ...base, rows, total: rows.reduce((s, x) => s + x.value, 0) };
  }

  const orders = await fetchOrders(ctx.outletId, spec.from, spec.to, ddef);
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
