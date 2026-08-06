/**
 * @fileoverview Regression guard for processPayment: a double-tapped settle must
 * charge the order exactly once (no double-charge race).
 *
 * Why: processPayment reads order.is_paid at the TOP, OUTSIDE the transaction.
 * Two near-simultaneous settle requests (a double-tapped "Settle" button, or a
 * retried request) can both read is_paid=false, both enter the transaction, both
 * create a Payment row and — with the old unconditional `tx.order.update` — both
 * flip is_paid=true. Result: the guest is charged twice and two success Payments
 * are recorded against one order.
 *
 * The fix makes the finalizing flip a CONDITIONAL updateMany scoped to
 * `is_paid: false`. Under READ COMMITTED the second writer blocks on the row
 * lock, then re-evaluates the predicate against the winner's committed row,
 * matches 0 rows, and we throw — rolling the whole transaction back (its
 * Payment row, loyalty decrement and inventory deduction all revert). The order
 * is charged exactly once.
 *
 * Unit-level: we drive processPayment with a mocked Prisma + a $transaction that
 * hands the callback a mock tx, so we can force the "loser" (updateMany → 0) and
 * "winner" (updateMany → 1) outcomes deterministically without Postgres.
 * @module tests/order-double-settle-guard.test
 */

const { BadRequestError } = require('../src/utils/errors');

const mockFindFirst = jest.fn();
const mockAggregate = jest.fn();
const mockOrderItemFindMany = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../src/config/database', () => ({
  getDbClient: () => ({
    order: { findFirst: mockFindFirst },
    payment: { aggregate: mockAggregate },
    orderItem: { findMany: mockOrderItemFindMany },
    $transaction: mockTransaction,
  }),
}));

jest.mock('../src/socket/index', () => ({ getIO: () => null }));
// Keep the settle path off the auto-free branch (no table work needed here).
jest.mock('../src/modules/orders/autofree.service', () => ({
  getAutoFreeConfig: async () => ({ enabled: false }),
}));

const orderService = require('../src/modules/orders/order.service');

const baseOrder = {
  id: 'order-1',
  outlet_id: 'outlet-1',
  status: 'ready',
  is_paid: false,
  grand_total: 100,
  table_id: null,
  customer_id: null,
};

// Build a mock Prisma tx. `flipCount` is what the conditional is_paid flip returns
// (1 = this request wins the race, 0 = a concurrent settle already flipped it).
function makeTx(flipCount, spies) {
  return {
    payment: { create: spies.paymentCreate },
    paymentSplit: { create: jest.fn(async () => ({})) },
    // The finalize path MUST be this conditional updateMany, never an unconditional update.
    order: {
      updateMany: spies.updateMany.mockResolvedValue({ count: flipCount }),
      update: spies.update, // present only to prove it is NOT used as the finalize write
      // Consumed by _deductInventoryForOrder — empty items make deduction a no-op.
      findFirst: jest.fn(async () => ({ id: 'order-1', is_deleted: false, order_items: [] })),
    },
    orderStatusHistory: { create: jest.fn(async () => ({})) },
    stockTransaction: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    loyaltyPoints: { updateMany: jest.fn(async () => ({ count: 1 })), findFirst: jest.fn(async () => ({ current_balance: 0 })) },
    loyaltyTransaction: { create: jest.fn(async () => ({})) },
    table: { update: jest.fn(async () => ({})) },
    inventoryStock: { upsert: jest.fn(async () => ({ current_stock: 0 })) },
  };
}

describe('processPayment — double-tap settle charges the order exactly once', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockAggregate.mockReset().mockResolvedValue({ _sum: { amount: null } });
    mockOrderItemFindMany.mockReset().mockResolvedValue([]);
    mockTransaction.mockReset();
    mockFindFirst.mockResolvedValue({ ...baseOrder });
  });

  // processPayment defers non-critical work (ledger/metering re-fetch, auto-86) to
  // setImmediate. Drain those before teardown so they run against the live mocks
  // instead of importing modules after Jest has torn the environment down.
  afterEach(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

  test('LOSER: when a concurrent settle already flipped is_paid, the tx rolls back and it throws', async () => {
    const spies = {
      paymentCreate: jest.fn(async () => ({ id: 'pay-1' })),
      updateMany: jest.fn(),
      update: jest.fn(async () => ({})),
    };
    // The conditional flip matches 0 rows → the guard throws inside the tx.
    mockTransaction.mockImplementation(async (cb) => cb(makeTx(0, spies)));

    await expect(
      orderService.processPayment('order-1', { method: 'cash', amount: 100 }, 'staff-1')
    ).rejects.toThrow(BadRequestError);

    // The finalize write was the CONDITIONAL updateMany scoped to is_paid:false...
    expect(spies.updateMany).toHaveBeenCalledTimes(1);
    const whereArg = spies.updateMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ id: 'order-1', is_paid: false });
    // ...never an unconditional order.update (that was the double-charge bug).
    expect(spies.update).not.toHaveBeenCalled();
  });

  test('LOSER: the throw is an "already paid" message so the double charge is refused', async () => {
    const spies = {
      paymentCreate: jest.fn(async () => ({ id: 'pay-1' })),
      updateMany: jest.fn(),
      update: jest.fn(async () => ({})),
    };
    mockTransaction.mockImplementation(async (cb) => cb(makeTx(0, spies)));

    await expect(
      orderService.processPayment('order-1', { method: 'cash', amount: 100 }, 'staff-1')
    ).rejects.toThrow(/already paid/i);
  });

  test('WINNER: the first settle flips is_paid via the conditional updateMany and succeeds', async () => {
    const spies = {
      paymentCreate: jest.fn(async () => ({ id: 'pay-1' })),
      updateMany: jest.fn(),
      update: jest.fn(async () => ({})),
    };
    // The flip matches 1 row → this request wins and settlement proceeds.
    mockTransaction.mockImplementation(async (cb) => cb(makeTx(1, spies)));

    await expect(
      orderService.processPayment('order-1', { method: 'cash', amount: 100 }, 'staff-1')
    ).resolves.toBeDefined();

    expect(spies.paymentCreate).toHaveBeenCalledTimes(1);
    expect(spies.updateMany).toHaveBeenCalledTimes(1);
    expect(spies.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'order-1', is_paid: false });
    expect(spies.update).not.toHaveBeenCalled();
  });

  test('a second settle attempt on an order already marked paid is refused before the tx even opens', async () => {
    // The top-of-function fast path: findFirst already shows is_paid=true.
    mockFindFirst.mockResolvedValue({ ...baseOrder, is_paid: true, status: 'paid' });

    await expect(
      orderService.processPayment('order-1', { method: 'cash', amount: 100 }, 'staff-1')
    ).rejects.toThrow(/already paid/i);

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
