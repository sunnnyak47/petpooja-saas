/**
 * @fileoverview Per-channel analytics service.
 *
 * Breaks restaurant performance down by sales channel: each delivery aggregator
 * (Uber Eats / DoorDash / Menulog / Swiggy / Zomato) plus Dine-in, QR, Takeaway
 * and Direct/Online. Provides channel summaries (orders, gross, AOV, cancel rate,
 * average prep time, commission & net), top items per channel and a daily trend.
 *
 * @module modules/integrations/channel-analytics.service
 */

const prisma = require('../../config/database').getDbClient();

/**
 * Aggregator commission rates (fraction of gross). Aggregator channels only —
 * first-party channels (dine-in, qr, takeaway, direct) carry no commission.
 * @type {Record<string, number>}
 */
const COMMISSION = {
  swiggy: 0.18,
  zomato: 0.15,
  doordash: 0.2,
  menulog: 0.14,
  uber_eats: 0.3,
};

/**
 * Human-readable labels for each normalized channel key.
 * @type {Record<string, string>}
 */
const CHANNEL_LABELS = {
  uber_eats: 'Uber Eats',
  doordash: 'DoorDash',
  menulog: 'Menulog',
  swiggy: 'Swiggy',
  zomato: 'Zomato',
  dine_in: 'Dine-in',
  qr: 'QR Orders',
  takeaway: 'Takeaway',
  direct: 'Direct/Online',
};

/** Statuses that count an order as cancelled / not fulfilled. */
const CANCELLED_STATUSES = new Set(['cancelled', 'voided']);

/**
 * Round a numeric value to 2 decimal places.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Round a numeric value to 1 decimal place (used for rates / percentages).
 * @param {number} n
 * @returns {number}
 */
function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}

/**
 * Coerce a Prisma Decimal (or anything number-ish) to a JS number.
 * @param {*} v
 * @returns {number}
 */
function toNum(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a Prisma `created_at` range filter from optional from/to bounds.
 * Inclusive on both ends; `to` is treated as end-of-day when a bare date is given.
 * @param {{ from?: string, to?: string }} [range]
 * @returns {object|undefined} A `{ gte?, lte? }` object, or undefined if no bounds.
 */
function buildDateFilter({ from, to } = {}) {
  const filter = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) filter.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      // If a bare YYYY-MM-DD was given, extend to the end of that day.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) {
        d.setHours(23, 59, 59, 999);
      }
      filter.lte = d;
    }
  }
  return Object.keys(filter).length ? filter : undefined;
}

/**
 * Normalize an order into a single channel key.
 *
 * Priority: explicit aggregator → QR → dine-in → takeaway → direct/online.
 * @param {{ aggregator?: string|null, source?: string|null, order_type?: string|null }} order
 * @returns {string} Normalized channel key (e.g. 'uber_eats', 'qr', 'dine_in').
 */
function normalizeChannel(order) {
  if (order && order.aggregator) return order.aggregator;
  if (order && (order.source === 'qr' || order.order_type === 'qr_order')) return 'qr';
  if (order && order.order_type === 'dine_in') return 'dine_in';
  if (order && order.order_type === 'takeaway') return 'takeaway';
  return 'direct';
}

/**
 * Resolve the display label for a channel key, falling back to the key itself.
 * @param {string} channel
 * @returns {string}
 */
function labelFor(channel) {
  return CHANNEL_LABELS[channel] || channel;
}

/**
 * Format a Date as a local `YYYY-MM-DD` day bucket.
 * @param {Date} d
 * @returns {string}
 */
function dayKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build the per-channel performance summary for an outlet over an optional range.
 *
 * @param {string} outletId - Tenant outlet id.
 * @param {{ from?: string, to?: string }} [opts]
 * @returns {Promise<{
 *   rows: Array<{
 *     channel: string, label: string, orders: number, gross: number, aov: number,
 *     cancelled: number, cancel_rate: number, avg_prep_min: number,
 *     commission_pct: number, commission_amount: number, net: number
 *   }>,
 *   totals: { orders: number, gross: number, commission_amount: number, net: number }
 * }>}
 */
async function summary(outletId, { from, to } = {}) {
  const where = { outlet_id: outletId, is_deleted: false };
  const range = buildDateFilter({ from, to });
  if (range) where.created_at = range;

  const orders = await prisma.order.findMany({
    where,
    select: {
      aggregator: true,
      source: true,
      order_type: true,
      grand_total: true,
      status: true,
      created_at: true,
      paid_at: true,
      updated_at: true,
    },
  });

  /** @type {Record<string, { orders: number, gross: number, cancelled: number, prepSum: number, prepCount: number }>} */
  const buckets = {};

  for (const o of orders) {
    const channel = normalizeChannel(o);
    if (!buckets[channel]) {
      buckets[channel] = { orders: 0, gross: 0, cancelled: 0, prepSum: 0, prepCount: 0 };
    }
    const b = buckets[channel];
    b.orders += 1;
    b.gross += toNum(o.grand_total);

    const isCancelled = CANCELLED_STATUSES.has(o.status);
    if (isCancelled) {
      b.cancelled += 1;
    } else {
      const end = o.paid_at || o.updated_at;
      if (end && o.created_at) {
        const diffMs = new Date(end).getTime() - new Date(o.created_at).getTime();
        if (Number.isFinite(diffMs) && diffMs >= 0) {
          b.prepSum += diffMs / 60000; // minutes
          b.prepCount += 1;
        }
      }
    }
  }

  const rows = Object.keys(buckets).map((channel) => {
    const b = buckets[channel];
    const gross = round2(b.gross);
    const commissionRate = COMMISSION[channel] || 0;
    const commissionAmount = round2(gross * commissionRate);
    return {
      channel,
      label: labelFor(channel),
      orders: b.orders,
      gross,
      aov: b.orders ? round2(gross / b.orders) : 0,
      cancelled: b.cancelled,
      cancel_rate: b.orders ? round1((b.cancelled / b.orders) * 100) : 0,
      avg_prep_min: b.prepCount ? round1(b.prepSum / b.prepCount) : 0,
      commission_pct: round1(commissionRate * 100),
      commission_amount: commissionAmount,
      net: round2(gross - commissionAmount),
    };
  });

  rows.sort((a, b) => b.gross - a.gross);

  const totals = rows.reduce(
    (acc, r) => {
      acc.orders += r.orders;
      acc.gross += r.gross;
      acc.commission_amount += r.commission_amount;
      acc.net += r.net;
      return acc;
    },
    { orders: 0, gross: 0, commission_amount: 0, net: 0 }
  );

  totals.gross = round2(totals.gross);
  totals.commission_amount = round2(totals.commission_amount);
  totals.net = round2(totals.net);

  return { rows, totals };
}

/**
 * Top-selling items, optionally scoped to a single channel.
 *
 * @param {string} outletId - Tenant outlet id.
 * @param {{ from?: string, to?: string, channel?: string, limit?: number }} [opts]
 * @returns {Promise<Array<{ name: string, qty: number, revenue: number }>>}
 */
async function topItems(outletId, { from, to, channel, limit = 10 } = {}) {
  const where = { outlet_id: outletId, is_deleted: false };
  const range = buildDateFilter({ from, to });
  if (range) where.created_at = range;

  // Fetch matching orders (ids + channel-defining fields), then filter by channel.
  const orders = await prisma.order.findMany({
    where,
    select: { id: true, aggregator: true, source: true, order_type: true },
  });

  const orderIds = (channel
    ? orders.filter((o) => normalizeChannel(o) === channel)
    : orders
  ).map((o) => o.id);

  if (orderIds.length === 0) return [];

  const items = await prisma.orderItem.findMany({
    where: { order_id: { in: orderIds }, is_deleted: false },
    select: { name: true, quantity: true, item_total: true },
  });

  /** @type {Record<string, { name: string, qty: number, revenue: number }>} */
  const agg = {};
  for (const it of items) {
    const name = it.name || 'Unknown';
    if (!agg[name]) agg[name] = { name, qty: 0, revenue: 0 };
    agg[name].qty += toNum(it.quantity);
    agg[name].revenue += toNum(it.item_total);
  }

  const lim = Math.max(1, Number(limit) || 10);

  return Object.values(agg)
    .map((r) => ({ name: r.name, qty: r.qty, revenue: round2(r.revenue) }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, lim);
}

/**
 * Daily gross-per-channel trend across the given range.
 *
 * Days are bucketed by `created_at` and emitted in ascending order. Every channel
 * present in the range gets a same-length series aligned to `days`.
 *
 * @param {string} outletId - Tenant outlet id.
 * @param {{ from?: string, to?: string }} [opts]
 * @returns {Promise<{ days: string[], series: Record<string, number[]> }>}
 */
async function trend(outletId, { from, to } = {}) {
  const where = { outlet_id: outletId, is_deleted: false };
  const range = buildDateFilter({ from, to });
  if (range) where.created_at = range;

  const orders = await prisma.order.findMany({
    where,
    select: {
      aggregator: true,
      source: true,
      order_type: true,
      grand_total: true,
      created_at: true,
    },
  });

  // Collect daily totals: dayMap[day][channel] = gross
  /** @type {Record<string, Record<string, number>>} */
  const dayMap = {};
  const channelSet = new Set();

  for (const o of orders) {
    if (!o.created_at) continue;
    const day = dayKey(o.created_at);
    const channel = normalizeChannel(o);
    channelSet.add(channel);
    if (!dayMap[day]) dayMap[day] = {};
    dayMap[day][channel] = (dayMap[day][channel] || 0) + toNum(o.grand_total);
  }

  const days = Object.keys(dayMap).sort();
  const channels = [...channelSet];

  /** @type {Record<string, number[]>} */
  const series = {};
  for (const ch of channels) {
    series[ch] = days.map((d) => round2(dayMap[d][ch] || 0));
  }

  return { days, series };
}

module.exports = {
  COMMISSION,
  CHANNEL_LABELS,
  normalizeChannel,
  summary,
  topItems,
  trend,
};
