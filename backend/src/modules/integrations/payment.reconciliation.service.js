/**
 * @fileoverview Payment reconciliation service — reconciles recorded/gateway
 * payments against orders for an outlet over a date range. Gives an owner
 * confidence that money collected matches what the POS/gateway recorded before
 * going live.
 * @module modules/integrations/payment.reconciliation.service
 */

const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');

/** Max entries returned in any anomaly list (keeps the payload bounded). */
const ANOMALY_CAP = 100;

/** Methods we treat as gateway/card-acquired for fee estimation. */
const FEE_BEARING_METHODS = new Set(['razorpay', 'card']);

/** Approximate blended gateway fee rate (2%). Estimate only — not an invoice. */
const GATEWAY_FEE_RATE = 0.02;

/**
 * Coerces a Prisma Decimal (or number/string/null) to a finite Number.
 * @param {*} v - Value to coerce.
 * @returns {number} Finite number, 0 when not parseable.
 */
function toNum(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rounds a number to 2 decimal places, returning a Number (not a string).
 * @param {number} v - Value to round.
 * @returns {number} Value rounded to 2dp.
 */
function money(v) {
  return Math.round((toNum(v) + Number.EPSILON) * 100) / 100;
}

/**
 * Returns the start of the current month (local server time).
 * @returns {Date} First instant of the current month.
 */
function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Parses a from/to input into a Date, falling back to a default when the
 * input is missing or unparseable.
 * @param {*} value - Raw input (Date | string | undefined).
 * @param {Date} fallback - Default to use when value is absent/invalid.
 * @returns {Date} A valid Date.
 */
function parseDate(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/**
 * Accumulates count + summed amount into a Map keyed by a string (method/status).
 * @param {Map<string, {count:number, amount:number}>} map - Accumulator map.
 * @param {string} key - Group key.
 * @param {number} amount - Amount to add.
 * @returns {void}
 */
function tally(map, key, amount) {
  const k = key || 'unknown';
  const cur = map.get(k) || { count: 0, amount: 0 };
  cur.count += 1;
  cur.amount += toNum(amount);
  map.set(k, cur);
}

/**
 * Converts a tally Map into a sorted, money-rounded array of buckets.
 * @param {Map<string, {count:number, amount:number}>} map - Accumulator map.
 * @param {string} label - Property name for the key ('method' | 'status').
 * @returns {Array<object>} Buckets sorted by amount descending.
 */
function bucketsFromMap(map, label) {
  return Array.from(map.entries())
    .map(([key, v]) => ({ [label]: key, count: v.count, amount: money(v.amount) }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Reconciles payments against orders for an outlet within [from, to].
 *
 * Anomaly detection:
 *  - payments_without_order: a Payment whose order_id does not resolve to a
 *    live Order row (orphaned/dangling payment — possible bad import or a
 *    deleted order that still has money attached).
 *  - paid_orders_without_payment: an Order flagged paid (is_paid) that has no
 *    successful Payment in range (cash collected but never recorded, or a
 *    gateway capture that never landed).
 *
 * Never throws: an empty range / DB hiccup yields a fully-zeroed summary.
 *
 * @param {string} outletId - Outlet UUID to scope the report to.
 * @param {Date|string} [from] - Range start (defaults to start of current month).
 * @param {Date|string} [to] - Range end (defaults to now).
 * @returns {Promise<object>} Reconciliation summary (see module docs / route).
 */
async function reconcile(outletId, from, to) {
  const fromDate = parseDate(from, startOfCurrentMonth());
  const toDate = parseDate(to, new Date());

  // Empty / inverted summary used for the no-outlet and error paths.
  const emptySummary = () => ({
    period: { from: fromDate, to: toDate },
    totals: { count: 0, gross_amount: 0, refunded_amount: 0, net_amount: 0 },
    by_method: [],
    by_status: [],
    matched: { count: 0, amount: 0 },
    unmatched: {
      payments_without_order: [],
      paid_orders_without_payment: [],
      count: 0,
    },
    fees_estimate: 0,
  });

  if (!outletId) {
    return emptySummary();
  }

  try {
    // Pull payments and paid orders in the window in parallel.
    const [payments, paidOrders] = await Promise.all([
      prisma.payment.findMany({
        where: {
          outlet_id: outletId,
          is_deleted: false,
          created_at: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          order_id: true,
          method: true,
          amount: true,
          status: true,
          refund_amount: true,
        },
      }),
      prisma.order.findMany({
        where: {
          outlet_id: outletId,
          is_deleted: false,
          is_paid: true,
          created_at: { gte: fromDate, lte: toDate },
        },
        select: { id: true, grand_total: true },
      }),
    ]);

    // Resolve which referenced orders actually exist & are paid. Payments may
    // reference orders created outside the window, so look them up by id.
    const referencedOrderIds = Array.from(
      new Set(payments.map((p) => p.order_id).filter(Boolean))
    );
    let liveOrderMap = new Map(); // id -> { is_paid }
    if (referencedOrderIds.length > 0) {
      const referencedOrders = await prisma.order.findMany({
        where: { id: { in: referencedOrderIds }, is_deleted: false },
        select: { id: true, is_paid: true },
      });
      liveOrderMap = new Map(referencedOrders.map((o) => [o.id, o]));
    }

    // Aggregate totals + per-method / per-status buckets in a single pass.
    const byMethod = new Map();
    const byStatus = new Map();
    let gross = 0;
    let refunded = 0;
    let feeBase = 0;
    let matchedCount = 0;
    let matchedAmount = 0;
    const paymentsWithoutOrder = [];
    // Track which orders had a successful payment so we can flag the inverse.
    const ordersWithSuccessfulPayment = new Set();

    for (const p of payments) {
      const amt = toNum(p.amount);
      gross += amt;
      refunded += toNum(p.refund_amount);

      tally(byMethod, p.method, amt);
      tally(byStatus, p.status, amt);

      if (FEE_BEARING_METHODS.has(String(p.method || '').toLowerCase())) {
        feeBase += amt;
      }

      const isSuccess = String(p.status || '').toLowerCase() === 'success';
      const order = p.order_id ? liveOrderMap.get(p.order_id) : null;

      if (isSuccess && p.order_id) {
        ordersWithSuccessfulPayment.add(p.order_id);
      }

      // Anomaly 1: payment references an order that does not exist / is deleted.
      if (!order) {
        if (paymentsWithoutOrder.length < ANOMALY_CAP) {
          paymentsWithoutOrder.push({
            payment_id: p.id,
            amount: money(amt),
            method: p.method || 'unknown',
          });
        }
        continue;
      }

      // Matched: order exists AND is flagged paid.
      if (order.is_paid) {
        matchedCount += 1;
        matchedAmount += amt;
      }
    }

    // Anomaly 2: orders flagged paid in-range with no successful payment recorded.
    const paidOrdersWithoutPayment = [];
    for (const o of paidOrders) {
      if (ordersWithSuccessfulPayment.has(o.id)) continue;
      if (paidOrdersWithoutPayment.length < ANOMALY_CAP) {
        paidOrdersWithoutPayment.push({
          order_id: o.id,
          grand_total: money(o.grand_total),
        });
      }
    }

    const net = gross - refunded;
    const anomalyCount = paymentsWithoutOrder.length + paidOrdersWithoutPayment.length;

    return {
      period: { from: fromDate, to: toDate },
      totals: {
        count: payments.length,
        gross_amount: money(gross),
        refunded_amount: money(refunded),
        net_amount: money(net),
      },
      by_method: bucketsFromMap(byMethod, 'method'),
      by_status: bucketsFromMap(byStatus, 'status'),
      matched: { count: matchedCount, amount: money(matchedAmount) },
      unmatched: {
        payments_without_order: paymentsWithoutOrder,
        paid_orders_without_payment: paidOrdersWithoutPayment,
        count: anomalyCount,
      },
      // Rough blended fee on gateway/card volume. ESTIMATE — surface as such.
      fees_estimate: money(feeBase * GATEWAY_FEE_RATE),
    };
  } catch (error) {
    logger.error('Payment reconciliation failed', {
      error: error.message,
      outletId,
    });
    return emptySummary();
  }
}

module.exports = { reconcile };
