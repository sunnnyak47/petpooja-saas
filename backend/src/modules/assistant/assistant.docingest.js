/**
 * @fileoverview Ingest an UPLOADED document (PDF / DOCX / TXT / image) into the
 * assistant's per-outlet knowledge (assistant.docs) so RAG can answer from it.
 *
 * This is the "OPTIONAL UPGRADE" flagged in assistant.docs.js — turning a file
 * the owner already uploaded (a Document row: {id, outlet_id, name, file_url,
 * file_type}) into searchable knowledge text, migration-free.
 *
 * Text extraction is pure-JS (no native build) and lazily required so the deps
 * only load when a matching file is actually ingested:
 *   - PDF        → pdf-parse            (new PDFParse({ data }).getText())
 *   - DOCX       → mammoth.extractRawText
 *   - TXT / MD   → utf8 decode
 *   - PNG / JPG  → tesseract.js OCR      (already a dependency)
 * Extraction output is capped; unsupported types / empty text throw a 400.
 *
 * @module modules/assistant/assistant.docingest
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const docs = require('./assistant.docs');

// Cap extracted text (mirrors assistant.docs MAX_DOC_CHARS so addDoc never has
// to silently truncate a giant scan/OCR into meaninglessness).
const MAX_CHARS = 20000;

/** Throw a caller-facing 400 (matches the addDoc error shape). */
function badRequest(message) {
  const e = new Error(message);
  e.statusCode = 400;
  throw e;
}

/** Normalise line-endings, trim, and cap length. */
function normalize(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_CHARS);
}

/**
 * Classify a MIME type or filename into an extractor bucket.
 * @param {string} hint - file_type (MIME) or a filename with an extension.
 * @returns {('pdf'|'docx'|'txt'|'image'|null)}
 */
function classify(hint) {
  const h = String(hint || '').toLowerCase().trim();
  if (/\.pdf$/.test(h) || h.includes('pdf')) return 'pdf';
  if (/\.docx$/.test(h) || h.includes('wordprocessingml') || h.includes('docx')) return 'docx';
  if (/\.(txt|md|markdown|text)$/.test(h) || h.startsWith('text/') || h.includes('markdown')) return 'txt';
  if (/\.(png|jpe?g|gif|bmp|webp|tiff?)$/.test(h) || h.startsWith('image/')) return 'image';
  return null;
}

/**
 * Extract plain text from a file buffer.
 * @param {Buffer} buffer
 * @param {string} fileTypeOrName - MIME type or filename used to pick the extractor.
 * @returns {Promise<string>} normalised, length-capped text.
 * @throws {Error} 400 for unsupported file types.
 */
async function extractText(buffer, fileTypeOrName) {
  const kind = classify(fileTypeOrName);
  let raw = '';
  if (kind === 'pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const out = await parser.getText();
      raw = (out && out.text) || '';
    } finally {
      await parser.destroy();
    }
  } else if (kind === 'docx') {
    const mammoth = require('mammoth');
    const out = await mammoth.extractRawText({ buffer });
    raw = (out && out.value) || '';
  } else if (kind === 'txt') {
    raw = buffer.toString('utf8');
  } else if (kind === 'image') {
    const Tesseract = require('tesseract.js');
    const out = await Tesseract.recognize(buffer, 'eng');
    raw = (out && out.data && out.data.text) || '';
  } else {
    badRequest('Unsupported file type — upload a PDF, Word doc, text, or image file');
  }
  return normalize(raw);
}

/** Download a URL into a Buffer using the global fetch (Node >= 20). */
async function fetchToBuffer(url) {
  let resp;
  try {
    resp = await fetch(url);
  } catch (_) {
    badRequest('Could not download that document to read it');
  }
  if (!resp.ok) badRequest(`Could not download that document (HTTP ${resp.status})`);
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Ingest an uploaded Document into the outlet's assistant knowledge.
 * Loads the Document row (scoped to the outlet), downloads its file, extracts
 * text, and stores it via assistant.docs.addDoc under the document's name.
 * @param {string} outletId
 * @param {{documentId:string, userId?:string}} params
 * @returns {Promise<{id:string, title:string, chars:number}>}
 * @throws {Error} 400 on bad input / unsupported / empty; 404 when not found.
 */
async function ingestDocument(outletId, { documentId, userId } = {}) {
  if (!outletId) badRequest('An outlet is required');
  if (!documentId) badRequest('A document is required');

  const prisma = getDbClient();
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  // Scope to the outlet ourselves (id is the only unique key) so one outlet can
  // never ingest another's file.
  if (!doc || doc.outlet_id !== outletId || doc.is_deleted) {
    const e = new Error('Document not found');
    e.statusCode = 404;
    throw e;
  }
  if (!doc.file_url) badRequest('That document has no file to read');

  const buffer = await fetchToBuffer(doc.file_url);
  const text = await extractText(buffer, doc.file_type || doc.name);
  if (!text) badRequest('No readable text found in that document');

  const saved = await docs.addDoc(outletId, { title: doc.name, text, userId: userId || null });
  logger.info('assistant document ingested into knowledge', { outletId, documentId, chars: saved.chars });
  return { id: saved.id, title: saved.title, chars: saved.chars };
}

module.exports = { extractText, ingestDocument, classify };
