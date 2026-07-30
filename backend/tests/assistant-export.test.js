/**
 * @fileoverview Tests for assistant report export — intent detection, date-range
 * parsing, signed-token round-trip, and CSV/PDF generation (services mocked).
 * @module tests/assistant-export.test
 */

const mockReports = { getRevenueTrendRange: jest.fn() };
const mockEod = { generateSnapshot: jest.fn(), previewToday: jest.fn() };
const mockAcctExport = { exportProfitLossCSV: jest.fn() };
const mockStatements = { getProfitAndLoss: jest.fn() };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/modules/reports/reports.service', () => mockReports);
jest.mock('../src/modules/reports/eod.service', () => mockEod);
jest.mock('../src/modules/accounting/accounting.export.service', () => mockAcctExport);
jest.mock('../src/modules/accounting/accounting.statements.service', () => mockStatements);

const xport = require('../src/modules/assistant/assistant.export');

const NOW = new Date('2026-07-30T10:00:00');

describe('detectExport', () => {
  test('recognises module + format', () => {
    expect(xport.detectExport('download eod report as pdf')).toEqual({ module: 'eod', format: 'pdf' });
    expect(xport.detectExport('export p&l this month as excel')).toEqual({ module: 'pnl', format: 'csv' });
    expect(xport.detectExport('give me the sales report last 7 days')).toEqual({ module: 'sales', format: 'csv' });
    expect(xport.detectExport('profit and loss pdf')).toEqual({ module: 'pnl', format: 'pdf' });
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
    expect(d).toMatchObject({ module: 'sales', format: 'csv', from: '2026-06-01', to: '2026-06-30' });
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
  test('P&L CSV reuses the audited exporter', async () => {
    mockAcctExport.exportProfitLossCSV.mockResolvedValue({ filename: 'pl.csv', csv: 'Net Profit,,900' });
    const out = await xport.generate({ outletId: 'o1', module: 'pnl', from: '2026-07-01', to: '2026-07-30', format: 'csv' });
    expect(out.body).toMatch(/Net Profit,,900/);
    expect(mockAcctExport.exportProfitLossCSV).toHaveBeenCalledWith('o1', '2026-07-01', '2026-07-30');
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
