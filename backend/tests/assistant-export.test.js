/**
 * @fileoverview Tests for assistant report export — intent detection, date-range
 * parsing, signed-token round-trip, and CSV/PDF generation (services mocked).
 * @module tests/assistant-export.test
 */

const mockReports = { getRevenueTrendRange: jest.fn(), getItemWiseSales: jest.fn(), getInventoryValuation: jest.fn() };
const mockEod = { generateSnapshot: jest.fn(), previewToday: jest.fn() };
const mockAcctExport = { exportProfitLossCSV: jest.fn() };
const mockStatements = { getProfitAndLoss: jest.fn(), getBalanceSheet: jest.fn() };
const mockBas = { getBASReport: jest.fn(), getCashFlow: jest.fn() };
const mockPayroll = { listPayRuns: jest.fn() };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/modules/reports/reports.service', () => mockReports);
jest.mock('../src/modules/reports/eod.service', () => mockEod);
jest.mock('../src/modules/accounting/accounting.export.service', () => mockAcctExport);
jest.mock('../src/modules/accounting/accounting.statements.service', () => mockStatements);
jest.mock('../src/modules/accounting/accounting.bas.service', () => mockBas);
jest.mock('../src/modules/payroll/payroll.service', () => mockPayroll);

const xport = require('../src/modules/assistant/assistant.export');

const NOW = new Date('2026-07-30T10:00:00');

describe('detectExport', () => {
  test('recognises module + format', () => {
    expect(xport.detectExport('download eod report as pdf')).toEqual({ module: 'eod', format: 'pdf' });
    expect(xport.detectExport('export p&l this month as excel')).toEqual({ module: 'pnl', format: 'xlsx' });
    expect(xport.detectExport('download sales as xlsx')).toEqual({ module: 'sales', format: 'xlsx' });
    expect(xport.detectExport('give me the sales report last 7 days')).toEqual({ module: 'sales', format: 'csv' });
    expect(xport.detectExport('profit and loss pdf')).toEqual({ module: 'pnl', format: 'pdf' });
  });
  test('recognises the new modules', () => {
    expect(xport.detectExport('export the balance sheet as pdf')).toEqual({ module: 'balance_sheet', format: 'pdf' });
    expect(xport.detectExport('download the gst report as excel')).toEqual({ module: 'bas', format: 'xlsx' });
    expect(xport.detectExport('export inventory valuation report')).toEqual({ module: 'inventory_valuation', format: 'csv' });
    expect(xport.detectExport('download the payroll report')).toEqual({ module: 'payroll', format: 'csv' });
    expect(xport.detectExport('export item-wise sales as xlsx')).toEqual({ module: 'item_wise', format: 'xlsx' });
    expect(xport.detectExport('download sales by item report')).toEqual({ module: 'item_wise', format: 'csv' });
  });
  test('non-export questions return null', () => {
    expect(xport.detectExport('how much did we sell today')).toBeNull();
    expect(xport.detectExport('who are my top customers')).toBeNull();
  });
});

describe('parseDateRange', () => {
  test('explicit + relative ranges', () => {
    expect(xport.parseDateRange('from 1 july to 15 july', NOW)).toMatchObject({ from: '2026-07-01', to: '2026-07-15' });
    expect(xport.parseDateRange('2026-06-01 to 2026-06-30', NOW)).toMatchObject({ from: '2026-06-01', to: '2026-06-30' });
    expect(xport.parseDateRange('last month', NOW)).toMatchObject({ from: '2026-06-01', to: '2026-06-30' });
    expect(xport.parseDateRange('today', NOW)).toMatchObject({ from: '2026-07-30', to: '2026-07-30' });
    expect(xport.parseDateRange('last 7 days', NOW)).toMatchObject({ from: '2026-07-24', to: '2026-07-30' });
    expect(xport.parseDateRange('past 58 days', NOW)).toMatchObject({ from: '2026-06-03', to: '2026-07-30' });
    expect(xport.parseDateRange('previous 2 months', NOW)).toMatchObject({ from: '2026-06-01', to: '2026-07-30' });
    expect(xport.parseDateRange('30 days ago', NOW)).toMatchObject({ from: '2026-07-01', to: '2026-07-30' });
    expect(xport.parseDateRange('a report', NOW)).toMatchObject({ from: '2026-07-01', to: '2026-07-30' }); // default: this month
  });
});

describe('signed token round-trip', () => {
  test('sign then verify preserves scope + fields', () => {
    const t = xport.signExportToken({ outletId: 'o1', module: 'sales', from: '2026-07-01', to: '2026-07-30', format: 'csv', currency: 'AUD' });
    const p = xport.verifyExportToken(t);
    expect(p).toMatchObject({ scope: 'assistant_export', outletId: 'o1', module: 'sales' });
  });
  test('tampered token rejected', () => {
    expect(() => xport.verifyExportToken('not.a.jwt')).toThrow();
  });
});

describe('buildDescriptor', () => {
  test('returns a download path with a valid token', () => {
    const d = xport.buildDescriptor({ outletId: 'o1', currency: 'AUD' }, 'export sales report last month as excel', NOW);
    expect(d).toMatchObject({ module: 'sales', format: 'xlsx', from: '2026-06-01', to: '2026-06-30' });
    expect(d.filename).toBe('sales-2026-06-01-to-2026-06-30.xlsx');
    expect(d.path).toMatch(/^\/assistant\/report\?t=/);
    const token = decodeURIComponent(d.path.split('t=')[1]);
    expect(xport.verifyExportToken(token).module).toBe('sales');
  });
  test('null for non-export', () => {
    expect(xport.buildDescriptor({ outletId: 'o1' }, 'how are sales today', NOW)).toBeNull();
  });
});

describe('generate — CSV', () => {
  test('sales CSV from daily series', async () => {
    mockReports.getRevenueTrendRange.mockResolvedValue([
      { date: '2026-07-01', revenue: 1000, orders: 20 },
      { date: '2026-07-02', revenue: 1500, orders: 25 },
    ]);
    const out = await xport.generate({ outletId: 'o1', module: 'sales', from: '2026-07-01', to: '2026-07-02', format: 'csv', currency: 'AUD' });
    expect(out.contentType).toMatch(/csv/);
    expect(out.filename).toBe('sales-2026-07-01-to-2026-07-02.csv');
    expect(out.body).toMatch(/Sales Report/);
    expect(out.body).toMatch(/2026-07-01,20,1000/);
    expect(out.body).toMatch(/Total,45,2500/);
  });
  test('P&L CSV: metadata block + 2-decimal money, sections, net profit', async () => {
    mockStatements.getProfitAndLoss.mockResolvedValue({
      from: '2026-07-01', to: '2026-07-30',
      revenue: { accounts: [{ code: '200', name: 'Food Sales', balance: 78450.25 }], total: 78450.25 },
      expenses: { accounts: [{ code: '400', name: 'Wages', balance: 32100 }], total: 32100 },
      cogs_total: 29304.11, gross_profit: 49146.14, net_profit: 46350.25,
    });
    const out = await xport.generate({ outletId: 'o1', module: 'pnl', from: '2026-07-01', to: '2026-07-30', format: 'csv', currency: 'AUD' });
    expect(out.body).toMatch(/Profit & Loss/);
    expect(out.body).toMatch(/Period,2026-07-01 to 2026-07-30/);
    expect(out.body).toMatch(/REVENUE/);
    expect(out.body).toMatch(/200,Food Sales,78450\.25/);
    expect(out.body).toMatch(/Net Profit,46350\.25/);
  });
});

describe('generate — new modules (CSV)', () => {
  test('item-wise sales: item rows + total', async () => {
    mockReports.getItemWiseSales.mockResolvedValue({ items: [
      { name: 'Paneer Tikka', total_quantity: 40, total_revenue: 480 },
      { name: 'Naan', total_quantity: 90, total_revenue: 270 },
    ] });
    const out = await xport.generate({ outletId: 'o1', module: 'item_wise', from: '2026-07-01', to: '2026-07-31', format: 'csv', currency: 'AUD' });
    expect(out.body).toMatch(/Item-wise Sales/);
    expect(out.body).toMatch(/Paneer Tikka,40,480\.00/);
    expect(out.body).toMatch(/Total,130,750\.00/);
  });
  test('inventory valuation: category rows + total value', async () => {
    mockReports.getInventoryValuation.mockResolvedValue({ total_value: 1234.5, total_items: 3, by_category: [
      { category: 'Produce', value: 800, count: 2 }, { category: 'Dry', value: 434.5, count: 1 },
    ] });
    const out = await xport.generate({ outletId: 'o1', module: 'inventory_valuation', from: '2026-07-01', to: '2026-07-31', format: 'csv', currency: 'AUD' });
    expect(out.body).toMatch(/Inventory Valuation/);
    expect(out.body).toMatch(/Produce,2,800\.00/);
    expect(out.body).toMatch(/Total,3,1234\.50/);
  });
  test('balance sheet: sections + liabilities+equity grand', async () => {
    mockStatements.getBalanceSheet.mockResolvedValue({
      as_of: '2026-07-31',
      assets: { accounts: [{ code: '100', name: 'Cash', amount: 5000 }], total: 5000 },
      liabilities: { accounts: [{ code: '300', name: 'Payables', amount: 1200 }], total: 1200 },
      equity: { accounts: [{ code: 'RE', name: 'Current Earnings', amount: 3800 }], total: 3800 },
      balanced: true,
    });
    const out = await xport.generate({ outletId: 'o1', module: 'balance_sheet', from: '2026-07-01', to: '2026-07-31', format: 'csv', currency: 'AUD' });
    expect(out.body).toMatch(/Balance Sheet/);
    expect(out.body).toMatch(/ASSETS/);
    expect(out.body).toMatch(/Liabilities \+ Equity,5000\.00/);
  });
  test('GST/BAS: collected, paid, net', async () => {
    mockBas.getBASReport.mockResolvedValue({
      G1_total_sales: 11000, G11_purchases: 4400, gst_on_sales_1A: 1000, gst_on_purchases_1B: 400,
      net_gst: 600, payable: true, period_label: 'Jul 2026',
    });
    const out = await xport.generate({ outletId: 'o1', module: 'bas', from: '2026-07-01', to: '2026-07-31', format: 'csv', currency: 'AUD' });
    expect(out.body).toMatch(/GST \/ BAS Summary/);
    expect(out.body).toMatch(/Net GST payable,600\.00/);
  });
  test('payroll: one row per pay run + totals', async () => {
    mockPayroll.listPayRuns.mockResolvedValue([
      { period_start: '2026-07-01', period_end: '2026-07-14', status: 'completed', gross_total: 8000, paye_total: 1600, super_total: 880, net_total: 6400, _count: { payslips: 4 } },
    ]);
    const out = await xport.generate({ outletId: 'o1', module: 'payroll', from: '2026-07-01', to: '2026-07-31', format: 'csv', currency: 'AUD' });
    expect(out.body).toMatch(/Payroll Report/);
    expect(out.body).toMatch(/8000\.00/);
    expect(out.body).toMatch(/Total,,8000\.00/);
  });
});

describe('generate — XLSX', () => {
  test('Sales XLSX returns a real .xlsx (zip) buffer with the spreadsheet content-type', async () => {
    mockReports.getRevenueTrendRange.mockResolvedValue([
      { date: '2026-07-01', revenue: 1000, orders: 20 },
      { date: '2026-07-02', revenue: 1500, orders: 25 },
    ]);
    const out = await xport.generate({ outletId: 'o1', module: 'sales', from: '2026-07-01', to: '2026-07-02', format: 'xlsx', currency: 'AUD' }, 'Test Cafe');
    expect(out.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(out.filename).toBe('sales-2026-07-01-to-2026-07-02.xlsx');
    expect(Buffer.isBuffer(out.body)).toBe(true);
    // .xlsx is a ZIP — must start with the PK local-file-header signature.
    expect(out.body.slice(0, 2).toString()).toBe('PK');
    expect(out.body.length).toBeGreaterThan(500);
  });
});

describe('generate — PDF', () => {
  test('EOD PDF returns a real PDF buffer', async () => {
    mockEod.generateSnapshot.mockResolvedValue({
      total_orders: 10, total_revenue: 800, total_tax: 72, total_discount: 20,
      cash_system: 300, card_system: 500, void_count: 1, refund_count: 0,
    });
    const out = await xport.generate({ outletId: 'o1', module: 'eod', from: '2026-07-01', to: '2026-07-02', format: 'pdf', currency: 'AUD' }, 'Test Cafe');
    expect(out.contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(out.body)).toBe(true);
    expect(out.body.slice(0, 4).toString()).toBe('%PDF');
    expect(out.body.length).toBeGreaterThan(500);
  });
});
