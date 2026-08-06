/**
 * @fileoverview Regression guard for recalcOrderTotals: an order-level discount
 * (or loyalty reduction) already on the order must SURVIVE a totals recompute.
 *
 * Why: recalcOrderTotals is the shared totals engine for addItemsToOrder and
 * mergeOrder. It used to recompute purely from line items and IGNORE any
 * discount_amount / loyalty_discount already persisted on the order. So adding
 * a single item to (or merging into) a discounted bill silently dropped the
 * discount — the guest was re-charged the full un-discounted base AND taxed on
 * it. The fix makes recalc discount-aware: it clamps the reduction, spreads it
 * proportionally across the taxable base (mirroring the apply-discount path's
 * recomputeOrderWithDiscount), taxes the POST-discount base, and returns the
 * preserved discount/loyalty so the callers persist them.
 *
 * Unit-level: recalcOrderTotals only touches tx.orderItem.findMany and pure tax
 * helpers, so we drive it with a mock tx + an explicit taxConfig — no Postgres.
 * @module tests/order-discount-preserved-on-recalc.test
 */

jest.mock('../src/config/database', () => ({ getDbClient: () => ({}) }));
jest.mock('../src/socket/index', () => ({ getIO: () => null }));

const { recalcOrderTotals } = require('../src/modules/orders/order.service');
const { round2 } = require('../src/utils/money');

// A mock Prisma tx whose orderItem.findMany returns the supplied line items.
const txWith = (items) => ({ orderItem: { findMany: async () => items } });

// AU: single 10% GST slab, tax-inclusive pricing.
const AU = { country_code: 'AU', state: null, gst_inclusive: true, default_gst_rate: 10 };
// IN: exclusive GST added on top; intra-state splits into CGST+SGST.
const IN = { country_code: 'IN', state: 'MH', gst_inclusive: false, default_gst_rate: 5 };

describe('recalcOrderTotals — order-level discount survives a recompute', () => {
  test('AU inclusive: a $11 (10%) discount is preserved and the taxable base drops', async () => {
    // One line: item_total 110 (GST-inclusive). Discount 11 → taxable base 99.
    const items = [{ item_total: 110, quantity: 1, gst_rate: 10 }];
    const totals = await recalcOrderTotals(txWith(items), 'order-1', AU, 11, 0);

    expect(totals.subtotal).toBe(110);
    // The discount is NOT dropped — this is the whole point of the fix.
    expect(totals.discount).toBe(11);
    // Taxable base is charged post-discount (subtotal - reduction), not the full 110.
    expect(totals.taxableAmount).toBe(99);
    // Inclusive pricing → the total equals the discounted taxable base.
    expect(totals.totalAmount).toBe(99);
    // GST is computed on the discounted base (9, inclusive of the $99), never on 110.
    expect(totals.totalTax).toBeCloseTo(9, 2);
  });

  test('backward-compatible: with NO discount the totals are unchanged (discount=0)', async () => {
    const items = [{ item_total: 110, quantity: 1, gst_rate: 10 }];
    const totals = await recalcOrderTotals(txWith(items), 'order-1', AU, 0, 0);

    expect(totals.discount).toBe(0);
    expect(totals.taxableAmount).toBe(110);
    expect(totals.totalAmount).toBe(110);
  });

  test('IN exclusive: discount reduces BOTH the taxable base and the GST charged', async () => {
    // Two lines summing to 1000 subtotal; 100 discount → 900 taxable base.
    const items = [
      { item_total: 600, quantity: 2, gst_rate: 5 },
      { item_total: 400, quantity: 1, gst_rate: 5 },
    ];
    const undiscounted = await recalcOrderTotals(txWith(items), 'order-2', IN, 0, 0);
    const discounted = await recalcOrderTotals(txWith(items), 'order-2', IN, 100, 0);

    expect(discounted.discount).toBe(100);
    expect(discounted.taxableAmount).toBe(900);
    // Exclusive GST on a smaller base ⇒ strictly less tax than the un-discounted bill.
    expect(discounted.totalTax).toBeLessThan(undiscounted.totalTax);
    // Intra-state ⇒ the tax splits evenly into CGST + SGST, no IGST.
    expect(round2(discounted.cgst + discounted.sgst)).toBeCloseTo(discounted.totalTax, 2);
    expect(discounted.igst).toBe(0);
    // Grand total = discounted base + GST-on-discounted-base.
    expect(discounted.totalAmount).toBeCloseTo(round2(900 + discounted.totalTax), 2);
  });

  test('a discount larger than the subtotal is clamped — the bill can never go negative', async () => {
    const items = [{ item_total: 50, quantity: 1, gst_rate: 10 }];
    const totals = await recalcOrderTotals(txWith(items), 'order-3', AU, 999, 0);

    expect(totals.discount).toBe(50); // clamped to subtotal
    expect(totals.taxableAmount).toBe(0);
    expect(totals.totalAmount).toBe(0);
    expect(totals.grandTotal).toBeGreaterThanOrEqual(0);
  });

  test('discount + loyalty stack, and their combined reduction is clamped to the subtotal', async () => {
    const items = [{ item_total: 100, quantity: 1, gst_rate: 10 }];
    // 70 discount + 60 loyalty = 130 requested against a 100 subtotal.
    const totals = await recalcOrderTotals(txWith(items), 'order-4', AU, 70, 60);

    expect(totals.discount).toBe(70);
    // Loyalty is clamped to whatever remains after the discount (100 - 70 = 30).
    expect(totals.loyalty).toBe(30);
    expect(totals.taxableAmount).toBe(0);
    expect(totals.totalAmount).toBe(0);
  });
});
