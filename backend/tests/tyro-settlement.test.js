/**
 * @fileoverview Unit tests for the Tyro settlement reconciliation math
 * (computeSettlement) — pure function, no DB. Guards the launch-audit
 * requirement: approved terminal transactions (purchases minus refunds, tips
 * and surcharges broken out) vs the POS Payment rows, with a mismatch list.
 * @module tests/tyro-settlement.test
 */

const { computeSettlement } = require('../src/modules/integrations/tyro.service');

const txn = (over = {}) => ({
  id: over.id || 'txn-1',
  order_id: 'order-1',
  payment_id: null,
  type: 'purchase',
  status: 'approved',
  amount_cents: 1000,
  base_amount_cents: 1000,
  tip_cents: 0,
  surcharge_cents: 0,
  cashout_cents: 0,
  our_ref: 'ref-1',
  tyro_reference: 'TYRO-1',
  card_type: 'VISA',
  elided_pan: '**** 4242',
  completed_at: new Date('2026-09-26T03:00:00Z'),
  ...over,
});

const pay = (over = {}) => ({
  id: over.id || 'pay-1',
  order_id: 'order-1',
  amount: 10.0,           // Decimal dollars, like Prisma returns
  method: 'card_pine_labs',
  status: 'success',
  transaction_id: null,
  ...over,
});

describe('computeSettlement — totals', () => {
  test('purchases minus refunds, tips and surcharges broken out', () => {
    const r = computeSettlement(
      [
        txn({ id: 't1', base_amount_cents: 1000, tip_cents: 200, surcharge_cents: 15 }),   // $12.15 settled
        txn({ id: 't2', order_id: 'order-2', base_amount_cents: 500 }),                     // $5.00
        txn({ id: 't3', order_id: 'order-2', type: 'refund', base_amount_cents: 300 }),     // -$3.00
      ],
      [
        pay({ id: 'p1', amount: 12.0 }),                                     // base+tip (POS never records surcharge)
        pay({ id: 'p2', order_id: 'order-2', amount: 5.0 }),
        pay({ id: 'p3', order_id: 'order-2', amount: -3.0, status: 'refunded' }),
      ],
    );

    expect(r.terminal.purchases_cents).toBe(1215 + 500);
    expect(r.terminal.refunds_cents).toBe(300);
    expect(r.terminal.tips_cents).toBe(200);
    expect(r.terminal.surcharges_cents).toBe(15);
    expect(r.terminal.net_cents).toBe(1215 + 500 - 300);

    expect(r.pos.charged_cents).toBe(1200 + 500);
    expect(r.pos.refunded_cents).toBe(300);
    expect(r.pos.net_cents).toBe(1400);

    // Variance is exactly the surcharge the terminal added but POS never records.
    expect(r.variance_cents).toBe(15);
    // All three matched, tolerantly (surcharge-only delta is a match).
    expect(r.transactions.every((t) => t.matched)).toBe(true);
    expect(r.mismatches).toHaveLength(0);
  });

  test('refund rows carry a negative total_cents in the per-transaction list', () => {
    const r = computeSettlement([txn({ type: 'refund', base_amount_cents: 750 })], []);
    expect(r.transactions[0].total_cents).toBe(-750);
  });
});

describe('computeSettlement — matching', () => {
  test('explicit payment_id link wins over order-level matching', () => {
    const r = computeSettlement(
      [txn({ payment_id: 'p-linked' })],
      [pay({ id: 'p-linked', amount: 10.0 }), pay({ id: 'p-other', amount: 10.0 })],
    );
    expect(r.transactions[0].payment_id).toBe('p-linked');
    expect(r.transactions[0].matched).toBe(true);
    // The other same-order payment is now unmatched → flagged.
    expect(r.mismatches).toEqual([
      expect.objectContaining({ kind: 'missing_terminal_txn', payment_id: 'p-other' }),
    ]);
  });

  test('order-level fallback requires matching sign: a purchase never claims a refund row', () => {
    const r = computeSettlement(
      [txn({ type: 'purchase', base_amount_cents: 1000 })],
      [pay({ amount: -10.0, status: 'refunded' })],
    );
    expect(r.transactions[0].payment_id).toBeNull();
    expect(r.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'missing_payment' }),
        expect.objectContaining({ kind: 'missing_terminal_txn' }),
      ]),
    );
  });

  test('terminal approval with no POS payment at all → missing_payment', () => {
    const r = computeSettlement([txn()], []);
    expect(r.mismatches).toEqual([
      expect.objectContaining({ kind: 'missing_payment', terminal_transaction_id: 'txn-1' }),
    ]);
  });

  test('linked payment with a diverging amount → amount_mismatch', () => {
    const r = computeSettlement(
      [txn({ payment_id: 'p1', base_amount_cents: 1000 })],
      [pay({ id: 'p1', amount: 8.0 })],
    );
    expect(r.transactions[0].matched).toBe(false);
    expect(r.mismatches).toEqual([
      expect.objectContaining({ kind: 'amount_mismatch', payment_id: 'p1' }),
    ]);
  });

  test('each POS payment is claimed at most once', () => {
    // Two identical terminal purchases on one order, one POS payment: the second
    // txn must not reuse the payment the first one claimed.
    const r = computeSettlement(
      [txn({ id: 't1' }), txn({ id: 't2', our_ref: 'ref-2' })],
      [pay({ amount: 10.0 })],
    );
    const matched = r.transactions.filter((t) => t.payment_id);
    expect(matched).toHaveLength(1);
    expect(r.mismatches).toEqual([
      expect.objectContaining({ kind: 'missing_payment', terminal_transaction_id: 't2' }),
    ]);
  });
});
