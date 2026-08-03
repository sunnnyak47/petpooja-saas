/**
 * @fileoverview Tests for daily/weekly DIGEST EMAILS (assistant.digest). Reports,
 * alerts, insights, mail and prisma are all mocked. Verifies buildDigest returns
 * a summary carrying the revenue + alert count, that sendDigest mails the OWNER's
 * address, and that it never sends when there is no owner email. `now` is injected
 * so the date window is deterministic.
 * @module tests/assistant-digest.test
 */

const mockReports = { getDailySales: jest.fn(), getRevenueTrendRange: jest.fn() };
const mockAlerts = { computeAlerts: jest.fn() };
const mockInsights = { mineUsage: jest.fn() };
const mockMail = { sendMail: jest.fn().mockResolvedValue({ transport: 'test' }) };
const mockPrisma = {
  user: { findUnique: jest.fn() },
  outlet: { findMany: jest.fn() },
};

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/modules/reports/reports.service', () => mockReports);
jest.mock('../src/modules/assistant/assistant.alerts', () => mockAlerts);
jest.mock('../src/modules/assistant/assistant.insights', () => mockInsights);
jest.mock('../src/utils/mail.service', () => mockMail);

const digest = require('../src/modules/assistant/assistant.digest');

const OUTLET = { id: 'o1', name: 'Test Cafe', currency: 'AUD', owner_id: 'u1' };
const NOW = new Date(2026, 7, 3); // 3 Aug 2026 → yesterday = 2026-08-02

beforeEach(() => {
  jest.clearAllMocks();
  mockReports.getDailySales.mockResolvedValue({ date: '2026-08-02', total_revenue: 1234, total_orders: 42 });
  mockReports.getRevenueTrendRange.mockResolvedValue([
    { date: '2026-07-27', revenue: 900, orders: 18 },
    { date: '2026-07-28', revenue: 1100, orders: 22 },
    { date: '2026-08-02', revenue: 1234, orders: 42 },
  ]);
  mockAlerts.computeAlerts.mockResolvedValue([
    { key: 'low_stock', severity: 'high', title: '2 items running low', message: 'Butter, Flour low. Consider a PO.' },
    { key: 'tax_due', severity: 'medium', title: 'BAS due in 8 days', message: 'Your BAS is due on 2026-08-11.' },
  ]);
  mockInsights.mineUsage.mockResolvedValue({ total: 10, answered: 8, misses_count: 2, miss_rate: 20, top_misses: [], by_tool: [] });
  mockPrisma.user.findUnique.mockResolvedValue({ email: 'owner@cafe.com', full_name: 'Ada Owner' });
});

describe('buildDigest', () => {
  test('daily digest summary carries the revenue + alert count', async () => {
    const d = await digest.buildDigest(OUTLET, { period: 'daily', now: NOW });
    expect(d.period).toBe('daily');
    expect(d.revenue).toBe(1234);          // daily headline = yesterday's total_revenue
    expect(d.alertCount).toBe(2);
    // summary must contain BOTH the (formatted) revenue and the alert count
    expect(d.summary).toMatch(/1,234/);
    expect(d.summary).toMatch(/2 alerts/);
    // and the same appear in the rendered bodies
    expect(d.text).toMatch(/1,234/);
    expect(d.text).toMatch(/BAS due in 8 days/);
    expect(d.html).toMatch(/Test Cafe/);
    expect(d.subject).toMatch(/Test Cafe/);
    // used the reports + alerts + insights services
    expect(mockReports.getDailySales).toHaveBeenCalled();
    expect(mockReports.getRevenueTrendRange).toHaveBeenCalled();
    expect(mockAlerts.computeAlerts).toHaveBeenCalled();
    expect(mockInsights.mineUsage).toHaveBeenCalledWith(expect.objectContaining({ outletId: 'o1' }), expect.objectContaining({ days: 1 }));
  });

  test('weekly digest sums the trend range for its headline revenue', async () => {
    const d = await digest.buildDigest(OUTLET, { period: 'weekly', now: NOW });
    expect(d.period).toBe('weekly');
    expect(d.revenue).toBe(900 + 1100 + 1234); // sum of the trailing-week trend
    expect(d.alertCount).toBe(2);
    expect(d.summary).toMatch(/3,234/);
    expect(mockInsights.mineUsage).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ days: 7 }));
  });

  test('degrades gracefully when a sub-service throws', async () => {
    mockAlerts.computeAlerts.mockRejectedValue(new Error('db down'));
    const d = await digest.buildDigest(OUTLET, { period: 'daily', now: NOW });
    expect(d.alertCount).toBe(0);
    expect(d.text).toMatch(/nothing/i);
  });
});

describe('sendDigest', () => {
  test('mails the digest to the OWNER email', async () => {
    const res = await digest.sendDigest(OUTLET, { period: 'daily', now: NOW });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    expect(mockMail.sendMail).toHaveBeenCalledTimes(1);
    const arg = mockMail.sendMail.mock.calls[0][0];
    expect(arg.to).toBe('owner@cafe.com');
    expect(arg.subject).toMatch(/digest/i);
    expect(arg.text).toMatch(/1,234/);
    expect(arg.html).toMatch(/Revenue/);
    expect(res.sent).toBe(true);
    expect(res.to).toBe('owner@cafe.com');
  });

  test('does NOT send when the owner has no email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: null, full_name: 'Ada' });
    const res = await digest.sendDigest(OUTLET, { period: 'daily', now: NOW });
    expect(mockMail.sendMail).not.toHaveBeenCalled();
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('no_email');
  });

  test('does NOT send (or even look up a user) when the outlet has no owner', async () => {
    const res = await digest.sendDigest({ id: 'o2', name: 'No Owner', currency: 'AUD', owner_id: null }, { period: 'daily', now: NOW });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockMail.sendMail).not.toHaveBeenCalled();
    expect(res.sent).toBe(false);
  });
});

describe('runDigests', () => {
  test('iterates owner outlets and reports sent/skipped counts', async () => {
    mockPrisma.outlet.findMany.mockResolvedValue([
      { id: 'o1', name: 'Cafe One', currency: 'AUD', owner_id: 'u1' },
      { id: 'o2', name: 'Cafe Two', currency: 'AUD', owner_id: 'u2' },
    ]);
    // u1 has an email, u2 does not
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ email: 'one@cafe.com', full_name: 'One' })
      .mockResolvedValueOnce({ email: null, full_name: 'Two' });
    const res = await digest.runDigests({ period: 'weekly', now: NOW });
    expect(res.outlets).toBe(2);
    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(1);
    expect(mockMail.sendMail).toHaveBeenCalledTimes(1);
    expect(mockMail.sendMail.mock.calls[0][0].to).toBe('one@cafe.com');
  });
});
