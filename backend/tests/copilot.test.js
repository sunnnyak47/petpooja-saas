/**
 * @fileoverview Unit tests for the "Ask your books" copilot.
 * Verifies the deterministic (no-LLM) answers stay grounded in the books
 * snapshot, that the context is built from the owner dashboard + aging, and
 * that askBooks falls back to rules when no LLM provider is configured.
 * @module tests/copilot.test
 */

const mockOwner = { getOwnerDashboard: jest.fn() };
const mockAging = { getReceivablesAging: jest.fn() };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/modules/accounting/accounting.owner.service', () => mockOwner);
jest.mock('../src/modules/accounting/accounting.aging.service', () => mockAging);

const copilot = require('../src/modules/accounting/accounting.copilot.service');

const CTX = {
  currency: 'AUD', has_data: true,
  this_month: { profit: 5000, sales_revenue: 20000, gross_profit: 12000 },
  last_month: { profit: 4000 },
  profit_change_pct_vs_last_month: 25,
  tax: { type: 'BAS', amount_to_pay: 300, is_payable: true, period: 'Jul–Sep 2026', due_date: '2026-10-28' },
  who_owes_me: { total: 1000, unpaid_count: 2, overdue_amount: 400, top_debtors: [{ customer: 'Sharma Caterers', amount: 600, days_overdue: 24, ref: 'INV-1' }] },
  what_i_owe: { total: 500, bill_count: 1 },
  expenses_this_month: [{ category: 'Ingredients', amount: 8000 }, { category: 'Wages', amount: 5000 }, { category: 'Rent', amount: 2000 }],
};

describe('ruleBasedAnswer — grounded, no-LLM answers', () => {
  test('tax question quotes the BAS figure + period', () => {
    const a = copilot.ruleBasedAnswer('How much tax do I owe?', CTX);
    expect(a).toMatch(/BAS/);
    expect(a).toMatch(/300/);
    expect(a).toMatch(/Jul–Sep 2026/);
  });
  test('who owes me names the oldest debtor', () => {
    const a = copilot.ruleBasedAnswer("Who hasn't paid me?", CTX);
    expect(a).toMatch(/2 unpaid/);
    expect(a).toMatch(/Sharma Caterers/);
    expect(a).toMatch(/overdue/);
  });
  test('what do I owe uses payables', () => {
    const a = copilot.ruleBasedAnswer('What do I owe suppliers?', CTX);
    expect(a).toMatch(/You owe/);
    expect(a).toMatch(/500/);
  });
  test('biggest expenses lists top categories', () => {
    const a = copilot.ruleBasedAnswer('What were my biggest expenses?', CTX);
    expect(a).toMatch(/Ingredients/);
    expect(a).toMatch(/Wages/);
  });
  test('how am I doing → profit + delta', () => {
    const a = copilot.ruleBasedAnswer('How am I doing this month?', CTX);
    expect(a).toMatch(/profit/i);
    expect(a).toMatch(/up 25%/);
  });
  test('sales question uses revenue', () => {
    const a = copilot.ruleBasedAnswer('What were my sales?', CTX);
    expect(a).toMatch(/sales/i);
    expect(a).toMatch(/20,000/);
  });
  test('unknown question → helpful capabilities list', () => {
    const a = copilot.ruleBasedAnswer('what is the meaning of life', CTX);
    expect(a).toMatch(/profit/);
    expect(a).toMatch(/expenses/);
  });
  test('no books yet → setup guidance', () => {
    const a = copilot.ruleBasedAnswer('how much profit?', { ...CTX, has_data: false });
    expect(a).toMatch(/set up/i);
  });
});

describe('buildBooksContext', () => {
  beforeEach(() => {
    mockOwner.getOwnerDashboard.mockResolvedValue({
      currency: 'AUD', region: 'AU', outlet_name: 'Test AU', has_data: true,
      period: { month_label: 'July 2026' },
      profit: { this_month: 5000, prev_month: 4000, delta_pct: 25, revenue: 20000, gross_profit: 12000 },
      tax: { amount: 300, payable: true, quarter_label: 'Jul–Sep 2026', due_date: '2026-10-28' },
      receivables: { total: 1000, count: 2, overdue: 400 },
      payables: { total: 500, count: 1 },
      expenses: { top: [{ code: '300', name: 'Ingredients', amount: 8000 }] },
    });
    mockAging.getReceivablesAging.mockResolvedValue({
      items: [
        { ref: 'A', customer: 'Newer', amount: 100, days: 5 },
        { ref: 'B', customer: 'Oldest', amount: 600, days: 40 },
      ],
    });
  });

  test('maps dashboard fields and sorts debtors oldest-first', async () => {
    const ctx = await copilot.buildBooksContext('outlet-1');
    expect(ctx.currency).toBe('AUD');
    expect(ctx.tax.type).toBe('BAS');
    expect(ctx.this_month.profit).toBe(5000);
    expect(ctx.who_owes_me.top_debtors[0].customer).toBe('Oldest');
    expect(ctx.expenses_this_month[0].category).toBe('Ingredients');
  });

  test('askBooks falls back to rules when no LLM provider is configured', async () => {
    const savedGroq = process.env.GROQ_API_KEY;
    const savedGemini = process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = await copilot.askBooks('outlet-1', 'How much tax do I owe?');
      expect(res.source).toBe('rules');
      expect(res.answer).toMatch(/BAS/);
      expect(Array.isArray(res.suggestions)).toBe(true);
    } finally {
      if (savedGroq !== undefined) process.env.GROQ_API_KEY = savedGroq;
      if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
    }
  });
});
