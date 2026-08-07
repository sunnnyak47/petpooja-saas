/**
 * @fileoverview Tests for the assistant COMPOUND (batch) write engine.
 * Verifies detectActions() splits a multi-command message on strong connectors
 * only (never inside an item name like "fish and chips"), that buildBatchPreview()
 * builds N items behind ONE signed token without mutating, and that a confirmed
 * batch runs EVERY sub-action, audits each, and reports per-item ✓/✗ (including a
 * partial failure). A single write intent still takes the normal single path.
 * All services + DB + jwt secret are mocked (no DB, no network).
 * @module tests/assistant-batch.test
 */

const mockMenu = { listMenuItems: jest.fn(), updateMenuItem: jest.fn() };
const mockCustomer = { createCustomer: jest.fn(), createCampaign: jest.fn() };
const mockTable = { listTables: jest.fn(), updateTableStatus: jest.fn() };
const mockInventory = { getLowStock: jest.fn() };
const mockProcurement = { createPurchaseOrder: jest.fn() };
const mockReservations = { createReservation: jest.fn() };
const mockOrder = { listOrders: jest.fn(), getOrderById: jest.fn() };
const mockPrisma = {
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  customer: { count: jest.fn() },
  order: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  orderItem: { findMany: jest.fn().mockResolvedValue([]) },
};

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/modules/menu/menu.service', () => mockMenu);
jest.mock('../src/modules/customers/customer.service', () => mockCustomer);
jest.mock('../src/modules/orders/table.service', () => mockTable);
jest.mock('../src/modules/inventory/inventory.service', () => mockInventory);
jest.mock('../src/modules/inventory/procurement.service', () => mockProcurement);
jest.mock('../src/modules/reservations/reservations.service', () => mockReservations);
jest.mock('../src/modules/orders/order.service', () => mockOrder);

const actions = require('../src/modules/assistant/assistant.actions');
const { NotFoundError } = require('../src/utils/errors');

const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [], currency: 'AUD', headOfficeId: 'h1' };
const CASHIER = (perms) => ({ id: 'u2', role: 'cashier', outletId: 'o1', permissions: perms, currency: 'AUD' });

// Every write/mutation service — asserted NOT to be called during a preview.
const MUTATORS = [
  mockMenu.updateMenuItem, mockTable.updateTableStatus, mockCustomer.createCustomer,
  mockCustomer.createCampaign, mockProcurement.createPurchaseOrder, mockReservations.createReservation,
  mockPrisma.order.update,
];

beforeEach(() => {
  jest.clearAllMocks();
  mockMenu.listMenuItems.mockResolvedValue({ items: [{ id: 'm1', name: 'Paneer Tikka', base_price: 12, is_available: true }] });
  mockTable.listTables.mockResolvedValue([{ id: 't5', table_number: '5', status: 'occupied' }]);
  mockCustomer.createCustomer.mockResolvedValue({ id: 'c9' });
  mockPrisma.customer.count.mockResolvedValue(5);
});

describe('detectActions — splits compound messages, keeps item names intact', () => {
  test('splits on ";" into three distinct actions', () => {
    const got = actions.detectActions('86 the paneer tikka; set paneer tikka price to 12; mark table 5 clean');
    expect(got.map((x) => x.action.name)).toEqual(['86_item', 'adjust_price', 'set_table_status']);
  });
  test('does NOT split an item name joined by "and" ("fish and chips" stays one)', () => {
    const got = actions.detectActions('86 fish and chips');
    expect(got.length).toBe(1);
    expect(got[0].action.name).toBe('86_item');
    expect(got[0].segment).toBe('86 fish and chips'); // name intact, not torn at "and"
    expect(actions.detectActions('86 the mac and cheese').length).toBe(1);
  });
  test('splits on " and " ONLY when the right side starts with an action verb', () => {
    // right side "set …" is a verb → split into two
    const two = actions.detectActions('86 fish and chips and set the price to 12');
    expect(two.map((x) => x.action.name)).toEqual(['86_item', 'adjust_price']);
    expect(two[0].segment).toBe('86 fish and chips'); // the noun "and" was preserved
  });
  test('splits on " then " / " and then " / " also " / " plus " / newline', () => {
    expect(actions.detectActions('86 the paneer tikka then mark table 5 clean').length).toBe(2);
    expect(actions.detectActions('86 the paneer tikka and then mark table 5 clean').length).toBe(2);
    expect(actions.detectActions('86 the paneer tikka also mark table 5 clean').length).toBe(2);
    expect(actions.detectActions('86 the paneer tikka plus mark table 5 clean').length).toBe(2);
    expect(actions.detectActions('86 the paneer tikka\nmark table 5 clean').length).toBe(2);
  });
  test('non-action segments are dropped; duplicates de-duped', () => {
    // "thanks" is not an action → dropped, leaving a single real action
    expect(actions.detectActions('86 the paneer tikka; thanks so much').map((x) => x.action.name)).toEqual(['86_item']);
    // identical repeated command collapses to one
    expect(actions.detectActions('mark table 5 clean; mark table 5 clean').length).toBe(1);
  });
  test('a lone command yields a single-element array (not a batch)', () => {
    expect(actions.detectActions('86 the paneer tikka').length).toBe(1);
  });
});

describe('buildBatchPreview — N items behind ONE token, never mutates', () => {
  test('builds 3 items + one batch token; calls NO mutation service', async () => {
    const p = await actions.buildBatchPreview(OWNER, '86 the paneer tikka; set paneer tikka price to 12; mark table 5 clean');
    expect(p.action).toBe('batch');
    expect(p.summary).toMatch(/these 3 things/);
    expect(p.items).toHaveLength(3);
    expect(p.items[0].summary).toMatch(/86 "Paneer Tikka"/);
    expect(p.items[1].summary).toMatch(/price of "Paneer Tikka"/);
    expect(p.items[2].summary).toMatch(/table 5 to cleaning/);
    expect(p.token).toBeTruthy();

    // Exactly ONE token, carrying all three executable sub-actions.
    const decoded = actions.verifyActionToken(p.token);
    expect(decoded.batch).toBe(true);
    expect(decoded.items.map((i) => i.action)).toEqual(['86_item', 'adjust_price', 'set_table_status']);

    for (const m of MUTATORS) expect(m).not.toHaveBeenCalled(); // preview must never write
  });

  test('a single write intent → null (falls through to the single-action path)', async () => {
    expect(await actions.buildBatchPreview(OWNER, '86 the paneer tikka')).toBeNull();
    expect(await actions.buildBatchPreview(OWNER, 'change paneer tikka price to 15')).toBeNull();
  });

  test('warn bubbles up when ANY sub-action warns (e.g. a campaign)', async () => {
    const p = await actions.buildBatchPreview(OWNER, '86 the paneer tikka and text all customers saying "hello"');
    expect(p.items).toHaveLength(2);
    expect(p.warn).toBe(true); // send_campaign is outward-facing → warn
    expect(p.items.some((i) => i.warn === true)).toBe(true);
    expect(mockCustomer.createCampaign).not.toHaveBeenCalled();
  });

  test('a denied sub-action is listed with a note; the others still proceed', async () => {
    // Cashier can 86 (MANAGE_MENU) but not set a table (MANAGE_POS).
    const p = await actions.buildBatchPreview(CASHIER(['MANAGE_MENU']), '86 the paneer tikka; mark table 5 clean');
    expect(p.items).toHaveLength(2);
    expect(p.items[1].summary).toMatch(/permission/i);
    // Only the permitted action is executable → token carries just that one.
    expect(actions.verifyActionToken(p.token).items.map((i) => i.action)).toEqual(['86_item']);
    for (const m of MUTATORS) expect(m).not.toHaveBeenCalled();
  });

  test('a needs-more-detail sub-action is noted but does not block the batch', async () => {
    // "set paneer tikka price" has no amount → clarify note; the 86 still proceeds.
    const p = await actions.buildBatchPreview(OWNER, '86 the paneer tikka and update the paneer tikka price');
    expect(p.items).toHaveLength(2);
    expect(p.items[1].summary).toMatch(/new price/i);
    expect(actions.verifyActionToken(p.token).items.map((i) => i.action)).toEqual(['86_item']);
  });
});

describe('runAction (batch) — executes ALL sub-actions, audits each, reports per-item', () => {
  test('all succeed → every service ran, each audited, ✓ line', async () => {
    const p = await actions.buildBatchPreview(OWNER, '86 the paneer tikka; set paneer tikka price to 12; mark table 5 clean');
    const r = await actions.runAction(OWNER, p.token);

    expect(r.ok).toBe(true);
    expect(r.done).toBe(true);
    // Each sub-action ran through its real service.
    expect(mockMenu.updateMenuItem).toHaveBeenCalledWith('m1', 'o1', { is_available: false });
    expect(mockMenu.updateMenuItem).toHaveBeenCalledWith('m1', 'o1', { base_price: 12 });
    expect(mockTable.updateTableStatus).toHaveBeenCalledWith('t5', 'dirty');
    // Each audited as ASSISTANT_<action>.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(3);
    const auditedActions = mockPrisma.auditLog.create.mock.calls.map((c) => c[0].data.action);
    expect(auditedActions).toEqual(['ASSISTANT_86_ITEM', 'ASSISTANT_ADJUST_PRICE', 'ASSISTANT_SET_TABLE_STATUS']);
    expect(r.results).toHaveLength(3);
    expect(r.results.every((x) => x.ok)).toBe(true);
    expect(r.message).not.toMatch(/✗/);
    expect((r.message.match(/✓/g) || []).length).toBe(3);
  });

  test('partial failure — one sub-action throws → its ✗, the others ✓ (batch never aborts)', async () => {
    // The table update fails; the two menu updates must still go through.
    mockTable.updateTableStatus.mockRejectedValue(new NotFoundError('table 5 not found'));
    const p = await actions.buildBatchPreview(OWNER, '86 the paneer tikka; set paneer tikka price to 12; mark table 5 clean');
    const r = await actions.runAction(OWNER, p.token);

    expect(r.ok).toBe(false);   // not all succeeded
    expect(r.done).toBe(true);
    expect(mockMenu.updateMenuItem).toHaveBeenCalledTimes(2); // both menu writes still ran
    // Only the successful sub-actions are audited (mirrors the single-action path).
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(r.results.map((x) => x.ok)).toEqual([true, true, false]);
    expect(r.message).toMatch(/✓/);
    expect(r.message).toMatch(/✗/);
    expect(r.message).toMatch(/not found/i); // the failure reason surfaces
  });

  test('permission revoked between preview and confirm → that item ✗, others still run', async () => {
    // Sign a batch as if previewed while permitted, then confirm as a cashier
    // who only holds MANAGE_MENU (so the table sub-action is now blocked).
    const token = actions.signActionToken({
      batch: true,
      items: [
        { action: '86_item', params: { item_id: 'm1', item_name: 'Paneer Tikka', is_available: false } },
        { action: 'set_table_status', params: { table_id: 't5', table_number: '5', status: 'dirty', status_label: 'cleaning' } },
      ],
      outletId: 'o1',
      userId: 'u2',
    });
    const r = await actions.runAction(CASHIER(['MANAGE_MENU']), token);
    expect(mockMenu.updateMenuItem).toHaveBeenCalledTimes(1);    // the allowed one ran
    expect(mockTable.updateTableStatus).not.toHaveBeenCalled();  // the revoked one did not
    expect(r.results.map((x) => x.ok)).toEqual([true, false]);
    expect(r.ok).toBe(false);
  });

  test('a batch token bound to another user/outlet is refused without mutating', async () => {
    const p = await actions.buildBatchPreview(OWNER, '86 the paneer tikka; mark table 5 clean');
    expect((await actions.runAction({ ...OWNER, id: 'someone-else' }, p.token)).ok).toBe(false);
    expect((await actions.runAction({ ...OWNER, outletId: 'o2' }, p.token)).ok).toBe(false);
    for (const m of MUTATORS) expect(m).not.toHaveBeenCalled();
  });
});
