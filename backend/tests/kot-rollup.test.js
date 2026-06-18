/**
 * @fileoverview Unit tests for the shared KOT → order roll-up helper.
 * Guards the bug where a KOT bumped straight to 'served'/'completed' (skipping
 * 'ready') left the parent order stuck at 'confirmed'. The KDS bump route and
 * completeKOT both delegate to rollUpOrderIfKitchenDone, so testing the helper
 * covers both paths. Pure unit test — prisma + auto-free are mocked, no DB.
 * @module tests/kot-rollup.test
 */

// Mock the auto-free side-effect so the helper never reaches the real DB client.
jest.mock('../src/modules/orders/autofree.service', () => ({
  scheduleAutoFreeIfReady: jest.fn().mockResolvedValue(false),
}));

const { scheduleAutoFreeIfReady } = require('../src/modules/orders/autofree.service');
const { rollUpOrderIfKitchenDone } = require('../src/modules/orders/kot.service');

/** Build a fake prisma client whose KOT list + updateMany result are controlled per-test. */
function makePrisma({ kots, updateCount }) {
  return {
    kOT: { findMany: jest.fn().mockResolvedValue(kots) },
    order: { updateMany: jest.fn().mockResolvedValue({ count: updateCount }) },
    orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('rollUpOrderIfKitchenDone (KOT → order roll-up)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('KOT bumped directly to "served" rolls the order up to "ready"', async () => {
    // Single-KOT order whose only ticket was bumped straight to 'served',
    // never passing through 'ready' — this is the bug the fix targets.
    const prisma = makePrisma({
      kots: [{ id: 'kot-1', status: 'served', is_deleted: false }],
      updateCount: 1,
    });

    const rolledUp = await rollUpOrderIfKitchenDone(prisma, 'order-1', 'kot-1', 'confirmed');

    expect(rolledUp).toBe(true);
    // Advanced atomically, only from a kitchen stage.
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: { in: ['created', 'confirmed'] } },
      data: { status: 'ready' },
    });
    // History written with the order's prior status.
    expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith({
      data: { order_id: 'order-1', from_status: 'confirmed', to_status: 'ready' },
    });
    // Auto-free path triggered.
    expect(scheduleAutoFreeIfReady).toHaveBeenCalledWith('order-1');
  });

  test('KOT bumped to "completed" with all siblings done rolls the order up', async () => {
    const prisma = makePrisma({
      kots: [
        { id: 'kot-1', status: 'completed', is_deleted: false },
        { id: 'kot-2', status: 'ready', is_deleted: false },
      ],
      updateCount: 1,
    });

    const rolledUp = await rollUpOrderIfKitchenDone(prisma, 'order-1', 'kot-1', 'created');

    expect(rolledUp).toBe(true);
    expect(prisma.orderStatusHistory.create).toHaveBeenCalled();
    expect(scheduleAutoFreeIfReady).toHaveBeenCalledWith('order-1');
  });

  test('does not roll up while a sibling KOT is still preparing', async () => {
    const prisma = makePrisma({
      kots: [
        { id: 'kot-1', status: 'served', is_deleted: false },
        { id: 'kot-2', status: 'preparing', is_deleted: false },
      ],
      updateCount: 0,
    });

    const rolledUp = await rollUpOrderIfKitchenDone(prisma, 'order-1', 'kot-1', 'confirmed');

    expect(rolledUp).toBe(false);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(scheduleAutoFreeIfReady).not.toHaveBeenCalled();
  });

  test('does not clobber an already-paid order, but still schedules auto-free', async () => {
    // Kitchen finishes after the order was prepaid: the status filter means
    // updateMany matches nothing (count 0), so the order is NOT reset to 'ready'
    // and no history row is written — but the table auto-free is still scheduled.
    const prisma = makePrisma({
      kots: [{ id: 'kot-1', status: 'completed', is_deleted: false }],
      updateCount: 0,
    });

    const rolledUp = await rollUpOrderIfKitchenDone(prisma, 'order-1', 'kot-1', 'paid');

    expect(rolledUp).toBe(false);
    expect(prisma.order.updateMany).toHaveBeenCalled();
    expect(prisma.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(scheduleAutoFreeIfReady).toHaveBeenCalledWith('order-1');
  });
});
