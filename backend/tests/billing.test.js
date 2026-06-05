/**
 * @fileoverview Usage-based billing — unit tests for the metering math.
 *
 * These exercise the pure fee-computation helpers (no DB), so they run
 * everywhere including CI. Channel resolution, per-channel rate rules, flat
 * fees, per-transaction minimum floors and rounding are all covered.
 *
 * @module tests/billing.test
 */

const {
  billingPeriodOf,
  resolveChannel,
  ruleForChannel,
  computeFee,
} = require('../src/modules/headoffice/billing.metering.service');

// Mirrors the seeded IN_USAGE_STD plan: 1.75% online, flat ₹2 dine-in.
const IN_PLAN = {
  code: 'IN_USAGE_STD',
  txn_fee_percent: 1.75,
  flat_fee_per_txn: 0,
  rate_rules: {
    channels: {
      online: { percent: 1.75, flat: 0 },
      dine_in: { percent: 0, flat: 2 },
      default: { percent: 1.75, flat: 0 },
    },
  },
};

// Mirrors the seeded AU_USAGE_STD plan: 0.9% all channels, A$0.10 floor.
const AU_PLAN = {
  code: 'AU_USAGE_STD',
  txn_fee_percent: 0.9,
  flat_fee_per_txn: 0,
  rate_rules: { channels: { default: { percent: 0.9, flat: 0, min_fee: 0.1 } } },
};

describe('Usage billing — metering math', () => {
  describe('billingPeriodOf', () => {
    test('formats a date as YYYY-MM (UTC)', () => {
      expect(billingPeriodOf(new Date(Date.UTC(2026, 5, 6)))).toBe('2026-06');
      expect(billingPeriodOf(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01');
      expect(billingPeriodOf(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12');
    });
  });

  describe('resolveChannel', () => {
    test('maps order types to canonical channels', () => {
      expect(resolveChannel({ order_type: 'dine_in' })).toBe('dine_in');
      expect(resolveChannel({ order_type: 'takeaway' })).toBe('takeaway');
      expect(resolveChannel({ order_type: 'online' })).toBe('online');
      expect(resolveChannel({ order_type: 'qr_order' })).toBe('qr');
    });

    test('aggregator source overrides order_type', () => {
      expect(resolveChannel({ order_type: 'online', source: 'Zomato' })).toBe('zomato');
      expect(resolveChannel({ order_type: 'delivery', platform: 'swiggy' })).toBe('swiggy');
    });

    test('defaults to dine_in when nothing is provided', () => {
      expect(resolveChannel({})).toBe('dine_in');
    });
  });

  describe('ruleForChannel', () => {
    test('returns the channel-specific rule', () => {
      expect(ruleForChannel(IN_PLAN, 'online')).toEqual({ percent: 1.75, flat: 0, min_fee: 0 });
      expect(ruleForChannel(IN_PLAN, 'dine_in')).toEqual({ percent: 0, flat: 2, min_fee: 0 });
    });

    test('falls back to default then to plan-level knobs', () => {
      expect(ruleForChannel(IN_PLAN, 'unknown')).toEqual({ percent: 1.75, flat: 0, min_fee: 0 });
      const bare = { txn_fee_percent: 3, flat_fee_per_txn: 1, rate_rules: {} };
      expect(ruleForChannel(bare, 'anything')).toEqual({ percent: 3, flat: 1, min_fee: 0 });
    });
  });

  describe('computeFee', () => {
    test('India online: 1.75% of gross', () => {
      const r = computeFee(IN_PLAN, 'online', 1000);
      expect(r.fee_amount).toBe(17.5);
      expect(r.fee_percent).toBe(1.75);
    });

    test('India dine-in: flat ₹2 regardless of value', () => {
      expect(computeFee(IN_PLAN, 'dine_in', 1000).fee_amount).toBe(2);
      expect(computeFee(IN_PLAN, 'dine_in', 50).fee_amount).toBe(2);
    });

    test('AU: 0.9% with an A$0.10 floor on tiny tickets', () => {
      expect(computeFee(AU_PLAN, 'online', 100).fee_amount).toBe(0.9);
      // 0.9% of A$5 = A$0.045 → floored to A$0.10
      expect(computeFee(AU_PLAN, 'online', 5).fee_amount).toBe(0.1);
    });

    test('rounds to 2 decimal places', () => {
      const r = computeFee(IN_PLAN, 'online', 333.33);
      expect(r.fee_amount).toBe(Math.round(333.33 * 1.75) / 100);
      expect(Number.isInteger(r.fee_amount * 100)).toBe(true);
    });

    test('zero gross yields zero fee (no floor on the default IN plan)', () => {
      expect(computeFee(IN_PLAN, 'online', 0).fee_amount).toBe(0);
    });
  });
});
