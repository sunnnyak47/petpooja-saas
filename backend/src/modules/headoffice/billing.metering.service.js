/**
 * @fileoverview Usage-based billing — transaction metering.
 *
 * Records one idempotent {@link BillingUsageEvent} per billable order. The
 * software fee is computed from the head office's active billing plan (config
 * driven via `rate_rules`), so rates are tuned as data, never in code.
 *
 * Design rules:
 *  - Idempotent: the unique [source_type, source_id, event_type] key makes a
 *    re-fired hook a no-op instead of a double-charge.
 *  - Non-blocking: every entry point swallows its own errors. Metering must
 *    NEVER break the order/payment path.
 *  - Free-tier, monthly minimum and caps are applied at INVOICE ROLLUP, not
 *    here — so this layer stays race-free and each event stores the raw,
 *    would-be fee for a fully auditable ledger.
 *
 * @module modules/headoffice/billing.metering.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * Current billing period as `YYYY-MM` (UTC).
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
function billingPeriodOf(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Maps an order's type/source to a billing channel key used in plan.rate_rules.
 * @param {object} order
 * @returns {string}
 */
function resolveChannel(order) {
  // Explicit external aggregator wins (zomato/swiggy), then order_type.
  const src = (order.source || order.platform || '').toString().toLowerCase();
  if (src.includes('zomato')) return 'zomato';
  if (src.includes('swiggy')) return 'swiggy';
  const type = (order.order_type || 'dine_in').toString().toLowerCase();
  if (['dine_in', 'dinein'].includes(type)) return 'dine_in';
  if (['takeaway', 'take_away', 'pickup'].includes(type)) return 'takeaway';
  if (['online', 'delivery'].includes(type)) return 'online';
  if (['qr', 'qr_order', 'self_order'].includes(type)) return 'qr';
  return type || 'default';
}

/**
 * Resolves the fee rule {percent, flat, min_fee} for a channel from a plan.
 * Falls back to the plan's `default` channel rule, then to the plan's flat
 * top-level knobs.
 * @param {object} plan - BillingPlan row
 * @param {string} channel
 * @returns {{percent:number, flat:number, min_fee:number}}
 */
function ruleForChannel(plan, channel) {
  const rules = (plan && plan.rate_rules && plan.rate_rules.channels) || {};
  const r = rules[channel] || rules.default || {};
  return {
    percent: Number(r.percent ?? plan?.txn_fee_percent ?? 0),
    flat: Number(r.flat ?? plan?.flat_fee_per_txn ?? 0),
    min_fee: Number(r.min_fee ?? 0),
  };
}

/**
 * Computes the would-be software fee for one transaction.
 * @param {object} plan
 * @param {string} channel
 * @param {number} gross
 * @returns {{fee_percent:number, flat_fee:number, fee_amount:number}}
 */
function computeFee(plan, channel, gross) {
  const rule = ruleForChannel(plan, channel);
  const pct = (Number(gross) * rule.percent) / 100;
  let fee = pct + rule.flat;
  if (rule.min_fee && fee < rule.min_fee) fee = rule.min_fee;
  // Round to 2 dp (currency minor units).
  fee = Math.round(fee * 100) / 100;
  return { fee_percent: rule.percent, flat_fee: rule.flat, fee_amount: fee };
}

/**
 * Resolves the head office + active subscription + plan for an outlet.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} outletId
 * @returns {Promise<{headOfficeId:string, subscription:object|null, plan:object|null, region:string, currency:string}|null>}
 */
async function resolveBillingContext(prisma, outletId) {
  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId },
    select: { id: true, head_office_id: true, currency: true, head_office: { select: { id: true, region: true, currency: true } } },
  });
  if (!outlet || !outlet.head_office_id) return null;
  const headOfficeId = outlet.head_office_id;
  const region = outlet.head_office?.region || 'IN';
  const currency = outlet.head_office?.currency || outlet.currency || 'INR';

  const subscription = await prisma.subscription.findFirst({
    where: { head_office_id: headOfficeId, is_deleted: false, status: { in: ['active', 'trialing', 'past_due', 'grace'] } },
    orderBy: { created_at: 'desc' },
    include: { plan: true },
  });

  let plan = subscription?.plan || null;
  // Fall back to a region-default active plan so usage is still metered even
  // before a subscription row is attached to a plan.
  if (!plan) {
    plan = await prisma.billingPlan.findFirst({
      where: { region, is_active: true, is_deleted: false },
      orderBy: { sort_order: 'asc' },
    });
  }
  return { headOfficeId, subscription: subscription || null, plan, region, currency };
}

/**
 * Records a usage event for a completed/paid order. Idempotent and non-blocking.
 * @param {object} order - Order with at least { id, outlet_id, order_type, grand_total }
 * @param {object} [opts]
 * @param {string} [opts.eventType='order_completed']
 * @returns {Promise<object|null>} The created/existing event, or null on skip/error.
 */
async function recordOrderUsage(order, opts = {}) {
  const eventType = opts.eventType || 'order_completed';
  try {
    if (!order || !order.id || !order.outlet_id) return null;
    const prisma = getDbClient();

    // Fast idempotency short-circuit (also enforced by the DB unique index).
    const existing = await prisma.billingUsageEvent.findFirst({
      where: { source_type: 'order', source_id: String(order.id), event_type: eventType },
    });
    if (existing) return existing;

    const ctx = await resolveBillingContext(prisma, order.outlet_id);
    if (!ctx) return null; // No head office / plan → nothing to meter.

    const channel = resolveChannel(order);
    const gross = Number(order.grand_total || order.total || 0);
    const { fee_percent, flat_fee, fee_amount } = ctx.plan
      ? computeFee(ctx.plan, channel, gross)
      : { fee_percent: 0, flat_fee: 0, fee_amount: 0 };

    try {
      return await prisma.billingUsageEvent.create({
        data: {
          head_office_id: ctx.headOfficeId,
          outlet_id: order.outlet_id,
          subscription_id: ctx.subscription?.id || null,
          event_type: eventType,
          channel,
          source_type: 'order',
          source_id: String(order.id),
          gross_amount: gross,
          fee_percent,
          flat_fee,
          fee_amount,
          currency: ctx.currency,
          billing_period: billingPeriodOf(),
          metadata: { order_number: order.order_number || null, plan_code: ctx.plan?.code || null },
        },
      });
    } catch (e) {
      // Unique violation = concurrent duplicate; treat as success (idempotent).
      if (e && e.code === 'P2002') {
        return prisma.billingUsageEvent.findFirst({
          where: { source_type: 'order', source_id: String(order.id), event_type: eventType },
        });
      }
      throw e;
    }
  } catch (error) {
    logger.warn('Usage metering failed (non-critical)', { orderId: order?.id, error: error.message });
    return null;
  }
}

module.exports = {
  recordOrderUsage,
  // Exported for unit tests / reuse by the rollup job.
  billingPeriodOf,
  resolveChannel,
  ruleForChannel,
  computeFee,
};
