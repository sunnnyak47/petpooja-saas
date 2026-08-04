/**
 * @fileoverview Tests for the text-to-metric engine (A→G item A). Whitelisted
 * metric × dimension × timeframe, computed over a bounded order fetch (or the
 * item-wise service). No arbitrary SQL. Also the ask() fallback into it.
 * @module tests/assistant-metric.test
 */

const NOW = new Date('2026-08-03T10:00:00');
const mockPrisma = {
  outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null }) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  order: { findMany: jest.fn() },
};
const mockReports = { getItemWiseSales: jest.fn(), getCategoryWiseSales: jest.fn() };
const mockLLM = { callLLM: jest.fn(), llmAvailable: () => true };
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/utils/llm', () => mockLLM);
jest.mock('../src/modules/reports/reports.service', () => mockReports);

const metric = require('../src/modules/assistant/assistant.metric');
const assistant = require('../src/modules/assistant/assistant.service');
const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [] };

const orders = [
  { grand_total: 100, discount_amount: 10, subtotal: 90, order_type: 'dine_in', created_at: '2026-08-01T09:30:00' },
  { grand_total: 200, discount_amount: 0, subtotal: 200, order_type: 'delivery', created_at: '2026-08-01T13:00:00' },
  { grand_total: 60, discount_amount: 5, subtotal: 55, order_type: 'dine_in', created_at: '2026-08-02T09:15:00' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.outlet.findUnique.mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null });
  mockPrisma.order.findMany.mockResolvedValue(orders);
});

describe('detectMetricQuery', () => {
  test('fires on metric + breakdown', () => {
    expect(metric.detectMetricQuery('revenue by channel last week', NOW)).toMatchObject({ metric: 'revenue', dimension: 'by_channel' });
    expect(metric.detectMetricQuery('discount total by day this month', NOW)).toMatchObject({ metric: 'discount', dimension: 'by_day' });
    expect(metric.detectMetricQuery('orders by hour today', NOW)).toMatchObject({ metric: 'orders', dimension: 'by_hour' });
    expect(metric.detectMetricQuery('average order value by item last month', NOW)).toMatchObject({ metric: 'avg_order', dimension: 'by_item' });
  });
  test('fires on the richer breakdowns (payment method, staff, category)', () => {
    expect(metric.detectMetricQuery('revenue by payment method this month', NOW)).toMatchObject({ metric: 'revenue', dimension: 'by_payment' });
    expect(metric.detectMetricQuery('sales by staff last week', NOW)).toMatchObject({ metric: 'revenue', dimension: 'by_staff' });
    expect(metric.detectMetricQuery('orders by employee today', NOW)).toMatchObject({ metric: 'orders', dimension: 'by_staff' });
    expect(metric.detectMetricQuery('revenue by category this month', NOW)).toMatchObject({ metric: 'revenue', dimension: 'by_category' });
  });
  test('null without an explicit breakdown (fixed tools own those)', () => {
    expect(metric.detectMetricQuery('how much did we sell today', NOW)).toBeNull();
    expect(metric.detectMetricQuery('what are my top items', NOW)).toBeNull();
    expect(metric.detectMetricQuery('hi there', NOW)).toBeNull();
  });
});

describe('runMetric (bounded, whitelisted)', () => {
  test('revenue by channel aggregates orders in JS', async () => {
    const d = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'revenue', dimension: 'by_channel', from: '2026-08-01', to: '2026-08-03' });
    expect(d.total).toBe(360);
    const byBucket = Object.fromEntries(d.rows.map((r) => [r.bucket, r.value]));
    expect(byBucket.dine_in).toBe(160);
    expect(byBucket.delivery).toBe(200);
    // bounded query used a date-range + status filter
    expect(mockPrisma.order.findMany).toHaveBeenCalled();
    const where = mockPrisma.order.findMany.mock.calls[0][0].where;
    expect(where.outlet_id).toBe('o1');
    expect(where.status.notIn).toContain('cancelled');
  });
  test('avg_order by channel = revenue/count per bucket', async () => {
    const d = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'avg_order', dimension: 'by_channel', from: '2026-08-01', to: '2026-08-03' });
    const byBucket = Object.fromEntries(d.rows.map((r) => [r.bucket, r.value]));
    expect(byBucket.dine_in).toBe(80); // (100+60)/2
  });
  test('by_item reuses the item-wise service (no order query)', async () => {
    mockReports.getItemWiseSales.mockResolvedValue({ items: [{ name: 'Latte', total_quantity: 30, total_revenue: 150 }, { name: 'Muffin', total_quantity: 20, total_revenue: 80 }] });
    const d = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'revenue', dimension: 'by_item', from: '2026-08-01', to: '2026-08-03' });
    expect(d.rows[0]).toEqual({ bucket: 'Latte', value: 150 });
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
  });

  const payStaffOrders = [
    { grand_total: 100, discount_amount: 10, subtotal: 90, order_type: 'dine_in', created_at: '2026-08-01T09:30:00', staff: { full_name: 'Alice' }, payments: [{ method: 'cash', amount: 100 }] },
    { grand_total: 200, discount_amount: 0, subtotal: 200, order_type: 'delivery', created_at: '2026-08-01T13:00:00', staff: { full_name: 'Bob' }, payments: [{ method: 'card', amount: 200 }] },
    { grand_total: 60, discount_amount: 5, subtotal: 55, order_type: 'dine_in', created_at: '2026-08-02T09:15:00', staff: { full_name: 'Alice' }, payments: [{ method: 'cash', amount: 60 }] },
  ];

  test('revenue by_payment groups order revenue by tender (bounded payments include)', async () => {
    mockPrisma.order.findMany.mockResolvedValue(payStaffOrders);
    const d = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'revenue', dimension: 'by_payment', from: '2026-08-01', to: '2026-08-03' });
    expect(d.total).toBe(360);
    const byBucket = Object.fromEntries(d.rows.map((r) => [r.bucket, r.value]));
    expect(byBucket.cash).toBe(160); // 100 + 60
    expect(byBucket.card).toBe(200);
    // the fetch opted into a soft-delete-filtered payments include
    const select = mockPrisma.order.findMany.mock.calls[0][0].select;
    expect(select.payments).toEqual({ where: { is_deleted: false }, select: { method: true, amount: true } });
  });
  test('orders by_payment counts orders per tender', async () => {
    mockPrisma.order.findMany.mockResolvedValue(payStaffOrders);
    const d = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'orders', dimension: 'by_payment', from: '2026-08-01', to: '2026-08-03' });
    const byBucket = Object.fromEntries(d.rows.map((r) => [r.bucket, r.value]));
    expect(byBucket.cash).toBe(2);
    expect(byBucket.card).toBe(1);
  });
  test('revenue by_staff groups by staff name (bounded staff include)', async () => {
    mockPrisma.order.findMany.mockResolvedValue(payStaffOrders);
    const d = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'revenue', dimension: 'by_staff', from: '2026-08-01', to: '2026-08-03' });
    expect(d.total).toBe(360);
    const byBucket = Object.fromEntries(d.rows.map((r) => [r.bucket, r.value]));
    expect(byBucket.Alice).toBe(160);
    expect(byBucket.Bob).toBe(200);
    expect(mockPrisma.order.findMany.mock.calls[0][0].select.staff).toEqual({ select: { full_name: true } });
  });
  test('by_payment/by_staff handle split tenders, unpaid, unnamed method and unassigned staff', async () => {
    const edge = [
      { grand_total: 100, discount_amount: 0, subtotal: 100, order_type: 'dine_in', created_at: '2026-08-01T10:00:00', payments: [{ method: 'cash', amount: 20 }, { method: 'card', amount: 80 }] }, // split → dominant card; no staff
      { grand_total: 50, discount_amount: 0, subtotal: 50, order_type: 'dine_in', created_at: '2026-08-01T11:00:00', staff: { full_name: 'Cara' }, payments: [] }, // unpaid
      { grand_total: 30, discount_amount: 0, subtotal: 30, order_type: 'dine_in', created_at: '2026-08-01T12:00:00', staff: { full_name: 'Cara' }, payments: [{ method: null, amount: 30 }] }, // method missing → other
    ];
    mockPrisma.order.findMany.mockResolvedValue(edge);
    const p = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'revenue', dimension: 'by_payment', from: '2026-08-01', to: '2026-08-03' });
    const pByBucket = Object.fromEntries(p.rows.map((r) => [r.bucket, r.value]));
    expect(pByBucket.card).toBe(100); // dominant tender of the split bill
    expect(pByBucket.unpaid).toBe(50);
    expect(pByBucket.other).toBe(30);

    mockPrisma.order.findMany.mockResolvedValue(edge);
    const s = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'revenue', dimension: 'by_staff', from: '2026-08-01', to: '2026-08-03' });
    const sByBucket = Object.fromEntries(s.rows.map((r) => [r.bucket, r.value]));
    expect(sByBucket.Unassigned).toBe(100);
    expect(sByBucket.Cara).toBe(80);
  });
  test('by_category reuses the category-wise service (no order query)', async () => {
    mockReports.getCategoryWiseSales.mockResolvedValue([{ category: 'Food', revenue: 130 }, { category: 'Beverages', revenue: 230 }]);
    const d = await metric.runMetric({ outletId: 'o1', currency: 'AUD' }, { metric: 'revenue', dimension: 'by_category', from: '2026-08-01', to: '2026-08-03' });
    expect(d.rows[0]).toEqual({ bucket: 'Beverages', value: 230 }); // sorted by value desc
    expect(d.total).toBe(360);
    expect(mockReports.getCategoryWiseSales).toHaveBeenCalledWith('o1', '2026-08-01', '2026-08-03');
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
  });
});

describe('ask() falls back to the metric engine', () => {
  test('"revenue by channel this month" is answered with source "metric"', async () => {
    mockLLM.callLLM.mockRejectedValue(new Error('no llm')); // force deterministic summary
    const res = await assistant.ask(OWNER, 'revenue by channel this month');
    expect(res.source).toBe('metric');
    expect(res.tool).toBe('metric_query');
    expect(res.answer).toMatch(/Revenue by channel/);
  });
});
