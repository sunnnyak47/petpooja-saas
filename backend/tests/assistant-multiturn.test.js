/**
 * @fileoverview Tests for MULTI-TURN write follow-ups (assistant.actions).
 * A pronoun/omitted-item follow-up ("change it by 10%", "86 it", "make that
 * unavailable") must resolve the menu item from the PREVIOUS turn instead of
 * asking which item — while preview still never mutates, ambiguous prior turns
 * are never guessed, and with no usable history it falls back to the existing
 * clarify. Existing single/batch behaviour is unchanged.
 * All services + DB + jwt secret are mocked (no DB, no network).
 * @module tests/assistant-multiturn.test
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

const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [], currency: 'AUD', headOfficeId: 'h1' };

// A realistic prior exchange: the owner asked to change Paneer Tikka's price,
// the assistant asked for the amount. The next message is the follow-up.
const HIST = [
  { role: 'user', text: 'update paneer tikka price' },
  { role: 'assistant', text: "What should Paneer Tikka's new price be?" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockMenu.listMenuItems.mockResolvedValue({ items: [{ id: 'm1', name: 'Paneer Tikka', base_price: 12, is_available: true }] });
});

// ── inferPronounAction: bridge detection for context-only phrasings ───────────
describe('inferPronounAction — routes pronoun follow-ups to the right action', () => {
  test('price signal (change verb + number) → adjust_price', () => {
    expect(actions.inferPronounAction('change it by 10%').name).toBe('adjust_price');
    expect(actions.inferPronounAction('set the same item to 12').name).toBe('adjust_price');
    expect(actions.inferPronounAction("bump that up 2").name).toBe('adjust_price');
  });
  test('availability signal → 86_item', () => {
    expect(actions.inferPronounAction('make that unavailable').name).toBe('86_item');
    expect(actions.inferPronounAction('put it back on the menu').name).toBe('86_item');
  });
  test('no pronoun, no signal, or how-to → null (never a false write)', () => {
    expect(actions.inferPronounAction('change the paneer tikka price to 12')).toBeNull(); // named item, not a pronoun
    expect(actions.inferPronounAction('what about it')).toBeNull();       // pronoun but no signal
    expect(actions.inferPronounAction('how do i set it to 12')).toBeNull(); // how-to guard
    expect(actions.inferPronounAction('increase it')).toBeNull();          // verb but no number
  });
});

// ── lastMenuItemFromHistory: newest-first, single match only ──────────────────
describe('lastMenuItemFromHistory — resolves the item from prior turns', () => {
  test('returns the most recent USER turn that names exactly one item', async () => {
    const item = await actions.lastMenuItemFromHistory('o1', HIST);
    expect(item.id).toBe('m1');
  });
  test('no item in history → null', async () => {
    const item = await actions.lastMenuItemFromHistory('o1', [{ role: 'user', text: 'how much did we sell today' }]);
    expect(item).toBeNull();
  });
  test('ambiguous prior turn resolves to null (never guesses)', async () => {
    mockMenu.listMenuItems.mockResolvedValue({ items: [{ id: 'a', name: 'Chicken Curry' }, { id: 'b', name: 'Chicken Wings' }] });
    const item = await actions.lastMenuItemFromHistory('o1', [{ role: 'user', text: '86 the chicken' }]);
    expect(item).toBeNull();
  });
});

// ── the headline behaviour ────────────────────────────────────────────────────
describe('buildActionPreview — pronoun follow-up resolves from the previous turn', () => {
  test('"change it by 10%" after "update paneer tikka price" previews 12 → 13.20', async () => {
    const p = await actions.buildActionPreview(OWNER, 'change it by 10%', HIST);
    expect(p.action).toBe('adjust_price');
    expect(p.summary).toMatch(/Paneer Tikka/);
    expect(p.summary).toMatch(/12\.00/);
    expect(p.summary).toMatch(/13\.20/); // 12.00 + 10%
    expect(p.token).toBeTruthy();
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled(); // preview must not write
    const params = actions.verifyActionToken(p.token).params;
    expect(params).toMatchObject({ item_id: 'm1', old_price: 12, new_price: 13.2 });
  });

  test('confirm executes the resolved price change through the service + audits', async () => {
    const p = await actions.buildActionPreview(OWNER, 'change it by 10%', HIST);
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockMenu.updateMenuItem).toHaveBeenCalledWith('m1', 'o1', { base_price: 13.2 });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('ASSISTANT_ADJUST_PRICE');
  });

  test('"86 it" after the same turn 86s Paneer Tikka', async () => {
    const p = await actions.buildActionPreview(OWNER, '86 it', HIST);
    expect(p.action).toBe('86_item');
    expect(p.summary).toMatch(/86 "Paneer Tikka"/);
    expect(actions.verifyActionToken(p.token).params).toMatchObject({ item_id: 'm1', is_available: false });
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
    const r = await actions.runAction(OWNER, p.token);
    expect(r.ok).toBe(true);
    expect(mockMenu.updateMenuItem).toHaveBeenCalledWith('m1', 'o1', { is_available: false });
  });

  test('"make that unavailable" resolves + 86s the item', async () => {
    const p = await actions.buildActionPreview(OWNER, 'make that unavailable', HIST);
    expect(p.action).toBe('86_item');
    expect(actions.verifyActionToken(p.token).params).toMatchObject({ item_id: 'm1', is_available: false });
  });

  test('"set the same item to 12" resolves the item and sets the absolute price', async () => {
    const p = await actions.buildActionPreview(OWNER, 'set the same item to 12', HIST);
    expect(p.action).toBe('adjust_price');
    expect(actions.verifyActionToken(p.token).params).toMatchObject({ item_id: 'm1', new_price: 12 });
  });
});

// ── the guard rails ───────────────────────────────────────────────────────────
describe('buildActionPreview — no usable history still clarifies (never guesses)', () => {
  test('"change it by 10%" with NO history clarifies for the item', async () => {
    const p = await actions.buildActionPreview(OWNER, 'change it by 10%', []);
    expect(p.clarify).toBe(true);
    expect(p.message).toMatch(/which item/i);
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
  });
  test('history param is optional (defaults to none) → clarifies', async () => {
    const p = await actions.buildActionPreview(OWNER, 'change it by 10%');
    expect(p.clarify).toBe(true);
  });
  test('history with an ambiguous prior item → keeps the clarify (never guesses)', async () => {
    mockMenu.listMenuItems.mockResolvedValue({ items: [{ id: 'a', name: 'Chicken Curry' }, { id: 'b', name: 'Chicken Wings' }] });
    const p = await actions.buildActionPreview(OWNER, '86 it', [{ role: 'user', text: '86 the chicken' }]);
    expect(p.clarify).toBe(true);
    expect(mockMenu.updateMenuItem).not.toHaveBeenCalled();
  });
});

// ── existing single / batch behaviour is unchanged ────────────────────────────
describe('single & batch behaviour unchanged by the multi-turn path', () => {
  test('an explicitly named single action still previews normally (with history present)', async () => {
    const p = await actions.buildActionPreview(OWNER, 'change paneer tikka price to 15', HIST);
    expect(p.action).toBe('adjust_price');
    expect(p.summary).toMatch(/from .*12.* to .*15/);
    expect(actions.verifyActionToken(p.token).params).toMatchObject({ item_id: 'm1', new_price: 15 });
  });
  test('a named 86 with no amount still resolves the item it names, not history', async () => {
    mockMenu.listMenuItems.mockResolvedValue({ items: [
      { id: 'm1', name: 'Paneer Tikka', base_price: 12 },
      { id: 'm2', name: 'Garlic Naan', base_price: 4 },
    ] });
    const p = await actions.buildActionPreview(OWNER, '86 the garlic naan', HIST);
    expect(p.summary).toMatch(/86 "Garlic Naan"/);
    expect(actions.verifyActionToken(p.token).params.item_id).toBe('m2');
  });
  test('batch of two explicit actions still previews as a batch (no history needed)', async () => {
    mockTable.listTables.mockResolvedValue([{ id: 't5', table_number: '5', status: 'occupied' }]);
    const b = await actions.buildBatchPreview(OWNER, '86 the paneer tikka and mark table 5 clean');
    expect(b.action).toBe('batch');
    expect(b.items.map((i) => i.summary)).toEqual([
      expect.stringMatching(/86 "Paneer Tikka"/),
      expect.stringMatching(/table 5 to cleaning/),
    ]);
  });
  test('a pronoun sub-action inside a batch resolves off history', async () => {
    mockTable.listTables.mockResolvedValue([{ id: 't5', table_number: '5', status: 'occupied' }]);
    const b = await actions.buildBatchPreview(OWNER, 'mark table 5 clean and 86 it', HIST);
    expect(b.action).toBe('batch');
    expect(b.items.map((i) => i.summary)).toEqual([
      expect.stringMatching(/table 5 to cleaning/),
      expect.stringMatching(/86 "Paneer Tikka"/),
    ]);
  });
});
