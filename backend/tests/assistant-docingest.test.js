/**
 * @fileoverview Tests for RAG FILE INGESTION (assistant.docingest) — turning an
 * already-uploaded Document (PDF/DOCX/TXT/image) into per-outlet assistant
 * knowledge so RAG can answer from it.
 *
 * All heavy extractors are mocked (pure-JS deps: pdf-parse, mammoth, tesseract),
 * plus global fetch + prisma.document.findUnique + prisma.outletSetting (the same
 * JSON kv store assistant.docs uses). A plain-text buffer round-trips end-to-end:
 * ingestDocument stores it (addDoc gets the file text) and searchDocs finds it.
 * @module tests/assistant-docingest.test
 */

// ── extractor mocks (out-of-scope refs must be prefixed `mock`) ───────────────
const mockPdfGetText = jest.fn(async () => ({ text: 'PDF TEXT extracted' }));
const mockPdfDestroy = jest.fn(async () => {});
const mockMammothExtract = jest.fn(async () => ({ value: 'DOCX TEXT extracted' }));
const mockOcr = jest.fn(async () => ({ data: { text: 'OCR TEXT extracted' } }));
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn(() => ({ getText: mockPdfGetText, destroy: mockPdfDestroy })) }));
jest.mock('mammoth', () => ({ extractRawText: mockMammothExtract }));
jest.mock('tesseract.js', () => ({ recognize: mockOcr }));

// ── shared store + prisma/config mocks (mirror assistant-docs.test) ───────────
const store = { value: null };
const mockPrisma = {
  document: { findUnique: jest.fn() },
  outletSetting: {
    findUnique: jest.fn(async () => (store.value == null ? null : { setting_value: store.value })),
    upsert: jest.fn(async ({ create, update }) => { store.value = (update && update.setting_value) || create.setting_value; return {}; }),
  },
};
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
jest.mock('../src/config/app', () => ({ jwt: { secret: 'testsecret' } }));
jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/utils/llm', () => ({ callLLM: jest.fn(), llmAvailable: () => true }));

const ingest = require('../src/modules/assistant/assistant.docingest');
const docs = require('../src/modules/assistant/assistant.docs');
const controller = require('../src/modules/assistant/assistant.controller');

const enc = new TextEncoder();
const TXT = 'Refunds are given within seven days with a valid receipt. No cash refunds after seven days.';

/** Build a Document row (defaults to a downloadable text file for this outlet). */
function docRow(over = {}) {
  return { id: 'd1', outlet_id: 'o1', name: 'Refund Policy.txt', file_url: 'https://files.example/refund.txt', file_type: 'text/plain', is_deleted: false, ...over };
}
/** Make global.fetch resolve to a buffer for the given string. */
function fetchOk(text = TXT) {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => enc.encode(text).buffer }));
}

beforeEach(() => {
  jest.clearAllMocks();
  store.value = null;
  mockPdfGetText.mockResolvedValue({ text: 'PDF TEXT extracted' });
  mockMammothExtract.mockResolvedValue({ value: 'DOCX TEXT extracted' });
  mockOcr.mockResolvedValue({ data: { text: 'OCR TEXT extracted' } });
  fetchOk();
});

// ── extractText: one branch per file kind ─────────────────────────────────────
describe('extractText picks the right extractor', () => {
  test('txt/md → utf8 decode', async () => {
    expect(await ingest.extractText(Buffer.from('hello world'), 'notes.txt')).toBe('hello world');
    expect(await ingest.extractText(Buffer.from('# heading'), 'text/markdown')).toBe('# heading');
  });
  test('pdf → pdf-parse getText (and destroy is called)', async () => {
    const out = await ingest.extractText(Buffer.from('%PDF'), 'application/pdf');
    expect(out).toBe('PDF TEXT extracted');
    expect(mockPdfGetText).toHaveBeenCalled();
    expect(mockPdfDestroy).toHaveBeenCalled();
  });
  test('docx → mammoth.extractRawText', async () => {
    expect(await ingest.extractText(Buffer.from('PK'), 'handbook.docx')).toBe('DOCX TEXT extracted');
  });
  test('image → tesseract OCR', async () => {
    expect(await ingest.extractText(Buffer.from('\x89PNG'), 'image/png')).toBe('OCR TEXT extracted');
  });
  test('unsupported type → 400', async () => {
    await expect(ingest.extractText(Buffer.from('x'), 'archive.zip')).rejects.toMatchObject({ statusCode: 400 });
  });
  test('classify tolerates a null hint', () => {
    expect(ingest.classify(null)).toBeNull();
  });
  test('extractor returning nothing normalises to empty string', async () => {
    mockPdfGetText.mockResolvedValueOnce({});
    expect(await ingest.extractText(Buffer.from('%PDF'), 'x.pdf')).toBe('');
    mockMammothExtract.mockResolvedValueOnce({});
    expect(await ingest.extractText(Buffer.from('PK'), 'x.docx')).toBe('');
    mockOcr.mockResolvedValueOnce({});
    expect(await ingest.extractText(Buffer.from('img'), 'x.jpg')).toBe('');
  });
});

// ── ingestDocument end-to-end ─────────────────────────────────────────────────
describe('ingestDocument stores the file text as knowledge', () => {
  test('a text file round-trips: addDoc gets the file text, searchDocs finds it', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow());
    const addSpy = jest.spyOn(docs, 'addDoc');

    const res = await ingest.ingestDocument('o1', { documentId: 'd1', userId: 'u1' });

    expect(mockPrisma.document.findUnique).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(global.fetch).toHaveBeenCalledWith('https://files.example/refund.txt');
    expect(addSpy).toHaveBeenCalledWith('o1', expect.objectContaining({ title: 'Refund Policy.txt', text: TXT, userId: 'u1' }));
    expect(res).toMatchObject({ title: 'Refund Policy.txt', chars: TXT.length });
    expect(res.id).toMatch(/^doc_/);

    const hits = await docs.searchDocs('o1', 'what is our refund policy on receipts', 3);
    expect(hits[0].title).toBe('Refund Policy.txt');
    expect(hits[0].text).toContain('Refunds are given');
    addSpy.mockRestore();
  });

  test('classifies by file name when file_type is missing', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow({ file_type: null, name: 'menu.pdf' }));
    const res = await ingest.ingestDocument('o1', { documentId: 'd1' });
    expect(res.title).toBe('menu.pdf');
    expect(res.chars).toBe('PDF TEXT extracted'.length);
  });

  test('empty extracted text → 400', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow({ file_type: 'image/png', name: 'scan.png' }));
    mockOcr.mockResolvedValueOnce({ data: { text: '   ' } });
    await expect(ingest.ingestDocument('o1', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('missing outlet / document ids → 400 (incl. no params object)', async () => {
    await expect(ingest.ingestDocument('', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(ingest.ingestDocument('o1', {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(ingest.ingestDocument('o1')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('document from another outlet / missing / deleted → 404', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce(docRow({ outlet_id: 'other' }));
    await expect(ingest.ingestDocument('o1', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 404 });
    mockPrisma.document.findUnique.mockResolvedValueOnce(null);
    await expect(ingest.ingestDocument('o1', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 404 });
    mockPrisma.document.findUnique.mockResolvedValueOnce(docRow({ is_deleted: true }));
    await expect(ingest.ingestDocument('o1', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('document with no file_url → 400', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow({ file_url: '' }));
    await expect(ingest.ingestDocument('o1', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('download errors → 400 (fetch throws, and non-2xx response)', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow());
    global.fetch = jest.fn(async () => { throw new Error('network down'); });
    await expect(ingest.ingestDocument('o1', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 400 });
    global.fetch = jest.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(ingest.ingestDocument('o1', { documentId: 'd1' })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── controller: POST /docs/ingest ─────────────────────────────────────────────
describe('controller.ingestDoc gate + delegation', () => {
  const mkRes = () => { const res = {}; res.status = jest.fn(() => res); res.json = jest.fn(() => res); return res; };
  const OWNER = { id: 'u1', role: 'owner', outlet_id: 'o1', permissions: [] };

  test('non-manager → 403', async () => {
    const res = mkRes(); const next = jest.fn();
    await controller.ingestDoc({ user: { role: 'cashier', permissions: [] }, query: {}, body: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('missing outlet → 400, missing document_id → 400', async () => {
    const res1 = mkRes();
    await controller.ingestDoc({ user: { role: 'owner', permissions: [] }, query: {}, body: { document_id: 'd1' } }, res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(400);
    const res2 = mkRes();
    await controller.ingestDoc({ user: OWNER, query: {}, body: {} }, res2, jest.fn());
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  test('success → 200 with the stored doc', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(docRow());
    const res = mkRes(); const next = jest.fn();
    await controller.ingestDoc({ user: OWNER, query: { outlet_id: 'o1' }, body: { document_id: 'd1' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { doc: expect.objectContaining({ title: 'Refund Policy.txt' }) } }));
    expect(next).not.toHaveBeenCalled();
  });

  test('relays a thrown statusCode error (404) via sendError', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(null);
    const res = mkRes(); const next = jest.fn();
    await controller.ingestDoc({ user: OWNER, query: {}, body: { documentId: 'd1' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('forwards an unexpected error to next()', async () => {
    mockPrisma.document.findUnique.mockRejectedValue(new Error('db exploded'));
    const res = mkRes(); const next = jest.fn();
    await controller.ingestDoc({ user: OWNER, query: {}, body: { document_id: 'd1' } }, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
