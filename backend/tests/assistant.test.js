/**
 * @fileoverview Unit tests for the read-only assistant.
 * Verifies permission gating (mirrors rbac.hasPermission), deterministic keyword
 * routing, per-tool grounded summaries, and the full no-LLM ask() pipeline.
 * All services + LLM are mocked so these run without a DB or network.
 * @module tests/assistant.test
 */

const mockPrisma = { outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Test Cafe' }) } };
const mockCopilot = { buildBooksContext: jest.fn(), ruleBasedAnswer: jest.fn() };
const mockReports = { getDailySales: jest.fn(), getItemWiseSales: jest.fn(), getRevenueTrendRange: jest.fn() };
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
    expect(names).toEqual(expect.arrayContaining(['finance_summary', 'sales_today', 'top_items', 'menu_overview']));
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
    expect(pick('what is the average prediction for tomorrow orders compared to last 30 days')).toBe('sales_forecast');
    expect(pick('forecast next week')).toBe('sales_forecast');
    expect(pick('how many non-veg items are in total')).toBe('menu_overview');
    expect(pick('how many dishes on the menu?')).toBe('menu_overview');
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

  test('menu question ("how many non-veg items") is answered, not declined', async () => {
    mockMenu.listMenuItems.mockResolvedValue({
      total: 3,
      items: [
        { name: 'Samosa', food_type: 'veg', base_price: 10, is_available: true, category: { name: 'Starters' } },
        { name: 'Chilly Chicken', food_type: 'non_veg', base_price: 18, is_available: true, category: { name: 'Mains' } },
        { name: 'Fish 65', food_type: 'non_veg', base_price: 20, is_available: false, category: { name: 'Mains' } },
      ],
    });
    const res = await assistant.ask({ ...OWNER }, 'how many non-veg items are in total');
    expect(res.tool).toBe('menu_overview');
    expect(res.answer).toMatch(/2 non-veg/);
  });

  test('prediction question runs sales_forecast and answers with a projection', async () => {
    // 21 days of sales so confidence is not "low"; simple flat series.
    const series = [];
    for (let i = 20; i >= 0; i--) {
      const d = new Date(2026, 6, 13 - i);
      series.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, orders: 10, revenue: 1000 });
    }
    mockReports.getRevenueTrendRange.mockResolvedValue(series);
    const res = await assistant.ask({ ...OWNER }, "What's tomorrow looking like?");
    expect(res.tool).toBe('sales_forecast');
    expect(res.answer).toMatch(/is likely around/);
    expect(mockReports.getRevenueTrendRange).toHaveBeenCalled();
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
  test('menu_overview summarizes counts, categories, price, 86 list', () => {
    const s = t('menu_overview').summarize({ total_items: 94, veg: 60, non_veg: 30, egg: 4, category_count: 8, price: { min: 10, max: 32, avg: 20 }, currency: 'AUD', unavailable: 5 });
    expect(s).toMatch(/94 items/);
    expect(s).toMatch(/30 non-veg/);
    expect(s).toMatch(/8 categories/);
    expect(s).toMatch(/86'd/);
    expect(t('menu_overview').summarize({ total_items: 0 })).toMatch(/no active items/i);
  });
  test('open_purchase_orders summary', () => {
    expect(t('open_purchase_orders').summarize({ currency: 'AUD', count: 0 })).toMatch(/no open purchase orders/i);
    expect(t('open_purchase_orders').summarize({ currency: 'AUD', count: 3, total: 1200 })).toMatch(/3 open purchase orders/);
  });
  test('top_customers summary', () => {
    expect(t('top_customers').summarize({ currency: 'AUD', top: [{ name: 'Asha', spend: 900, visits: 12 }] })).toMatch(/Asha/);
  });
});

// ── New tools (added Phase 1b): active orders, EOD, payroll, fraud, staff hours,
//    and the how-to knowledge tool. Routing/RBAC/summaries are pure (no DB). ──
const { searchKnowledge } = require('../src/modules/assistant/assistant.knowledge');

describe('new tools — RBAC gating', () => {
  test('owner sees all new tools', () => {
    const names = assistant.allowedTools(OWNER).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['active_orders', 'eod_summary', 'payroll_summary', 'fraud_alerts', 'staff_hours', 'help_howto']));
  });
  test('help_howto is available to everyone (no permission)', () => {
    const names = assistant.allowedTools({ role: 'cashier', permissions: [] }).map((t) => t.name);
    expect(names).toContain('help_howto');
  });
  test('permission-gated new tools hidden without the key', () => {
    const names = assistant.allowedTools({ role: 'cashier', permissions: ['VIEW_REPORTS'] }).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['eod_summary', 'payroll_summary', 'fraud_alerts'])); // VIEW_REPORTS
    expect(names).not.toContain('active_orders'); // needs VIEW_ORDERS
    expect(names).not.toContain('staff_hours');   // needs VIEW_STAFF
  });
});

describe('new tools — keyword routing', () => {
  const pick = (q) => assistant.keywordSelect(q, TOOLS);
  test('routes new-topic questions', () => {
    expect(pick('show me active orders')).toBe('active_orders');
    expect(pick('close the day')).toBe('eod_summary');
    expect(pick('how much super this pay run')).toBe('payroll_summary');
    expect(pick('anything suspicious lately')).toBe('fraud_alerts');
    expect(pick('who worked this week')).toBe('staff_hours');
    expect(pick('how do i 86 an item')).toBe('help_howto');
    expect(pick('how do i split a bill')).toBe('help_howto');
  });
});

describe('new tools — deterministic summaries', () => {
  const t = (name) => TOOLS.find((x) => x.name === name);
  test('active_orders', () => {
    expect(t('active_orders').summarize({ currency: 'AUD', count: 0, orders: [] })).toMatch(/no active orders/i);
    const s = t('active_orders').summarize({ currency: 'AUD', count: 3, total: 450, orders: [{ paid: false }, { paid: true }, { paid: false }] });
    expect(s).toMatch(/3 active orders/); expect(s).toMatch(/to be paid/);
  });
  test('eod_summary', () => {
    expect(t('eod_summary').summarize({ total_orders: 0 })).toMatch(/nothing to close/i);
    const s = t('eod_summary').summarize({ currency: 'AUD', total_orders: 12, total_revenue: 4500, cash_system: 2000, card_system: 2500, total_tax: 409, total_discount: 50, void_count: 1, refund_count: 0 });
    expect(s).toMatch(/4,500/); expect(s).toMatch(/12 order/);
  });
  test('payroll_summary', () => {
    expect(t('payroll_summary').summarize({ latest: null })).toMatch(/no payroll/i);
    const s = t('payroll_summary').summarize({ currency: 'AUD', latest: { period_start: '2026-07-01', period_end: '2026-07-14', status: 'finalised', gross: 8000, paye: 1600, super: 920, net: 6400, payslips: 4 } });
    expect(s).toMatch(/gross/); expect(s).toMatch(/4 payslips/);
  });
  test('fraud_alerts', () => {
    expect(t('fraud_alerts').summarize({ count: 0, alerts: [] })).toMatch(/no open fraud/i);
    const s = t('fraud_alerts').summarize({ count: 2, alerts: [{ severity: 'high', title: 'Excess voids', staff: 'Sam' }] });
    expect(s).toMatch(/2 open fraud/); expect(s).toMatch(/Excess voids/);
  });
  test('staff_hours', () => {
    expect(t('staff_hours').summarize({ staff_count: 0, staff: [] })).toMatch(/no staff attendance/i);
    const s = t('staff_hours').summarize({ staff_count: 2, staff: [{ name: 'Sam', hours: 38.5 }, { name: 'Amy', hours: 20 }] });
    expect(s).toMatch(/2 staff/); expect(s).toMatch(/Sam/);
  });
  test('help_howto returns the top KB answer', () => {
    expect(t('help_howto').summarize({ matches: [{ topic: 'x', text: 'Open POS and tap items.' }] })).toMatch(/Open POS/);
    expect(t('help_howto').summarize({ matches: [] })).toMatch(/tell me which feature/i);
  });
});

describe('knowledge base search', () => {
  test('finds the right topic', () => {
    expect(searchKnowledge('how do i split a bill', 1)[0].topic).toMatch(/split/i);
    expect(searchKnowledge('does it work offline', 1)[0].topic).toMatch(/offline/i);
    expect(searchKnowledge('asdfqwer nonsense', 3)).toHaveLength(0);
  });
});

describe('ask() — how-to pipeline (no LLM, no DB)', () => {
  test('routes a how-to question to help_howto and answers from the KB', async () => {
    const res = await assistant.ask(OWNER, 'how do i take a new order');
    expect(res.tool).toBe('help_howto');
    expect(res.answer).toMatch(/POS/);
  });
});

// ── Phase 1c: profit_loss, sales_trend, table_status, staff_risk + memory ──
describe('new tools (1c) — RBAC + routing + summaries', () => {
  const t = (n) => TOOLS.find((x) => x.name === n);
  test('RBAC gating', () => {
    const owner = assistant.allowedTools(OWNER).map((x) => x.name);
    expect(owner).toEqual(expect.arrayContaining(['profit_loss', 'sales_trend', 'table_status', 'staff_risk']));
    const cashier = assistant.allowedTools({ role: 'cashier', permissions: ['VIEW_REPORTS'] }).map((x) => x.name);
    expect(cashier).toEqual(expect.arrayContaining(['profit_loss', 'sales_trend', 'staff_risk']));
    expect(cashier).toContain('table_status'); // null permission → everyone
    const bare = assistant.allowedTools({ role: 'cashier', permissions: [] }).map((x) => x.name);
    expect(bare).not.toContain('profit_loss'); // needs VIEW_REPORTS
    expect(bare).toContain('table_status');
  });
  test('keyword routing', () => {
    const pick = (q) => assistant.keywordSelect(q, TOOLS);
    expect(pick('show me the p&l breakdown')).toBe('profit_loss');
    expect(pick('gross profit this month')).toBe('profit_loss');
    expect(pick('how are sales this week')).toBe('sales_trend');
    expect(pick('how many tables are free')).toBe('table_status');
    expect(pick('who is my riskiest staff')).toBe('staff_risk');
    // must NOT poach existing routes
    expect(pick('what is my net profit')).toBe('finance_summary');
    expect(pick('are we trending up')).toBe('sales_forecast');
    expect(pick('anything suspicious')).toBe('fraud_alerts');
  });
  test('summaries', () => {
    expect(t('profit_loss').summarize({ currency: 'AUD', revenue: 10000, expenses: 3000, cogs: 4000, gross_profit: 6000, net_profit: 3000 })).toMatch(/gross profit .*6,000/i);
    expect(t('profit_loss').summarize({ revenue: 0, expenses: 0, cogs: 0 })).toMatch(/no profit & loss/i);
    expect(t('sales_trend').summarize({ currency: 'AUD', total_revenue: 9500, total_orders: 120, change_pct: 12, best_day: { date: '2026-08-01', revenue: 3400 } })).toMatch(/up 12%/);
    expect(t('sales_trend').summarize({ total_orders: 0 })).toMatch(/no sales/i);
    expect(t('table_status').summarize({ total: 8, available: 3, occupied: 4, dirty: 1 })).toMatch(/3 free, 4 occupied/);
    expect(t('table_status').summarize({ total: 0 })).toMatch(/no tables/i);
    expect(t('staff_risk').summarize({ flagged: 2, staff: [{ name: 'Sam', role: 'waiter', risk: 'high', alerts: 3 }] })).toMatch(/Sam/);
    expect(t('staff_risk').summarize({ flagged: 0, staff: [] })).toMatch(/no staff are flagged/i);
  });
});

describe('multi-turn memory', () => {
  test('normalizeHistory bounds + sanitizes + aliases', () => {
    expect(assistant.normalizeHistory('garbage')).toEqual([]);
    expect(assistant.normalizeHistory([null, { x: 1 }, { role: 'user', text: '' }])).toEqual([]);
    const n = assistant.normalizeHistory([{ role: 'bot', content: 'hi', tool: 'sales_today' }]);
    expect(n).toEqual([{ role: 'assistant', text: 'hi', tool: 'sales_today' }]);
    const long = assistant.normalizeHistory(Array.from({ length: 20 }, (_, i) => ({ role: 'user', text: `q${i}` })));
    expect(long.length).toBe(6); // capped to last 6 turns
    expect(assistant.normalizeHistory([{ role: 'user', text: 'x'.repeat(9999) }])[0].text.length).toBeLessThanOrEqual(500);
  });
  test('isFollowup detects ellipsis, rejects full questions', () => {
    expect(assistant.isFollowup('and non-veg?')).toBe(true);
    expect(assistant.isFollowup('what about last month')).toBe(true);
    expect(assistant.isFollowup('yesterday')).toBe(true);
    expect(assistant.isFollowup('how much did we sell today please')).toBe(false);
  });
  test('lastToolFromHistory returns the previous allowed tool', () => {
    const h = [{ role: 'user', text: 'q' }, { role: 'bot', text: 'a', tool: 'sales_today' }, { role: 'user', text: 'q2' }];
    expect(assistant.lastToolFromHistory(h, TOOLS)).toBe('sales_today');
    expect(assistant.lastToolFromHistory([{ role: 'bot', text: 'a', tool: 'not_a_tool' }], TOOLS)).toBeNull();
  });
  test('ask() reuses the prior tool for a keyword-less follow-up (no LLM)', async () => {
    mockReports.getDailySales.mockResolvedValue({ total_orders: 5, total_revenue: 500, avg_order_value: 100, by_type: {}, by_payment: {} });
    const res = await assistant.ask({ ...OWNER }, 'what about it', [{ role: 'bot', text: 'Today $X', tool: 'sales_today' }]);
    expect(res.tool).toBe('sales_today');
  });
});
