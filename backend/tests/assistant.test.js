/**
 * @fileoverview Unit tests for the read-only assistant.
 * Verifies permission gating (mirrors rbac.hasPermission), deterministic keyword
 * routing, per-tool grounded summaries, and the full no-LLM ask() pipeline.
 * All services + LLM are mocked so these run without a DB or network.
 * @module tests/assistant.test
 */

const mockPrisma = { outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Test Cafe' }) } };
const mockCopilot = { buildBooksContext: jest.fn(), ruleBasedAnswer: jest.fn() };
const mockReports = { getDailySales: jest.fn(), getItemWiseSales: jest.fn() };
const mockInventory = { getLowStock: jest.fn() };
const mockProcurement = { listPurchaseOrders: jest.fn() };
const mockMenu = { listMenuItems: jest.fn() };
const mockCustomer = { getCRMDashboard: jest.fn() };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
// Force the deterministic (no-LLM) path so routing + summaries are exercised.
jest.mock('../src/utils/llm', () => ({ callLLM: jest.fn().mockRejectedValue(new Error('no llm')), llmAvailable: () => false }));
jest.mock('../src/modules/accounting/accounting.copilot.service', () => mockCopilot);
jest.mock('../src/modules/reports/reports.service', () => mockReports);
jest.mock('../src/modules/inventory/inventory.service', () => mockInventory);
jest.mock('../src/modules/inventory/procurement.service', () => mockProcurement);
jest.mock('../src/modules/menu/menu.service', () => mockMenu);
jest.mock('../src/modules/customers/customer.service', () => mockCustomer);

const assistant = require('../src/modules/assistant/assistant.service');
const { TOOLS } = require('../src/modules/assistant/assistant.tools');

const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [] };

describe('allowedTools — RBAC gating (mirrors hasPermission)', () => {
  test('owner and super_admin see every tool', () => {
    expect(assistant.allowedTools({ role: 'owner', permissions: [] }).length).toBe(TOOLS.length);
    expect(assistant.allowedTools({ role: 'super_admin', permissions: [] }).length).toBe(TOOLS.length);
  });
  test('cashier sees only permitted + unrestricted tools', () => {
    const names = assistant.allowedTools({ role: 'cashier', permissions: ['VIEW_REPORTS'] }).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['finance_summary', 'sales_today', 'top_items', 'menu_availability']));
    expect(names).not.toContain('low_stock'); // needs VIEW_INVENTORY
    expect(names).not.toContain('top_customers'); // needs VIEW_CUSTOMERS
    expect(names).not.toContain('open_purchase_orders');
  });
});

describe('keywordSelect — deterministic routing', () => {
  const pick = (q) => assistant.keywordSelect(q, TOOLS);
  test('routes to the right tool', () => {
    expect(pick('how much did we sell today?')).toBe('sales_today');
    expect(pick("what's running low on stock?")).toBe('low_stock');
    expect(pick('what are my top sellers?')).toBe('top_items');
    expect(pick('how much tax do I owe?')).toBe('finance_summary');
    expect(pick('who are my best customers?')).toBe('top_customers');
    expect(pick('any open purchase orders?')).toBe('open_purchase_orders');
  });
  test('no keyword match → null (help path)', () => {
    expect(pick('hello there, nice to meet you')).toBeNull();
  });
});

describe('ask() — full no-LLM pipeline', () => {
  beforeEach(() => jest.clearAllMocks());

  test('finance question runs finance_summary and returns a grounded answer', async () => {
    mockCopilot.buildBooksContext.mockResolvedValue({ currency: 'AUD', has_data: true });
    mockCopilot.ruleBasedAnswer.mockReturnValue('You have $300 of BAS to pay for Jul–Sep 2026.');
    const res = await assistant.ask({ ...OWNER }, 'How much tax do I owe?');
    expect(res.tool).toBe('finance_summary');
    expect(res.source).toBe('rules');
    expect(res.answer).toMatch(/BAS/);
    expect(mockCopilot.buildBooksContext).toHaveBeenCalledWith('o1');
  });

  test("today's sales runs sales_today and formats money", async () => {
    mockReports.getDailySales.mockResolvedValue({ total_orders: 12, total_revenue: 4500, avg_order_value: 375, by_type: {}, by_payment: {} });
    const res = await assistant.ask({ ...OWNER }, 'How much did we sell today?');
    expect(res.tool).toBe('sales_today');
    expect(res.answer).toMatch(/4,500/);
    expect(res.answer).toMatch(/12 orders/);
  });

  test('low stock runs low_stock', async () => {
    mockInventory.getLowStock.mockResolvedValue([
      { name: 'Paneer', current_stock: 2, unit: 'kg', min_threshold: 5, stock_status: 'CRITICAL' },
    ]);
    const res = await assistant.ask({ ...OWNER }, "What's running low?");
    expect(res.tool).toBe('low_stock');
    expect(res.answer).toMatch(/Paneer/);
    expect(res.answer).toMatch(/2 kg/);
  });

  test('unmatched question → help/capabilities, no tool', async () => {
    const res = await assistant.ask({ ...OWNER }, 'hello there');
    expect(res.tool).toBeNull();
    expect(res.answer).toMatch(/read-only/i);
  });

  test('a tool the user lacks permission for is never selected', async () => {
    // cashier without VIEW_INVENTORY asks about stock → no low_stock tool available,
    // keyword router finds nothing else → help path (never runs the service).
    const res = await assistant.ask({ role: 'cashier', outletId: 'o1', permissions: ['VIEW_REPORTS'] }, 'what stock is running low');
    expect(res.tool).toBeNull();
    expect(mockInventory.getLowStock).not.toHaveBeenCalled();
  });
});

describe('tool summaries — deterministic grounding', () => {
  const t = (name) => TOOLS.find((x) => x.name === name);
  test('menu_availability handles empty + non-empty', () => {
    expect(t('menu_availability').summarize({ unavailable_count: 0, unavailable: [] })).toMatch(/all menu items/i);
    expect(t('menu_availability').summarize({ unavailable_count: 2, unavailable: ['Paneer Tikka', 'Naan'] })).toMatch(/Paneer Tikka/);
  });
  test('open_purchase_orders summary', () => {
    expect(t('open_purchase_orders').summarize({ currency: 'AUD', count: 0 })).toMatch(/no open purchase orders/i);
    expect(t('open_purchase_orders').summarize({ currency: 'AUD', count: 3, total: 1200 })).toMatch(/3 open purchase orders/);
  });
  test('top_customers summary', () => {
    expect(t('top_customers').summarize({ currency: 'AUD', top: [{ name: 'Asha', spend: 900, visits: 12 }] })).toMatch(/Asha/);
  });
});
