/**
 * @fileoverview Tests for clarify-before-read (Item 2 of Partial→Legend).
 * A read tool that needs a detail the question didn't give (WHICH customer)
 * returns a `clarify` response with tappable options instead of guessing; a
 * question that DOES name the customer runs normally. LLM/DB/services mocked.
 * @module tests/assistant-clarify.test
 */

const mockCustomer = { getCRMDashboard: jest.fn(), listCustomers: jest.fn(), getCustomer: jest.fn() };
const mockPrisma = { outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Test Cafe', head_office_id: null }) } };

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
// Force the no-LLM deterministic path: router falls back to keywords, compose to summarize.
jest.mock('../src/utils/llm', () => ({ callLLM: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/modules/customers/customer.service', () => mockCustomer);

const assistant = require('../src/modules/assistant/assistant.service');

const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockCustomer.getCRMDashboard.mockResolvedValue({ topSpenders: [
    { full_name: 'Ava Chen', total_spend: 900, total_visits: 12 },
    { full_name: 'Ben Ortiz', total_spend: 700, total_visits: 9 },
  ] });
  mockCustomer.listCustomers.mockResolvedValue({ customers: [
    { id: 'c1', full_name: 'John Smith', phone: '0400111222', segment: 'regular', total_spend: 320, total_visits: 5, _count: { orders: 5 }, loyalty_points: { current_balance: 40 } },
  ], total: 1 });
  mockCustomer.getCustomer.mockResolvedValue({ orders: [{ order_number: 'A-1', grand_total: 42, created_at: new Date().toISOString() }] });
});

describe('clarify-before-read', () => {
  test('a customer lookup with no name/phone asks WHICH customer, with quick-pick options', async () => {
    const res = await assistant.ask(OWNER, 'look up a customer');
    expect(res.tool).toBe('customer_lookup');
    expect(res.source).toBe('clarify');
    expect(res.clarify.options.map((o) => o.label)).toEqual(['Ava Chen', 'Ben Ortiz']);
    expect(res.clarify.options[0].query).toBe('look up Ava Chen');
    // A clarify NEVER runs the tool — no customer was searched.
    expect(mockCustomer.listCustomers).not.toHaveBeenCalled();
  });

  test('clarify still returns (without options) when the quick-pick lookup fails', async () => {
    mockCustomer.getCRMDashboard.mockRejectedValue(new Error('crm down'));
    const res = await assistant.ask(OWNER, 'find a customer');
    expect(res.source).toBe('clarify');
    expect(res.clarify.options).toEqual([]);
    expect(res.answer).toMatch(/name or phone/i);
  });

  test('a lookup that NAMES the customer runs the tool (no clarify)', async () => {
    const res = await assistant.ask(OWNER, 'look up John Smith');
    expect(res.tool).toBe('customer_lookup');
    expect(res.source).not.toBe('clarify');
    expect(res.clarify).toBeUndefined();
    expect(mockCustomer.listCustomers).toHaveBeenCalledWith('o1', { search: 'John Smith', limit: 1 }, null);
    expect(res.answer).toMatch(/John Smith/);
  });

  test('a phone number counts as naming the customer (no clarify)', async () => {
    const res = await assistant.ask(OWNER, 'look up customer 0400 111 222');
    expect(res.source).not.toBe('clarify');
    expect(mockCustomer.listCustomers).toHaveBeenCalledWith('o1', { search: '0400111222', limit: 1 }, null);
  });

  test('a tool without a clarify hook never returns clarify', async () => {
    const res = await assistant.ask(OWNER, 'who are my top customers');
    expect(res.tool).toBe('top_customers');
    expect(res.source).not.toBe('clarify');
    expect(res.clarify).toBeUndefined();
  });
});
