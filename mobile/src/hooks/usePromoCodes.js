/**
 * usePromoCodes — data layer for the "Promo codes" screen (mobile).
 *
 * SaaS subscription promo codes (platform-level discount codes applied at plan
 * checkout — TRIAL / STARTER / PRO / ENTERPRISE), NOT the outlet-level offers &
 * discounts shown on offers.jsx (those hit /discounts). These are managed by
 * super-admins and stored globally, so this hook is NOT outlet-scoped.
 *
 * Endpoints (backend superadmin/services/promos.service via superadmin routes):
 *   GET    /superadmin/promo-codes                 → { success, data: promo[] }
 *   POST   /superadmin/promo-codes                 → create (needs sa.promos.manage)
 *   PATCH  /superadmin/promo-codes/:id             → update (is_active, value, …)
 *   DELETE /superadmin/promo-codes/:id             → remove
 *
 * A promo shape: { id, code, discount_type:'PERCENT'|'FLAT', discount_value,
 *   applicable_plans:[], max_uses|null, used_count, valid_from, valid_until|null,
 *   description, is_active, created_at }.
 *
 * Pure helpers (filtering / labelling / payload building) are exported for unit
 * tests — no React, no network.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const PLANS = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];
export const DISCOUNT_TYPES = ['PERCENT', 'FLAT'];

const PC_KEY = ['promo-codes'];

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Human label for a promo's discount, e.g. "10% off" or "$15 off". */
export function discountLabel(promo = {}, symbol = '$') {
  const v = Number(promo.discount_value) || 0;
  return promo.discount_type === 'PERCENT' ? `${v}% off` : `${symbol}${v} off`;
}

/** A code has expired once its valid_until date is in the past. */
export function isExpired(promo = {}) {
  return !!promo.valid_until && new Date(promo.valid_until) < new Date();
}

/** A code is maxed out once its used_count reaches its (finite) max_uses. */
export function isMaxedOut(promo = {}) {
  return !!promo.max_uses && (Number(promo.used_count) || 0) >= Number(promo.max_uses);
}

/** Derived lifecycle: 'inactive' | 'expired' | 'maxed' | 'active'. */
export function promoStatus(promo = {}) {
  if (!promo.is_active) return 'inactive';
  if (isExpired(promo)) return 'expired';
  if (isMaxedOut(promo)) return 'maxed';
  return 'active';
}

/** Free-text match over code / description. Blank query matches all. */
export function matchesPromo(promo = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [promo.code, promo.description].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(s);
}

/** Client-side filter by status ('all'|'active'|'inactive') + query. */
export function filterPromos(rows = [], { q = '', status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((p) => {
    if (status === 'active' && !p.is_active) return false;
    if (status === 'inactive' && p.is_active) return false;
    return matchesPromo(p, q);
  });
}

/** Headline counts from a row set. */
export function summarizePromos(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const active = list.filter((p) => p.is_active).length;
  const uses = list.reduce((sum, p) => sum + (Number(p.used_count) || 0), 0);
  return { total: list.length, active, uses };
}

/** Validate + shape a create form → { ok, error, payload }. */
export function buildCreatePayload(form = {}) {
  const code = String(form.code || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Enter a promo code.' };
  if (code.length > 20) return { ok: false, error: 'Code must be 20 characters or fewer.' };

  const type = form.discount_type === 'FLAT' ? 'FLAT' : 'PERCENT';
  const value = Number(form.discount_value);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: 'Enter a discount value greater than 0.' };
  }
  if (type === 'PERCENT' && value > 100) {
    return { ok: false, error: 'A percentage discount cannot exceed 100%.' };
  }

  const plans = Array.isArray(form.applicable_plans) ? form.applicable_plans : [];
  if (plans.length === 0) return { ok: false, error: 'Pick at least one plan.' };

  const payload = {
    code,
    discount_type: type,
    discount_value: value,
    applicable_plans: plans,
  };
  const desc = String(form.description || '').trim();
  if (desc) payload.description = desc;
  const maxUses = Number(form.max_uses);
  if (Number.isFinite(maxUses) && maxUses > 0) payload.max_uses = Math.floor(maxUses);
  const until = String(form.valid_until || '').trim();
  if (until) payload.valid_until = until;
  return { ok: true, payload };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePromoCodes() {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: PC_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/superadmin/promo-codes');
      // sendSuccess → body { success, data: promo[] }; api unwraps to body.
      return Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: PC_KEY });

  const createMut = useMutation({
    mutationFn: (payload) => api.post('/superadmin/promo-codes', payload),
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/superadmin/promo-codes/${id}`, data),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/superadmin/promo-codes/${id}`),
    onSuccess: invalidate,
  });

  const rows = listQuery.data || [];

  return {
    rows,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    isRefetching: listQuery.isRefetching,
    refetch: () => listQuery.refetch(),
    createPromo: (payload) => createMut.mutateAsync(payload),
    isCreating: createMut.isPending,
    updatePromo: (id, data) => updateMut.mutateAsync({ id, data }),
    isUpdating: updateMut.isPending,
    toggleActive: (promo) => updateMut.mutateAsync({ id: promo.id, data: { is_active: !promo.is_active } }),
    deletePromo: (id) => deleteMut.mutateAsync(id),
    isDeleting: deleteMut.isPending,
  };
}
