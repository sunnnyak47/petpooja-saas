/**
 * @fileoverview Unit tests for the Owner Mode dashboard aggregator.
 * Mocks the underlying report services + prisma so the aggregation logic
 * (profit delta, top expenses, tax = |net_gst|, receivables overdue, has_data)
 * is verified without a DB.
 * @module tests/owner-dashboard.test
 */

const mockPrisma = {
  outlet: { findUnique: jest.fn() },
  journalEntry: { count: jest.fn() },
};
const mockStatements = { getProfitAndLoss: jest.fn() };
const mockBas = { getBASReport: jest.fn() };
const mockAging = { getReceivablesAging: jest.fn(), getPayablesAging: jest.fn() };

jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/modules/accounting/accounting.statements.service', () => mockStatements);
jest.mock('../src/modules/accounting/accounting.bas.service', () => mockBas);
jest.mock('../src/modules/accounting/accounting.aging.service', () => mockAging);

const owner = require('../src/modules/accounting/accounting.owner.service');

const CURRENT_PL = {
  net_profit: 5000, gross_profit: 12000,
  revenue: { total: 20000 },
  expenses: {
    accounts: [
      { code: '400', name: 'Wages', amount: 5000 },
      { code: '300', name: 'Ingredients', amount: 8000 },
      { code: '500', name: 'Rent', amount: 2000 },
      { code: '999', name: 'Zeroed', amount: 0 },
    ],
    total: 15000,
  },
};
const PREV_PL = { net_profit: 4000, gross_profit: 9000, revenue: { total: 16000 }, expenses: { accounts: [], total: 12000 } };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.outlet.findUnique.mockResolvedValue({ name: 'Test AU', currency: 'AUD', country: 'Australia', head_office: { region: 'AU' } });
  mockPrisma.journalEntry.count.mockResolvedValue(3);
  mockStatements.getProfitAndLoss.mockResolvedValueOnce(CURRENT_PL).mockResolvedValueOnce(PREV_PL);
  mockBas.getBASReport.mockResolvedValue({ net_gst: 300, payable: true });
  mockAging.getReceivablesAging.mockResolvedValue({ total: 1000, items: [{}, {}], buckets: { '0-30': 600, '31-60': 300, '61-90': 100, '90+': 0 } });
  mockAging.getPayablesAging.mockResolvedValue({ total: 500, items: [{}] });
});

describe('getOwnerDashboard — aggregation', () => {
  test('profit, delta and revenue', async () => {
    const d = await owner.getOwnerDashboard('outlet-1');
    expect(d.profit.this_month).toBe(5000);
    expect(d.profit.prev_month).toBe(4000);
    expect(d.profit.delta_pct).toBe(25); // (5000-4000)/4000
    expect(d.profit.is_up).toBe(true);
    expect(d.profit.revenue).toBe(20000);
  });

  test('top expenses sorted desc, zero amounts dropped', async () => {
    const d = await owner.getOwnerDashboard('outlet-1');
    expect(d.expenses.top.map((e) => e.name)).toEqual(['Ingredients', 'Wages', 'Rent']);
    expect(d.expenses.top[0].amount).toBe(8000);
    expect(d.expenses.total).toBe(15000);
  });

  test('tax = absolute net GST, receivables overdue = 31+ buckets', async () => {
    const d = await owner.getOwnerDashboard('outlet-1');
    expect(d.tax.amount).toBe(300);
    expect(d.tax.payable).toBe(true);
    expect(d.receivables).toEqual(expect.objectContaining({ total: 1000, count: 2, overdue: 400 }));
    expect(d.payables).toEqual(expect.objectContaining({ total: 500, count: 1 }));
  });

  test('currency/region from outlet, has_data true when journals exist', async () => {
    const d = await owner.getOwnerDashboard('outlet-1');
    expect(d.currency).toBe('AUD');
    expect(d.region).toBe('AU');
    expect(d.has_data).toBe(true);
  });

  test('has_data false when no journal entries', async () => {
    mockPrisma.journalEntry.count.mockReset().mockResolvedValue(0);
    const d = await owner.getOwnerDashboard('outlet-1');
    expect(d.has_data).toBe(false);
  });

  test('delta_pct null when previous month had zero profit', async () => {
    mockStatements.getProfitAndLoss.mockReset()
      .mockResolvedValueOnce(CURRENT_PL)
      .mockResolvedValueOnce({ net_profit: 0, revenue: { total: 0 }, expenses: { accounts: [], total: 0 } });
    const d = await owner.getOwnerDashboard('outlet-1');
    expect(d.profit.delta_pct).toBeNull();
    expect(d.profit.is_up).toBeNull();
  });
});

describe('basQuarter — AU financial-year quarters', () => {
  test('August → Jul–Sep, due 28 Oct', () => {
    const q = owner.basQuarter(new Date(2026, 7, 15)); // Aug
    expect(q.label).toMatch(/Jul–Sep 2026/);
    expect(owner.ymd(q.dueDate)).toBe('2026-10-28');
  });
  test('November → Oct–Dec, due 28 Feb next year', () => {
    const q = owner.basQuarter(new Date(2026, 10, 5)); // Nov
    expect(q.label).toMatch(/Oct–Dec 2026/);
    expect(owner.ymd(q.dueDate)).toBe('2027-02-28');
  });
  test('February → Jan–Mar, due 28 Apr', () => {
    const q = owner.basQuarter(new Date(2026, 1, 10)); // Feb
    expect(q.label).toMatch(/Jan–Mar 2026/);
    expect(owner.ymd(q.dueDate)).toBe('2026-04-28');
  });
});
