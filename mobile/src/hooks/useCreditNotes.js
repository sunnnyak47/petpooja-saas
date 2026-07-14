/**
 * useCreditNotes — data layer for the "Refunds & credits" screen (mobile).
 *
 * Credit notes are the GST document for refunds / returns / adjustments. This
 * hook lists them for the SELECTED outlet, exposes issued/value summary stats,
 * and issues (create) + cancels notes. Every request is outlet-scoped — the
 * backend's enforceOutletScope needs outlet_id, and an owner's user.outlet_id is
 * often null, so we ALWAYS pass it explicitly (query for reads, body for writes).
 *
 * Endpoints (backend financial-docs/creditnote.*):
 *   GET  /credit-notes?outlet_id=&limit=      → { data: rows[], meta:{ total } }
 *   GET  /credit-notes/stats?outlet_id=        → { count, total_amount, tax_amount, currency }
 *   POST /credit-notes                         → issue (needs lines OR total_amount>0) · MANAGE_PAYMENTS
 *   POST /credit-notes/:id/cancel  { reason }  → cancel an 'issued' note · MANAGE_PAYMENTS
 *
 * Pure helpers (filtering / formatting) are unit-tested — no React, no network.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

export const CN_STATUS = { ISSUED: 'issued', CANCELLED: 'cancelled' };

const CN_KEYS = {
  list: (outletId) => ['credit-notes', outletId],
  stats: (outletId) => ['credit-notes-stats', outletId],
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** The display number for a note, tolerant of field-name drift. */
export function creditNoteNumber(note = {}) {
  return String(note.credit_note_no ?? note.credit_note_number ?? note.number ?? note.id ?? '');
}

/** Free-text match over number / customer / reason. Blank query matches all. */
export function matchesCreditNote(note = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [creditNoteNumber(note), note.customer_name, note.reason]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

/** Client-side filter by status ('all'|'issued'|'cancelled') + query. */
export function filterCreditNotes(rows = [], { q = '', status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(
    (n) => (status === 'all' || n.status === status) && matchesCreditNote(n, q)
  );
}

/** Currency-aware money formatter (per-note currency; AUD/INR aware). */
export function formatMoney(currency, amount) {
  const cur = currency || 'AUD';
  const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch (_) {
    return `${cur} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

/** Issued / cancelled / total counts from a row set. */
export function summarizeCounts(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const issued = list.filter((n) => n.status === CN_STATUS.ISSUED).length;
  const cancelled = list.filter((n) => n.status === CN_STATUS.CANCELLED).length;
  return { issued, cancelled, total: list.length };
}

/** Validate a create form before hitting the network → { ok, error, payload }. */
export function buildCreatePayload(form = {}) {
  const amount = Number(form.total_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter a refund amount greater than 0.' };
  }
  const payload = { total_amount: Math.round(amount * 100) / 100 };
  const reason = String(form.reason || '').trim();
  const name = String(form.customer_name || '').trim();
  const phone = String(form.customer_phone || '').trim();
  if (reason) payload.reason = reason;
  if (name) payload.customer_name = name;
  if (phone) payload.customer_phone = phone;
  return { ok: true, payload };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCreditNotes() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: CN_KEYS.list(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/credit-notes', { params: { outlet_id: outletId, limit: 200 } });
      // sendPaginated → body { data: rows[], meta:{ total } }; api unwraps to body.
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const total = res?.meta?.total ?? rows.length;
      return { rows, total };
    },
  });

  const statsQuery = useQuery({
    queryKey: CN_KEYS.stats(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/credit-notes/stats', { params: { outlet_id: outletId } });
      return res?.data || { count: 0, total_amount: 0, tax_amount: 0, currency: 'AUD' };
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: CN_KEYS.list(outletId) });
    qc.invalidateQueries({ queryKey: CN_KEYS.stats(outletId) });
  };

  const createMut = useMutation({
    mutationFn: (payload) => api.post('/credit-notes', { outlet_id: outletId, ...payload }),
    onSuccess: invalidate,
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/credit-notes/${id}/cancel`, { outlet_id: outletId, reason }),
    onSuccess: invalidate,
  });

  return {
    outletId,
    rows: listQuery.data?.rows || [],
    total: listQuery.data?.total || 0,
    stats: statsQuery.data || { count: 0, total_amount: 0, currency: 'AUD' },
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    isRefetching: listQuery.isRefetching || statsQuery.isRefetching,
    refetch: () => { listQuery.refetch(); statsQuery.refetch(); },
    createNote: (payload) => createMut.mutateAsync(payload),
    isCreating: createMut.isPending,
    cancelNote: (id, reason) => cancelMut.mutateAsync({ id, reason }),
    isCancelling: cancelMut.isPending,
    hasOutlet: !!outletId,
  };
}
