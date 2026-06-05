/**
 * @fileoverview Usage-based SaaS billing — monthly invoice rollup.
 *
 * Rolls the per-transaction {@link BillingUsageEvent} ledger up into one real
 * {@link SubscriptionInvoice} (+ channel line items) per head office per
 * billing period. Replaces the previous puppeteer-per-subscription approach
 * that wrote ephemeral PDFs to disk and crashed querying a non-existent
 * `is_deleted` column.
 *
 * Pricing knobs (free allotment, monthly minimum, cap, tax) come from the head
 * office's active {@link BillingPlan} — config, not code.
 *
 * Idempotency: the [head_office_id, billing_period] unique constraint plus the
 * `invoiced` flag on each event make the rollup safe to re-run.
 *
 * @module modules/headoffice/billing.service
 */

const cron = require('node-cron');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { billingPeriodOf } = require('./billing.metering.service');

const DUE_DAYS = 7;

/**
 * Returns the previous calendar month as `YYYY-MM` (UTC). The 1st-of-month cron
 * bills the month that just closed.
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
function previousPeriod(d = new Date()) {
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return billingPeriodOf(prev);
}

/**
 * UTC start/end Date objects for a `YYYY-MM` period.
 * @param {string} period
 * @returns {{start:Date, end:Date}}
 */
function periodBounds(period) {
  const [y, m] = period.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1) - 1); // last ms of the month
  return { start, end };
}

/**
 * Rolls one head office's uninvoiced usage for a period into an invoice.
 * Idempotent: returns the existing invoice if one already exists for the period.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} headOfficeId
 * @param {string} period - `YYYY-MM`
 * @returns {Promise<object|null>} The invoice, or null if there was nothing to bill.
 */
async function rollupHeadOffice(prisma, headOfficeId, period) {
  // Idempotency guard — one invoice per head office per period.
  const existing = await prisma.subscriptionInvoice.findFirst({
    where: { head_office_id: headOfficeId, billing_period: period },
  });
  if (existing) return existing;

  const events = await prisma.billingUsageEvent.findMany({
    where: { head_office_id: headOfficeId, billing_period: period, invoiced: false },
    orderBy: { occurred_at: 'asc' },
  });
  if (events.length === 0) return null;

  const subscription = await prisma.subscription.findFirst({
    where: { head_office_id: headOfficeId, is_deleted: false, status: { in: ['active', 'trialing', 'past_due', 'grace'] } },
    orderBy: { created_at: 'desc' },
    include: { plan: true },
  });
  const plan = subscription?.plan || null;

  const currency = events[0].currency || plan?.currency || 'INR';
  const freeQuota = Number(plan?.free_txns_monthly || 0);
  const baseFee = Number(plan?.base_monthly_fee || 0);
  const minFee = Number(plan?.monthly_min_fee || 0);
  const capFee = plan?.monthly_cap_fee != null ? Number(plan.monthly_cap_fee) : null;
  const taxPercent = Number(plan?.tax_percent || 0);
  const taxLabel = plan?.tax_label || 'GST';

  // Apply the free allotment to the earliest N events; the rest are billable.
  const freeIds = [];
  const billable = [];
  let grossVolume = 0;
  events.forEach((ev, idx) => {
    grossVolume += Number(ev.gross_amount || 0);
    if (idx < freeQuota) freeIds.push(ev.id);
    else billable.push(ev);
  });

  // Group billable fee by channel into line items.
  const byChannel = new Map();
  let usageSubtotal = 0;
  for (const ev of billable) {
    const ch = ev.channel || 'default';
    const fee = Number(ev.fee_amount || 0);
    usageSubtotal += fee;
    const line = byChannel.get(ch) || { channel: ch, quantity: 0, gross_volume: 0, amount: 0 };
    line.quantity += 1;
    line.gross_volume += Number(ev.gross_amount || 0);
    line.amount += fee;
    byChannel.set(ch, line);
  }

  const lines = [];
  let sort = 0;
  if (baseFee > 0) {
    lines.push({ description: 'Base platform fee', channel: null, quantity: 1, unit_label: 'month', gross_volume: 0, amount: baseFee, sort_order: sort++ });
  }
  for (const line of byChannel.values()) {
    lines.push({
      description: `Transaction fee — ${line.channel}`,
      channel: line.channel,
      quantity: line.quantity,
      unit_label: 'txn',
      gross_volume: round2(line.gross_volume),
      amount: round2(line.amount),
      sort_order: sort++,
    });
  }
  if (freeIds.length > 0) {
    lines.push({ description: `Included free transactions (${freeIds.length})`, channel: null, quantity: freeIds.length, unit_label: 'txn', gross_volume: 0, amount: 0, sort_order: sort++ });
  }

  let subtotal = round2(usageSubtotal + baseFee);

  // Monthly minimum top-up.
  if (minFee > 0 && subtotal < minFee) {
    lines.push({ description: 'Monthly minimum adjustment', channel: null, quantity: 1, unit_label: null, gross_volume: 0, amount: round2(minFee - subtotal), sort_order: sort++ });
    subtotal = minFee;
  }
  // Monthly cap.
  if (capFee != null && subtotal > capFee) {
    lines.push({ description: 'Monthly cap adjustment', channel: null, quantity: 1, unit_label: null, gross_volume: 0, amount: round2(capFee - subtotal), sort_order: sort++ });
    subtotal = capFee;
  }

  const taxAmount = round2((subtotal * taxPercent) / 100);
  const total = round2(subtotal + taxAmount);
  const { start, end } = periodBounds(period);
  const invoiceNumber = `INV-${period.replace('-', '')}-${headOfficeId.slice(0, 8).toUpperCase()}`;
  const now = new Date();
  const dueAt = new Date(now.getTime() + DUE_DAYS * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.subscriptionInvoice.create({
      data: {
        invoice_number: invoiceNumber,
        head_office_id: headOfficeId,
        subscription_id: subscription?.id || null,
        billing_period: period,
        period_start: start,
        period_end: end,
        currency,
        txn_count: billable.length,
        gross_volume: round2(grossVolume),
        subtotal,
        tax_percent: taxPercent,
        tax_amount: taxAmount,
        total,
        status: 'issued',
        issued_at: now,
        due_at: dueAt,
        notes: taxLabel ? `Includes ${taxPercent}% ${taxLabel}` : null,
        lines: { create: lines },
      },
    });

    // Mark events invoiced; flag the free ones.
    await tx.billingUsageEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { invoiced: true, invoice_id: invoice.id },
    });
    if (freeIds.length > 0) {
      await tx.billingUsageEvent.updateMany({ where: { id: { in: freeIds } }, data: { is_free: true } });
    }
    return invoice;
  });
}

/**
 * Generates invoices for every head office with uninvoiced usage in a period.
 * Per-head-office try/catch — one failure never aborts the batch.
 *
 * @param {string} [period] - `YYYY-MM`. Defaults to the previous month.
 * @returns {Promise<{period:string, generated:number, skipped:number, failed:number}>}
 */
async function generateInvoicesForPeriod(period = previousPeriod()) {
  const prisma = getDbClient();
  const groups = await prisma.billingUsageEvent.groupBy({
    by: ['head_office_id'],
    where: { billing_period: period, invoiced: false },
  });

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  for (const g of groups) {
    try {
      const inv = await rollupHeadOffice(prisma, g.head_office_id, period);
      if (inv) generated += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      logger.error('Invoice rollup failed for head office', { headOfficeId: g.head_office_id, period, error: err.message });
    }
  }
  logger.info('Monthly billing rollup complete', { period, generated, skipped, failed, headOffices: groups.length });
  return { period, generated, skipped, failed };
}

/** Round to 2 decimal places. @param {number} n @returns {number} */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Monthly billing — 1st of every month at 00:10 UTC, bills the closed month.
cron.schedule('10 0 1 * *', async () => {
  logger.info('Starting monthly billing rollup...');
  try {
    await generateInvoicesForPeriod();
  } catch (error) {
    logger.error('Monthly billing job failed', { error: error.message });
  }
});

module.exports = {
  generateInvoicesForPeriod,
  rollupHeadOffice,
  previousPeriod,
  periodBounds,
};
