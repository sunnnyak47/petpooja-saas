/**
 * @fileoverview Close-of-Day (EOD) Report service.
 * Structured end-of-day cash reconciliation workflow.
 * @module modules/reports/eod.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/* ─── helpers ───────────────────────────────────────────────────── */

function toNum(d) { return Number(d ?? 0); }

/** Convert to integer cents/paise to avoid IEEE 754 drift */
function toCents(d) { return Math.round(toNum(d) * 100); }
function toMajor(cents) { return Math.round(cents) / 100; }

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
        payments: { where: { is_deleted: false, status: { not: 'failed' } }, include: { splits: true } },
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

    /* ── Aggregate totals using integer cents/paise to prevent float drift ── */
    let totalRevenueCents = 0, totalTaxCents = 0, totalDiscountCents = 0;
    let cashSystemCents = 0, cardSystemCents = 0, upiSystemCents = 0, otherSystemCents = 0;
    let dineInOrders = 0, dineInRevenueCents = 0;
    let takeawayOrders = 0, takeawayRevenueCents = 0;
    let deliveryOrders = 0, deliveryRevenueCents = 0;
    let onlineOrders = 0, onlineRevenueCents = 0;

    // Item frequency map (revenue tracked in cents)
    const itemMap = {};

    for (const order of orders) {
      const gtCents = toCents(order.grand_total);
      totalRevenueCents  += gtCents;
      totalTaxCents      += toCents(order.total_tax);
      totalDiscountCents += toCents(order.discount_amount) + toCents(order.loyalty_discount);

      // By order type
      switch (order.order_type) {
        case 'dine_in':   dineInOrders++;   dineInRevenueCents   += gtCents; break;
        case 'takeaway':  takeawayOrders++;  takeawayRevenueCents += gtCents; break;
        case 'delivery':  deliveryOrders++;  deliveryRevenueCents += gtCents; break;
        default:          onlineOrders++;    onlineRevenueCents   += gtCents; break;
      }

      // Payment method breakdown — use integer math
      for (const p of order.payments) {
        const amtCents = toCents(p.amount) - toCents(p.refund_amount);
        const m   = (p.method || '').toLowerCase();

        if (m === 'split') {
          // Break split payments into their per-method portions
          const splits = (p.splits || []).filter(s => !s.is_deleted);
          if (splits.length > 0) {
            // Distribute refund proportionally across splits; last split absorbs rounding remainder
            const splitTotal = splits.reduce((s, sp) => s + toCents(sp.amount), 0);
            const refundCents = toCents(p.refund_amount);
            let remainingRefund = refundCents;

            splits.forEach((s, idx) => {
              const rawCents = toCents(s.amount);
              // Last split absorbs rounding remainder
              const splitRefund = idx === splits.length - 1
                ? remainingRefund
                : (splitTotal > 0 ? Math.round((rawCents / splitTotal) * refundCents) : 0);
              remainingRefund -= splitRefund;
              const sAmtCents = rawCents - splitRefund;
              const sM = (s.method || '').toLowerCase();
              if (sM === 'cash')        cashSystemCents  += sAmtCents;
              else if (sM === 'card' || sM === 'credit_card' || sM === 'debit_card') cardSystemCents += sAmtCents;
              else if (sM === 'upi' || sM === 'gpay' || sM === 'phonepe' || sM === 'paytm') upiSystemCents += sAmtCents;
              else                       otherSystemCents += sAmtCents;
            });
          } else {
            // No split records — fall back to otherSystem (already handles refund)
            otherSystemCents += amtCents;
          }
        } else if (m === 'cash') {
          cashSystemCents  += amtCents;
        } else if (m === 'card' || m === 'credit_card' || m === 'debit_card') {
          cardSystemCents += amtCents;
        } else if (m === 'upi' || m === 'gpay' || m === 'phonepe' || m === 'paytm') {
          upiSystemCents += amtCents;
        } else {
          otherSystemCents += amtCents;
        }
      }

      // Top items
      for (const oi of order.order_items) {
        const key = oi.name;
        if (!itemMap[key]) itemMap[key] = { name: key, qty: 0, revenueCents: 0 };
        itemMap[key].qty          += oi.quantity;
        itemMap[key].revenueCents += toCents(oi.item_total);
      }
    }

    const topItems = Object.values(itemMap)
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10)
      .map(i => ({ name: i.name, qty: i.qty, revenue: toMajor(i.revenueCents) }));

    const voidAmountCents = voidedOrders.reduce((s, o) => s + toCents(o.grand_total), 0);
    const refundTotalCents = refunds.reduce((s, r) => s + toCents(r.refund_amount), 0);

    // Bug 1 fix: subtract refunds so total_revenue matches the payment breakdown sum
    totalRevenueCents -= refundTotalCents;

    return {
      report_date:      new Date(date).toISOString().slice(0, 10),
      total_orders:     orders.length,
      total_revenue:    toMajor(totalRevenueCents),
      total_tax:        toMajor(totalTaxCents),
      total_discount:   toMajor(totalDiscountCents),
      void_count:       voidedOrders.length,
      void_amount:      toMajor(voidAmountCents),
      refund_count:     refunds.length,
      refund_amount:    toMajor(refundTotalCents),
      dine_in_orders:   dineInOrders,    dine_in_revenue:  toMajor(dineInRevenueCents),
      takeaway_orders:  takeawayOrders,  takeaway_revenue: toMajor(takeawayRevenueCents),
      delivery_orders:  deliveryOrders,  delivery_revenue: toMajor(deliveryRevenueCents),
      online_orders:    onlineOrders,    online_revenue:   toMajor(onlineRevenueCents),
      cash_system:      toMajor(cashSystemCents),
      card_system:      toMajor(cardSystemCents),
      upi_system:       toMajor(upiSystemCents),
      other_system:     toMajor(otherSystemCents),
      // Cross-check field: equals cash + card + upi + other; should match total_revenue
      net_revenue:      toMajor(cashSystemCents + cardSystemCents + upiSystemCents + otherSystemCents),
      top_items:        topItems,
    };
  } catch (err) {
    logger.error('EOD generateSnapshot failed', { error: err.message });
    throw err;
  }
}

/* ─── 2. Compute cash reconciliation ────────────────────────────── */

/** Region-specific cash denominations */
const IN_DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const AU_DENOMS = [100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05];

/** Default export for backwards compatibility */
const DENOM_LIST = IN_DENOMS;

/**
 * Get the appropriate denomination list for a currency.
 * @param {string} currency - 'AUD' or 'INR'
 * @returns {number[]}
 */
function getDenomsForCurrency(currency) {
  return (currency || '').toUpperCase() === 'AUD' ? AU_DENOMS : IN_DENOMS;
}

/**
 * Compute actual cash from denomination counts, using integer math.
 * @param {object} denominationCount - { "50": 3, "20": 2, "0.50": 5, ... }
 * @param {string} [currency='INR'] - 'AUD' or 'INR'
 * @returns {number} Cash total in major currency units
 */
function computeCashActual(denominationCount = {}, currency = 'INR') {
  const denoms = getDenomsForCurrency(currency);
  // Use integer cents/paise to avoid float drift with AU coins (0.05, 0.10, etc.)
  const totalCents = denoms.reduce((sum, d) => {
    const count = Number(denominationCount[String(d)] || 0);
    return sum + Math.round(d * 100) * count;
  }, 0);
  return toMajor(totalCents);
}

function computeDifference(cashActual, openingCash, cashSystem) {
  // Use integer math: expected in drawer = opening float + all cash sales
  const expectedCents = toCents(openingCash) + toCents(cashSystem);
  return toMajor(toCents(cashActual) - expectedCents);
}

/* ─── 3. Upsert draft EOD report ─────────────────────────────────── */

async function saveDraft(outletId, userId, { date, openingCash, denominationCount, notes, discrepancyReason }) {
  const prisma = getDbClient();
  try {
    // Fetch outlet currency for region-aware cash denomination handling
    const outlet = await prisma.outlet.findFirst({ where: { id: outletId }, select: { currency: true } });
    const currency = outlet?.currency || 'INR';

    const snapshot    = await generateSnapshot(outletId, date);
    const cashActual  = computeCashActual(denominationCount, currency);
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
      include: { closer: { select: { full_name: true, email: true } } },
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
      include: { closer: { select: { full_name: true, email: true } } },
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
      include: { closer: { select: { full_name: true } } },
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
  getDenomsForCurrency,
  DENOM_LIST,
  IN_DENOMS,
  AU_DENOMS,
};
