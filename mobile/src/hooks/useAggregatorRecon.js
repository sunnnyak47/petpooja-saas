/**
 * useAggregatorRecon — "Delivery payouts" reconciliation data layer.
 *
 * Backend (existing):
 *   GET  /api/aggregator-reconciliation/commission-report
 *        ?outlet_id=&from=&to=&platform=
 *        → { rows: [{ platform, platform_name, order_count, gross,
 *                     commission_pct, commission_amount, net_payout }],
 *            totals: { order_count, gross, commission_amount, net_payout } }
 *        (grouped per delivery platform: gross sales, the commission the
 *         aggregator takes, and the EXPECTED net payout).
 *
 *   POST /api/aggregator-reconciliation/payout-to-settlement
 *        { outlet_id, platform, from, to, reference }
 *        → creates a reconcilable Settlement from that platform's payout
 *          (requires MANAGE_PAYMENTS). We surface this as a per-platform
 *          "Reconcile → Settlement" action.
 *
 * The commission report gives the EXPECTED net payout. When the payload also
 * carries a received amount (received / net_received / payout_received / …) we
 * compute the discrepancy and a matched / short-paid / over-paid status; when it
 * doesn't, the row reads "Awaiting payout" (pending). This keeps the screen
 * honest against the current API while remaining ready for a received signal.
 *
 * All money math here is pure numbers — the screen formats with useCurrency so
 * the SELECTED outlet's own symbol (AU $ / IN ₹) is applied. EVERY fetch is
 * scoped to the selected outlet via useOutlet().outletId.
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

// ─── Query keys ───────────────────────────────────────────────────────────────
export const RECON_KEYS = {
  report: (outletId, range, platform) => [
    'aggregator-recon',
    outletId || 'none',
    range || '30d',
    platform || 'all',
  ],
};

// ─── Date-range presets ────────────────────────────────────────────────────────
export const RANGE_OPTIONS = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

// ─── Platform filter options + display meta ────────────────────────────────────
export const PLATFORM_META = {
  swiggy: { icon: 'fast-food', hue: '#fc8019' },
  zomato: { icon: 'restaurant', hue: '#e23744' },
  doordash: { icon: 'bicycle', hue: '#ff3008' },
  menulog: { icon: 'pizza', hue: '#ff8000' },
  uber_eats: { icon: 'car', hue: '#06c167' },
};

export const PLATFORM_FILTERS = [
  { key: null, label: 'All platforms' },
  { key: 'swiggy', label: 'Swiggy' },
  { key: 'zomato', label: 'Zomato' },
  { key: 'uber_eats', label: 'Uber Eats' },
  { key: 'doordash', label: 'DoorDash' },
  { key: 'menulog', label: 'Menulog' },
];

// ─── Sort modes ────────────────────────────────────────────────────────────────
export const SORT_MODES = {
  PAYOUT: 'net_payout',
  GROSS: 'gross',
  COMMISSION: 'commission_amount',
};

// ─── Reconciliation status meta (colors resolved in the screen via `tone`) ─────
export const STATUS_META = {
  pending: { label: 'Awaiting payout', tone: 'muted' },
  matched: { label: 'Matched', tone: 'success' },
  short: { label: 'Short-paid', tone: 'error' },
  over: { label: 'Over-paid', tone: 'warning' },
};

// ─── Pure helpers (unit-tested) ────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Round a numeric-ish value to 2 dp (mirrors the backend's round2). */
export function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** First value that is neither undefined nor null (empty string counts as set). */
function firstDefined(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

/** Title-case a platform key ("uber_eats" → "Uber Eats"). */
export function titleCasePlatform(key) {
  return (
    String(key || '')
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Unknown'
  );
}

/** Icon + hue for a platform key (falls back to a generic storefront). */
export function platformMeta(platform) {
  return PLATFORM_META[String(platform || '').toLowerCase()] || { icon: 'storefront', hue: null };
}

/**
 * Convert a range preset key into { from, to } ISO (yyyy-mm-dd) query params.
 * 'all' (or unknown) → {} so the backend applies no date bound.
 * @param {string} rangeKey
 * @param {Date} [now] injectable clock for deterministic tests
 * @returns {{from?:string,to?:string}}
 */
export function rangeToParams(rangeKey, now = new Date()) {
  const opt = RANGE_OPTIONS.find((r) => r.key === rangeKey);
  if (!opt || opt.days == null) return {};
  const toISODate = (d) => d.toISOString().slice(0, 10);
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - opt.days);
  return { from: toISODate(from), to: toISODate(to) };
}

/**
 * Normalize one raw commission-report row into the shape the screen consumes.
 * Tolerant of `aggregator` (raw order field) as an alias for `platform`, and
 * passes through any received-amount signal for reconciliation.
 * @param {object} raw
 */
export function normalizePlatformRow(raw = {}) {
  const platform = String(raw.platform || raw.aggregator || 'unknown').toLowerCase();
  return {
    platform,
    platform_name: raw.platform_name || titleCasePlatform(platform),
    order_count: num(raw.order_count),
    gross: round2(raw.gross),
    commission_pct: num(raw.commission_pct),
    commission_amount: round2(raw.commission_amount),
    net_payout: round2(raw.net_payout),
    received: firstDefined(
      raw.received,
      raw.net_received,
      raw.payout_received,
      raw.amount_received,
      raw.received_amount
    ),
  };
}

/**
 * Reconciliation status for a row: compares the received amount (if any) against
 * the expected net payout. No received signal → 'pending'.
 * @param {object} row normalized row
 * @returns {{key:'pending'|'matched'|'short'|'over',received:number|null,discrepancy:number}}
 */
export function reconcileStatus(row = {}) {
  const expected = round2(row.net_payout);
  const rawReceived = firstDefined(
    row.received,
    row.net_received,
    row.payout_received,
    row.amount_received,
    row.received_amount
  );
  if (rawReceived === undefined || rawReceived === null || rawReceived === '') {
    return { key: 'pending', received: null, discrepancy: 0 };
  }
  const received = round2(rawReceived);
  const discrepancy = round2(received - expected);
  let key = 'matched';
  if (discrepancy < -0.009) key = 'short';
  else if (discrepancy > 0.009) key = 'over';
  return { key, received, discrepancy };
}

/**
 * Roll normalized rows into header totals. Recomputed locally (rather than
 * trusting the payload's totals) so received/discrepancy are always included.
 * @param {Array} rows
 */
export function computeTotals(rows = []) {
  return rows.reduce(
    (acc, r) => {
      acc.order_count += num(r.order_count);
      acc.platform_count += 1;
      acc.gross = round2(acc.gross + num(r.gross));
      acc.commission_amount = round2(acc.commission_amount + num(r.commission_amount));
      acc.net_payout = round2(acc.net_payout + num(r.net_payout));
      const st = reconcileStatus(r);
      if (st.received != null) {
        acc.received = round2(acc.received + st.received);
        acc.discrepancy = round2(acc.discrepancy + st.discrepancy);
        acc.reconciled_count += 1;
        if (st.key === 'short') acc.short_count += 1;
      }
      return acc;
    },
    {
      order_count: 0,
      platform_count: 0,
      gross: 0,
      commission_amount: 0,
      net_payout: 0,
      received: 0,
      discrepancy: 0,
      reconciled_count: 0,
      short_count: 0,
    }
  );
}

/**
 * Normalize the full commission-report payload into { rows, totals }.
 * @param {object} data
 */
export function normalizeReport(data = {}) {
  const rawRows = Array.isArray(data?.rows) ? data.rows : [];
  const rows = rawRows.map(normalizePlatformRow);
  return { rows, totals: computeTotals(rows) };
}

/**
 * Sort rows by the active metric (desc). Ties break on gross so order is stable.
 * @param {Array} rows
 * @param {string} mode one of SORT_MODES
 */
export function sortRows(rows = [], mode = SORT_MODES.PAYOUT) {
  const valid = [SORT_MODES.PAYOUT, SORT_MODES.GROSS, SORT_MODES.COMMISSION];
  const key = valid.includes(mode) ? mode : SORT_MODES.PAYOUT;
  return rows.slice().sort((a, b) => {
    const primary = num(b[key]) - num(a[key]);
    if (primary !== 0) return primary;
    return num(b.gross) - num(a.gross);
  });
}

// ─── React-query hook ──────────────────────────────────────────────────────────

const EMPTY_ROWS = [];

/**
 * Fetch + shape aggregator reconciliation for the selected outlet, plus the
 * per-platform "convert payout to settlement" mutation.
 * @param {{range?:string, platform?:string|null, sortMode?:string}} [opts]
 */
export function useAggregatorRecon({ range = '30d', platform = null, sortMode = SORT_MODES.PAYOUT } = {}) {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const params = useMemo(() => rangeToParams(range), [range]);

  const query = useQuery({
    queryKey: RECON_KEYS.report(outletId, range, platform),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/aggregator-reconciliation/commission-report', {
        params: {
          outlet_id: outletId,
          ...params,
          ...(platform ? { platform } : {}),
        },
      });
      const data = res?.data ?? res;
      return normalizeReport(data || {});
    },
  });

  const rows = useMemo(
    () => sortRows(query.data?.rows || EMPTY_ROWS, sortMode),
    [query.data, sortMode]
  );
  const totals = query.data?.totals || computeTotals(EMPTY_ROWS);

  const reconcileMutation = useMutation({
    mutationFn: (vars = {}) =>
      api.post('/aggregator-reconciliation/payout-to-settlement', {
        outlet_id: outletId,
        platform: vars.platform,
        ...params,
        reference: vars.reference,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECON_KEYS.report(outletId, range, platform) });
    },
  });

  return {
    rows,
    totals,
    range,
    platform,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    hasOutlet: !!outletId,
    // per-platform reconcile → settlement
    reconcile: (vars) => reconcileMutation.mutateAsync(vars),
    isReconciling: reconcileMutation.isPending,
    reconcilingPlatform: reconcileMutation.isPending
      ? reconcileMutation.variables?.platform ?? null
      : null,
  };
}
