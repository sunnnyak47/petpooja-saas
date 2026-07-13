/**
 * @fileoverview Unit tests for syncOfflineOrders (v2 offline-sync contract).
 *
 * Covers the five contract-critical behaviours:
 *  1. Idempotency — an order whose client UUID already exists returns 'exists'
 *     (with the cloud order_number) and writes nothing.
 *  2. Financial trust — the client's price-at-sale snapshot is persisted verbatim
 *     (cgst/sgst passthrough; AU single-GST convention maps tax_amount → igst).
 *  3. Table keep-both — an occupied table does NOT fail the sync: the order is
 *     still created, the table is not seized, and conflict:'table_occupied' is returned.
 *  4. Paid orders — a Payment row is created mirroring processPayment's shape
 *     (status 'success', processed_by, gateway_response.offline_captured).
 *  5. Batch resilience — one failing order never fails the rest of the batch.
 *
 * Unit-level (mocked DB) rather than HTTP so it deterministically exercises the
 * service semantics regardless of license/permission middleware or DB seeding.
 * Mirrors the mocking pattern of order-status-completion-guard.test.js.
 * @module tests/syncOfflineOrders.test
 */

// Mock the DB + socket layers so the service runs without Postgres / a live io.
const mockOrderFindUnique = jest.fn();
const mockOutletFindFirst = jest.fn();
const mockMenuItemFindMany = jest.fn();
const mockOrderItemFindMany = jest.fn();
const mockCustomerFindUnique = jest.fn();
const mockCustomerUpsert = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../src/config/database', () => ({
  getDbClient: () => ({
    order: { findUnique: mockOrderFindUnique },
    outlet: { findFirst: mockOutletFindFirst },
    menuItem: { findMany: mockMenuItemFindMany },
    // Item-merge on idempotent replay loads the existing order's OrderItem ids
    // to decide which incoming items are new.
    orderItem: { findMany: mockOrderItemFindMany },
    customer: { findUnique: mockCustomerFindUnique, upsert: mockCustomerUpsert },
    $transaction: mockTransaction,
  }),
}));

jest.mock('../src/socket/index', () => ({ getIO: () => null }));

const orderService = require('../src/modules/orders/order.service');
const { syncOfflineOrdersSchema } = require('../src/modules/orders/order.validation');

/* ── fixtures ── */
const USER_ID      = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTLET_ID    = '11111111-1111-4111-8111-111111111111';
const MENU_ITEM_ID = '22222222-2222-4222-8222-222222222222';
const MENU_ITEM_2  = '55555555-5555-4555-8555-555555555555';
const TABLE_ID     = '33333333-3333-4333-8333-333333333333';
const TABLE_ID_2   = '33333333-3333-4333-8333-333333333334';
const CLIENT_ID    = '44444444-4444-4444-8444-444444444441';
const CLIENT_ID_2  = '44444444-4444-4444-8444-444444444442';
const ITEM_ID_1    = '66666666-6666-4666-8666-666666666661';
const ITEM_ID_2    = '66666666-6666-4666-8666-666666666662';

const OUTLET_ROW = { id: OUTLET_ID, code: 'SIL9SW' };

function baseOrder(overrides = {}) {
  return {
    id: CLIENT_ID,
    outlet_id: OUTLET_ID,
    order_number: 'SIL9SW-20260711-DA1B2-003',
    order_type: 'dine_in',
    source: 'pos',
    status: 'confirmed',
    subtotal: 100,
    tax_amount: 5,
    cgst_amount: 2.5,
    sgst_amount: 2.5,
    discount_amount: 0,
    total_amount: 105,
    created_at: '2026-07-11T05:30:00.000Z',
    items: [
      { menu_item_id: MENU_ITEM_ID, item_name: 'Paneer Tikka', quantity: 2, unit_price: 50, total_price: 100 },
    ],
    ...overrides,
  };
}

/** Fresh transaction client whose create() mocks echo back the row data. */
function makeTx() {
  return {
    // nextDailySequence allocates via $queryRawUnsafe — return a fixed seq.
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ seq: 7 }]),
    order: {
      create: jest.fn(async ({ data }) => ({ ...data })),
      // Forward-merge path re-applies a newer offline state onto the cloud row.
      update: jest.fn(async ({ data }) => ({ ...data })),
    },
    orderItem: {
      create: jest.fn(async ({ data }) => ({ ...data, id: `oi-${Math.random()}` })),
      // Forward-merge soft-deletes cloud items the device no longer carries (split/merge).
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    payment: {
      create: jest.fn(async ({ data }) => ({ ...data, id: 'pay-1' })),
      // Forward-merge checks for an existing tender before creating one.
      findFirst: jest.fn(async () => null),
    },
    orderStatusHistory: { create: jest.fn(async ({ data }) => data) },
    table: { updateMany: jest.fn(async () => ({ count: 1 })) },
    kOT: {
      create: jest.fn(), // present only to assert KOTs are never created on sync
      // Forward-merge reconciles offline KDS statuses onto matching cloud KOTs.
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
}

let tx;

beforeEach(() => {
  mockOrderFindUnique.mockReset().mockResolvedValue(null);
  mockOutletFindFirst.mockReset().mockResolvedValue(OUTLET_ROW);
  mockMenuItemFindMany.mockReset().mockResolvedValue([]);
  mockOrderItemFindMany.mockReset().mockResolvedValue([]);
  mockCustomerFindUnique.mockReset().mockResolvedValue(null);
  mockCustomerUpsert.mockReset().mockImplementation(async ({ create }) => ({ id: 'cust-new', ...create }));
  tx = makeTx();
  mockTransaction.mockReset().mockImplementation(async (fn) => fn(tx));
});

describe('syncOfflineOrders — v2 offline sync contract', () => {

  test('idempotency: existing client id returns "exists" with the cloud order_number and writes nothing', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260710-0004', status: 'confirmed', is_paid: false, grand_total: 105, outlet_id: OUTLET_ID,
    });

    const results = await orderService.syncOfflineOrders([baseOrder()], USER_ID);

    // Same-rank re-sync (confirmed → confirmed) is a pure no-op merge.
    expect(results).toEqual([
      { id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260710-0004', merged: false },
    ]);
    expect(mockOrderFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CLIENT_ID } })
    );
    // Dedupe short-circuits before any write path.
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  test('financial trust (IN): client cgst/sgst/tax persisted verbatim — prices never re-derived', async () => {
    const results = await orderService.syncOfflineOrders([baseOrder()], USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('synced');
    // Cloud order_number allocated from the outlet code + tx-allocated sequence.
    expect(results[0].order_number).toMatch(/^SIL9SW-\d{8}-0007$/);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.id).toBe(CLIENT_ID); // created WITH the client UUID (idempotency key)
    expect(data.subtotal).toBe(100);
    expect(data.taxable_amount).toBe(100); // subtotal - discount(0)
    expect(data.cgst).toBe(2.5);
    expect(data.sgst).toBe(2.5);
    expect(data.igst).toBe(0);
    expect(data.total_tax).toBe(5);
    expect(data.grand_total).toBe(105);
    expect(data.total_amount).toBe(105);
    expect(data.staff_id).toBe(USER_ID);
    expect(data.daily_sequence).toBe(7);
    expect(data.notes).toContain('[offline:SIL9SW-20260711-DA1B2-003]');
    expect(data.created_at).toEqual(new Date('2026-07-11T05:30:00.000Z'));

    // Item lands with the client's price-at-sale numbers and IN 5% gst_rate.
    const item = tx.orderItem.create.mock.calls[0][0].data;
    expect(item.unit_price).toBe(50);
    expect(item.item_total).toBe(100);
    expect(item.gst_rate).toBe(5);
    expect(item.item_tax).toBe(5); // single item takes the whole tax share
    expect(item.is_kot_sent).toBe(true);
    expect(item.status).toBe('sent');
    // KOTs were printed offline — none may be created on sync.
    expect(tx.kOT.create).not.toHaveBeenCalled();
  });

  test('financial trust (AU single-GST): cgst=sgst=0 with tax_amount>0 maps to igst and 10% gst_rate', async () => {
    // Region is resolved from the outlet (AUD currency → AU), NOT inferred from
    // cgst==0 — an IN gst_inclusive order also has cgst==0.
    mockOutletFindFirst.mockResolvedValue({ ...OUTLET_ROW, currency: 'AUD' });
    const auOrder = baseOrder({
      subtotal: 110,
      tax_amount: 10,
      cgst_amount: 0,
      sgst_amount: 0,
      total_amount: 110,
      items: [
        { menu_item_id: MENU_ITEM_ID, item_name: 'Flat White', quantity: 1, unit_price: 44, total_price: 44 },
        { menu_item_id: MENU_ITEM_2, item_name: 'Avo Toast', quantity: 1, unit_price: 66, total_price: 66 },
      ],
    });

    const results = await orderService.syncOfflineOrders([auOrder], USER_ID);
    expect(results[0].status).toBe('synced');

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.cgst).toBe(0);
    expect(data.sgst).toBe(0);
    expect(data.igst).toBe(10); // AU convention: whole tax lands in igst
    expect(data.total_tax).toBe(10);

    // Both items carry the AU 10% rate, and proportional item_tax sums to total_tax.
    const itemRows = tx.orderItem.create.mock.calls.map((c) => c[0].data);
    expect(itemRows).toHaveLength(2);
    itemRows.forEach((r) => expect(r.gst_rate).toBe(10));
    expect(itemRows[0].item_tax).toBeCloseTo(4, 2);  // 44/110 * 10
    expect(itemRows[1].item_tax).toBeCloseTo(6, 2);  // remainder — shares sum exactly
    expect(itemRows[0].item_tax + itemRows[1].item_tax).toBeCloseTo(10, 2);
  });

  test('occupied table: order is still created WITHOUT seizing the table and conflict flag is returned', async () => {
    tx.table.updateMany.mockResolvedValue({ count: 0 }); // conditional seize loses

    const results = await orderService.syncOfflineOrders(
      [baseOrder({ table_id: TABLE_ID })],
      USER_ID
    );

    expect(results[0].status).toBe('synced');
    expect(results[0].conflict).toBe('table_occupied');
    expect(results[0].order_number).toMatch(/^SIL9SW-/);
    // The order row was created despite the conflict (keep-both policy)…
    expect(tx.order.create).toHaveBeenCalledTimes(1);
    // …and the seize was strictly conditional (never overwrites an occupied table).
    expect(tx.table.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: TABLE_ID,
        current_order_id: null,
        status: { not: 'occupied' },
      }),
    }));
  });

  test('free table is seized; paid/cancelled orders never touch the table', async () => {
    // Free table → seized, no conflict flag.
    let results = await orderService.syncOfflineOrders(
      [baseOrder({ table_id: TABLE_ID })],
      USER_ID
    );
    expect(results[0].conflict).toBeUndefined();
    expect(tx.table.updateMany).toHaveBeenCalledTimes(1);

    // Paid order with a table → no seize attempt at all.
    tx = makeTx();
    mockTransaction.mockImplementation(async (fn) => fn(tx));
    results = await orderService.syncOfflineOrders(
      [baseOrder({ id: CLIENT_ID_2, table_id: TABLE_ID, status: 'paid', payment_method: 'cash', paid_at: '2026-07-11T06:00:00.000Z' })],
      USER_ID
    );
    expect(results[0].status).toBe('synced');
    expect(tx.table.updateMany).not.toHaveBeenCalled();
  });

  test('paid order creates a Payment row mirroring processPayment shape', async () => {
    const paidOrder = baseOrder({
      status: 'paid',
      payment_method: 'card',
      payment_note: 'EFTPOS terminal 2',
      paid_at: '2026-07-11T06:00:00.000Z',
    });

    const results = await orderService.syncOfflineOrders([paidOrder], USER_ID);
    expect(results[0].status).toBe('synced');

    const orderData = tx.order.create.mock.calls[0][0].data;
    expect(orderData.status).toBe('paid');
    expect(orderData.is_paid).toBe(true);
    expect(orderData.paid_at).toEqual(new Date('2026-07-11T06:00:00.000Z'));

    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    const payData = tx.payment.create.mock.calls[0][0].data;
    expect(payData).toEqual(expect.objectContaining({
      outlet_id: OUTLET_ID,
      order_id: CLIENT_ID,
      method: 'card',
      amount: 105,
      status: 'success', // processPayment's convention — revenue queries key on it
      processed_by: USER_ID,
    }));
    expect(payData.processed_at).toEqual(new Date('2026-07-11T06:00:00.000Z'));
    expect(payData.gateway_response).toEqual({ offline_captured: true, note: 'EFTPOS terminal 2' });
  });

  test('unpaid order creates NO payment row; "active" status maps to confirmed', async () => {
    const results = await orderService.syncOfflineOrders(
      [baseOrder({ status: 'active' })],
      USER_ID
    );
    expect(results[0].status).toBe('synced');
    expect(tx.payment.create).not.toHaveBeenCalled();
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.status).toBe('confirmed');
    expect(data.is_paid).toBe(false);
  });

  test('batch resilience: one failing order does not fail the rest of the batch', async () => {
    // First order: unknown outlet → per-order failure.
    mockOutletFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(OUTLET_ROW);

    const results = await orderService.syncOfflineOrders(
      [baseOrder(), baseOrder({ id: CLIENT_ID_2 })],
      USER_ID
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: CLIENT_ID, status: 'failed', error: 'Outlet not found' });
    expect(results[1].status).toBe('synced');
    expect(results[1].id).toBe(CLIENT_ID_2);
  });

  test('batch resilience: a transaction blow-up on one order still syncs the others', async () => {
    // First order's tx explodes mid-flight (e.g. FK violation on a deleted menu item).
    mockTransaction
      .mockRejectedValueOnce(new Error('Foreign key constraint failed'))
      .mockImplementation(async (fn) => fn(tx));

    const results = await orderService.syncOfflineOrders(
      [baseOrder(), baseOrder({ id: CLIENT_ID_2 })],
      USER_ID
    );

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'failed', error: 'Foreign key constraint failed' })
    );
    expect(results[1].status).toBe('synced');
  });

  test('transaction runs with punchKOT-grade headroom (maxWait/timeout)', async () => {
    await orderService.syncOfflineOrders([baseOrder()], USER_ID);
    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 8000, timeout: 20000 }
    );
  });

  test('status "created" maps to confirmed and "held" passes through — neither is a wholesale reject', async () => {
    // 'created' (offline live order) normalises to the cloud 'confirmed'.
    let results = await orderService.syncOfflineOrders([baseOrder({ status: 'created' })], USER_ID);
    expect(results[0].status).toBe('synced');
    expect(tx.order.create.mock.calls[0][0].data.status).toBe('confirmed');

    // 'held' (parked order) is preserved verbatim — Order.status is a free VarChar.
    tx = makeTx();
    mockTransaction.mockImplementation(async (fn) => fn(tx));
    results = await orderService.syncOfflineOrders([baseOrder({ id: CLIENT_ID_2, status: 'held' })], USER_ID);
    expect(results[0].status).toBe('synced');
    const heldData = tx.order.create.mock.calls[0][0].data;
    expect(heldData.status).toBe('held');
    expect(heldData.is_paid).toBe(false);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  test('untrusted customer_id + phone: unknown id is resolved via find-or-create by phone (no FK failure)', async () => {
    // Desktop-minted local id does not exist in the cloud → findUnique returns null.
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerUpsert.mockResolvedValue({ id: 'cust-resolved' });

    const results = await orderService.syncOfflineOrders([
      baseOrder({ customer_id: '99999999-9999-4999-8999-999999999999', customer_phone: '9998887777', customer_name: 'Asha' }),
    ], USER_ID);

    expect(results[0].status).toBe('synced');
    // Upserted by the globally-unique phone, NOT the bogus client id.
    expect(mockCustomerUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { phone: '9998887777' },
    }));
    // The order persists the resolved cloud customer id — never the client's.
    expect(tx.order.create.mock.calls[0][0].data.customer_id).toBe('cust-resolved');
  });

  test('untrusted customer_id, no phone: customer_id is dropped to null and the order still succeeds', async () => {
    mockCustomerFindUnique.mockResolvedValue(null); // unknown id

    const results = await orderService.syncOfflineOrders([
      baseOrder({ customer_id: '99999999-9999-4999-8999-999999999999', customer_phone: null }),
    ], USER_ID);

    expect(results[0].status).toBe('synced');
    expect(mockCustomerUpsert).not.toHaveBeenCalled();
    expect(tx.order.create.mock.calls[0][0].data.customer_id).toBeNull();
  });

  test('forward-merge: re-syncing an existing "confirmed" order now "paid" advances status and creates exactly one Payment', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false, grand_total: 105, outlet_id: OUTLET_ID,
    });
    tx.payment.findFirst.mockResolvedValue(null); // no tender captured yet

    const results = await orderService.syncOfflineOrders([
      baseOrder({ status: 'paid', payment_method: 'card', payment_note: 'EFTPOS', paid_at: '2026-07-11T06:00:00.000Z' }),
    ], USER_ID);

    expect(results[0]).toEqual({
      id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260711-0007', merged: true,
    });
    // The existing row is advanced in place — no new order is created.
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    const upd = tx.order.update.mock.calls[0][0].data;
    expect(upd.status).toBe('paid');
    expect(upd.is_paid).toBe(true);
    expect(upd.paid_at).toEqual(new Date('2026-07-11T06:00:00.000Z'));
    // Exactly one Payment (amount = device total, here 105 == cloud grand_total
    // because no items changed; the item-gain-then-pay case below proves the
    // device total wins when they differ).
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      order_id: CLIENT_ID, method: 'card', amount: 105, status: 'success', processed_by: USER_ID,
    }));
  });

  test('forward-merge is idempotent: an already-paid order with a Payment neither regresses nor double-charges', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'paid', is_paid: true, grand_total: 105, outlet_id: OUTLET_ID,
    });

    // Re-sending a stale 'confirmed' snapshot must NOT roll the order back.
    const results = await orderService.syncOfflineOrders([baseOrder({ status: 'confirmed' })], USER_ID);

    expect(results[0]).toEqual({
      id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260711-0007', merged: false,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  test('item-merge replay: re-syncing an existing order with one NEW item inserts exactly that item, updates totals, and re-running is a no-op', async () => {
    // The cloud order already exists (first sync landed one item). The desktop
    // resends the SAME order id with an extra item added after the first sync.
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false, grand_total: 105, outlet_id: OUTLET_ID,
    });
    // Only the original item is present on the cloud order.
    mockOrderItemFindMany.mockResolvedValue([{ id: ITEM_ID_1 }]);

    const resyncOrder = baseOrder({
      status: 'confirmed',
      subtotal: 150,
      tax_amount: 7.5,
      cgst_amount: 3.75,
      sgst_amount: 3.75,
      total_amount: 157.5,
      items: [
        { id: ITEM_ID_1, menu_item_id: MENU_ITEM_ID, item_name: 'Paneer Tikka', quantity: 2, unit_price: 50, total_price: 100 },
        { id: ITEM_ID_2, menu_item_id: MENU_ITEM_2, item_name: 'Naan', quantity: 2, unit_price: 25, total_price: 50 },
      ],
    });

    const results = await orderService.syncOfflineOrders([resyncOrder], USER_ID);
    expect(results[0]).toEqual({
      id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260711-0007', merged: true,
    });

    // Exactly ONE item inserted — the new one — created WITH its client id.
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    const item = tx.orderItem.create.mock.calls[0][0].data;
    expect(item.id).toBe(ITEM_ID_2);
    expect(item.order_id).toBe(CLIENT_ID);
    expect(item.name).toBe('Naan');
    expect(item.unit_price).toBe(25);
    expect(item.item_total).toBe(50);
    expect(item.gst_rate).toBe(5); // IN default
    expect(item.item_tax).toBe(2.5); // remainder: 7.5 - (7.5 * 100/150) = 2.5
    expect(item.is_kot_sent).toBe(true);
    expect(item.status).toBe('sent');
    // The already-present item is never re-created.
    expect(tx.orderItem.create.mock.calls.some((c) => c[0].data.id === ITEM_ID_1)).toBe(false);

    // Order financial columns re-asserted to the incoming payload snapshot.
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    const upd = tx.order.update.mock.calls[0][0].data;
    expect(upd).toEqual(expect.objectContaining({
      subtotal: 150, taxable_amount: 150, cgst: 3.75, sgst: 3.75, igst: 0,
      total_tax: 7.5, discount_amount: 0, round_off: 0, grand_total: 157.5, total_amount: 157.5,
    }));
    // No new order row, no KOTs.
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.kOT.create).not.toHaveBeenCalled();

    // ── Idempotent re-run: both items now present → pure no-op, no duplicate.
    // The cloud row now reflects the first merge (both items + re-asserted total
    // 157.5), so re-sending the identical snapshot changes nothing.
    mockOrderItemFindMany.mockResolvedValue([{ id: ITEM_ID_1 }, { id: ITEM_ID_2 }]);
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 157.5, outlet_id: OUTLET_ID, table_id: null, notes: null,
    });
    tx = makeTx();
    mockTransaction.mockClear();
    mockTransaction.mockImplementation(async (fn) => fn(tx));

    const results2 = await orderService.syncOfflineOrders([resyncOrder], USER_ID);
    expect(results2[0]).toEqual({
      id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260711-0007', merged: false,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.orderItem.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  test('forward-merge (merge source): re-syncing an existing order as "merged" applies the status, frees its table, and never 400s the batch', async () => {
    // The offline table-merge emptied this SOURCE ticket (its items moved onto
    // the target order) and stamped it 'merged'. Previously 'merged' was absent
    // from the schema enum → Joi 400'd the whole batch and the order dead-lettered.
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 105, outlet_id: OUTLET_ID, table_id: TABLE_ID, notes: null,
    });

    // The device moved every line onto the target, so the source now carries ZERO
    // items — the exact shape the offline merge produces. min(1) used to 400 it.
    mockOrderItemFindMany.mockResolvedValue([{ id: ITEM_ID_1 }, { id: ITEM_ID_2 }]);
    const mergedSource = baseOrder({
      status: 'merged', items: [], subtotal: 0, tax_amount: 0, cgst_amount: 0, sgst_amount: 0, total_amount: 0,
    });

    const results = await orderService.syncOfflineOrders([mergedSource], USER_ID);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260711-0007', merged: true })
    );
    // The merged status is applied to the existing row in place (no new order).
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.order.update.mock.calls[0][0].data.status).toBe('merged');

    // The table the emptied source order held is released (mirrors the void branch).
    expect(tx.table.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: TABLE_ID, current_order_id: CLIENT_ID }),
      data: expect.objectContaining({ status: 'available', current_order_id: null }),
    }));
    // The source's stale cloud items are cleared so they don't double-count against
    // the target (previously skipped — reconcile only ran when items were present).
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ is_deleted: true }),
    }));
    // A merged (voided-into-another) order never becomes a Payment.
    expect(tx.payment.create).not.toHaveBeenCalled();

    // Validation accepts the EMPTY-items merged source — the batch is not 400'd.
    const { error } = syncOfflineOrdersSchema.validate({ orders: [mergedSource] });
    expect(error).toBeUndefined();
  });

  test('forward-merge (item removed): a cloud item the device no longer carries is soft-deleted and totals reconcile', async () => {
    // First sync landed two items (grand 157.5). The waiter then split ITEM_ID_2
    // onto another ticket offline, so this re-sync carries only the survivor —
    // the dropped item must be soft-deleted so the items sum to the new total.
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 157.5, outlet_id: OUTLET_ID, table_id: null, notes: null,
    });
    mockOrderItemFindMany.mockResolvedValue([{ id: ITEM_ID_1 }, { id: ITEM_ID_2 }]);

    const results = await orderService.syncOfflineOrders([
      baseOrder({
        status: 'confirmed',
        subtotal: 100, tax_amount: 5, cgst_amount: 2.5, sgst_amount: 2.5, total_amount: 105,
        items: [
          { id: ITEM_ID_1, menu_item_id: MENU_ITEM_ID, item_name: 'Paneer Tikka', quantity: 2, unit_price: 50, total_price: 100 },
        ],
      }),
    ], USER_ID);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'exists', merged: true })
    );
    // The dropped cloud item is soft-deleted (device item set is authoritative)…
    expect(tx.orderItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ order_id: CLIENT_ID, id: { in: [ITEM_ID_2] } }),
      data: expect.objectContaining({ is_deleted: true }),
    }));
    // …no new item is inserted (the survivor was already present)…
    expect(tx.orderItem.create).not.toHaveBeenCalled();
    // …and the order totals are re-asserted down to the device snapshot.
    const upd = tx.order.update.mock.calls[0][0].data;
    expect(upd).toEqual(expect.objectContaining({
      subtotal: 100, taxable_amount: 100, total_tax: 5, grand_total: 105, total_amount: 105,
    }));
  });

  test('forward-merge (item added): a genuinely-new item is still inserted and nothing is soft-deleted', async () => {
    // Both device item ids are still present in the payload, so the removal
    // reconcile is a no-op — only the new item is inserted (existing behaviour).
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 105, outlet_id: OUTLET_ID, table_id: null, notes: null,
    });
    mockOrderItemFindMany.mockResolvedValue([{ id: ITEM_ID_1 }]);

    const results = await orderService.syncOfflineOrders([
      baseOrder({
        status: 'confirmed',
        subtotal: 150, tax_amount: 7.5, cgst_amount: 3.75, sgst_amount: 3.75, total_amount: 157.5,
        items: [
          { id: ITEM_ID_1, menu_item_id: MENU_ITEM_ID, item_name: 'Paneer Tikka', quantity: 2, unit_price: 50, total_price: 100 },
          { id: ITEM_ID_2, menu_item_id: MENU_ITEM_2, item_name: 'Naan', quantity: 2, unit_price: 25, total_price: 50 },
        ],
      }),
    ], USER_ID);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'exists', merged: true })
    );
    // Exactly the new item inserted WITH its client id…
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(tx.orderItem.create.mock.calls[0][0].data.id).toBe(ITEM_ID_2);
    // …and no live item is soft-deleted (both device ids remain present).
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  test('forward-merge underpayment guard: an order that gains an item AND becomes paid tenders the DEVICE total, not the stale cloud total', async () => {
    // Regression: the merge-path Payment was stamped with existing.grand_total
    // (105), undercharging by the value of the item the waiter added offline
    // after the first sync — while the item-merge block re-asserted the order to
    // the device total (157.5), leaving Payment 52.50 short of the order.
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false, grand_total: 105, outlet_id: OUTLET_ID,
    });
    mockOrderItemFindMany.mockResolvedValue([{ id: ITEM_ID_1 }]); // only the first item is on the cloud order
    tx.payment.findFirst.mockResolvedValue(null); // no tender captured yet

    const results = await orderService.syncOfflineOrders([
      baseOrder({
        status: 'paid', payment_method: 'card', payment_note: 'EFTPOS', paid_at: '2026-07-11T06:00:00.000Z',
        subtotal: 150, tax_amount: 7.5, cgst_amount: 3.75, sgst_amount: 3.75, total_amount: 157.5,
        items: [
          { id: ITEM_ID_1, menu_item_id: MENU_ITEM_ID, item_name: 'Paneer Tikka', quantity: 2, unit_price: 50, total_price: 100 },
          { id: ITEM_ID_2, menu_item_id: MENU_ITEM_2, item_name: 'Naan', quantity: 2, unit_price: 25, total_price: 50 },
        ],
      }),
    ], USER_ID);

    expect(results[0]).toEqual({
      id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260711-0007', merged: true,
    });
    // The new item is inserted, the order total is re-asserted to the device
    // snapshot, and — the fix — the Payment equals that same device total.
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.create.mock.calls[0][0].data.amount).toBe(157.5);
    const financialUpd = tx.order.update.mock.calls.find((c) => c[0].data.grand_total !== undefined);
    expect(financialUpd[0].data.grand_total).toBe(157.5);
    // Payment.amount and the order's re-asserted grand_total must agree.
    expect(tx.payment.create.mock.calls[0][0].data.amount).toBe(financialUpd[0].data.grand_total);
  });

  test('first-sync persists client item ids; an id-less item falls back to a generated id', async () => {
    const order = baseOrder({
      subtotal: 125,
      tax_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      total_amount: 125,
      items: [
        { id: ITEM_ID_1, menu_item_id: MENU_ITEM_ID, item_name: 'Paneer Tikka', quantity: 2, unit_price: 50, total_price: 100 },
        { menu_item_id: MENU_ITEM_2, item_name: 'Naan', quantity: 1, unit_price: 25, total_price: 25 }, // no client id
      ],
    });

    const results = await orderService.syncOfflineOrders([order], USER_ID);
    expect(results[0].status).toBe('synced');

    expect(tx.orderItem.create).toHaveBeenCalledTimes(2);
    // Item with a client id is created WITH that id (idempotency key).
    expect(tx.orderItem.create.mock.calls[0][0].data.id).toBe(ITEM_ID_1);
    // Id-less item omits id → Prisma's gen_random_uuid() default applies.
    expect(tx.orderItem.create.mock.calls[1][0].data.id).toBeUndefined();
  });

  test('order_type "online" and an item with null menu_item_id both validate and sync', async () => {
    const payload = {
      orders: [baseOrder({
        order_type: 'online',
        subtotal: 100,
        tax_amount: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        total_amount: 100,
        items: [
          { menu_item_id: null, item_name: 'Open Item', quantity: 1, unit_price: 100, total_price: 100 },
        ],
      })],
    };

    // Joi accepts the widened order_type and the null menu_item_id — no 400.
    const { error, value } = syncOfflineOrdersSchema.validate(payload);
    expect(error).toBeUndefined();
    expect(value.orders[0].order_type).toBe('online');
    expect(value.orders[0].items[0].menu_item_id).toBeNull();

    // The service syncs the validated payload end-to-end.
    const results = await orderService.syncOfflineOrders(value.orders, USER_ID);
    expect(results[0].status).toBe('synced');
    expect(tx.order.create.mock.calls[0][0].data.order_type).toBe('online');
    expect(tx.orderItem.create.mock.calls[0][0].data.menu_item_id).toBeNull();
  });

  test('negative-discount clamp: a discount larger than the subtotal never persists a negative taxable_amount', async () => {
    const results = await orderService.syncOfflineOrders([
      baseOrder({ subtotal: 100, discount_amount: 150, tax_amount: 0, cgst_amount: 0, sgst_amount: 0, total_amount: 0 }),
    ], USER_ID);

    expect(results[0].status).toBe('synced');
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.taxable_amount).toBe(0); // max(100 - 150, 0), not -50
    expect(data.discount_amount).toBe(150);
  });

  /* ── Full-state forward-merge (transfer / discount / void / split / KOT) ── */

  test('forward-merge (transfer): re-syncing an existing order with a new table_id moves the table', async () => {
    // The order already lives on TABLE_ID; the waiter transferred it to TABLE_ID_2
    // offline, so the whole-order re-sync carries the new table_id.
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 105, outlet_id: OUTLET_ID, table_id: TABLE_ID, notes: null,
    });

    const results = await orderService.syncOfflineOrders([
      baseOrder({ table_id: TABLE_ID_2 }),
    ], USER_ID);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'exists', order_number: 'SIL9SW-20260711-0007', merged: true })
    );
    expect(tx.order.create).not.toHaveBeenCalled();

    // The order row is repointed to the new table in a single consolidated update.
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(tx.order.update.mock.calls[0][0].data.table_id).toBe(TABLE_ID_2);

    // Old table freed (only while it still points at this order)…
    expect(tx.table.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: TABLE_ID, current_order_id: CLIENT_ID }),
      data: expect.objectContaining({ status: 'available', current_order_id: null }),
    }));
    // …new table conditionally seized (keep-both — never clobbers an occupied one).
    expect(tx.table.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: TABLE_ID_2, current_order_id: null, status: { not: 'occupied' } }),
      data: expect.objectContaining({ status: 'occupied', current_order_id: CLIENT_ID }),
    }));
  });

  test('forward-merge (discount): re-syncing a discount re-asserts the discounted totals + discount snapshot', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 105, outlet_id: OUTLET_ID, table_id: null, notes: null,
    });

    // Manager applied a flat 20 discount offline: subtotal 100, taxable 80,
    // 5% GST on 80 = 4 (cgst 2 / sgst 2), grand 84.
    const results = await orderService.syncOfflineOrders([
      baseOrder({
        discount_type: 'flat', discount_value: 20, discount_amount: 20,
        subtotal: 100, tax_amount: 4, cgst_amount: 2, sgst_amount: 2, total_amount: 84,
      }),
    ], USER_ID);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'exists', merged: true })
    );
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    const upd = tx.order.update.mock.calls[0][0].data;
    expect(upd).toEqual(expect.objectContaining({
      subtotal: 100,
      discount_amount: 20,
      discount_type: 'flat',
      discount_value: 20,
      taxable_amount: 80, // max(100 - 20, 0)
      cgst: 2, sgst: 2, igst: 0,
      total_tax: 4,
      grand_total: 84,
      total_amount: 84,
    }));
    // A pure discount edit neither advances the lifecycle nor tenders a payment.
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  test('forward-merge (void): re-syncing an existing order as "cancelled" voids it and frees its table', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 105, outlet_id: OUTLET_ID, table_id: TABLE_ID, notes: null,
    });

    const results = await orderService.syncOfflineOrders([
      baseOrder({ status: 'cancelled', notes: 'Walkout' }),
    ], USER_ID);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'exists', merged: true })
    );
    const upd = tx.order.update.mock.calls[0][0].data;
    expect(upd.status).toBe('cancelled');
    expect(upd.cancelled_by).toBe(USER_ID);
    expect(upd.cancel_reason).toBe('Walkout');

    // The table the cancelled order held is released…
    expect(tx.table.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: TABLE_ID, current_order_id: CLIENT_ID }),
      data: expect.objectContaining({ status: 'available', current_order_id: null }),
    }));
    // …and a void never becomes a Payment.
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  test('split-order: the split-off second order syncs as a brand-new cloud order with its own number + items', async () => {
    // A table bill was split offline; the child ticket carries one item under its
    // own device-namespaced id. On sync it is a plain CREATE (findUnique → null).
    const splitChild = baseOrder({
      id: CLIENT_ID_2,
      order_number: 'SIL9SW-20260711-DA1B2-004',
      subtotal: 50, tax_amount: 2.5, cgst_amount: 1.25, sgst_amount: 1.25, total_amount: 52.5,
      items: [
        { id: ITEM_ID_2, menu_item_id: MENU_ITEM_2, item_name: 'Naan', quantity: 2, unit_price: 25, total_price: 50 },
      ],
    });

    const results = await orderService.syncOfflineOrders([splitChild], USER_ID);

    expect(results[0].status).toBe('synced');
    expect(results[0].id).toBe(CLIENT_ID_2);
    expect(results[0].order_number).toMatch(/^SIL9SW-\d{8}-0007$/);

    const data = tx.order.create.mock.calls[0][0].data;
    expect(data.id).toBe(CLIENT_ID_2); // created WITH the child ticket's client id
    expect(data.subtotal).toBe(50);
    expect(data.taxable_amount).toBe(50);
    expect(data.grand_total).toBe(52.5);
    expect(data.total_amount).toBe(52.5);
    expect(data.notes).toContain('[offline:SIL9SW-20260711-DA1B2-004]');

    // Its lone item lands with the client's price-at-sale snapshot + client id.
    expect(tx.orderItem.create).toHaveBeenCalledTimes(1);
    const item = tx.orderItem.create.mock.calls[0][0].data;
    expect(item.id).toBe(ITEM_ID_2);
    expect(item.name).toBe('Naan');
    expect(item.item_total).toBe(50);
  });

  test('kots[]: an incoming KOT status is reconciled onto the matching cloud KOT by outlet_id+kot_number', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: CLIENT_ID, order_number: 'SIL9SW-20260711-0007', status: 'confirmed', is_paid: false,
      grand_total: 105, outlet_id: OUTLET_ID, table_id: null, notes: null,
    });

    // The offline KDS marked KOT-42 ready; nothing else about the order changed.
    const results = await orderService.syncOfflineOrders([
      baseOrder({ kots: [{ kot_number: 'KOT-42', station: 'KITCHEN', status: 'ready', items_count: 1 }] }),
    ], USER_ID);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: CLIENT_ID, status: 'exists', merged: true })
    );
    expect(tx.kOT.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ outlet_id: OUTLET_ID, kot_number: 'KOT-42' }),
      data: expect.objectContaining({ status: 'ready' }),
    }));
    // A KOT-only re-sync touches neither the order body nor a payment.
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();

    // Validation accepts the top-level kots[] array (no 400).
    const { error } = syncOfflineOrdersSchema.validate({
      orders: [baseOrder({ kots: [{ kot_number: 'KOT-42', station: 'KITCHEN', status: 'ready', items_count: 1 }] })],
    });
    expect(error).toBeUndefined();
  });
});
