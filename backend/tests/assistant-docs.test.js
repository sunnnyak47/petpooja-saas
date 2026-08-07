/**
 * @fileoverview Tests for RAG over the owner's own knowledge docs (A→G item F).
 * Migration-free (outlet_settings JSON), key-free (IDF retrieval), LLM answer with
 * citation + deterministic fallback. Also the ask() fallback into docs.
 * @module tests/assistant-docs.test
 */

const store = { value: null };
const mockPrisma = {
  outlet: { findUnique: jest.fn().mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null }) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  outletSetting: {
    findUnique: jest.fn(async () => (store.value == null ? null : { setting_value: store.value })),
    upsert: jest.fn(async ({ create, update }) => { store.value = (update && update.setting_value) || create.setting_value; return {}; }),
  },
};
const mockLLM = { callLLM: jest.fn(), llmAvailable: () => true };
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/utils/llm', () => mockLLM);

const docs = require('../src/modules/assistant/assistant.docs');
const assistant = require('../src/modules/assistant/assistant.service');
const OWNER = { id: 'u1', role: 'owner', outletId: 'o1', permissions: [] };

beforeEach(() => {
  jest.clearAllMocks();
  store.value = null;
  mockPrisma.outlet.findUnique.mockResolvedValue({ currency: 'AUD', name: 'Cafe', head_office_id: null });
});

describe('manage docs (outlet_settings JSON)', () => {
  test('add → list → delete round-trip; rejects empty text', async () => {
    await expect(docs.addDoc('o1', { title: 'Refund Policy', text: '' })).rejects.toThrow(/text is required/i);
    const d = await docs.addDoc('o1', { title: 'Refund Policy', text: 'Refunds are given within 7 days with a receipt. No cash refunds after 7 days.' });
    expect(d.id).toMatch(/^doc_/);
    const list = await docs.listDocs('o1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Refund Policy' });
    expect(list[0].text).toBeUndefined(); // list is metadata only
    expect(await docs.deleteDoc('o1', d.id)).toBe(true);
    expect(await docs.deleteDoc('o1', d.id)).toBe(false);
    expect(await docs.listDocs('o1')).toHaveLength(0);
  });
});

describe('retrieval + answer', () => {
  beforeEach(async () => {
    await docs.addDoc('o1', { title: 'Refund Policy', text: 'Refunds are given within 7 days with a valid receipt.\n\nNo cash refunds are given after 7 days; a credit note is issued instead.' });
    await docs.addDoc('o1', { title: 'Uniform Policy', text: 'Staff must wear a clean black apron and closed-toe shoes on every shift.' });
  });

  test('paraphrase retrieval: "when do we close?" finds the hours doc via synonyms', async () => {
    await docs.addDoc('o1', { title: 'Opening Hours', text: 'We are open from 9am to 10pm daily; the kitchen closes 30 minutes before.' });
    const hits = await docs.searchDocs('o1', 'when do we close?', 3);
    expect(hits[0].title).toBe('Opening Hours'); // "close" expands to hour/open/closing
    expect(hits[0].score).toBeGreaterThan(0);
  });

  test('searchDocs ranks the relevant document first', async () => {
    const hits = await docs.searchDocs('o1', 'what is our refund policy on receipts', 3);
    expect(hits[0].title).toBe('Refund Policy');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  test('answerFromDocs cites the source (LLM path)', async () => {
    mockLLM.callLLM.mockResolvedValue({ answer: 'Refunds are within 7 days with a receipt [Refund Policy].' });
    const r = await docs.answerFromDocs(OWNER, 'can I get a refund without a receipt');
    expect(r.source).toBe('docs');
    expect(r.tool).toBe('knowledge_docs');
    expect(r.citations[0].title).toBe('Refund Policy');
  });

  test('answerFromDocs falls back to the top chunk verbatim when the LLM is down', async () => {
    mockLLM.callLLM.mockRejectedValue(new Error('no llm'));
    const r = await docs.answerFromDocs(OWNER, 'refund policy receipt 7 days');
    expect(r.answer).toMatch(/From your document "Refund Policy"/);
  });

  test('an unrelated question returns null (no weak-match hallucination)', async () => {
    const r = await docs.answerFromDocs(OWNER, 'how much did we sell today');
    expect(r).toBeNull();
  });
});

describe('ask() falls back to the owner docs when no tool matches', () => {
  test('a policy question is answered from docs with source "docs"', async () => {
    await docs.addDoc('o1', { title: 'Dress Code', text: 'The dress code requires a clean black apron and closed-toe shoes; no shorts or sandals are permitted on shift.' });
    mockLLM.callLLM.mockResolvedValue({ answer: 'A clean black apron and closed-toe shoes; no shorts or sandals [Dress Code].' });
    const res = await assistant.ask(OWNER, 'what is the dress code on shift');
    expect(res.source).toBe('docs');
    expect(res.citations[0].title).toBe('Dress Code');
  });
});
