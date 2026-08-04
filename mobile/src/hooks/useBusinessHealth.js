/**
 * useBusinessHealth — data layer for the "Business Health" screen (mobile).
 *
 * Combined performance analytics: Square payments × Xero financials for the
 * SELECTED outlet. The backend computes true net profit, margins, card-fee
 * leakage, cash forecast, payment mix, top items, insights, reconciliation and
 * a daily gross-sales trend. Every request is outlet-scoped — the endpoint
 * resolves the outlet from `outlet_id` and an owner's user.outlet_id is often
 * null, so we ALWAYS pass it explicitly.
 *
 * Endpoints (backend modules/performance/performance.routes):
 *   GET  /performance/health?outlet_id=&from=&to=  → health snapshot object
 *   POST /performance/refresh?outlet_id=           → force a Square pull (last 30d)
 *
 * The mobile api interceptor unwraps the response to the BODY
 * ({ success, data, message }), so the snapshot itself lives at `.data`.
 *
 * Pure helpers (range / formatting / status) are self-contained — no React,
 * no network — so they can be reasoned about (and unit-tested) in isolation.
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

const BH_KEYS = {
  health: (outletId, from, to) => ['business-health', outletId, from, to],
};

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** ISO (YYYY-MM-DD) date `days` ago from today. */
export function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days || 0));
  return d.toISOString().split('T')[0];
}

/** Today as an ISO (YYYY-MM-DD) date. */
export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** { from, to } window for a range in days (7/30/90). */
export function computeRange(rangeDays) {
  return { from: isoDaysAgo(rangeDays), to: todayISO() };
}

/** Percentage label, tolerant of null/NaN. */
export function pct(n) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

/** Whole-number label, tolerant of null/NaN. */
export function num(n) {
  return (Number(n) || 0).toLocaleString('en-AU');
}

/**
 * Derive a plain-language health status from the net margin. Thresholds mirror
 * the backend's own insight rules (margin > 18% is flagged "healthy"), so this
 * is a presentation of real figures — not an invented score.
 * @returns {{ label:string, tone:'good'|'ok'|'watch' }}
 */
export function healthStatus(marginPct) {
  const m = Number(marginPct);
  if (!Number.isFinite(m)) return { label: 'No data', tone: 'watch' };
  if (m >= 18) return { label: 'Healthy', tone: 'good' };
  if (m >= 8) return { label: 'Steady', tone: 'ok' };
  return { label: 'Needs attention', tone: 'watch' };
}

/** Short date label (e.g. "4 Aug") from an ISO string. */
export function shortDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? String(s)
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * @param {number} rangeDays  7 | 30 | 90 — the lookback window.
 */
export function useBusinessHealth(rangeDays = 30) {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const { from, to } = useMemo(() => computeRange(rangeDays), [rangeDays]);

  const healthQuery = useQuery({
    queryKey: BH_KEYS.health(outletId, from, to),
    enabled: !!outletId,
    staleTime: 120_000,
    queryFn: async () => {
      // api unwraps to the body { success, data, message }; snapshot is `.data`.
      const res = await api.get('/performance/health', {
        params: { outlet_id: outletId, from, to },
      });
      return res?.data || {};
    },
  });

  const refreshMut = useMutation({
    mutationFn: () => api.post('/performance/refresh', {}, { params: { outlet_id: outletId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-health', outletId] });
    },
  });

  const health = healthQuery.data || {};
  const availability = health.data_availability || {};

  return {
    outletId,
    from,
    to,
    health,
    period: health.period || null,
    currency: health.currency || 'AUD',
    headline: health.headline || '',
    squareConnected: !!availability.square_connected,
    xeroConnected: !!availability.xero_connected,
    square: health.square || {},
    xero: health.xero || null,
    kpis: health.kpis || {},
    reconciliation: health.reconciliation || null,
    operations: health.operations || {},
    alerts: Array.isArray(health.alerts) ? health.alerts : [],
    trends: Array.isArray(health.trends) ? health.trends : [],
    isLoading: healthQuery.isLoading,
    isError: healthQuery.isError,
    isRefetching: healthQuery.isRefetching,
    refetch: () => healthQuery.refetch(),
    refresh: () => refreshMut.mutateAsync(),
    isRefreshing: refreshMut.isPending,
    hasOutlet: !!outletId,
  };
}
