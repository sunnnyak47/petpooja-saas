/**
 * @fileoverview Aggregator commission & payout reconciliation service.
 *
 * Gives restaurants a per-delivery-platform view of gross sales, the commission
 * each aggregator takes, and the expected net payout — and lets them turn an
 * aggregator payout into a reconcilable Settlement (bridged into the existing
 * settlements feature). Every query is strictly scoped by outlet_id +
 * is_deleted:false for tenant isolation.
 *
 * @module modules/integrations/aggregator.reconciliation.service
 */

const prisma = require('../../config/database').getDbClient();
const { BadRequestError } = require('../../utils/errors');
const settlementService = require('../settlements/settlement.service');

/**
 * Commission rate per delivery platform, expressed as a fraction of gross.
 * @type {Record<string, number>}
 */
const COMMISSION_RATES = {
  swiggy: 0.18,
  zomato: 0.15,
  doordash: 0.20,
  menulog: 0.14,
  uber_eats: 0.30,
};

/** Default fallback commission for any unknown/unlisted platform. */
const DEFAULT_COMMISSION = 0.15;

/** Human-friendly display names for each platform key. */
const PLATFORM_NAMES = {
  swiggy: 'Swiggy',
  zomato: 'Zomato',
  doordash: 'DoorDash',
  menulog: 'Menulog',
  uber_eats: 'Uber Eats',
};

/**
 * Resolve the commission fraction for a platform key (case-insensitive).
 * @param {string} platform
 * @returns {number}
 */
function commissionFor(platform) {
  const key = String(platform || '').toLowerCase();
  return COMMISSION_RATES[key] != null ? COMMISSION_RATES[key] : DEFAULT_COMMISSION;
}

/**
 * Human display name for a platform key, falling back to a title-cased key.
 * @param {string} platform
 * @returns {string}
 */
function platformName(platform) {
  const key = String(platform || '').toLowerCase();
  if (PLATFORM_NAMES[key]) return PLATFORM_NAMES[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Unknown';
}

/**
 * Round a numeric-ish value to 2 decimal places, returning a Number.
 * @param {*} v
 * @returns {number}
 */
function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Build a tenant-scoped Prisma `where` for aggregator orders.
 * @param {string} outletId
 * @param {object} [opts]
 * @param {string} [opts.from] - ISO date (inclusive lower bound on created_at)
 * @param {string} [opts.to] - ISO date (inclusive upper bound on created_at)
 * @param {string} [opts.platform] - Restrict to a single platform key
 * @returns {object}
 */
function buildWhere(outletId, { from, to, platform } = {}) {
  const where = {
    outlet_id: outletId,
    aggregator: { not: null },
    is_deleted: false,
  };
  if (platform) where.aggregator = platform;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at.gte = new Date(from);
    if (to) where.created_at.lte = new Date(to);
  }
  return where;
}

const aggregatorReconciliationService = {
  COMMISSION_RATES,
  commissionFor,

  /**
   * Per-platform commission report for an outlet.
   *
   * Groups non-deleted aggregator orders by platform and computes gross sales,
   * the commission the platform takes, and the expected net payout.
   *
   * @param {string} outletId
   * @param {object} [opts]
   * @param {string} [opts.from] - ISO date lower bound (inclusive)
   * @param {string} [opts.to] - ISO date upper bound (inclusive)
   * @param {string} [opts.platform] - Optional single-platform filter
   * @returns {Promise<{rows:Array, totals:object}>}
   */
  async commissionReport(outletId, { from, to, platform } = {}) {
    const where = buildWhere(outletId, { from, to, platform });

    const grouped = await prisma.order.groupBy({
      by: ['aggregator'],
      where,
      _count: { _all: true },
      _sum: { grand_total: true },
    });

    const rows = grouped
      .map((g) => {
        const key = g.aggregator;
        const commission = commissionFor(key);
        const gross = round2(g._sum.grand_total || 0);
        const commissionAmount = round2(gross * commission);
        const netPayout = round2(gross - commissionAmount);
        return {
          platform: key,
          platform_name: platformName(key),
          order_count: g._count._all,
          gross,
          commission_pct: round2(commission * 100),
          commission_amount: commissionAmount,
          net_payout: netPayout,
        };
      })
      .sort((a, b) => b.gross - a.gross);

    const totals = rows.reduce(
      (acc, r) => {
        acc.order_count += r.order_count;
        acc.gross = round2(acc.gross + r.gross);
        acc.commission_amount = round2(acc.commission_amount + r.commission_amount);
        acc.net_payout = round2(acc.net_payout + r.net_payout);
        return acc;
      },
      { order_count: 0, gross: 0, commission_amount: 0, net_payout: 0 }
    );

    return { rows, totals };
  },

  /**
   * Convert an aggregator payout into a reconcilable Settlement.
   *
   * Loads every non-deleted aggregator order for the platform in the given
   * range and creates a Settlement (one line per order) via the settlements
   * service. The resulting settlement can then be reconciled in the Settlements
   * UI against recorded payments.
   *
   * @param {string} outletId
   * @param {string} platform - Platform key (e.g. 'uber_eats')
   * @param {object} opts
   * @param {string} [opts.from] - ISO date lower bound (inclusive)
   * @param {string} [opts.to] - ISO date upper bound (inclusive)
   * @param {string} [opts.reference] - Optional payout reference
   * @param {object} user - Authenticated user (needs .id)
   * @returns {Promise<object>} The created settlement
   */
  async payoutToSettlement(outletId, platform, { from, to, reference } = {}, user) {
    if (!platform) throw new BadRequestError('platform is required');

    const where = buildWhere(outletId, { from, to, platform });
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        aggregator_order_id: true,
        order_number: true,
        grand_total: true,
      },
      orderBy: { created_at: 'asc' },
    });

    if (!orders.length) {
      throw new BadRequestError(
        `No ${platformName(platform)} orders found for the selected period`
      );
    }

    const commission = commissionFor(platform);
    const lines = orders.map((o) => {
      const amount = round2(o.grand_total);
      const fee = round2(amount * commission);
      return {
        transaction_id: o.aggregator_order_id || o.id,
        order_ref: o.order_number || null,
        type: 'payment',
        amount,
        fee,
        net: round2(amount - fee),
      };
    });

    const settlement = await settlementService.create(
      outletId,
      {
        provider: platform,
        reference: reference || `${platformName(platform)} payout`,
        settlement_date: new Date(),
        currency: 'AUD',
        lines,
      },
      user
    );

    return settlement;
  },
};

module.exports = aggregatorReconciliationService;
