/**
 * @fileoverview Close-of-Day (EOD) Report service.
 * Structured end-of-day cash reconciliation workflow.
 * @module modules/reports/eod.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/* ─── helpers ───────────────────────────────────────────────────── */

function toNum(d) { return Number(d ?? 0); }

/** Build a date range for a single calendar day (outlet local midnight) */
function dayRange(date) {
  const d  = new Date(date);
  const lo = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
  const hi = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
  return { gte: lo, lte: hi };
}

/* ─── 1. Generate snapshot from live orders ─────────────────────── */

/**
 * Pulls all paid orders for a given date and computes EOD totals.
 * Does NOT persist — caller decides to save as draft.
 */
async function generateSnapshot(outletId, date = new Date()) {
  const prisma = getDbClient();
  try {
    const range = dayRange(date);

    // All paid / completed orders for the day
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
        is_paid:   true,
        paid_at:   range,
      },
      include: {
        payments: { where: { is_deleted: false, status: { not: 'failed' } } },
        order_items: { where: { is_deleted: false } },
      },
    });

    // Voided / cancelled orders
    const voidedOrders = await prisma.order.findMany({
      where: {
        outlet_id:    outletId,
        is_deleted:   false,
        status:       { in: ['cancelled', 'voided'] },
        cancelled_at: range,
      },
      select: { grand_total: true },
    });

    // Refunds
    const refunds = await prisma.payment.findMany({
      where: {
        outlet_id:  outletId,
        is_deleted: false,
        refund_amount: { gt: 0 },
        updated_at: range,
      },
      select: { refund_amount: true },
    });

    /* ── Aggregate totals ── */
    let totalRevenue = 0, totalTax = 0, totalDiscount = 0;
    let cashSystem = 0, cardSystem = 0, upiSystem = 0, otherSystem = 0;
    let dineInOrders = 0, dineInRevenue = 0;
    let takeawayOrders = 0, takeawayRevenue = 0;
    let deliveryOrders = 0, deliveryRevenue = 0;
    let onlineOrders = 0, onlineRevenue = 0;

    // Item frequency map
    const itemMap = {};

    for (const order of orders) {
      const gt = toNum(order.grand_total);
      totalRevenue  += gt;
      totalTax      += toNum(order.total_tax);
      totalDiscount += toNum(order.discount_amount) + toNum(order.loyalty_discount);

      // By order type
      switch (order.order_type) {
        case 'dine_in':   dineInOrders++;   dineInRevenue   += gt; break;
        case 'takeaway':  takeawayOrders++;  takeawayRevenue += gt; break;
        case 'delivery':  deliveryOrders++;  deliveryRevenue += gt; break;
        default:          onlineOrders++;    onlineRevenue   += gt; break;
      }

      // Payment method breakdown
      for (const p of order.payments) {
        const amt = toNum(p.amount) - toNum(p.refund_amount);
        const m   = (p.method || '').toLowerCase();
        if (m === 'cash')        cashSystem  += amt;
        else if (m === 'card' || m === 'credit_card' || m === 'debit_card') cardSystem += amt;
        else if (m === 'upi' || m === 'gpay' || m === 'phonepe' || m === 'paytm') upiSystem += amt;
        else                     otherSystem += amt;
      }

      // Top items
      for (const oi of order.order_items) {
        const key = oi.name;
        if (!itemMap[key]) itemMap[key] = { name: key, qty: 0, revenue: 0 };
        itemMap[key].qty     += oi.quantity;
        itemMap[key].revenue += toNum(oi.item_total);
      }
    }

    const topItems = Object.values(itemMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(i => ({ ...i, revenue: Math.round(i.revenue * 100) / 100 }));

    const voidAmount  = voidedOrders.reduce((s, o) => s + toNum(o.grand_total), 0);
    const refundTotal = refunds.reduce((s, r) => s + toNum(r.refund_amount), 0);

    return {
      report_date:      new Date(date).toISOString().slice(0, 10),
      total_orders:     orders.length,
      total_revenue:    Math.round(totalRevenue  * 100) / 100,
      total_tax:        Math.round(totalTax       * 100) / 100,
      total_discount:   Math.round(totalDiscount  * 100) / 100,
      void_count:       voidedOrders.length,
      void_amount:      Math.round(voidAmount     * 100) / 100,
      refund_count:     refunds.length,
      refund_amount:    Math.round(refundTotal    * 100) / 100,
      dine_in_orders,   dine_in_revenue:  Math.round(dineInRevenue  * 100) / 100,
      takeaway_orders,  takeaway_revenue: Math.round(takeawayRevenue * 100) / 100,
      delivery_orders,  delivery_revenue: Math.round(deliveryRevenue * 100) / 100,
      online_orders,    online_revenue:   Math.round(onlineRevenue   * 100) / 100,
      cash_system:      Math.round(cashSystem  * 100) / 100,
      card_system:      Math.round(cardSystem  * 100) / 100,
      upi_system:       Math.round(upiSystem   * 100) / 100,
      other_system:     Math.round(otherSystem * 100) / 100,
      top_items:        topItems,
    };
  } catch (err) {
    logger.error('EOD generateSnapshot failed', { error: err.message });
    throw err;
  }
}

/* ─── 2. Compute cash reconciliation ────────────────────────────── */

/** DENOM_LIST: Indian currency denominations in descending order */
const DENOM_LIST = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

function computeCashActual(denominationCount = {}) {
  return DENOM_LIST.reduce((sum, d) => sum + d * (Number(denominationCount[String(d)] || 0)), 0);
}

function computeDifference(cashActual, openingCash, cashSystem) {
  // Expected in drawer = opening float + all cash sales
  const expected = openingCash + cashSystem;
  return Math.round((cashActual - expected) * 100) / 100;
}

/* ─── 3. Upsert draft EOD report ─────────────────────────────────── */

async function saveDraft(outletId, userId, { date, openingCash, denominationCount, notes, discrepancyReason }) {
  const prisma = getDbClient();
  try {
    const snapshot    = await generateSnapshot(outletId, date);
    const cashActual  = computeCashActual(denominationCount);
    const cashDiff    = computeDifference(cashActual, toNum(openingCash), snapshot.cash_system);

    const data = {
      outlet_id:          outletId,
      report_date:        new Date(date),
      status:             'draft',
      total_orders:       snapshot.total_orders,
      total_revenue:      snapshot.total_revenue,
      total_tax:          snapshot.total_tax,
      total_discount:     snapshot.total_discount,
      void_count:         snapshot.void_count,
      void_amount:        snapshot.void_amount,
      refund_count:       snapshot.refund_count,
      refund_amount:      snapshot.refund_amount,
      dine_in_orders:     snapshot.dine_in_orders,
      dine_in_revenue:    snapshot.dine_in_revenue,
      takeaway_orders:    snapshot.takeaway_orders,
      takeaway_revenue:   snapshot.takeaway_revenue,
      delivery_orders:    snapshot.delivery_orders,
      delivery_revenue:   snapshot.delivery_revenue,
      online_orders:      snapshot.online_orders,
      online_revenue:     snapshot.online_revenue,
      cash_system:        snapshot.cash_system,
      card_system:        snapshot.card_system,
      upi_system:         snapshot.upi_system,
      other_system:       snapshot.other_system,
      opening_cash:       toNum(openingCash),
      denomination_count: denominationCount || {},
      cash_actual:        Math.round(cashActual * 100) / 100,
      cash_difference:    cashDiff,
      top_items:          snapshot.top_items,
      discrepancy_reason: discrepancyReason || null,
      notes:              notes || null,
    };

    const report = await prisma.eODReport.upsert({
      where:  { outlet_id_report_date: { outlet_id: outletId, report_date: new Date(date) } },
      create: data,
      update: { ...data, status: 'draft' },       // can't override a locked report
    });

    // Also sync into DailySummary
    await prisma.dailySummary.upsert({
      where:  { outlet_id_summary_date: { outlet_id: outletId, summary_date: new Date(date) } },
      create: {
        outlet_id:       outletId,
        summary_date:    new Date(date),
        total_orders:    snapshot.total_orders,
        total_revenue:   snapshot.total_revenue,
        total_tax:       snapshot.total_tax,
        total_discount:  snapshot.total_discount,
        dine_in_orders:  snapshot.dine_in_orders,
        takeaway_orders: snapshot.takeaway_orders,
        delivery_orders: snapshot.delivery_orders,
        online_orders:   snapshot.online_orders,
        cash_collected:  snapshot.cash_system,
        card_collected:  snapshot.card_system,
        upi_collected:   snapshot.upi_system,
        other_collected: snapshot.other_system,
        void_count:      snapshot.void_count,
        void_amount:     snapshot.void_amount,
        refund_count:    snapshot.refund_count,
        refund_amount:   snapshot.refund_amount,
      },
      update: {
        total_orders:    snapshot.total_orders,
        total_revenue:   snapshot.total_revenue,
        total_tax:       snapshot.total_tax,
        total_discount:  snapshot.total_discount,
        cash_collected:  snapshot.cash_system,
        card_collected:  snapshot.card_system,
        upi_collected:   snapshot.upi_system,
        other_collected: snapshot.other_system,
        void_count:      snapshot.void_count,
        void_amount:     snapshot.void_amount,
      },
    });

    return { ...report, snapshot };
  } catch (err) {
    logger.error('EOD saveDraft failed', { error: err.message });
    throw err;
  }
}

/* ─── 4. Lock (finalise) EOD report ─────────────────────────────── */

async function lockEOD(outletId, reportId, userId) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.eODReport.findFirst({ where: { id: reportId, outlet_id: outletId } });
    if (!existing) throw new Error('EOD report not found');
    if (existing.status === 'locked') throw new Error('Report is already locked');

    return await prisma.eODReport.update({
      where: { id: reportId },
      data:  { status: 'locked', closed_by: userId, closed_at: new Date() },
      include: { closer: { select: { name: true, email: true } } },
    });
  } catch (err) {
    logger.error('EOD lockEOD failed', { error: err.message });
    throw err;
  }
}

/* ─── 5. Get specific date report ────────────────────────────────── */

async function getReportByDate(outletId, date) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.eODReport.findFirst({
      where: { outlet_id: outletId, report_date: new Date(date) },
      include: { closer: { select: { name: true, email: true } } },
    });
    if (existing) return existing;

    // No report yet — return live snapshot with null id
    const snapshot = await generateSnapshot(outletId, date);
    return { id: null, status: 'not_started', ...snapshot };
  } catch (err) {
    logger.error('EOD getReportByDate failed', { error: err.message });
    throw err;
  }
}

/* ─── 6. EOD history ─────────────────────────────────────────────── */

async function getHistory(outletId, limit = 30) {
  const prisma = getDbClient();
  try {
    return await prisma.eODReport.findMany({
      where:   { outlet_id: outletId },
      orderBy: { report_date: 'desc' },
      take:    limit,
      include: { closer: { select: { name: true } } },
    });
  } catch (err) {
    logger.error('EOD getHistory failed', { error: err.message });
    throw err;
  }
}

/* ─── 7. Today's quick preview (no save) ────────────────────────── */

async function previewToday(outletId) {
  return generateSnapshot(outletId, new Date());
}

module.exports = {
  generateSnapshot,
  saveDraft,
  lockEOD,
  getReportByDate,
  getHistory,
  previewToday,
  computeCashActual,
  computeDifference,
  DENOM_LIST,
};
