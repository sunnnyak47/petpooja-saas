/**
 * @fileoverview Tests for the assistant WRITE engine (assistant.actions).
 * Verifies detection, param extraction, that PREVIEW never mutates, that CONFIRM
 * executes through the real service + audits, and every token/permission guard.
 * All services + DB + jwt secret are mocked (no DB, no network).
 * @module tests/assistant-actions.test
 */

const mockMenu = { listMenuItems: jest.fn(), updateMenuItem: jest.fn(), listCategories: jest.fn(), createMenuItem: jest.fn(), createCategory: jest.fn(), createCombo: jest.fn() };
const mockCustomer = { createCustomer: jest.fn(), createCampaign: jest.fn(), findByPhone: jest.fn(), listCustomers: jest.fn(), adjustPoints: jest.fn() };
const mockPricing = { createRule: jest.fn() };
const mockDiscounts = { createDiscount: jest.fn() };
const mockTable = { listTables: jest.fn(), updateTableStatus: jest.fn() };
const mockInventory = { getLowStock: jest.fn(), listInventoryItems: jest.fn(), recordWastage: jest.fn(), adjustStock: jest.fn(), getStock: jest.fn(), createInventoryItem: jest.fn() };
const mockProcurement = { createPurchaseOrder: jest.fn(), listPurchaseOrders: jest.fn(), receivePurchaseOrder: jest.fn() };
const mockReservations = { createReservation: jest.fn() };
const mockOrder = { listOrders: jest.fn(), getOrderById: jest.fn() };
const mockStaff = { createStaffWithUser: jest.fn(), listStaff: jest.fn(), upsertStaffProfile: jest.fn(), changeStaffRole: jest.fn(), clockIn: jest.fn(), clockOut: jest.fn(), createShift: jest.fn() };
const mockPrisma = {
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  customer: { count: jest.fn() },
  order: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  orderItem: { findMany: jest.fn().mockResolvedValue([]) },
  attendanceLog: { findFirst: jest.fn().mockResolvedValue(null) },
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
jest.mock('../src/modules/staff/staff.service', () => mockStaff);
jest.mock('../src/modules/pricing/pricing.service', () => mockPricing);
jest.mock('../src/modules/discounts/discount.service', () => mockDiscounts);
// The order tax/pricing engine (tax.service, pricing.service, utils/outlet, utils/money)
// is left UNMOCKED on purpose so the discount recompute is exercised for real.

const actions = require('../src/modules/assistant/assistant.actions');

const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [], currency: 'AUD', headOfficeId: 'h1' };
const CASHIER = (perms) => ({ id: 'u2', role: 'cashier', outletId: 'o1', permissions: perms, currency: 'AUD' });

beforeEach(() => {
  jest.clearAllMocks();
  mockMenu.listMenuItems.mockResolvedValue({ items: [{ id: 'm1', name: 'Paneer Tikka', base_price: 12, is_available: true }] });
  mockTable.listTables.mockResolvedValue([{ id: 't5', table_number: '5', status: 'occupied' }]);
  mockCustomer.createCustomer.mockResolvedValue({ id: 'c9' });
  mockStaff.createStaffWithUser.mockResolvedValue({ id: 'sp1', user_id: 'u9', user: { id: 'u9', full_name: 'Test-1' } });
  mockMenu.listCategories.mockResolvedValue({ categories: [{ id: 'cat_mains', name: 'Mains', display_order: 0 }, { id: 'cat_desserts', name: 'Desserts', display_order: 1 }], total: 2 });
  mockMenu.createMenuItem.mockResolvedValue({ id: 'mi1' });
  mockMenu.createCategory.mockResolvedValue({ id: 'cat_new' });
  mockMenu.createCombo.mockResolvedValue({ id: 'combo1' });
  mockStaff.listStaff.mockResolvedValue({ staff: [{ user_id: 'su1', user: { id: 'su1', full_name: 'Ravi Kumar', user_roles: [] } }], total: 1, page: 1, limit: 500 });
  mockStaff.upsertStaffProfile.mockResolvedValue({});
  mockStaff.changeStaffRole.mockResolvedValue({ user_id: 'su1', role: 'manager' });
  mockStaff.clockIn.mockResolvedValue({ id: 'att1' });
  mockStaff.clockOut.mockResolvedValue({ id: 'att1', hours_worked: 8 });
  mockStaff.createShift.mockResolvedValue({ id: 'sh1' });
  mockPricing.createRule.mockResolvedValue({ id: 'pr1' });
  mockDiscounts.createDiscount.mockResolvedValue({ id: 'd1' });
  mockCustomer.findByPhone.mockResolvedValue({ id: 'c1', full_name: 'John Smith', phone: '0412345678' });
  mockCustomer.listCustomers.mockResolvedValue({ customers: [{ id: 'c1', full_name: 'John Smith', phone: '0412345678' }], total: 1, page: 1, limit: 10 });
  mockCustomer.adjustPoints.mockResolvedValue({ current_balance: 150 });
});

describe('detectAction', () => {
  test('recognises write intents', () => {
    expect(actions.detectAction('86 the paneer tikka').name).toBe('86_item');
    expect(actions.detectAction('change paneer tikka price to 15').name).toBe('adjust_price');
    expect(actions.detectAction('mark table 5 clean').name).toBe('set_table_status');
    expect(actions.detectAction('add customer John Smith 0412345678').name).toBe('create_customer');
    expect(actions.detectAction('add a new staff as test-1 name').name).toBe('create_staff');
    expect(actions.detectAction('add staff John Smith as cashier').name).toBe('create_staff');
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
  test('detects "update <item> price" (verb + item + price non-adjacent)', () => {
    expect(actions.detectAction('update paneer tikka price')?.name).toBe('adjust_price');
    expect(actions.detectAction("change paneer tikka's price to 15")?.name).toBe('adjust_price');
    expect(actions.detectAction('increase the paneer tikka price by 10%')?.name).toBe('adjust_price');
    // a READ price question is NOT a write action
    expect(actions.detectAction('what is the price of paneer tikka')).toBeNull();
  });
  test('"update <item> price" with no amount → clarify for the new price', async () => {
    const p = await actions.buildActionPreview(OWNER, 'update paneer tikka price');
    expect(p.clarify).toBe(true);
    expect(p.message).toMatch(/new price/i);
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
  });
  test('relative percentage change computes from the current price', async () => {
    const p = await actions.buildActionPreview(OWNER, 'increase paneer tikka price by 10%');
    expect(p.summary).toMatch(/13\.20/); // 12.00 → +10% = 13.20
  });
  test('relative flat change ("up by 3")', async () => {
    const p = await actions.buildActionPreview(OWNER, 'put the paneer tikka price up by 3');
    expect(p.summary).toMatch(/15\.00/); // 12 + 3
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
  test('create_staff: parses a hyphen/digit name ("test-1"), previews, does NOT create', async () => {
    const p = await actions.buildActionPreview(OWNER, 'add a new staff as test-1 name');
    expect(p.action).toBe('create_staff');
    expect(p.summary).toMatch(/test-1/i);       // literal name preserved (not "test")
    expect(p.summary).toMatch(/cashier/i);      // defaults to cashier when no role given
    expect(p.token).toBeTruthy();
    expect(mockStaff.createStaffWithUser).not.toHaveBeenCalled(); // preview never mutates
  });
  test('create_staff: separates the role from the name ("Jane as manager")', async () => {
    const p = await actions.buildActionPreview(OWNER, 'add staff Jane as manager');
    expect(p.action).toBe('create_staff');
    expect(p.summary).toMatch(/jane/i);
    expect(p.summary).toMatch(/manager/i);
    expect(p.summary).not.toMatch(/jane as manager/i); // "as manager" is the role, not part of the name
  });
  test('create_staff: asks for a name when none is given', async () => {
    const p = await actions.buildActionPreview(OWNER, 'add a new staff member');
    expect(p.clarify).toBe(true);
    expect(p.message).toMatch(/name/i);
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
  test('create_staff confirm creates through the staff service and audits', async () => {
    const p = await actions.buildActionPreview(OWNER, 'add staff John Smith as cashier');
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockStaff.createStaffWithUser).toHaveBeenCalledWith('o1', expect.objectContaining({ full_name: 'John Smith', role: 'cashier' }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_CREATE_STAFF');
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.entity_type).toBe('staff');
  });
  test('create_staff is blocked for a user without MANAGE_STAFF', async () => {
    const denied = await actions.buildActionPreview(CASHIER([]), 'add staff John Smith');
    expect(denied.denied).toBe(true);
    expect(mockStaff.createStaffWithUser).not.toHaveBeenCalled();
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

// ── apply_discount (write to a live order; preview → approve → run) ────────────
describe('apply_discount — detection & extraction', () => {
  test('command phrasings detect as apply_discount', () => {
    expect(actions.detectAction('apply 10% off order 42').name).toBe('apply_discount');
    expect(actions.detectAction('give a discount on the bill').name).toBe('apply_discount');
    expect(actions.detectAction('discount the order by $5').name).toBe('apply_discount');
  });
  test('how-to / read questions about discounts are NOT write intents', () => {
    expect(actions.detectAction('how do i apply a discount')).toBeNull();
    expect(actions.detectAction('how much discount did we give today')).toBeNull();
  });
  test('extractDiscount parses percentage vs flat; bare order number is not money', () => {
    expect(actions.extractDiscount('apply 10% off')).toEqual({ discount_type: 'percentage', discount_value: 10 });
    expect(actions.extractDiscount('take 12.5 percent off')).toEqual({ discount_type: 'percentage', discount_value: 12.5 });
    expect(actions.extractDiscount('$5 off the bill')).toEqual({ discount_type: 'flat', discount_value: 5 });
    expect(actions.extractDiscount('flat 8 discount')).toEqual({ discount_type: 'flat', discount_value: 8 });
    expect(actions.extractDiscount('apply a discount to order 42')).toBeNull(); // "42" is the order, not $42
  });
  test('extractOrderNumber requires a digit; extractReason prefers quotes', () => {
    expect(actions.extractOrderNumber('discount order 42')).toBe('42');
    expect(actions.extractOrderNumber('discount bill #A12 please')).toBe('A12');
    expect(actions.extractOrderNumber('discount the order by 10%')).toBeNull();
    expect(actions.extractReason('discount order 42 reason "staff meal"')).toBe('staff meal');
  });
});

describe('apply_discount — preview never mutates & resolves the order', () => {
  const RUNNING = (over = {}) => ({ id: 'ord42', order_number: '42', status: 'confirmed', subtotal: 20, table_id: null, ...over });

  test('resolves the single open order; previews with token; NO update called', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING()] });
    const p = await actions.buildActionPreview(OWNER, 'apply 10% off order 42');
    expect(p.action).toBe('apply_discount');
    expect(p.warn).toBe(true); // financial change → strong confirm
    expect(p.summary).toMatch(/Apply a 10% discount to order #42/);
    expect(p.token).toBeTruthy();
    expect(mockPrisma.order.update).not.toHaveBeenCalled(); // preview must not write
    const params = actions.verifyActionToken(p.token).params;
    expect(params).toMatchObject({ order_id: 'ord42', discount_type: 'percentage', discount_value: 10 });
  });
  test('flat discount summary shows the amount', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING()] });
    const p = await actions.buildActionPreview(OWNER, 'take $5 off order 42');
    expect(p.summary).toMatch(/Apply a .*5\.00 discount to order #42/);
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });
  test('auto-picks the single running order when none is named', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING()] });
    const p = await actions.buildActionPreview(OWNER, 'apply 10% discount');
    expect(p.action).toBe('apply_discount');
    expect(p.summary).toMatch(/order #42/);
  });
  test('missing amount → clarification', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING()] });
    const p = await actions.buildActionPreview(OWNER, 'apply a discount to order 42');
    expect(p.clarify).toBe(true);
    expect(p.message).toMatch(/how much discount/i);
  });
  test('percentage over 100 → clarification', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING()] });
    const p = await actions.buildActionPreview(OWNER, 'apply 150% off order 42');
    expect(p.message).toMatch(/can't be more than 100/i);
  });
  test('no open order → clarification, no mutation', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [] });
    const p = await actions.buildActionPreview(OWNER, 'apply 10% off');
    expect(p.clarify).toBe(true);
    expect(p.message).toMatch(/no open order/i);
  });
  test('several open orders + no order named → clarify (never guess)', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING(), RUNNING({ id: 'ord43', order_number: '43' })] });
    const p = await actions.buildActionPreview(OWNER, 'apply 10% off');
    expect(p.clarify).toBe(true);
    expect(p.message).toMatch(/which one|open orders/i);
  });
  test('named order not found → clarify', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING()] });
    const p = await actions.buildActionPreview(OWNER, 'apply 10% off order 99');
    expect(p.message).toMatch(/couldn't find/i);
  });
  test('order already billed/paid → cannot discount', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING({ status: 'billed' })] });
    const p = await actions.buildActionPreview(OWNER, 'apply 10% off order 42');
    expect(p.message).toMatch(/before it's billed or paid/i);
  });
  test('cashier without MANAGE_ORDERS is denied; with it is allowed', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [RUNNING()] });
    expect((await actions.buildActionPreview(CASHIER([]), 'apply 10% off order 42')).denied).toBe(true);
    expect((await actions.buildActionPreview(CASHIER(['MANAGE_ORDERS']), 'apply 10% off order 42')).action).toBe('apply_discount');
  });
});

describe('apply_discount — confirm executes the real recompute + audits', () => {
  test('recomputes totals against the live order and updates + audits', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [{ id: 'ord42', order_number: '42', status: 'confirmed', subtotal: 20, table_id: null }] });
    // Live order re-fetched at execute time (AU outlet → GST inclusive).
    mockPrisma.order.findFirst.mockResolvedValue({
      id: 'ord42', status: 'confirmed', subtotal: 20, loyalty_discount: 0,
      outlet: { currency: 'AUD', state: '', head_office: { country_code: 'AU', region: 'AU', gst_inclusive: true, currency: 'AUD' } },
    });
    mockPrisma.orderItem.findMany.mockResolvedValue([{ item_total: 20, quantity: 1, gst_rate: 10, is_deleted: false }]);

    const p = await actions.buildActionPreview(OWNER, 'apply 10% off order 42');
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);

    const data = mockPrisma.order.update.mock.calls[0][0].data;
    expect(data.discount_type).toBe('percentage');
    expect(data.discount_value).toBe(10);
    expect(data.discount_amount).toBe(2);     // 10% of a $20 subtotal
    expect(data.grand_total).toBe(18);        // AU inclusive → 20 - 2
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_APPLY_DISCOUNT');
    expect(r.message).toMatch(/applied a 10% discount/i);
  });
  test('status flipped to paid between preview and confirm → refuses, no update', async () => {
    mockOrder.listOrders.mockResolvedValue({ orders: [{ id: 'ord42', order_number: '42', status: 'confirmed', subtotal: 20, table_id: null }] });
    const p = await actions.buildActionPreview(OWNER, 'apply 10% off order 42');
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'ord42', status: 'paid', subtotal: 20, loyalty_discount: 0, outlet: { currency: 'AUD', head_office: { country_code: 'AU', gst_inclusive: true } } });
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(false);
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });
});

// ── Pack A: inventory & wastage ──────────────────────────────────────────────
describe('inventory pack (record_wastage / adjust_stock / receive_po / create_inventory_item)', () => {
  beforeEach(() => {
    mockInventory.listInventoryItems.mockResolvedValue({ items: [{ id: 'inv1', name: 'Paneer', unit: 'kg' }] });
  });

  test('detection routes each inventory intent', () => {
    expect(actions.detectAction('we threw out 2kg paneer').name).toBe('record_wastage');
    expect(actions.detectAction('set tomatoes to 5kg').name).toBe('adjust_stock');
    expect(actions.detectAction('add 10kg onions').name).toBe('adjust_stock');
    expect(actions.detectAction('receive PO-000123').name).toBe('receive_po');
    expect(actions.detectAction('add inventory item Paneer, unit kg').name).toBe('create_inventory_item');
    expect(actions.detectAction('how do I log wastage')).toBeNull();
  });

  test('record_wastage: preview resolves the item + reason, never writes; confirm records + audits', async () => {
    const p = await actions.buildActionPreview(OWNER, 'we threw out 2kg paneer, expired');
    expect(p.action).toBe('record_wastage');
    expect(p.summary).toMatch(/2 kg of "Paneer".*expired/i);
    expect(mockInventory.recordWastage).not.toHaveBeenCalled();
    mockInventory.recordWastage.mockResolvedValue({ logged: 1 });
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockInventory.recordWastage).toHaveBeenCalledWith('o1', [{ item_id: 'inv1', quantity: 2, reason: 'expired' }], 'u1');
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_RECORD_WASTAGE');
  });

  test('adjust_stock set: confirm computes delta from live stock', async () => {
    mockInventory.listInventoryItems.mockResolvedValue({ items: [{ id: 'inv2', name: 'Tomatoes', unit: 'kg' }] });
    mockInventory.getStock.mockResolvedValue({ items: [{ id: 'inv2', current_stock: 3 }] });
    mockInventory.adjustStock.mockResolvedValue({ current_stock: 5 });
    const p = await actions.buildActionPreview(OWNER, 'set tomatoes to 5kg');
    expect(p.summary).toMatch(/Set "Tomatoes" stock to 5 kg/);
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockInventory.adjustStock).toHaveBeenCalledWith('o1', 'inv2', 2, 'Assistant stock set', 'u1');
  });

  test('adjust_stock add: positive delta, no live read needed', async () => {
    mockInventory.listInventoryItems.mockResolvedValue({ items: [{ id: 'inv3', name: 'Onions', unit: 'kg' }] });
    mockInventory.adjustStock.mockResolvedValue({ current_stock: 12 });
    const p = await actions.buildActionPreview(OWNER, 'add 10kg onions');
    await actions.runAction(OWNER, p.token);
    expect(mockInventory.adjustStock).toHaveBeenCalledWith('o1', 'inv3', 10, 'Assistant stock add', 'u1');
  });

  test('receive_po: resolves by number, refuses already-received, confirm receives + audits', async () => {
    mockProcurement.listPurchaseOrders.mockResolvedValue({ items: [{ id: 'po1', po_number: 'PO-000123', status: 'approved' }] });
    mockProcurement.receivePurchaseOrder.mockResolvedValue({ id: 'grn1', grn_number: 'GRN-123456' });
    const p = await actions.buildActionPreview(OWNER, 'receive PO-000123');
    expect(p.action).toBe('receive_po');
    expect(mockProcurement.receivePurchaseOrder).not.toHaveBeenCalled();
    const r = await actions.runAction(OWNER, p.token);
    expect(mockProcurement.receivePurchaseOrder).toHaveBeenCalledWith('o1', 'po1', {}, 'u1');
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_RECEIVE_PO');

    mockProcurement.listPurchaseOrders.mockResolvedValue({ items: [{ id: 'po1', po_number: 'PO-000123', status: 'received' }] });
    const already = await actions.buildActionPreview(OWNER, 'receive PO-000123');
    expect(already.message).toMatch(/already been received/i);
  });

  test('create_inventory_item: dup blocked; confirm creates + audits', async () => {
    mockInventory.listInventoryItems.mockResolvedValue({ items: [] });
    mockInventory.createInventoryItem.mockResolvedValue({ id: 'inv9', name: 'Paneer' });
    const p = await actions.buildActionPreview(OWNER, 'add inventory item Paneer, unit kg');
    expect(p.summary).toMatch(/Create inventory item "Paneer".*unit kg/);
    const r = await actions.runAction(OWNER, p.token);
    expect(mockInventory.createInventoryItem).toHaveBeenCalledWith('o1', expect.objectContaining({ name: 'Paneer', unit: 'kg' }));
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_CREATE_INVENTORY_ITEM');

    mockInventory.listInventoryItems.mockResolvedValue({ items: [{ id: 'x', name: 'Paneer', unit: 'kg' }] });
    const dup = await actions.buildActionPreview(OWNER, 'add inventory item Paneer, unit kg');
    expect(dup.message).toMatch(/already an inventory item/i);
  });

  test('cashier without MANAGE_INVENTORY is denied', async () => {
    const p = await actions.buildActionPreview(CASHIER([]), 'set tomatoes to 5kg');
    expect(p.denied).toBe(true);
    expect(mockInventory.adjustStock).not.toHaveBeenCalled();
  });
});

// ── Pack B: menu setup ───────────────────────────────────────────────────────
describe('menu pack (create_menu_item / create_category / create_combo)', () => {
  test('detection routes each menu-setup intent', () => {
    expect(actions.detectAction('add dish Butter Chicken $14 in Mains').name).toBe('create_menu_item');
    expect(actions.detectAction('new item Garlic Naan 3.50').name).toBe('create_menu_item');
    expect(actions.detectAction("make a 'Lunch Specials' category").name).toBe('create_category');
    expect(actions.detectAction("create combo 'Lunch Deal' $12").name).toBe('create_combo');
    expect(actions.detectAction('how do I add a menu item')).toBeNull();
  });

  test('create_menu_item: named category, preview never writes, confirm creates + audits', async () => {
    const p = await actions.buildActionPreview(OWNER, 'add dish Butter Chicken $14 in Mains');
    expect(p.action).toBe('create_menu_item');
    expect(p.summary).toMatch(/Butter Chicken.*14\.00.*Mains/);
    expect(mockMenu.createMenuItem).not.toHaveBeenCalled();
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockMenu.createMenuItem).toHaveBeenCalledWith(expect.objectContaining({ outlet_id: 'o1', category_id: 'cat_mains', name: 'Butter Chicken', base_price: 14 }));
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_CREATE_MENU_ITEM');
  });

  test('create_menu_item: no category → defaults to first; unknown category / missing price → clarify', async () => {
    const def = await actions.buildActionPreview(OWNER, 'new item Garlic Naan 3.50');
    expect(def.summary).toMatch(/Mains/);
    expect(def.summary).toMatch(/default/i);
    const unknown = await actions.buildActionPreview(OWNER, 'add dish Tandoori Wings $9 in Starters');
    expect(unknown.message).toMatch(/couldn't find a category called "Starters"/i);
    const noPrice = await actions.buildActionPreview(OWNER, 'add dish Butter Chicken in Mains');
    expect(noPrice.message).toMatch(/price/i);
    mockMenu.listCategories.mockResolvedValue({ categories: [], total: 0 });
    const noCats = await actions.buildActionPreview(OWNER, 'new item Garlic Naan 3.50');
    expect(noCats.message).toMatch(/don't have any menu categories/i);
  });

  test('create_category: quoted name, confirm creates + audits; needs MANAGE_CATEGORIES', async () => {
    const p = await actions.buildActionPreview(OWNER, "make a 'Lunch Specials' category");
    expect(p.action).toBe('create_category');
    const r = await actions.runAction(OWNER, p.token);
    expect(mockMenu.createCategory).toHaveBeenCalledWith({ outlet_id: 'o1', name: 'Lunch Specials' });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_CREATE_CATEGORY');
    expect((await actions.buildActionPreview(CASHIER(['MANAGE_MENU']), "add category 'Sides'")).denied).toBe(true);
    expect((await actions.buildActionPreview(CASHIER(['MANAGE_CATEGORIES']), "add category 'Sides'")).action).toBe('create_category');
  });

  test('create_combo: inactive shell; confirm creates is_active:false + audits', async () => {
    const p = await actions.buildActionPreview(OWNER, "create combo 'Lunch Deal' $12");
    expect(p.summary).toMatch(/Lunch Deal.*12\.00/);
    const r = await actions.runAction(OWNER, p.token);
    expect(mockMenu.createCombo).toHaveBeenCalledWith(expect.objectContaining({ outlet_id: 'o1', name: 'Lunch Deal', combo_price: 12, is_active: false }));
    expect(r.message).toMatch(/add its items/i);
  });

  test('menuResolveCategory: exact, fuzzy, none', async () => {
    expect((await actions.menuResolveCategory('o1', 'mains')).map((c) => c.id)).toEqual(['cat_mains']);
    expect((await actions.menuResolveCategory('o1', 'dess')).map((c) => c.id)).toEqual(['cat_desserts']);
    expect((await actions.menuResolveCategory('o1', 'drinks')).length).toBe(0);
  });
});

// ── Pack C: staff & roster ───────────────────────────────────────────────────
describe('staff pack (update_staff / clock_in / clock_out / create_shift)', () => {
  test('detection routes each; does not hijack menu/hire phrasings', () => {
    expect(actions.detectAction("set Sam's PIN to 4321").name).toBe('update_staff');
    expect(actions.detectAction('make Ravi a manager').name).toBe('update_staff');
    expect(actions.detectAction('clock in Priya').name).toBe('clock_in');
    expect(actions.detectAction('clock out Sam').name).toBe('clock_out');
    expect(actions.detectAction('add a Friday dinner shift 6pm-11pm').name).toBe('create_shift');
    expect(actions.detectAction('add a chef named Ravi').name).toBe('create_staff'); // hire, not update
    expect(actions.detectAction('how do i clock in priya')).toBeNull();
  });

  test('helpers: time range, shift name, staff name, pin', () => {
    expect(actions.stfParseTimeRange('6pm-11pm')).toEqual({ start: '18:00', end: '23:00' });
    expect(actions.stfParseTimeRange('6-11pm')).toEqual({ start: '18:00', end: '23:00' }); // inherits pm
    expect(actions.stfShiftName('add a Friday dinner shift 6pm-11pm')).toBe('Friday Dinner');
    expect(actions.stfExtractStaffName("set Sam's PIN to 4321")).toBe('Sam');
    expect(actions.stfExtractStaffName('promote Priya Sharma to manager')).toBe('Priya Sharma');
    expect(actions.stfExtractPin("set Sam's PIN to 4321")).toBe('4321');
  });

  test('update_staff PIN: confirm calls upsertStaffProfile; PIN never echoed or audited raw', async () => {
    mockStaff.listStaff.mockResolvedValue({ staff: [{ user_id: 'su2', user: { id: 'su2', full_name: 'Sam Lee' } }] });
    const p = await actions.buildActionPreview(OWNER, "set Sam's PIN to 4321");
    expect(p.action).toBe('update_staff');
    expect(p.summary).toMatch(/Set a new PIN for Sam Lee/);
    expect(p.summary).not.toMatch(/4321/);
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockStaff.upsertStaffProfile).toHaveBeenCalledWith('su2', 'o1', { manager_pin: '4321' });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.new_values.manager_pin).toBe('***'); // redacted
  });

  test('update_staff role: confirm changes the role via changeStaffRole', async () => {
    const p = await actions.buildActionPreview(OWNER, 'make Ravi a manager');
    expect(p.action).toBe('update_staff');
    expect(p.summary).toMatch(/Change Ravi Kumar's role to manager/);
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockStaff.changeStaffRole).toHaveBeenCalledWith('o1', 'su1', 'manager');
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_UPDATE_STAFF');
  });

  test('clock_in/out: honours already-in / not-in state; confirm calls the service', async () => {
    mockStaff.listStaff.mockResolvedValue({ staff: [{ user_id: 'su3', user: { id: 'su3', full_name: 'Priya' } }] });
    mockPrisma.attendanceLog.findFirst.mockResolvedValue(null);
    const p = await actions.buildActionPreview(OWNER, 'clock in Priya');
    expect(p.summary).toMatch(/Clock Priya in/);
    await actions.runAction(OWNER, p.token);
    expect(mockStaff.clockIn).toHaveBeenCalledWith('su3', 'o1', {});

    mockPrisma.attendanceLog.findFirst.mockResolvedValue({ id: 'open1' });
    const already = await actions.buildActionPreview(OWNER, 'clock in Priya');
    expect(already.message).toMatch(/already clocked in/i);
    const out = await actions.buildActionPreview(OWNER, 'clock out Priya');
    const ro = await actions.runAction(OWNER, out.token);
    expect(ro.ok).toBe(true);
    expect(mockStaff.clockOut).toHaveBeenCalledWith('su3', 'o1', {});
  });

  test('create_shift: passes real Date times; no time → clarify', async () => {
    const p = await actions.buildActionPreview(OWNER, 'add a Friday dinner shift 6pm-11pm');
    expect(p.summary).toMatch(/"Friday Dinner" shift from 18:00 to 23:00/);
    await actions.runAction(OWNER, p.token);
    const arg = mockStaff.createShift.mock.calls[0][0];
    expect(arg).toMatchObject({ outlet_id: 'o1', name: 'Friday Dinner' });
    expect(arg.start_time).toBeInstanceOf(Date);
    expect(arg.start_time.toISOString()).toMatch(/T18:00/);
    const noTime = await actions.buildActionPreview(OWNER, 'add a dinner shift');
    expect(noTime.message).toMatch(/what time/i);
  });

  test('cashier lacking the permission is denied (staff + attendance)', async () => {
    expect((await actions.buildActionPreview(CASHIER([]), "set Sam's PIN to 4321")).denied).toBe(true);
    expect((await actions.buildActionPreview(CASHIER([]), 'clock in Priya')).denied).toBe(true);
  });
});

// ── Pack D: promotions & pricing ─────────────────────────────────────────────
describe('promo pack (create_pricing_rule / create_discount / adjust_loyalty_points)', () => {
  beforeEach(() => {
    mockMenu.listCategories.mockResolvedValue({ categories: [{ id: 'cat-drinks', name: 'Drinks' }] });
  });

  test('detection routes each; one-off order discount stays apply_discount; read is null', () => {
    expect(actions.detectAction('20% off drinks 4-6pm on weekdays').name).toBe('create_pricing_rule');
    expect(actions.detectAction('happy hour 15% off all 5-7pm').name).toBe('create_pricing_rule');
    expect(actions.detectAction('make code WELCOME10 for 10% off').name).toBe('create_discount');
    expect(actions.detectAction('give customer 0412345678 50 points').name).toBe('adjust_loyalty_points');
    expect(actions.detectAction('apply 10% off order 42').name).toBe('apply_discount');
    expect(actions.detectAction('how many loyalty points does John have')).toBeNull();
  });

  test('time-window / day parsing', () => {
    expect(actions.promoParseTimeWindow('20% off drinks 4-6pm')).toEqual({ time_start: '16:00', time_end: '18:00' });
    expect(actions.promoParseTimeWindow('from 5pm to 7pm')).toEqual({ time_start: '17:00', time_end: '19:00' });
    expect(actions.promoParseDays('on weekdays').days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(actions.promoParseDays('weekends only').days).toEqual(['sat', 'sun']);
  });

  test('create_pricing_rule: parses amount/target/window/days; confirm creates via (outletId, data)', async () => {
    const p = await actions.buildActionPreview(OWNER, '20% off drinks 4-6pm on weekdays');
    expect(p.action).toBe('create_pricing_rule');
    expect(p.summary).toMatch(/20% off the "Drinks" category/);
    expect(p.summary).toMatch(/16:00–18:00/);
    expect(p.summary).toMatch(/weekdays \(Mon–Fri\)/);
    expect(mockPricing.createRule).not.toHaveBeenCalled();
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    const [outletId, data] = mockPricing.createRule.mock.calls[0];
    expect(outletId).toBe('o1');
    expect(data).toMatchObject({ action_type: 'discount', action_unit: 'percent', action_value: 20, time_start: '16:00', time_end: '18:00', days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'], item_target: 'category', target_ids: ['cat-drinks'] });
  });

  test('create_pricing_rule: unknown category → all items + disclosed; no amount → clarify', async () => {
    mockMenu.listCategories.mockResolvedValue({ categories: [] });
    const p = await actions.buildActionPreview(OWNER, '10% off nachos 5-7pm');
    expect(p.summary).toMatch(/all items/);
    expect(p.summary).toMatch(/couldn't find a "nachos" category/);
    expect((await actions.buildActionPreview(OWNER, 'happy hour on drinks 5-7pm')).message).toMatch(/how much/i);
  });

  test('create_discount: code + percentage via (data, outletId); flat; >100% clarifies', async () => {
    const p = await actions.buildActionPreview(OWNER, 'make code WELCOME10 for 10% off');
    expect(p.summary).toMatch(/code WELCOME10.*10% off/);
    await actions.runAction(OWNER, p.token);
    const [data, outletId] = mockDiscounts.createDiscount.mock.calls[0];
    expect(outletId).toBe('o1');
    expect(data).toMatchObject({ code: 'WELCOME10', type: 'percentage', value: 10 });
    const flat = await actions.buildActionPreview(OWNER, 'create discount HAPPY 50 off');
    await actions.runAction(OWNER, flat.token);
    expect(mockDiscounts.createDiscount.mock.calls[1][0]).toMatchObject({ code: 'HAPPY', type: 'flat', value: 50 });
    expect((await actions.buildActionPreview(OWNER, 'create code BIG for 150% off')).message).toMatch(/100%/);
  });

  test('adjust_loyalty_points: by phone (+), by name (-); confirm calls adjustPoints with caller', async () => {
    const p = await actions.buildActionPreview(OWNER, 'give customer 0412345678 50 points');
    expect(p.summary).toMatch(/Add 50 loyalty points to John Smith \(0412345678\)/);
    await actions.runAction(OWNER, p.token);
    expect(mockCustomer.adjustPoints).toHaveBeenCalledWith('c1', 'o1', 50, expect.any(String), expect.objectContaining({ role: 'owner', head_office_id: 'h1' }));
    const neg = await actions.buildActionPreview(OWNER, 'take 20 points off John');
    expect(neg.summary).toMatch(/Remove 20 loyalty points from John Smith/);
    await actions.runAction(OWNER, neg.token);
    expect(mockCustomer.adjustPoints).toHaveBeenCalledWith('c1', 'o1', -20, expect.any(String), expect.any(Object));
  });

  test('adjust_loyalty_points: ambiguous name → asks for phone; unknown phone → not found', async () => {
    mockCustomer.listCustomers.mockResolvedValue({ customers: [{ id: 'a', full_name: 'John A', phone: '1' }, { id: 'b', full_name: 'John B', phone: '2' }], total: 2 });
    expect((await actions.buildActionPreview(OWNER, 'add 30 points to John')).message).toMatch(/matched 2 customers/);
    mockCustomer.findByPhone.mockResolvedValue(null);
    expect((await actions.buildActionPreview(OWNER, 'give 0400000000 10 points')).message).toMatch(/couldn't find/i);
  });

  test('permissions: pricing/discount need MANAGE_MENU, loyalty needs MANAGE_CUSTOMERS', async () => {
    expect((await actions.buildActionPreview(CASHIER([]), '20% off drinks 4-6pm weekdays')).denied).toBe(true);
    expect((await actions.buildActionPreview(CASHIER([]), 'give 0412345678 50 points')).denied).toBe(true);
  });
});
