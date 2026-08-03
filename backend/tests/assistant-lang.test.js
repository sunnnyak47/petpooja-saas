/**
 * @fileoverview Tests for multilingual answers (A→G item E). detect() picks a
 * target language from an explicit name or the question's script; compose() then
 * instructs the LLM to answer in it while keeping the grounded figures intact.
 * @module tests/assistant-lang.test
 */

const lang = require('../src/modules/assistant/assistant.lang');

describe('lang.detect', () => {
  test('English (no cue) → null', () => {
    expect(lang.detect('how much did we sell today')).toBeNull();
    expect(lang.detect('')).toBeNull();
  });
  test('explicit language name', () => {
    expect(lang.detect('how much did we sell today in hindi')).toBe('Hindi');
    expect(lang.detect('reply in tamil please')).toBe('Tamil');
    expect(lang.detect('answer in punjabi')).toBe('Punjabi');
  });
  test('script detection', () => {
    expect(lang.detect('आज कितनी बिक्री हुई')).toBe('Hindi');       // Devanagari
    expect(lang.detect('இன்று விற்பனை எவ்வளவு')).toBe('Tamil');     // Tamil
    expect(lang.detect('ਅੱਜ ਦੀ ਵਿਕਰੀ')).toBe('Punjabi');            // Gurmukhi
  });
});

// integration: the composed LLM prompt carries the language instruction and the
// grounded answer is still returned.
const mockLLM = { callLLM: jest.fn(), llmAvailable: () => true };
const mockReports = { getDailySales: jest.fn() };
const mockPrisma = {
  outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null }) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/utils/llm', () => mockLLM);
jest.mock('../src/modules/reports/reports.service', () => mockReports);

const assistant = require('../src/modules/assistant/assistant.service');
const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [] };

describe('multilingual compose via ask()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.outlet.findUnique.mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null });
    mockReports.getDailySales.mockResolvedValue({ total_orders: 12, total_revenue: 4500, avg_order_value: 375, by_type: {}, by_payment: {} });
  });

  test('a Hindi request adds a "Respond ONLY in Hindi" instruction to the LLM system prompt', async () => {
    mockLLM.callLLM.mockResolvedValue({ answer: 'Aaj $4,500 ki bikri hui 12 orders se.' });
    const res = await assistant.ask(OWNER, 'how much did we sell today in hindi');
    expect(res.tool).toBe('sales_today');
    // compose() is the LLM call whose system prompt names the language.
    const composeCall = mockLLM.callLLM.mock.calls.find((c) => /Respond ONLY in Hindi/.test(c[0]));
    expect(composeCall).toBeTruthy();
    expect(res.source).toBe('ai'); // grounded ($4,500 in data) → kept
  });

  test('an English question gets no language instruction', async () => {
    mockLLM.callLLM.mockResolvedValue({ answer: 'Today you made $4,500 from 12 orders.' });
    await assistant.ask(OWNER, 'how much did we sell today');
    const anyLangLine = mockLLM.callLLM.mock.calls.some((c) => /Respond ONLY in /.test(c[0]));
    expect(anyLangLine).toBe(false);
  });
});
