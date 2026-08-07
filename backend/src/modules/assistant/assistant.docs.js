/**
 * @fileoverview RAG over the OWNER'S OWN knowledge documents (A→G item F).
 * Owners add their SOPs / policies / handbook text; the assistant answers from
 * them WITH A CITATION when the built-in tools/KB don't cover the question.
 *
 * MIGRATION-FREE + KEY-FREE by design:
 *   - Storage: a JSON array in the existing `outlet_settings` (OutletSetting) kv
 *     table — the same store scheduled reports / Square / Xero settings use. No
 *     new Prisma model, no migration.
 *   - Retrieval: IDF-weighted keyword scoring over paragraph chunks (the proven
 *     assistant.knowledge approach) — no embeddings provider, no heavy local model.
 *   - Generation: the existing Groq callLLM answers ONLY from the retrieved chunks
 *     and cites the source; falls back to returning the top chunk verbatim.
 * OPTIONAL UPGRADES (need a credential / heavy dep, deliberately NOT done here):
 *   semantic embeddings (provider key or @xenova/transformers), and ingesting
 *   uploaded PDF/DOCX files (text extraction) from the existing documents module.
 *
 * @module modules/assistant/assistant.docs
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { callLLM } = require('../../utils/llm');
const guard = require('./assistant.guard');

const SETTING_KEY = 'assistant_docs';
const MAX_DOCS = 50;
const MAX_DOC_CHARS = 20000;
const MAX_TOTAL_CHARS = 200000;
const MIN_SCORE = 1.5; // don't answer from docs on a weak/unrelated match

// ── persistence (JSON blob inside outlet_settings) ───────────────────────────
async function _read(outletId) {
  const prisma = getDbClient();
  const row = await prisma.outletSetting.findUnique({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: SETTING_KEY } },
  });
  if (!row || !row.setting_value) return [];
  try { const arr = JSON.parse(row.setting_value); return Array.isArray(arr) ? arr : []; }
  catch (_) { return []; }
}
async function _write(outletId, list) {
  const prisma = getDbClient();
  const value = JSON.stringify(Array.isArray(list) ? list : []);
  await prisma.outletSetting.upsert({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: SETTING_KEY } },
    create: { outlet_id: outletId, setting_key: SETTING_KEY, setting_value: value, data_type: 'json' },
    update: { setting_value: value },
  });
}

let _seq = 0;
function genId() { return `doc_${Date.now().toString(36)}${(_seq += 1).toString(36)}`; }

// ── manage ───────────────────────────────────────────────────────────────────
/** List stored docs as metadata (no full text). */
async function listDocs(outletId) {
  const list = await _read(outletId);
  return list.map((d) => ({ id: d.id, title: d.title, chars: (d.text || '').length, added_at: d.added_at }));
}

/** Add a knowledge document (title + text). Throws on invalid/over-quota input. */
async function addDoc(outletId, { title, text, userId } = {}) {
  const body = String(text || '').trim().slice(0, MAX_DOC_CHARS);
  if (!body) { const e = new Error('Document text is required'); e.statusCode = 400; throw e; }
  const list = await _read(outletId);
  if (list.length >= MAX_DOCS) { const e = new Error(`You can store up to ${MAX_DOCS} knowledge documents`); e.statusCode = 400; throw e; }
  const total = list.reduce((s, d) => s + (d.text || '').length, 0);
  if (total + body.length > MAX_TOTAL_CHARS) { const e = new Error('Knowledge storage is full — remove a document first'); e.statusCode = 400; throw e; }
  const doc = { id: genId(), title: String(title || '').trim().slice(0, 140) || 'Untitled', text: body, added_by: userId || null, added_at: new Date().toISOString() };
  list.push(doc);
  await _write(outletId, list);
  return { id: doc.id, title: doc.title, chars: body.length };
}

/** Remove a doc by id. Returns true if it existed. */
async function deleteDoc(outletId, id) {
  const list = await _read(outletId);
  const next = list.filter((d) => d.id !== id);
  if (next.length === list.length) return false;
  await _write(outletId, next);
  return true;
}

// ── retrieval ────────────────────────────────────────────────────────────────
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'be', 'with', 'how', 'do', 'i', 'what', 'my', 'we', 'it', 'this', 'that', 'you', 'your', 'can', 'does', 'our']);
function terms(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)); // light plural stemming
}

/** Adjacent-word bigrams ("opening hours") so multi-word concepts match as phrases,
 *  not just as independent words. Added to BOTH the doc and query term sets. */
function bigrams(tokenArr) {
  const out = [];
  for (let i = 0; i < tokenArr.length - 1; i += 1) out.push(`${tokenArr[i]} ${tokenArr[i + 1]}`);
  return out;
}

// Compact domain synonym map — expands QUERY terms only so a paraphrase ("when do
// we close?") reaches a doc worded differently ("Opening Hours"). Keys/values are
// already light-stemmed (terms() drops a trailing plural 's').
const SYN = {
  hour: ['time', 'timing', 'open', 'close', 'closing', 'opening', 'schedule'],
  open: ['hour', 'timing', 'close'], close: ['hour', 'timing', 'open', 'shut'], timing: ['hour', 'time'],
  refund: ['return', 'money', 'reimburse'], return: ['refund'],
  wifi: ['internet', 'password', 'network'], internet: ['wifi'], password: ['wifi', 'login'],
  park: ['parking'], parking: ['park'],
  book: ['reservation', 'reserve', 'booking'], reservation: ['book', 'reserve', 'booking'],
  allergen: ['allergy', 'allergic', 'intolerance'], allergy: ['allergen'],
  deliver: ['delivery', 'takeaway', 'takeout'], delivery: ['deliver', 'takeaway'],
  tip: ['gratuity', 'service charge'], vegan: ['vegetarian', 'plant'], veg: ['vegetarian'],
  uniform: ['dress', 'apron', 'attire'], dress: ['uniform', 'attire'],
  cancel: ['cancellation'], discount: ['offer', 'deal', 'promo'], gift: ['voucher', 'card'],
  halal: ['certified'], policy: ['rule'], leave: ['holiday', 'time off', 'absence'],
};
function expandQuery(qTokens) {
  const out = new Set(qTokens);
  for (const t of qTokens) for (const s of (SYN[t] || [])) for (const w of terms(s)) out.add(w);
  return [...out];
}

/** Split a doc into paragraph chunks (finer retrieval + tighter citation). */
function chunksOf(doc) {
  const parts = String(doc.text || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return (parts.length ? parts : [String(doc.text || '')]).map((text, idx) => ({ id: doc.id, title: doc.title, idx, text }));
}

/** Top-N chunks for a question by IDF-weighted overlap of unigrams + bigrams, with
 *  the query expanded by a domain synonym map so paraphrases still retrieve. */
async function searchDocs(outletId, question, n = 3) {
  const list = await _read(outletId);
  if (!list.length) return [];
  const chunks = list.flatMap(chunksOf);
  const df = {};
  const chunkSets = chunks.map((c) => {
    const uni = terms(`${c.title} ${c.text}`);
    const set = new Set([...uni, ...bigrams(uni)]);
    for (const t of set) df[t] = (df[t] || 0) + 1;
    return set;
  });
  const N = chunks.length;
  const qUni = terms(question);
  const q = new Set([...expandQuery(qUni), ...bigrams(qUni)]);
  return chunks
    .map((c, i) => { let s = 0; for (const t of q) if (chunkSets[i].has(t)) s += Math.log(1 + N / (df[t] || 1)); return { ...c, score: Math.round(s * 1000) / 1000 }; })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** Fuzzy-resolve a knowledge note by title → [{id,title}] (exact → prefix → substring). */
async function resolveDocByTitle(outletId, name) {
  const qn = String(name || '').toLowerCase().trim();
  if (!qn) return [];
  const list = await _read(outletId);
  const norm = (s) => String(s || '').toLowerCase().trim();
  let m = list.filter((d) => norm(d.title) === qn);
  if (!m.length) m = list.filter((d) => norm(d.title).startsWith(qn));
  if (!m.length) m = list.filter((d) => norm(d.title).includes(qn) || qn.includes(norm(d.title)));
  return m.map((d) => ({ id: d.id, title: d.title }));
}

/** Append text to an existing note (by id or fuzzy title). Throws 404 if not found. */
async function appendDoc(outletId, idOrTitle, text) {
  const add = String(text || '').trim();
  if (!add) { const e = new Error('Nothing to add'); e.statusCode = 400; throw e; }
  const list = await _read(outletId);
  let doc = list.find((d) => d.id === idOrTitle);
  if (!doc) { const r = await resolveDocByTitle(outletId, idOrTitle); doc = r.length === 1 ? list.find((d) => d.id === r[0].id) : null; }
  if (!doc) { const e = new Error('Knowledge note not found'); e.statusCode = 404; throw e; }
  doc.text = `${doc.text || ''}\n\n${add}`.slice(0, MAX_DOC_CHARS);
  doc.updated_at = new Date().toISOString();
  await _write(outletId, list);
  return { id: doc.id, title: doc.title, chars: doc.text.length };
}

/**
 * Answer a question from the owner's own documents, or null if nothing relevant.
 * Retrieve → LLM answers ONLY from the chunks + cites the source → deterministic
 * fallback returns the top chunk verbatim.
 */
async function answerFromDocs(userCtx, question) {
  if (!userCtx || !userCtx.outletId) return null;
  let top;
  try { top = await searchDocs(userCtx.outletId, question, 3); }
  catch (e) { logger.warn('assistant docs search failed', { error: e.message }); return null; }
  if (!top.length || top[0].score < MIN_SCORE) return null;

  const context = top.map((c, i) => `[${i + 1}] ${c.title}: ${c.text}`).join('\n\n');
  const sys = [
    "You answer ONLY from CONTEXT — the owner's own documents. Be concise.",
    'If the answer is in CONTEXT, give it and cite the source title in brackets, e.g. [Refund Policy]. If CONTEXT does not contain it, say you could not find it in their documents.',
    guard.GUARD_SYSTEM,
    'Respond as strict JSON: {"answer": "<your answer>"}',
  ].join('\n');
  const safeQ = guard.sanitizeForPrompt(question).text;
  let answer = null;
  try {
    const out = await callLLM(sys, `QUESTION: ${safeQ}\n\nCONTEXT:\n${context}`);
    if (out && typeof out.answer === 'string' && out.answer.trim()) answer = out.answer.trim();
  } catch (_) { /* fall through to deterministic */ }
  if (!answer) {
    const snip = top[0].text.length > 400 ? `${top[0].text.slice(0, 400)}…` : top[0].text;
    answer = `From your document "${top[0].title}": ${snip}`;
  }
  return { answer, source: 'docs', tool: 'knowledge_docs', citations: top.map((c) => ({ title: c.title, id: c.id })) };
}

module.exports = { addDoc, listDocs, deleteDoc, searchDocs, answerFromDocs, terms, chunksOf, appendDoc, resolveDocByTitle };
