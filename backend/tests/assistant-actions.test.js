/**
 * @fileoverview Tests for the assistant WRITE engine (assistant.actions).
 * Verifies detection, param extraction, that PREVIEW never mutates, that CONFIRM
 * executes through the real service + audits, and every token/permission guard.
 * All services + DB + jwt secret are mocked (no DB, no network).
 * @module tests/assistant-actions.test
 */

const mockMenu = { listMenuItems: jest.fn(), updateMenuItem: jest.fn() };
const mockCustomer = { createCustomer: jest.fn(), createCampaign: jest.fn() };
const mockTable = { listTables: jest.fn(), updateTableStatus: jest.fn() };
const mockInventory = { getLowStock: jest.fn() };
const mockProcurement = { createPurchaseOrder: jest.fn() };
const mockReservations = { createReservation: jest.fn() };
const mockPrisma = { auditLog: { create: jest.fn().mockResolvedValue({}) }, customer: { count: jest.fn() } };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/modules/menu/menu.service', () => mockMenu);
jest.mock('../src/modules/customers/customer.service', () => mockCustomer);
jest.mock('../src/modules/orders/table.service', () => mockTable);
jest.mock('../src/modules/inventory/inventory.service', () => mockInventory);
jest.mock('../src/modules/inventory/procurement.service', () => mockProcurement);
jest.mock('../src/modules/reservations/reservations.service', () => mockReservations);

const actions = require('../src/modules/assistant/assistant.actions');

const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [], currency: 'AUD', headOfficeId: 'h1' };
const CASHIER = (perms) => ({ id: 'u2', role: 'cashier', outletId: 'o1', permissions: perms, currency: 'AUD' });

beforeEach(() => {
  jest.clearAllMocks();
  mockMenu.listMenuItems.mockResolvedValue({ items: [{ id: 'm1', name: 'Paneer Tikka', base_price: 12, is_available: true }] });
  mockTable.listTables.mockResolvedValue([{ id: 't5', table_number: '5', status: 'occupied' }]);
  mockCustomer.createCustomer.mockResolvedValue({ id: 'c9' });
});

describe('detectAction', () => {
  test('recognises write intents', () => {
    expect(actions.detectAction('86 the paneer tikka').name).toBe('86_item');
    expect(actions.detectAction('change paneer tikka price to 15').name).toBe('adjust_price');
    expect(actions.detectAction('mark table 5 clean').name).toBe('set_table_status');
    expect(actions.detectAction('add customer John Smith 0412345678').name).toBe('create_customer');
  });
  test('how-to questions are NOT write intents (route to help)', () => {
    expect(actions.detectAction('how do i 86 an item')).toBeNull();
    expect(actions.detectAction('how to change a price')).toBeNull();
    expect(actions.detectAction('where do i mark a table clean')).toBeNull();
  });
  test('read questions are not write intents', () => {
    expect(actions.detectAction('how much did we sell today')).toBeNull();
    expect(actions.detectAction('who are my top customers')).toBeNull();
  });
});

describe('extraction helpers', () => {
  test('price / phone / table number / name', () => {
    expect(actions.extractPrice('set it to 8.50')).toBe(8.5);
    expect(actions.extractPrice('make it $12')).toBe(12);
    expect(actions.extractPhone('add customer 0412 345 678')).toBe('0412345678');
    expect(actions.extractTableNumber('mark table 7 clean')).toBe('7');
    expect(actions.isolateName('86 the paneer tikka')).toBe('paneer tikka');
  });
});

describe('resolveMenuItem', () => {
  test('exact, then fuzzy, then ambiguous', async () => {
    mockMenu.listMenuItems.mockResolvedValue({ items: [
      { id: 'a', name: 'Chicken Curry' }, { id: 'b', name: 'Chicken Wings' },
    ] });
    expect((await actions.resolveMenuItem('o1', 'chicken curry')).map((x) => x.id)).toEqual(['a']);
    expect((await actions.resolveMenuItem('o1', 'chicken')).length).toBe(2); // ambiguous
    expect((await actions.resolveMenuItem('o1', 'pizza')).length).toBe(0); // none
  });
});

describe('buildActionPreview — never mutates', () => {
  test('86_item happy path: preview + token, NO update called', async () => {
    const p = await actions.buildActionPreview(OWNER, '86 the paneer tikka');
    expect(p.action).toBe('86_item');
    expect(p.summary).toMatch(/86 "Paneer Tikka"/);
    expect(p.token).toBeTruthy();
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled(); // preview must not write
    expect(actions.verifyActionToken(p.token).params.item_id).toBe('m1');
  });
  test('adjust_price shows old → new', async () => {
    const p = await actions.buildActionPreview(OWNER, 'change paneer tikka price to 15');
    expect(p.summary).toMatch(/from .*12.* to .*15/);
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
  });
  test('set_table_status maps clean → cleaning', async () => {
    const p = await actions.buildActionPreview(OWNER, 'mark table 5 clean');
    expect(p.summary).toMatch(/table 5 to cleaning/);
    expect(mockTable.updateTableStatus).not.toHaveBeenCalled();
  });
  test('create_customer parses name + phone', async () => {
    const p = await actions.buildActionPreview(OWNER, 'add customer John Smith 0412345678');
    expect(p.summary).toMatch(/John Smith.*0412345678/);
    expect(mockCustomer.createCustomer).not.toHaveBeenCalled();
  });
  test('permission denied when the user lacks the RBAC key', async () => {
    const p = await actions.buildActionPreview(CASHIER([]), '86 the paneer tikka');
    expect(p.denied).toBe(true);
    expect(p.message).toMatch(/permission/i);
  });
  test('clarification when ambiguous / missing detail', async () => {
    mockMenu.listMenuItems.mockResolvedValue({ items: [{ id: 'a', name: 'Chicken Curry' }, { id: 'b', name: 'Chicken Wings' }] });
    expect((await actions.buildActionPreview(OWNER, '86 chicken')).clarify).toBe(true);
    mockMenu.listMenuItems.mockResolvedValue({ items: [] });
    expect((await actions.buildActionPreview(OWNER, '86 the pizza')).message).toMatch(/couldn't find/i);
    expect((await actions.buildActionPreview(OWNER, 'add customer Jane')).message).toMatch(/phone/i);
  });
  test('non-write question → null', async () => {
    expect(await actions.buildActionPreview(OWNER, 'how much did we sell today')).toBeNull();
  });
});

describe('runAction — confirm + execute + audit + guards', () => {
  test('valid token executes through the service and audits', async () => {
    const p = await actions.buildActionPreview(OWNER, '86 the paneer tikka');
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockMenu.updateMenuItem).toHaveBeenCalledWith('m1', 'o1', { is_available: false });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_86_ITEM');
  });
  test('adjust_price + set_table_status + create_customer execute the right service', async () => {
    const price = await actions.buildActionPreview(OWNER, 'change paneer tikka price to 15');
    await actions.runAction(OWNER, price.token);
    expect(mockMenu.updateMenuItem).toHaveBeenCalledWith('m1', 'o1', { base_price: 15 });
    const tbl = await actions.buildActionPreview(OWNER, 'mark table 5 clean');
    await actions.runAction(OWNER, tbl.token);
    expect(mockTable.updateTableStatus).toHaveBeenCalledWith('t5', 'dirty');
    const cust = await actions.buildActionPreview(OWNER, 'add customer John Smith 0412345678');
    await actions.runAction(OWNER, cust.token);
    expect(mockCustomer.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ phone: '0412345678', full_name: 'John Smith' }), expect.any(Object));
  });
  test('garbage / expired token is rejected without mutating', async () => {
    const r = await actions.runAction(OWNER, 'not.a.jwt');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/expired/i);
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
  });
  test('token bound to another user/outlet is refused', async () => {
    const p = await actions.buildActionPreview(OWNER, '86 the paneer tikka');
    const other = await actions.runAction({ ...OWNER, id: 'someone-else' }, p.token);
    expect(other.ok).toBe(false);
    const otherOutlet = await actions.runAction({ ...OWNER, outletId: 'o2' }, p.token);
    expect(otherOutlet.ok).toBe(false);
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
  });
  test('permission revoked between preview and confirm blocks execution', async () => {
    // Sign a token as if previewed while permitted, then confirm as an unpermitted same user.
    const token = actions.signActionToken({ action: '86_item', params: { item_id: 'm1', item_name: 'Paneer Tikka', is_available: false }, outletId: 'o1', userId: 'u2' });
    const r = await actions.runAction(CASHIER([]), token);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/permission/i);
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
  });
  test('service error surfaces gracefully (e.g. duplicate customer)', async () => {
    mockCustomer.createCustomer.mockRejectedValue(new Error('Customer with this phone already exists'));
    const p = await actions.buildActionPreview(OWNER, 'add customer Jane 0400000000');
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/already exists/i);
  });
});

// ── Batch 2 write tools: draft_po, create_reservation, send_campaign ──────────
describe('draft_po (from low stock)', () => {
  test('builds a draft PO from low-stock items; preview never writes; confirm creates', async () => {
    mockInventory.getLowStock.mockResolvedValue([
      { id: 'i1', name: 'Butter', unit: 'kg', current_stock: 1, min_threshold: 5, reorder_qty: 10, cost_per_unit: 4 },
      { id: 'i2', name: 'Flour', unit: 'kg', current_stock: 2, min_threshold: 8, cost_per_unit: 2 }, // no reorder_qty → min-cur=6
    ]);
    mockProcurement.createPurchaseOrder.mockResolvedValue({ id: 'po1', po_number: 'PO-0007' });
    const p = await actions.buildActionPreview(OWNER, 'draft a po for what is running low');
    expect(p.summary).toMatch(/2 low-stock items/);
    expect(mockProcurement.createPurchaseOrder).not.toHaveBeenCalled();
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    const [outlet, data] = mockProcurement.createPurchaseOrder.mock.calls[0];
    expect(outlet).toBe('o1');
    expect(data.items).toEqual([
      { inventory_item_id: 'i1', item_name: 'Butter', quantity: 10, unit: 'kg', unit_price: 4 },
      { inventory_item_id: 'i2', item_name: 'Flour', quantity: 6, unit: 'kg', unit_price: 2 },
    ]);
    expect(r.message).toMatch(/PO-0007/);
  });
  test('nothing low → clarification, no PO', async () => {
    mockInventory.getLowStock.mockResolvedValue([]);
    const p = await actions.buildActionPreview(OWNER, 'draft a po for low stock');
    expect(p.clarify).toBe(true);
    expect(mockProcurement.createPurchaseOrder).not.toHaveBeenCalled();
  });
});

describe('create_reservation', () => {
  test('parses date/time/party/name; confirm creates via service', async () => {
    mockReservations.createReservation.mockResolvedValue({ id: 'r1', table_number: '4' });
    const now = new Date('2026-08-02T10:00:00'); // Sunday (only affects relative dates, computed inside)
    const p = await actions.buildActionPreview(OWNER, 'book a table for 4 tomorrow at 7pm for John Smith');
    expect(p.summary).toMatch(/table for 4 on \d{4}-\d{2}-\d{2} at 19:00 for John Smith/);
    expect(mockReservations.createReservation).not.toHaveBeenCalled();
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockReservations.createReservation).toHaveBeenCalledWith('o1', expect.objectContaining({ party_size: 4, reservation_time: '19:00', customer_name: 'John Smith' }));
    expect(r.message).toMatch(/reserved table 4/);
  });
  test('no date → clarification', async () => {
    expect((await actions.buildActionPreview(OWNER, 'make a reservation for 2')).clarify).toBe(true);
  });
});

describe('send_campaign (outward-facing, strong confirm)', () => {
  test('counts recipients, warns, previews without sending; confirm sends', async () => {
    mockPrisma.customer.count.mockResolvedValue(342);
    const p = await actions.buildActionPreview(OWNER, 'text my VIP customers saying "2-for-1 this Friday"');
    expect(p.warn).toBe(true); // stronger confirmation flag
    expect(p.summary).toMatch(/Send a SMS to 342 vip customers/);
    expect(p.summary).toMatch(/2-for-1 this Friday/);
    expect(mockCustomer.createCampaign).not.toHaveBeenCalled(); // preview must not send
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockCustomer.createCampaign).toHaveBeenCalledWith('o1', expect.objectContaining({ type: 'sms', target_segment: 'vip', message: '2-for-1 this Friday' }));
    expect(r.message).toMatch(/went to 342 customers/);
  });
  test('no message → clarification', async () => {
    mockPrisma.customer.count.mockResolvedValue(10);
    expect((await actions.buildActionPreview(OWNER, 'send an sms to all customers')).message).toMatch(/what message/i);
  });
  test('zero recipients → clarification, no send', async () => {
    mockPrisma.customer.count.mockResolvedValue(0);
    const p = await actions.buildActionPreview(OWNER, 'email my vip customers saying "hi"');
    expect(p.clarify).toBe(true);
    expect(mockCustomer.createCampaign).not.toHaveBeenCalled();
  });
  test('cashier without MANAGE_CAMPAIGNS is denied', async () => {
    const p = await actions.buildActionPreview(CASHIER([]), 'text all customers saying "hello"');
    expect(p.denied).toBe(true);
  });
});
