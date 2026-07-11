/**
 * useDocuments — data + pure transforms for the Documents ("Licenses & files")
 * screen. Everything is scoped to the SELECTED outlet (owner user.outlet_id is
 * often null, so we always pass useOutlet().outletId).
 *
 * Exports:
 *   useDocuments()        — useQuery: GET /documents?outlet_id=
 *   useUploadDocument()   — useMutation: POST /documents (multipart)
 *   useDeleteDocument()   — useMutation: DELETE /documents/:id
 *   + pure helpers (unit-tested): DOC_CATEGORIES, getExpiryStatus,
 *     groupByCategory, formatFileSize, fileIconFor, buildDocumentFormData
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

// ─── Constants ───────────────────────────────────────────────────────────────
export const DOC_CATEGORIES = ['License', 'Contract', 'Certificate', 'Menu', 'Other'];

// Categories whose documents carry a legal expiry we should warn about.
export const EXPIRING_CATEGORIES = ['License', 'Certificate'];

// Warn when an expiry is this many days out (or already past).
export const EXPIRY_WARN_DAYS = 30;

export const KEYS = {
  documents: (outletId) => ['documents', outletId],
};

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

/**
 * Classify a document's expiry.
 * @param {string|Date|null|undefined} expiresAt
 * @param {Date} [now=new Date()]
 * @returns {{ status: 'none'|'ok'|'soon'|'expired', days: number|null }}
 *   days = whole days until expiry (negative if already expired).
 */
export function getExpiryStatus(expiresAt, now = new Date()) {
  if (!expiresAt) return { status: 'none', days: null };
  const exp = new Date(expiresAt);
  if (isNaN(exp.getTime())) return { status: 'none', days: null };

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const days = Math.ceil((exp.getTime() - now.getTime()) / MS_PER_DAY);

  if (days < 0) return { status: 'expired', days };
  if (days <= EXPIRY_WARN_DAYS) return { status: 'soon', days };
  return { status: 'ok', days };
}

/**
 * Group documents into ordered category sections. Empty categories are dropped.
 * @param {Array} docs
 * @returns {Array<{ category: string, data: Array }>}
 */
export function groupByCategory(docs = []) {
  const buckets = new Map();
  for (const d of docs) {
    const cat = DOC_CATEGORIES.includes(d?.category) ? d.category : 'Other';
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push(d);
  }
  return DOC_CATEGORIES
    .filter((cat) => buckets.has(cat))
    .map((cat) => ({ category: cat, data: buckets.get(cat) }));
}

/**
 * Human-readable file size.
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Pick an Ionicons name for a file based on its mime type / filename.
 * @param {string} [fileType]
 * @param {string} [name]
 * @returns {string} Ionicons glyph name
 */
export function fileIconFor(fileType = '', name = '') {
  const t = String(fileType).toLowerCase();
  const n = String(name).toLowerCase();
  if (t.includes('pdf') || n.endsWith('.pdf')) return 'document-text';
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return 'image';
  if (t.includes('sheet') || t.includes('excel') || /\.(xlsx?|csv)$/.test(n)) return 'grid';
  if (t.includes('word') || /\.docx?$/.test(n)) return 'document';
  return 'document-attach';
}

/**
 * Build the multipart FormData body for an upload.
 * @param {{ uri: string, name: string, mimeType?: string }} file
 * @param {{ name: string, category: string, expires_at?: string|null, outlet_id: string }} fields
 * @returns {FormData}
 */
export function buildDocumentFormData(file, fields) {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name || 'upload',
    type: file.mimeType || 'application/octet-stream',
  });
  form.append('name', fields.name);
  form.append('category', fields.category || 'Other');
  if (fields.expires_at) form.append('expires_at', fields.expires_at);
  if (fields.outlet_id) form.append('outlet_id', fields.outlet_id);
  return form;
}

// ─── Response normaliser ─────────────────────────────────────────────────────
function extractList(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data?.items)) return res.data.items;
  if (Array.isArray(res.items)) return res.items;
  return [];
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** GET /documents — outlet-scoped list. */
export function useDocuments() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: KEYS.documents(outletId),
    enabled: !!outletId,
    queryFn: async () => {
      const res = await api.get('/documents', { params: { outlet_id: outletId } });
      return extractList(res);
    },
    staleTime: 30_000,
  });
}

/** POST /documents — multipart upload. */
export function useUploadDocument() {
  const qc = useQueryClient();
  const { outletId } = useOutlet();
  return useMutation({
    mutationFn: async ({ file, name, category, expires_at }) => {
      const form = buildDocumentFormData(file, {
        name,
        category,
        expires_at,
        outlet_id: outletId,
      });
      return api.post('/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.documents(outletId) }),
  });
}

/** DELETE /documents/:id — soft delete. */
export function useDeleteDocument() {
  const qc = useQueryClient();
  const { outletId } = useOutlet();
  return useMutation({
    mutationFn: (id) =>
      api.delete(`/documents/${id}`, { params: { outlet_id: outletId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.documents(outletId) }),
  });
}
