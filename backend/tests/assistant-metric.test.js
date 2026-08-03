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
const mockReports = { getItemWiseSales: jest.fn() };
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
