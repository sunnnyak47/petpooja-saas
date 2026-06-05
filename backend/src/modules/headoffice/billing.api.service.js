/**
 * @fileoverview Usage-based SaaS billing — read/query service for the API layer.
 *
 * Aggregations for the SuperAdmin billing dashboard (MRR-style usage, overdue,
 * invoice lists) and the restaurant self-serve billing page (current-period
 * usage meter, own invoices, subscription/plan info). Pure reads + plan CRUD;
 * mutating billing actions live in the rollup / collection / dunning services.
 *
 * @module modules/headoffice/billing.api.service
 */

const { getDbClient } = require('../../config/database');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { billingPeriodOf } = require('./billing.metering.service');

function num(n) { return Number(n || 0); }

/**
 * SuperAdmin overview: current-period metered revenue, outstanding, counts.
 * @param {object} [opts]
 * @param {string} [opts.period] - YYYY-MM, defaults to current.
 * @returns {Promise<object>}
 */
async function getAdminOverview(opts = {}) {
  const prisma = getDbClient();
  const period = opts.period || billingPeriodOf();

  const [usageAgg, freeAgg, invoiceAgg, overdueAgg, activeSubs, planCount] = await Promise.all([
    prisma.billingUsageEvent.aggregate({
      where: { billing_period: period },
      _sum: { fee_amount: true, gross_amount: true },
      _count: { _all: true },
    }),
    prisma.billingUsageEvent.count({ where: { billing_period: period, is_free: true } }),
    prisma.subscriptionInvoice.aggregate({
      where: { billing_period: period, is_deleted: false },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.subscriptionInvoice.aggregate({
      where: { status: 'overdue', is_deleted: false },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.subscription.count({ where: { is_deleted: false, status: { in: ['active', 'trialing', 'grace', 'past_due'] } } }),
    prisma.billingPlan.count({ where: { is_active: true, is_deleted: false } }),
  ]);

  return {
    period,
    metered_fee_total: num(usageAgg._sum.fee_amount),
    gross_volume: num(usageAgg._sum.gross_amount),
    txn_count: usageAgg._count._all,
    free_txn_count: freeAgg,
    invoiced_total: num(invoiceAgg._sum.total),
    invoice_count: invoiceAgg._count._all,
    overdue_total: num(overdueAgg._sum.total),
    overdue_count: overdueAgg._count._all,
    active_subscriptions: activeSubs,
    active_plans: planCount,
  };
}

/**
 * Lists invoices for the admin dashboard.
 * @param {object} [filters] - { status, period, headOfficeId, limit }
 * @returns {Promise<object[]>}
 */
async function listAdminInvoices(filters = {}) {
  const prisma = getDbClient();
  const where = { is_deleted: false };
  if (filters.status) where.status = filters.status;
  if (filters.period) where.billing_period = filters.period;
  if (filters.headOfficeId) where.head_office_id = filters.headOfficeId;
  return prisma.subscriptionInvoice.findMany({
    where,
    orderBy: [{ created_at: 'desc' }],
    take: Math.min(Number(filters.limit) || 100, 500),
    include: { head_office: { select: { id: true, name: true, contact_email: true } } },
  });
}

/**
 * Current-period usage meter for one head office.
 * @param {string} headOfficeId
 * @param {string} [period]
 * @returns {Promise<object>}
 */
async function getMyUsage(headOfficeId, period = billingPeriodOf()) {
  const prisma = getDbClient();
  if (!headOfficeId) throw new BadRequestError('No head office linked to this account');

  const subscription = await prisma.subscription.findFirst({
    where: { head_office_id: headOfficeId, is_deleted: false },
    orderBy: { created_at: 'desc' },
    include: { plan: true },
  });
  const plan = subscription?.plan || null;

  const events = await prisma.billingUsageEvent.findMany({
    where: { head_office_id: headOfficeId, billing_period: period },
    orderBy: { occurred_at: 'asc' },
  });

  const freeQuota = num(plan?.free_txns_monthly);
  let estFee = 0;
  let gross = 0;
  const byChannel = {};
  events.forEach((ev, idx) => {
    gross += num(ev.gross_amount);
    const billable = idx >= freeQuota;
    const fee = billable ? num(ev.fee_amount) : 0;
    estFee += fee;
    const ch = ev.channel || 'default';
    byChannel[ch] = byChannel[ch] || { channel: ch, count: 0, gross_volume: 0, fee: 0 };
    byChannel[ch].count += 1;
    byChannel[ch].gross_volume += num(ev.gross_amount);
    byChannel[ch].fee += fee;
  });

  const baseFee = num(plan?.base_monthly_fee);
  const minFee = num(plan?.monthly_min_fee);
  let subtotal = estFee + baseFee;
  if (minFee > 0 && subtotal < minFee) subtotal = minFee;
  const taxPercent = num(plan?.tax_percent);
  const taxAmount = Math.round(((subtotal * taxPercent) / 100) * 100) / 100;

  return {
    period,
    currency: plan?.currency || subscription?.currency || 'INR',
    plan: plan ? { code: plan.code, name: plan.name, free_txns_monthly: freeQuota } : null,
    txn_count: events.length,
    free_remaining: Math.max(0, freeQuota - events.length),
    gross_volume: Math.round(gross * 100) / 100,
    estimated_subtotal: Math.round(subtotal * 100) / 100,
    estimated_tax: taxAmount,
    estimated_total: Math.round((subtotal + taxAmount) * 100) / 100,
    by_channel: Object.values(byChannel).map((c) => ({
      ...c,
      gross_volume: Math.round(c.gross_volume * 100) / 100,
      fee: Math.round(c.fee * 100) / 100,
    })),
  };
}

/**
 * Subscription + plan info for one head office.
 * @param {string} headOfficeId
 * @returns {Promise<object>}
 */
async function getMySubscription(headOfficeId) {
  const prisma = getDbClient();
  if (!headOfficeId) throw new BadRequestError('No head office linked to this account');
  const subscription = await prisma.subscription.findFirst({
    where: { head_office_id: headOfficeId, is_deleted: false },
    orderBy: { created_at: 'desc' },
    include: { plan: true },
  });
  const availablePlans = await prisma.billingPlan.findMany({
    where: { is_active: true, is_deleted: false },
    orderBy: { sort_order: 'asc' },
  });
  return { subscription, plan: subscription?.plan || null, available_plans: availablePlans };
}

/**
 * Invoices belonging to one head office.
 * @param {string} headOfficeId
 * @returns {Promise<object[]>}
 */
async function listMyInvoices(headOfficeId) {
  const prisma = getDbClient();
  if (!headOfficeId) throw new BadRequestError('No head office linked to this account');
  return prisma.subscriptionInvoice.findMany({
    where: { head_office_id: headOfficeId, is_deleted: false },
    orderBy: { created_at: 'desc' },
    include: { lines: { orderBy: { sort_order: 'asc' } } },
  });
}

/**
 * Asserts an invoice belongs to a head office (tenant isolation).
 * @param {string} invoiceId
 * @param {string} headOfficeId
 * @returns {Promise<object>}
 */
async function assertInvoiceOwnership(invoiceId, headOfficeId) {
  const prisma = getDbClient();
  const invoice = await prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId, is_deleted: false } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (headOfficeId && invoice.head_office_id !== headOfficeId) {
    throw new NotFoundError('Invoice not found');
  }
  return invoice;
}

// ---- Plan CRUD (SuperAdmin) ----

/** @returns {Promise<object[]>} */
async function listPlans() {
  const prisma = getDbClient();
  return prisma.billingPlan.findMany({ where: { is_deleted: false }, orderBy: { sort_order: 'asc' } });
}

/** @param {object} data @returns {Promise<object>} */
async function createPlan(data) {
  const prisma = getDbClient();
  if (!data.code || !data.name) throw new BadRequestError('code and name are required');
  return prisma.billingPlan.create({ data });
}

/** @param {string} id @param {object} data @returns {Promise<object>} */
async function updatePlan(id, data) {
  const prisma = getDbClient();
  const existing = await prisma.billingPlan.findFirst({ where: { id, is_deleted: false } });
  if (!existing) throw new NotFoundError('Plan not found');
  // Never allow the immutable code to be rewritten through update.
  const { code: _code, ...rest } = data;
  return prisma.billingPlan.update({ where: { id }, data: rest });
}

module.exports = {
  getAdminOverview,
  listAdminInvoices,
  getMyUsage,
  getMySubscription,
  listMyInvoices,
  assertInvoiceOwnership,
  listPlans,
  createPlan,
  updatePlan,
};
