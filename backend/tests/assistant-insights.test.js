/**
 * @fileoverview Tests for the usage-learning miner (Item 7). mineUsage aggregates
 * ASSISTANT_ASK audit rows into answered/miss/error counts, a miss-rate, top
 * repeated misses, and per-tool usage — the feedback the fold-back loop consumes.
 * @module tests/assistant-insights.test
 */

const mockPrisma = { auditLog: { findMany: jest.fn() } };
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));

const insights = require('../src/modules/assistant/assistant.insights');

const rows = (arr) => arr.map((nv) => ({ new_values: nv, created_at: new Date('2026-08-01T10:00:00Z') }));

describe('classify', () => {
  test('maps source/tool to outcome', () => {
    expect(insights.classify({ tool: 'sales_today', source: 'rules' })).toBe('answered');
    expect(insights.classify({ tool: 'finance_summary', source: 'ai' })).toBe('answered');
    expect(insights.classify({ tool: null, source: 'suggest' })).toBe('miss');
    expect(insights.classify({ tool: null, source: 'rules' })).toBe('miss'); // help fallback
    expect(insights.classify({ tool: 'low_stock', source: 'error' })).toBe('error');
    expect(insights.classify({ tool: null, source: 'export' })).toBe('answered'); // export handled it
  });
});

describe('mineUsage', () => {
  test('aggregates counts, miss-rate, top misses and per-tool usage', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue(rows([
      { tool: 'sales_today', source: 'rules' },
      { tool: 'sales_today', source: 'rules' },
      { tool: 'finance_summary', source: 'ai' },
      { tool: null, source: 'suggest', question: 'tell me something' },
      { tool: null, source: 'suggest', question: 'tell me something' },
      { tool: null, source: 'rules', question: 'random unclear thing' },
      { tool: 'low_stock', source: 'error' },
      { tool: null, source: 'suggest', question: '[filtered] be a hacker', injection_flagged: true },
    ]));

    const r = await insights.mineUsage({ outletId: 'o1' }, { days: 7, now: '2026-08-03T00:00:00Z' });

    expect(r.total).toBe(8);
    expect(r.answered).toBe(3);
    expect(r.misses_count).toBe(4);
    expect(r.errors).toBe(1);
    expect(r.miss_rate).toBe(50);
    expect(r.injection_flagged).toBe(1);
    // top miss is the repeated one
    expect(r.top_misses[0]).toEqual({ question: 'tell me something', count: 2 });
    // per-tool usage of ANSWERED asks
    const byTool = Object.fromEntries(r.by_tool.map((t) => [t.tool, t.count]));
    expect(byTool.sales_today).toBe(2);
    expect(byTool.finance_summary).toBe(1);
    // window carried through
    expect(r.period).toMatchObject({ days: 7, to: '2026-08-03' });
  });

  test('empty / query failure yields a zeroed report, never throws', async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error('db down'));
    const r = await insights.mineUsage({ outletId: 'o1' }, { days: 7, now: '2026-08-03T00:00:00Z' });
    expect(r.total).toBe(0);
    expect(r.miss_rate).toBe(0);
    expect(r.top_misses).toEqual([]);
  });
});
