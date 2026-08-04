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
