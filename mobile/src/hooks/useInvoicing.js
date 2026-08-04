/**
 * useInvoicing — data layer for the "Tax Invoices" screen (mobile).
 *
 * Customer (sales) invoices are the GST tax-invoice document layer for the
 * SELECTED outlet. This hook lists them, exposes outstanding/paid summary
 * stats, and drives the lifecycle: create draft → issue (posts AR journal) →
 * mark paid (cash/bank) → or void. Every request is outlet-scoped — the
 * backend reads outlet_id from the query (reads) or body (writes), and an
 * owner's user.outlet_id is often null, so we ALWAYS pass it explicitly.
 *
 * Endpoints (backend accounting/accounting.invoice.service):
 *   GET  /accounting/invoices?outlet_id=&status=&limit=  → { data: rows[] }
 *   GET  /accounting/invoices/:id?outlet_id=              → { data: invoice }
 *   POST /accounting/invoices                             → create draft · MANAGE_INVENTORY
 *   POST /accounting/invoices/:id/issue                   → draft → sent (posts AR)
 *   POST /accounting/invoices/:id/mark-paid { method }    → sent → paid
 *   POST /accounting/invoices/:id/void                    → any → void
 *
 * Pure helpers (filtering / totals / formatting) are unit-testable — no React,
 * no network.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

export const INV_STATUS = { DRAFT: 'draft', SENT: 'sent', PAID: 'paid', VOID: 'void' };

// Customer invoices are AU GST documents (10% GST-exclusive on entry).
export const GST_RATE = 0.1;

const INV_KEYS = {
  list: (outletId) => ['invoices', outletId],
};

// ─── Pure helpers (unit-testable) ───────────────────────────────────────────

/** Display number for an invoice, tolerant of field-name drift. */
export function invoiceNumber(inv = {}) {
  return String(inv.invoice_number ?? inv.number ?? inv.id ?? '');
}

/** Free-text match over number / customer / notes. Blank query matches all. */
export function matchesInvoice(inv = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [invoiceNumber(inv), inv.customer_name, inv.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

/** Client-side filter by status ('all'|'draft'|'sent'|'paid'|'void') + query. */
export function filterInvoices(rows = [], { q = '', status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(
    (inv) => (status === 'all' || inv.status === status) && matchesInvoice(inv, q)
  );
}

/** Currency-aware money formatter (AUD/INR aware). */
export function formatMoney(currency, amount) {
  const cur = currency || 'AUD';
  const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch (_) {
    return `${cur} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

/** Round to 2dp, matching the backend's money rounding. */
export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Live subtotal/gst/total from draft form lines (mirrors backend math). */
export function computeTotals(lines = []) {
  let subtotal = 0;
  for (const ln of Array.isArray(lines) ? lines : []) {
    const qty = Number(ln.quantity);
    const price = Number(ln.unit_price);
    subtotal = round2(subtotal + round2((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0)));
  }
  const gst = round2(subtotal * GST_RATE);
  return { subtotal, gst, total: round2(subtotal + gst) };
}

/** Outstanding (issued, unpaid) / paid / draft summary from a row set. */
export function summarize(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  let outstanding = 0;
  let paid = 0;
  let draftCount = 0;
  let sentCount = 0;
  for (const inv of list) {
    if (inv.status === INV_STATUS.SENT) { outstanding = round2(outstanding + Number(inv.total || 0)); sentCount += 1; }
    else if (inv.status === INV_STATUS.PAID) paid = round2(paid + Number(inv.total || 0));
    else if (inv.status === INV_STATUS.DRAFT) draftCount += 1;
  }
  return { outstanding, paid, draftCount, sentCount, total: list.length };
}

/** Validate a create form → { ok, error, payload }. */
export function buildCreatePayload(form = {}) {
  const rawLines = Array.isArray(form.lines) ? form.lines : [];
  const lines = rawLines
    .map((ln) => ({
      description: String(ln.description || '').trim(),
      quantity: Number(ln.quantity),
      unit_price: Number(ln.unit_price),
    }))
    .filter((ln) => ln.description.length > 0);

  if (lines.length === 0) {
    return { ok: false, error: 'Add at least one item with a description.' };
  }
  for (const ln of lines) {
    if (!Number.isFinite(ln.quantity) || ln.quantity <= 0) {
      return { ok: false, error: `Enter a quantity greater than 0 for "${ln.description}".` };
    }
    if (!Number.isFinite(ln.unit_price) || ln.unit_price < 0) {
      return { ok: false, error: `Enter a valid unit price for "${ln.description}".` };
    }
  }

  const payload = {
    issue_date: new Date().toISOString(),
    lines: lines.map((ln) => ({
      description: ln.description,
      quantity: round2(ln.quantity),
      unit_price: round2(ln.unit_price),
    })),
  };
  const name = String(form.customer_name || '').trim();
  const notes = String(form.notes || '').trim();
  if (name) payload.customer_name = name;
  if (notes) payload.notes = notes;
  return { ok: true, payload };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useInvoicing() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: INV_KEYS.list(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/accounting/invoices', { params: { outlet_id: outletId, limit: 200 } });
      // sendSuccess → body { success, data: rows[], message }; api unwraps to body.
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      return rows;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: INV_KEYS.list(outletId) });

  const createMut = useMutation({
    mutationFn: (payload) => api.post('/accounting/invoices', { outlet_id: outletId, ...payload }),
    onSuccess: invalidate,
  });

  const issueMut = useMutation({
    mutationFn: (id) => api.post(`/accounting/invoices/${id}/issue`, { outlet_id: outletId }),
    onSuccess: invalidate,
  });

  const markPaidMut = useMutation({
    mutationFn: ({ id, method }) => api.post(`/accounting/invoices/${id}/mark-paid`, { outlet_id: outletId, method: method || 'bank' }),
    onSuccess: invalidate,
  });

  const voidMut = useMutation({
    mutationFn: (id) => api.post(`/accounting/invoices/${id}/void`, { outlet_id: outletId }),
    onSuccess: invalidate,
  });

  const rows = listQuery.data || [];

  return {
    outletId,
    rows,
    stats: summarize(rows),
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    isRefetching: listQuery.isRefetching,
    refetch: () => listQuery.refetch(),
    createInvoice: (payload) => createMut.mutateAsync(payload),
    isCreating: createMut.isPending,
    issueInvoice: (id) => issueMut.mutateAsync(id),
    isIssuing: issueMut.isPending,
    markPaid: (id, method) => markPaidMut.mutateAsync({ id, method }),
    isMarkingPaid: markPaidMut.isPending,
    voidInvoice: (id) => voidMut.mutateAsync(id),
    isVoiding: voidMut.isPending,
    hasOutlet: !!outletId,
  };
}
