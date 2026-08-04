/**
 * usePrepTime — data layer for the "Prep Time" KDS analytics screen (mobile).
 *
 * Kitchen-cook-time intelligence for the SELECTED outlet: average KOT prep time,
 * fastest / slowest tickets, per-station stats, per-item averages and SLA
 * compliance. Read-only. Every request is outlet-scoped — the backend's
 * enforceOutletScope needs outlet_id and an owner's user.outlet_id is often null,
 * so we ALWAYS pass it explicitly as a query param.
 *
 * Endpoint (backend orders/kot.routes → prep-analytics.service):
 *   GET /kitchen/analytics/full?outlet_id=&from=&to=
 *     → { summary, stations, items, sla, heatmap, trend }
 *   summary: { total_kots, avg_secs, avg_fmt, fastest_secs, slowest_secs, fastest_fmt, slowest_fmt }
 *   stations[]: { station, kots_completed, items_processed, avg_total_fmt, avg_cook_fmt, ... }
 *   items[]:    { name, station, count, avg_secs, min_fmt, max_fmt, avg_fmt } (sorted slowest→fastest)
 *   sla[]:      { station, sla_target_fmt, total, within_sla, breached, compliance_pct }
 *
 * Pure helpers (range/format/station meta) are unit-testable — no React, no network.
 */
import { useQuery } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Preset → number of days back. */
export const RANGE_DAYS = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
export const RANGE_OPTIONS = ['1d', '7d', '30d', '90d'];

/** Station display metadata (Ionicons name + tone). */
export const STATION_META = {
  KITCHEN: { label: 'Kitchen', icon: 'restaurant-outline', color: '#f97316' },
  BAR:     { label: 'Bar',     icon: 'wine-outline',       color: '#a855f7' },
  DESSERT: { label: 'Dessert', icon: 'ice-cream-outline',  color: '#ec4899' },
  PACKING: { label: 'Packing', icon: 'cube-outline',       color: '#14b8a6' },
  DEFAULT: { label: 'Other',   icon: 'flame-outline',      color: '#6366f1' },
};

// ─── Pure helpers (unit-testable) ───────────────────────────────────────────

/** Seconds → "Xm Ys" (mirrors backend fmtSecs). */
export function fmtSecs(secs) {
  const n = Number(secs);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Metadata for a station key, tolerant of unknowns. */
export function stationMeta(station) {
  return STATION_META[station] || STATION_META.DEFAULT;
}

/** Preset (e.g. '7d') → { from, to } as YYYY-MM-DD strings. */
export function rangeToDates(range, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const days = RANGE_DAYS[range] || 7;
  const f = new Date(now);
  f.setDate(f.getDate() - days);
  return { from: f.toISOString().slice(0, 10), to };
}

/** Colour for an SLA compliance percentage. */
export function slaColor(pct) {
  const n = Number(pct) || 0;
  if (n >= 90) return '#22c55e';
  if (n >= 70) return '#f59e0b';
  return '#ef4444';
}

/** Top N slowest items (backend already sorts slowest→fastest). */
export function slowestItems(items = [], n = 5) {
  return (Array.isArray(items) ? items : []).slice(0, n);
}

/** Top N fastest items (ascending by avg_secs). */
export function fastestItems(items = [], n = 5) {
  return [...(Array.isArray(items) ? items : [])]
    .sort((a, b) => (a.avg_secs || 0) - (b.avg_secs || 0))
    .slice(0, n);
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePrepTime(range = '7d') {
  const { outletId, currentOutlet } = useOutlet();
  const { from, to } = rangeToDates(range);

  const query = useQuery({
    queryKey: ['prep-time', outletId, from, to],
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      // api interceptor unwraps to the response BODY: { success, data, message }.
      const res = await api.get('/kitchen/analytics/full', {
        params: { outlet_id: outletId, from, to },
      });
      const data = res?.data || {};
      return {
        summary:  data.summary  || {},
        stations: Array.isArray(data.stations) ? data.stations : [],
        items:    Array.isArray(data.items)    ? data.items    : [],
        sla:      Array.isArray(data.sla)       ? data.sla      : [],
        trend:    Array.isArray(data.trend)     ? data.trend    : [],
      };
    },
  });

  const d = query.data || {};

  return {
    outletId,
    outletName: currentOutlet?.name || 'Selected outlet',
    summary:  d.summary  || {},
    stations: d.stations || [],
    items:    d.items    || [],
    sla:      d.sla      || [],
    trend:    d.trend    || [],
    from,
    to,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    hasOutlet: !!outletId,
  };
}
