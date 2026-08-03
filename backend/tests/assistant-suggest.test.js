/**
 * @fileoverview Tests for confidence / "did you mean" (Item 6). When the router
 * is unsure (no confident tool) on a non-greeting, ask() returns source:'suggest'
 * with tappable option chips; greetings and clear questions are unaffected.
 * @module tests/assistant-suggest.test
 */

const mockReports = { getDailySales: jest.fn() };
const mockPrisma = {
  outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null }) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/utils/llm', () => ({ callLLM: jest.fn().mockRejectedValue(new Error('no llm')), llmAvailable: () => false }));
jest.mock('../src/modules/reports/reports.service', () => mockReports);

const assistant = require('../src/modules/assistant/assistant.service');
const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.outlet.findUnique.mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null });
  mockReports.getDailySales.mockResolvedValue({ total_orders: 5, total_revenue: 1000, avg_order_value: 200, by_type: {}, by_payment: {} });
});

describe('did-you-mean (low confidence)', () => {
  test('a vague, unmatched question returns suggestions instead of answering', async () => {
    const res = await assistant.ask(OWNER, 'tell me something about it');
    expect(res.source).toBe('suggest');
    expect(res.tool).toBeNull();
    expect(Array.isArray(res.clarify.options)).toBe(true);
    expect(res.clarify.options.length).toBeGreaterThan(0);
    expect(res.clarify.options.length).toBeLessThanOrEqual(3);
    for (const o of res.clarify.options) {
      expect(typeof o.label).toBe('string');
      expect(typeof o.query).toBe('string');
      expect(o.label).toMatch(/\?$/); // question-cased chip label
    }
  });

  test('a greeting is answered warmly, NOT turned into suggestions', async () => {
    const res = await assistant.ask(OWNER, 'hi there');
    expect(res.source).not.toBe('suggest');
    expect(res.tool).toBeNull();
  });

  test('a clear question is answered directly (no suggestions)', async () => {
    const res = await assistant.ask(OWNER, 'how much did we sell today');
    expect(res.source).not.toBe('suggest');
    expect(res.tool).toBe('sales_today');
  });

  test('suggestion chips carry a re-askable canonical question', async () => {
    const res = await assistant.ask(OWNER, 'tell me something about it');
    expect(res.source).toBe('suggest');
    // each option.query is a real phrasing the router can answer on tap
    expect(res.clarify.options.every((o) => o.query && o.query.length > 4)).toBe(true);
  });
});
