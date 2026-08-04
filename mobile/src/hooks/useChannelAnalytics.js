/**
 * useChannelAnalytics — data layer for the "Channel Analytics" screen (mobile).
 *
 * Breaks the SELECTED outlet's sales down by channel — every delivery aggregator
 * (Uber Eats / DoorDash / Menulog / Swiggy / Zomato) plus Dine-in, QR, Takeaway
 * and Direct/Online — with per-channel orders / gross / AOV / cancel-rate / prep /
 * commission / net, a top-items list (optionally scoped to one channel) and a
 * daily gross trend. Read-only.
 *
 * Every request is outlet-scoped: the backend's enforceOutletScope needs an
 * outlet_id, and an owner's user.outlet_id is often null, so we ALWAYS pass the
 * selected outlet id explicitly as a query param.
 *
 * Endpoints (backend integrations/channel-analytics.*), mounted at
 * /api/channel-analytics — the mobile api interceptor unwraps to the response
 * BODY, so `res.data` below is already the payload:
 *   GET /channel-analytics/summary?outlet_id=&from=&to=
 *     → { rows: [{ channel, label, orders, gross, aov, cancelled, cancel_rate,
 *                  avg_prep_min, commission_pct, commission_amount, net }],
 *         totals: { orders, gross, commission_amount, net } }
 *   GET /channel-analytics/top-items?outlet_id=&from=&to=&channel=
 *     → [{ name, qty, revenue }]
 *   GET /channel-analytics/trend?outlet_id=&from=&to=
 *     → { days: ['YYYY-MM-DD'...], series: { '<channel>': [n...] } }
 *
 * Pure helpers (ranges / colours / trend math) are React-free and network-free.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Selectable look-back windows for the header chips. */
export const CA_RANGES = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
];

export const CA_DEFAULT_RANGE = '30d';

/** Stable per-channel accent colour, keyed by the backend's normalized channel key. */
const CHANNEL_COLORS = {
  uber_eats: '#06c167',
  doordash: '#ff3008',
  deliveroo: '#00ccbc',
  menulog: '#ff8000',
  swiggy: '#fc8019',
  zomato: '#e23744',
  dine_in: '#6366f1',
  qr: '#8b5cf6',
  takeaway: '#0ea5e9',
  direct: '#14b8a6',
};
const FALLBACK_PALETTE = ['#6366f1', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#64748b'];

const CA_KEYS = {
  summary: (o, from, to) => ['channel-analytics', 'summary', o || 'none', from, to],
  trend: (o, from, to) => ['channel-analytics', 'trend', o || 'none', from, to],
  items: (o, from, to, ch) => ['channel-analytics', 'top-items', o || 'none', from, to, ch || 'all'],
};

// ─── Pure helpers (unit-testable) ─────────────────────────────────────────────

/** Coerce anything number-ish to a finite JS number (0 otherwise). */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Format a Date (or ms) as a local YYYY-MM-DD day bucket. */
export function isoDay(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Turn a range key ('7d'|'30d'|'90d') into an inclusive { from, to } day pair. */
export function rangeToDates(key = CA_DEFAULT_RANGE, now = new Date()) {
  const found = CA_RANGES.find((r) => r.key === key) || CA_RANGES[1];
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (found.days - 1));
  return { from: isoDay(from), to: isoDay(to), days: found.days };
}

/** Resolve a channel key to its accent colour (hashed fallback for unknown keys). */
export function channelColor(channel) {
  const key = String(channel || '').toLowerCase();
  if (CHANNEL_COLORS[key]) return CHANNEL_COLORS[key];
  const clean = key.replace(/[^a-z]/g, '');
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

/** First letter of a label (or channel key) for the channel monogram. */
export function monogram(label) {
  return String(label || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Rows sorted by gross descending (defensive copy). */
export function sortRowsByGross(rows = []) {
  return (Array.isArray(rows) ? [...rows] : []).sort((a, b) => num(b.gross) - num(a.gross));
}

/**
 * Collapse a { days, series } trend into a per-day total across all channels,
 * plus peak / period-total summary numbers for the strip.
 * @returns {{ days: string[], totals: number[], peak: number, sum: number, max: number }}
 */
export function dailyTotals(trend = {}) {
  const days = Array.isArray(trend.days) ? trend.days : [];
  const series = trend.series && typeof trend.series === 'object' ? trend.series : {};
  const totals = days.map((_, idx) =>
    Object.values(series).reduce((s, arr) => s + num(Array.isArray(arr) ? arr[idx] : 0), 0)
  );
  const peak = totals.reduce((a, b) => Math.max(a, b), 0);
  const sum = totals.reduce((a, b) => a + b, 0);
  return { days, totals, peak, sum, max: Math.max(1, peak) };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChannelAnalytics() {
  const { outletId } = useOutlet();
  const [rangeKey, setRangeKey] = useState(CA_DEFAULT_RANGE);
  const [channel, setChannel] = useState('all'); // top-items scope

  const { from, to } = useMemo(() => rangeToDates(rangeKey), [rangeKey]);

  const summaryQ = useQuery({
    queryKey: CA_KEYS.summary(outletId, from, to),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/channel-analytics/summary', {
        params: { outlet_id: outletId, from, to },
      });
      const data = res?.data || res || {};
      return {
        rows: Array.isArray(data.rows) ? data.rows : [],
        totals: data.totals || { orders: 0, gross: 0, commission_amount: 0, net: 0 },
      };
    },
  });

  const trendQ = useQuery({
    queryKey: CA_KEYS.trend(outletId, from, to),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/channel-analytics/trend', {
        params: { outlet_id: outletId, from, to },
      });
      const data = res?.data || res || {};
      return { days: Array.isArray(data.days) ? data.days : [], series: data.series || {} };
    },
  });

  const itemsQ = useQuery({
    queryKey: CA_KEYS.items(outletId, from, to, channel),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/channel-analytics/top-items', {
        params: { outlet_id: outletId, from, to, channel: channel === 'all' ? undefined : channel },
      });
      const data = res?.data || res;
      return Array.isArray(data) ? data : [];
    },
  });

  const rows = useMemo(() => sortRowsByGross(summaryQ.data?.rows), [summaryQ.data]);
  const totals = summaryQ.data?.totals || { orders: 0, gross: 0, commission_amount: 0, net: 0 };

  return {
    outletId,
    hasOutlet: !!outletId,
    from,
    to,
    rangeKey,
    setRangeKey,
    channel,
    setChannel,

    rows,
    totals,
    trend: trendQ.data || { days: [], series: {} },
    topItems: itemsQ.data || [],

    isLoading: summaryQ.isLoading,
    isError: summaryQ.isError,
    isRefetching: summaryQ.isRefetching || trendQ.isRefetching || itemsQ.isRefetching,
    refetch: () => { summaryQ.refetch(); trendQ.refetch(); itemsQ.refetch(); },

    isTrendLoading: trendQ.isLoading,
    isTrendError: trendQ.isError,
    isItemsLoading: itemsQ.isLoading,
    isItemsError: itemsQ.isError,
  };
}
