/**
 * @fileoverview Tests for the proactive alert engine (assistant.alerts).
 * Verifies each rule's threshold logic, the GST/BAS deadline math, permission
 * gating, severity sorting, and that a throwing rule never breaks the set.
 * Services + logger mocked; `now` is injected so date logic is deterministic.
 * @module tests/assistant-alerts.test
 */

const mockReports = { getRevenueTrendRange: jest.fn() };
const mockInventory = { getLowStock: jest.fn() };
const mockFraud = { listAlerts: jest.fn() };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/modules/reports/reports.service', () => mockReports);
jest.mock('../src/modules/inventory/inventory.service', () => mockInventory);
jest.mock('../src/modules/fraud/fraud.service', () => mockFraud);

const alerts = require('../src/modules/assistant/assistant.alerts');

const OWNER = { role: 'owner', outletId: 'o1', permissions: [], currency: 'AUD' };
const IN_OWNER = { ...OWNER, currency: 'INR' };

beforeEach(() => {
  jest.clearAllMocks();
  mockInventory.getLowStock.mockResolvedValue([]);
  mockReports.getRevenueTrendRange.mockResolvedValue([]);
  mockFraud.listAlerts.mockResolvedValue({ items: [], total: 0 });
});

describe('nextTaxDeadline', () => {
  test('AU → next quarterly BAS (28 Oct/Feb/Apr/Jul)', () => {
    const d = alerts.nextTaxDeadline('AU', new Date(2026, 9, 20)); // 20 Oct 2026 → due 28 Oct
    expect(d.label).toBe('BAS');
    expect(d.date).toBe('2026-10-28');
    expect(d.daysUntil).toBe(8);
    // After 28 Oct → next is 28 Feb
    expect(alerts.nextTaxDeadline('AU', new Date(2026, 10, 1)).date).toBe('2027-02-28');
  });
  test('IN → 20th of the month (or next)', () => {
    expect(alerts.nextTaxDeadline('IN', new Date(2026, 7, 15)).date).toBe('2026-08-20'); // 15 Aug → 20 Aug
    expect(alerts.nextTaxDeadline('IN', new Date(2026, 7, 25)).date).toBe('2026-09-20'); // 25 Aug → 20 Sep
  });
});

describe('individual rules', () => {
  const rule = (key) => alerts.RULES.find((r) => r.key === key);
  const NOW = new Date(2026, 7, 10); // 10 Aug 2026

  test('low_stock: fires with count + out-of-stock severity', async () => {
    mockInventory.getLowStock.mockResolvedValue([
      { name: 'Butter', current_stock: 0 }, { name: 'Flour', current_stock: 2 }, { name: 'Milk', current_stock: 1 }, { name: 'Eggs', current_stock: 3 },
    ]);
    const a = await rule('low_stock').evaluate(OWNER);
    expect(a.severity).toBe('high'); // something is fully out
    expect(a.title).toMatch(/4 items running low/);
    expect(a.message).toMatch(/Butter, Flour, Milk/);
    mockInventory.getLowStock.mockResolvedValue([]);
    expect(await rule('low_stock').evaluate(OWNER)).toBeNull();
  });

  test('sales_drop: fires only on a ≥20% drop vs average', async () => {
    // yesterday = 2026-08-09; prior days ~1000, yesterday 600 → -40%
    mockReports.getRevenueTrendRange.mockResolvedValue([
      { date: '2026-08-03', revenue: 1000 }, { date: '2026-08-04', revenue: 1000 },
      { date: '2026-08-05', revenue: 1000 }, { date: '2026-08-06', revenue: 1000 },
      { date: '2026-08-09', revenue: 600 },
    ]);
    const a = await rule('sales_drop').evaluate(OWNER, NOW);
    expect(a.severity).toBe('high');
    expect(a.title).toMatch(/down 40% yesterday/);
    // small drop → no alert
    mockReports.getRevenueTrendRange.mockResolvedValue([
      { date: '2026-08-03', revenue: 1000 }, { date: '2026-08-04', revenue: 1000 },
      { date: '2026-08-05', revenue: 1000 }, { date: '2026-08-09', revenue: 950 },
    ]);
    expect(await rule('sales_drop').evaluate(OWNER, NOW)).toBeNull();
    // not enough history → no alert
    mockReports.getRevenueTrendRange.mockResolvedValue([{ date: '2026-08-09', revenue: 100 }]);
    expect(await rule('sales_drop').evaluate(OWNER, NOW)).toBeNull();
  });

  test('tax_due: fires within 14 days, not beyond', async () => {
    expect(await rule('tax_due').evaluate(OWNER, new Date(2026, 9, 20))).toMatchObject({ title: expect.stringMatching(/BAS due in 8 days/) });
    expect(await rule('tax_due').evaluate(IN_OWNER, new Date(2026, 7, 18))).toMatchObject({ title: expect.stringMatching(/GST return due in 2 days/) });
    expect(await rule('tax_due').evaluate(OWNER, new Date(2026, 7, 2))).toBeNull(); // Oct 28 is >14 days away
  });

  test('fraud_open: fires when unread alerts exist', async () => {
    mockFraud.listAlerts.mockResolvedValue({ items: [], total: 3 });
    expect((await rule('fraud_open').evaluate(OWNER)).title).toMatch(/3 fraud alerts to review/);
    mockFraud.listAlerts.mockResolvedValue({ items: [], total: 0 });
    expect(await rule('fraud_open').evaluate(OWNER)).toBeNull();
  });
});

describe('computeAlerts', () => {
  test('permission gating: cashier sees only rules they can', async () => {
    mockInventory.getLowStock.mockResolvedValue([{ name: 'Butter', current_stock: 1 }]);
    mockFraud.listAlerts.mockResolvedValue({ total: 2 });
    const cashier = { role: 'cashier', outletId: 'o1', permissions: ['VIEW_INVENTORY'], currency: 'AUD' };
    const out = await alerts.computeAlerts(cashier, new Date(2026, 7, 2));
    expect(out.map((a) => a.key)).toEqual(['low_stock']); // no VIEW_REPORTS → no sales/tax/fraud
  });

  test('severity-sorted; a throwing rule is skipped, not fatal', async () => {
    mockInventory.getLowStock.mockRejectedValue(new Error('db down')); // low_stock throws → skipped
    mockFraud.listAlerts.mockResolvedValue({ total: 1 }); // high
    const out = await alerts.computeAlerts(OWNER, new Date(2026, 9, 20)); // tax_due medium (BAS in 8d)
    const keys = out.map((a) => a.key);
    expect(keys).not.toContain('low_stock');
    expect(keys[0]).toBe('fraud_open'); // high before medium
    expect(keys).toContain('tax_due');
  });

  test('no outlet → empty', async () => {
    expect(await alerts.computeAlerts({ role: 'owner', outletId: null })).toEqual([]);
  });
});
