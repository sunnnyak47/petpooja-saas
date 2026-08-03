/**
 * @fileoverview Tests for multi-tool reasoning (assistant.reason). Covers the
 * NARROW intent detector (positive + the metric-vs-metric / greeting guardrails),
 * runTools resilience (one tool rejects, the rest survive), and the no-LLM
 * composeMulti fallback (must contain BOTH tools' figures). callLLM is mocked to
 * reject so the deterministic path is exercised.
 * @module tests/assistant-reason.test
 */

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/database', () => ({ getDbClient: () => ({}) }));
jest.mock('../src/modules/reports/reports.service', () => ({ getRevenueTrendRange: jest.fn() }));
jest.mock('../src/utils/llm', () => ({ callLLM: jest.fn().mockRejectedValue(new Error('no llm')), llmAvailable: () => false }));

const reason = require('../src/modules/assistant/assistant.reason');
const { callLLM } = require('../src/utils/llm');

const CTX = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [], currency: 'AUD' };

describe('detectMultiIntent (narrow)', () => {
  test('positive: WHY-diagnosis and period-vs-period comparison', () => {
    expect(reason.detectMultiIntent('why is my profit down this month')).toBe('diagnose');
    expect(reason.detectMultiIntent('why are sales dropping')).toBe('diagnose');
    expect(reason.detectMultiIntent('why is business slow')).toBe('diagnose');
    expect(reason.detectMultiIntent('this week vs last week')).toBe('compare');
    expect(reason.detectMultiIntent('how does this month compare to last month')).toBe('compare');
  });

  test('guardrail: metric-vs-metric cores name NO period → null (single tool)', () => {
    for (const q of ['expenses vs revenue', 'veg vs non-veg', 'cash in vs cash out', 'gst collected vs paid', 'planned vs actual']) {
      expect(reason.detectMultiIntent(q)).toBeNull();
    }
  });

  test('guardrail: greetings and plain single-tool questions → null', () => {
    for (const q of ['hi there', 'hello', 'thanks', 'how much did we sell today', "what's tomorrow looking like", '']) {
      expect(reason.detectMultiIntent(q)).toBeNull();
    }
  });
});

describe('runTools resilience', () => {
  test('one tool rejecting does not sink the others', async () => {
    const good = { name: 'sales_trend', run: jest.fn().mockResolvedValue({ total_revenue: 4500 }) };
    const bad = { name: 'top_items', run: jest.fn().mockRejectedValue(new Error('boom')) };
    const sync = { name: 'low_stock', run: jest.fn(() => { throw new Error('sync throw'); }) };
    const map = await reason.runTools(CTX, 'why are sales down', [good, bad, sync]);
    expect(map.sales_trend).toEqual({ total_revenue: 4500 });
    expect(map.top_items).toBeUndefined();
    expect(map.low_stock).toBeUndefined();
    expect(good.run).toHaveBeenCalledWith(CTX, 'why are sales down');
  });
});

describe('composeMulti no-LLM fallback', () => {
  test('joins BOTH tools deterministic summaries (contains both figures)', async () => {
    const toolA = { name: 'sales_trend', summarize: () => 'Last 7 days: $4,500 from 30 orders.' };
    const toolB = { name: 'top_items', summarize: () => 'Top sellers: Paneer Tikka (42).' };
    const dataMap = { sales_trend: { total_revenue: 4500 }, top_items: { items: [] } };

    const answer = await reason.composeMulti('why are sales down', dataMap, [toolA, toolB], []);
    expect(callLLM).toHaveBeenCalled(); // LLM was attempted then rejected
    expect(answer).toMatch(/4,?500/);
    expect(answer).toMatch(/Paneer Tikka/);
    expect(answer).toMatch(/42/);
  });

  test('includes a period-comparison line when present, even with no tools', async () => {
    const dataMap = {
      period_comparison: {
        currency: 'AUD', unit: 'week',
        current: { revenue: 4500, orders: 30 }, previous: { revenue: 3000, orders: 22 },
        revenue_change: 1500, revenue_change_pct: 50,
      },
    };
    const answer = await reason.composeMulti('this week vs last week', dataMap, [], []);
    expect(answer).toMatch(/This week/);
    expect(answer).toMatch(/up 50%/);
  });
});
