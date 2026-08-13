/**
 * @fileoverview Regression guard for the AU GST BLOCKER: the tax engine must charge
 * a FLAT 10% for Australian outlets regardless of a stale per-item gst_rate (the 95
 * legacy items were stored at India's 5%), and inclusive tax must round ONCE so the
 * parts reconcile to the price (no 5.99 -> 0.55 double-rounding).
 * @module tests/tax-au-rate.test
 */

const { calculateItemTax } = require('../src/modules/orders/tax.service');

const AU = { country_code: 'AU', default_gst_rate: 10 };
const inc = (price, gst_rate) => calculateItemTax({ base_price: price, quantity: 1, gst_rate, is_inclusive: true }, AU);

describe('AU GST — flat 10% regardless of stored per-item rate', () => {
  test('a legacy item stored at 5% is charged 10% (the BLOCKER)', () => {
    // ONION SALAD A$5.99, stored gst_rate 5 → GST A$0.54 (10%), not A$0.29 (5%).
    const onion = inc(5.99, 5);
    expect(onion.total_tax).toBe(0.54);
    expect(onion.igst).toBe(0.54); // AU reports GST via the single igst field
    // BUTTER CHICKEN A$25.00, stored 5 → A$2.27 (10%), not A$1.19.
    expect(inc(25.00, 5).total_tax).toBe(2.27);
  });

  test('a newly-created item stored at 10% is unchanged', () => {
    expect(inc(15.00, 10).total_tax).toBe(1.36);
  });

  test('even gst_rate 0 / missing is coerced to the flat AU 10%', () => {
    expect(inc(11.00, 0).total_tax).toBe(1.00);
    expect(calculateItemTax({ base_price: 11, quantity: 1, is_inclusive: true }, AU).total_tax).toBe(1.00);
  });

  test('inclusive tax rounds ONCE and reconciles to the price (no double-rounding)', () => {
    // 5.99 incl 10%: 5.99/11 = 0.5445 → 0.54 (single round), NOT 0.545→0.55.
    const r = inc(5.99, 10);
    expect(r.total_tax).toBe(0.54);
    expect(r.taxable_amount).toBe(5.45);
    expect(r.taxable_amount + r.total_tax).toBeCloseTo(5.99, 2); // parts reconcile
    // 80.99 incl 10%: A$7.36, not A$7.37.
    expect(inc(80.99, 10).total_tax).toBe(7.36);
  });

  test('India is unaffected — stored rate honored, no AU coercion', () => {
    const IN = { country_code: 'IN', state: 'MH' };
    const r = calculateItemTax({ base_price: 100, quantity: 1, gst_rate: 5, is_inclusive: false }, IN);
    expect(r.total_tax).toBe(5); // 5% exclusive
    expect(r.cgst).toBe(2.5);
    expect(r.sgst).toBe(2.5);
    // an 18% item stays 18% in India
    expect(calculateItemTax({ base_price: 100, quantity: 1, gst_rate: 18, is_inclusive: false }, IN).total_tax).toBe(18);
  });
});
