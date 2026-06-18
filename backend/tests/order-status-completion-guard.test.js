/**
 * @fileoverview Guard test for updateOrderStatus: an UNPAID order must not be
 * marked 'completed'.
 *
 * Why: revenue, head-office, accounting and payment-reconciliation queries all
 * key settlement on `is_paid` (never on status='completed'). So a
 * completed-but-unpaid order is money that was fulfilled but never collected —
 * invisible to revenue, yet no longer surfacing as an open/live bill. The fix
 * blocks the transition and requires payment to be collected first. Prepaid
 * orders (online/Razorpay, Swiggy/Zomato) already carry is_paid=true, so the
 * legitimate "complete an already-paid order" path is preserved.
 *
 * Unit-level (mocked DB) rather than HTTP so it deterministically exercises the
 * service guard regardless of license/permission middleware or DB seeding.
 * @module tests/order-status-completion-guard.test
 */

const { BadRequestError } = require('../src/utils/errors');

// Mock the DB + socket layers so the service runs without Postgres / a live io.
const mockFindFirst = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../src/config/database', () => ({
  getDbClient: () => ({
    order: { findFirst: mockFindFirst },
    $transaction: mockTransaction,
  }),
}));

jest.mock('../src/socket/index', () => ({ getIO: () => null }));

const orderService = require('../src/modules/orders/order.service');

const baseOrder = {
  id: 'order-1',
  outlet_id: 'outlet-1',
  status: 'ready',
  customer_phone: null,
  outlet: { name: 'Test Outlet' },
};

describe('updateOrderStatus — completing an order requires settlement', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockTransaction.mockReset();
  });

  test('rejects marking an UNPAID order as completed and writes nothing', async () => {
    mockFindFirst.mockResolvedValue({ ...baseOrder, is_paid: false });

    await expect(
      orderService.updateOrderStatus('order-1', 'completed', 'staff-1')
    ).rejects.toThrow(BadRequestError);

    // The guard fires before the transaction, so no status flip / history write happens.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test('surfaces a payment-related message so staff know to collect first', async () => {
    mockFindFirst.mockResolvedValue({ ...baseOrder, is_paid: false });

    await expect(
      orderService.updateOrderStatus('order-1', 'completed', 'staff-1')
    ).rejects.toThrow(/unpaid|payment|paid/i);
  });

  test('does NOT block an already-PAID order — it proceeds past the guard (prepaid path)', async () => {
    mockFindFirst.mockResolvedValue({ ...baseOrder, is_paid: true });
    // Sentinel from the transaction proves execution got past the guard and into
    // the write path (rather than being rejected up front like the unpaid case).
    const reachedTransaction = new Error('reached transaction');
    mockTransaction.mockRejectedValue(reachedTransaction);

    await expect(
      orderService.updateOrderStatus('order-1', 'completed', 'staff-1')
    ).rejects.toBe(reachedTransaction);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  test('still allows non-terminal transitions (e.g. ready) on an unpaid order', async () => {
    mockFindFirst.mockResolvedValue({ ...baseOrder, status: 'preparing', is_paid: false });
    const reachedTransaction = new Error('reached transaction');
    mockTransaction.mockRejectedValue(reachedTransaction);

    // 'ready' is a normal kitchen-workflow step — the guard only targets 'completed'.
    await expect(
      orderService.updateOrderStatus('order-1', 'ready', 'staff-1')
    ).rejects.toBe(reachedTransaction);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
