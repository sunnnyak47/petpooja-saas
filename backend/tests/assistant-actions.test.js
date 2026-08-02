/**
 * @fileoverview Tests for the assistant WRITE engine (assistant.actions).
 * Verifies detection, param extraction, that PREVIEW never mutates, that CONFIRM
 * executes through the real service + audits, and every token/permission guard.
 * All services + DB + jwt secret are mocked (no DB, no network).
 * @module tests/assistant-actions.test
 */

const mockMenu = { listMenuItems: jest.fn(), updateMenuItem: jest.fn() };
const mockCustomer = { createCustomer: jest.fn() };
const mockTable = { listTables: jest.fn(), updateTableStatus: jest.fn() };
const mockPrisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/modules/menu/menu.service', () => mockMenu);
jest.mock('../src/modules/customers/customer.service', () => mockCustomer);
jest.mock('../src/modules/orders/table.service', () => mockTable);

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
