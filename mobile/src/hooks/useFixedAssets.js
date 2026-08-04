/**
 * useFixedAssets — data layer for the "Fixed Assets" screen (mobile).
 *
 * The fixed-asset register + straight-line depreciation for the SELECTED outlet:
 * list assets with cost / accumulated depreciation / book value, add an asset,
 * dispose (soft) or delete one, and run the monthly depreciation batch for a
 * 'YYYY-MM' period. Every request is outlet-scoped — the backend falls back to
 * req.user.outlet_id which is often null for an owner, so we ALWAYS pass
 * outlet_id explicitly (query for reads, body for writes/deletes).
 *
 * Endpoints (backend modules/assets, mounted at /api/assets):
 *   GET    /assets/register?outlet_id=      → { assets: row[], totals:{ cost, accumulated_depreciation, book_value } }
 *   POST   /assets            { ...asset }   → create · MANAGE_INVENTORY
 *   PATCH  /assets/:id        { ...patch }   → update / dispose · MANAGE_INVENTORY
 *   DELETE /assets/:id                       → soft delete · MANAGE_INVENTORY
 *   POST   /assets/run-depreciation { period } → { period, assets_depreciated, total_amount } · MANAGE_INVENTORY
 *
 * A register row: { id, name, category, purchase_date, method, useful_life_months,
 *   is_disposed, cost, accumulated_depreciation, book_value }.
 *
 * Pure helpers (filtering / formatting / validation) are React- and network-free.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

const FA_KEYS = {
  register: (outletId) => ['fixed-assets-register', outletId],
};

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Currency-aware money formatter (AUD/INR aware; falls back gracefully). */
export function formatMoney(currency, amount) {
  const cur = currency || 'AUD';
  const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch (_) {
    return `${cur} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

/** Free-text match over name / category. Blank query matches all. */
export function matchesAsset(asset = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [asset.name, asset.category].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(s);
}

/** Client-side filter by status ('all'|'active'|'disposed') + query. */
export function filterAssets(rows = [], { q = '', status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((a) => {
    const disposed = !!a.is_disposed;
    if (status === 'active' && disposed) return false;
    if (status === 'disposed' && !disposed) return false;
    return matchesAsset(a, q);
  });
}

/** Active / disposed / total counts from a row set. */
export function summarizeAssets(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const disposed = list.filter((a) => a.is_disposed).length;
  return { active: list.length - disposed, disposed, total: list.length };
}

/** Fraction of an asset's cost already depreciated (0..1) — a rough progress bar. */
export function depreciationProgress(asset = {}) {
  const cost = Number(asset.cost) || 0;
  const accumulated = Number(asset.accumulated_depreciation) || 0;
  if (cost <= 0) return 0;
  const p = accumulated / cost;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** Human "useful life" label from a month count. */
export function usefulLifeLabel(months) {
  const m = parseInt(months, 10) || 0;
  if (m <= 0) return '—';
  if (m % 12 === 0) return `${m / 12} yr${m / 12 === 1 ? '' : 's'}`;
  return `${m} mo`;
}

/** Current calendar period as 'YYYY-MM' (default for the depreciation run). */
export function currentPeriod(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export function isValidPeriod(period) {
  return PERIOD_RE.test(String(period || '').trim());
}

/** Validate the add-asset form before hitting the network → { ok, error, payload }. */
export function buildCreatePayload(form = {}) {
  const name = String(form.name || '').trim();
  if (!name) return { ok: false, error: 'Give the asset a name.' };

  const cost = Number(form.cost);
  if (!Number.isFinite(cost) || cost <= 0) {
    return { ok: false, error: 'Enter a purchase cost greater than 0.' };
  }

  const date = String(form.purchase_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'Enter the purchase date as YYYY-MM-DD.' };
  }
  if (Number.isNaN(new Date(date).getTime())) {
    return { ok: false, error: 'That purchase date is not valid.' };
  }

  const life = parseInt(form.useful_life_months, 10);
  if (!Number.isFinite(life) || life < 1) {
    return { ok: false, error: 'Useful life must be at least 1 month.' };
  }

  const salvageRaw = String(form.salvage_value ?? '').trim();
  const salvage = salvageRaw === '' ? 0 : Number(salvageRaw);
  if (!Number.isFinite(salvage) || salvage < 0) {
    return { ok: false, error: 'Salvage value cannot be negative.' };
  }
  if (salvage >= cost) {
    return { ok: false, error: 'Salvage value must be less than the cost.' };
  }

  const payload = {
    name,
    purchase_date: date,
    cost: Math.round(cost * 100) / 100,
    salvage_value: Math.round(salvage * 100) / 100,
    useful_life_months: life,
    method: 'straight_line',
  };
  const category = String(form.category || '').trim();
  if (category) payload.category = category;
  return { ok: true, payload };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useFixedAssets() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const registerQuery = useQuery({
    queryKey: FA_KEYS.register(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/assets/register', { params: { outlet_id: outletId } });
      // api interceptor unwraps to the body { success, data, message }; payload is res.data.
      const payload = res?.data || res || {};
      const assets = Array.isArray(payload.assets) ? payload.assets : [];
      const totals = payload.totals || { cost: 0, accumulated_depreciation: 0, book_value: 0 };
      return { assets, totals };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: FA_KEYS.register(outletId) });

  const createMut = useMutation({
    mutationFn: (payload) => api.post('/assets', { outlet_id: outletId, ...payload }),
    onSuccess: invalidate,
  });

  const disposeMut = useMutation({
    mutationFn: (id) => api.patch(`/assets/${id}`, { outlet_id: outletId, is_disposed: true }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    // DELETE controller reads outlet_id from req.body → pass it via axios `data`.
    mutationFn: (id) => api.delete(`/assets/${id}`, { data: { outlet_id: outletId } }),
    onSuccess: invalidate,
  });

  const runDeprMut = useMutation({
    mutationFn: (period) => api.post('/assets/run-depreciation', { outlet_id: outletId, period }),
    onSuccess: invalidate,
  });

  return {
    outletId,
    assets: registerQuery.data?.assets || [],
    totals: registerQuery.data?.totals || { cost: 0, accumulated_depreciation: 0, book_value: 0 },
    isLoading: registerQuery.isLoading,
    isError: registerQuery.isError,
    isRefetching: registerQuery.isRefetching,
    refetch: () => registerQuery.refetch(),
    createAsset: (payload) => createMut.mutateAsync(payload),
    isCreating: createMut.isPending,
    disposeAsset: (id) => disposeMut.mutateAsync(id),
    isDisposing: disposeMut.isPending,
    deleteAsset: (id) => deleteMut.mutateAsync(id),
    isDeleting: deleteMut.isPending,
    runDepreciation: (period) => runDeprMut.mutateAsync(period),
    isRunning: runDeprMut.isPending,
    hasOutlet: !!outletId,
  };
}
