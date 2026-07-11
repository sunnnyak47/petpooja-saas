/**
 * useMultiBranch — owner cross-outlet ("Manage all outlets") data layer.
 *
 * Wraps the Head Office endpoints:
 *   GET /ho/outlets            → every outlet enriched with today_orders,
 *                                today_revenue, active_orders, currency, country,
 *                                is_active/status.
 *   GET /ho/outlet-comparison  → cross-outlet revenue comparison (date range).
 *   GET /ho/outlets/:id        → a single outlet's detail + KPIs.
 *
 * CRITICAL currency rule: revenue MUST be shown in EACH outlet's OWN currency.
 * An AU branch renders $, an IN branch ₹. NEVER sum a mixed-currency list into a
 * single number — group by currency and show per-currency totals instead. The
 * pure transforms below (exported for tests) enforce that.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';
import { getCurrencyConfigForOutlet, fmtFull } from '../utils/currency';

// ─── Query keys ───────────────────────────────────────────────────────────────
export const MB_KEYS = {
  outlets: (scope) => ['ho', 'outlets', scope || 'all'],
  comparison: (scope, from, to) => ['ho', 'outlet-comparison', scope || 'all', from, to],
  outlet: (id) => ['ho', 'outlet', id],
};

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

/**
 * Resolve an outlet's currency config (symbol/region/currency/locale).
 * Follows the outlet, never the logged-in user.
 * @param {object} outlet
 * @returns {{symbol:string,currency:string,region:string,locale:string}}
 */
export function resolveOutletCurrency(outlet) {
  return getCurrencyConfigForOutlet(outlet || {}, null);
}

/**
 * Format an amount in a specific outlet's own currency.
 * @param {number} value
 * @param {object} outlet
 * @returns {string} e.g. "$1,240" (AU) / "₹1,240" (IN)
 */
export function fmtOutletMoney(value, outlet) {
  return fmtFull(value, resolveOutletCurrency(outlet));
}

/**
 * Derive a live/offline status for an outlet. Prefers an explicit `status`
 * field from the backend, else falls back to `is_active`.
 * @param {object} o
 * @returns {'live'|'offline'}
 */
export function outletStatus(o) {
  if (!o) return 'offline';
  const s = String(o.status || '').toLowerCase();
  if (s) {
    if (['live', 'active', 'open', 'online'].includes(s)) return 'live';
    if (['offline', 'inactive', 'closed', 'suspended'].includes(s)) return 'offline';
  }
  return o.is_active === false ? 'offline' : 'live';
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Group outlets by their currency so revenue is NEVER summed across currencies.
 * Returns one bucket per currency, each with its own per-currency totals, sorted
 * by descending revenue.
 * @param {Array} outlets
 * @returns {Array<{currency,symbol,region,count,totalRevenue,totalOrders,activeOrders,liveCount,outlets:Array}>}
 */
export function groupOutletsByCurrency(outlets = []) {
  const buckets = new Map();
  for (const o of outlets) {
    const cfg = resolveOutletCurrency(o);
    const key = cfg.currency;
    if (!buckets.has(key)) {
      buckets.set(key, {
        currency: cfg.currency,
        symbol: cfg.symbol,
        region: cfg.region,
        count: 0,
        totalRevenue: 0,
        totalOrders: 0,
        activeOrders: 0,
        liveCount: 0,
        outlets: [],
      });
    }
    const b = buckets.get(key);
    b.count += 1;
    b.totalRevenue += num(o.today_revenue);
    b.totalOrders += num(o.today_orders);
    b.activeOrders += num(o.active_orders);
    if (outletStatus(o) === 'live') b.liveCount += 1;
    b.outlets.push(o);
  }
  return Array.from(buckets.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * Currency-agnostic global counts (safe to sum — these are counts, not money).
 * @param {Array} outlets
 * @returns {{total:number,live:number,offline:number,totalOrders:number,activeOrders:number,currencies:number}}
 */
export function computeGlobalStats(outlets = []) {
  let live = 0;
  let totalOrders = 0;
  let activeOrders = 0;
  const currencies = new Set();
  for (const o of outlets) {
    if (outletStatus(o) === 'live') live += 1;
    totalOrders += num(o.today_orders);
    activeOrders += num(o.active_orders);
    currencies.add(resolveOutletCurrency(o).currency);
  }
  return {
    total: outlets.length,
    live,
    offline: outlets.length - live,
    totalOrders,
    activeOrders,
    currencies: currencies.size,
  };
}

/**
 * Filter outlets by a search query (name / code / city).
 * @param {Array} outlets
 * @param {string} q
 * @returns {Array}
 */
export function filterOutlets(outlets = [], q = '') {
  const needle = q.trim().toLowerCase();
  if (!needle) return outlets;
  return outlets.filter((o) =>
    [o.name, o.code, o.city].some((f) => String(f || '').toLowerCase().includes(needle))
  );
}

/**
 * Attach each comparison row's currency (looked up from the outlets list) then
 * group by currency and pick best/worst performer WITHIN each currency — you
 * cannot rank $ against ₹.
 * @param {Array} comparison  rows: {outlet_id,outlet_name,city,total_orders,total_revenue,avg_order_value}
 * @param {Array} outlets     enriched outlets (carry currency/country/region)
 * @returns {Array<{currency,symbol,region,rows,best,worst,totalRevenue}>}
 */
export function rankComparisonByCurrency(comparison = [], outlets = []) {
  const byId = new Map(outlets.map((o) => [o.id, o]));
  const buckets = new Map();
  for (const row of comparison) {
    const outlet = byId.get(row.outlet_id) || {};
    const cfg = resolveOutletCurrency(outlet);
    const enriched = { ...row, currency: cfg.currency, symbol: cfg.symbol, region: cfg.region };
    if (!buckets.has(cfg.currency)) {
      buckets.set(cfg.currency, {
        currency: cfg.currency,
        symbol: cfg.symbol,
        region: cfg.region,
        rows: [],
        totalRevenue: 0,
      });
    }
    const b = buckets.get(cfg.currency);
    b.rows.push(enriched);
    b.totalRevenue += num(row.total_revenue);
  }
  return Array.from(buckets.values())
    .map((b) => {
      const rows = b.rows.slice().sort((a, x) => num(x.total_revenue) - num(a.total_revenue));
      return {
        ...b,
        rows,
        best: rows[0] || null,
        worst: rows.length > 1 ? rows[rows.length - 1] : null,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * ISO date range for the comparison endpoint (default: trailing `days` days).
 * @param {number} days
 * @param {Date} [now]
 * @returns {{from:string,to:string}}
 */
export function defaultRange(days = 7, now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ─── React-query hooks ────────────────────────────────────────────────────────

/**
 * All outlets with today's KPIs. Endpoint is head-office scoped (not a single
 * outlet), but we key the cache by the selected outlet so switching tenants
 * refetches cleanly.
 */
export function useOutlets() {
  const { outletId } = useOutlet();
  const query = useQuery({
    queryKey: MB_KEYS.outlets(outletId),
    queryFn: async () => {
      const res = await api.get('/ho/outlets');
      const data = res?.data ?? res;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
  });

  const outlets = query.data || [];
  const groups = useMemo(() => groupOutletsByCurrency(outlets), [outlets]);
  const stats = useMemo(() => computeGlobalStats(outlets), [outlets]);

  return { ...query, outlets, groups, stats };
}

/**
 * Cross-outlet comparison for a date range (default trailing 7 days).
 * @param {{from?:string,to?:string,outlets?:Array,enabled?:boolean}} opts
 */
export function useOutletComparison({ from, to, outlets = [], enabled = true } = {}) {
  const { outletId } = useOutlet();
  const range = useMemo(() => (from && to ? { from, to } : defaultRange(7)), [from, to]);

  const query = useQuery({
    queryKey: MB_KEYS.comparison(outletId, range.from, range.to),
    enabled,
    queryFn: async () => {
      const res = await api.get('/ho/outlet-comparison', { params: range });
      const data = res?.data ?? res;
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });

  const comparison = query.data || [];
  const ranked = useMemo(
    () => rankComparisonByCurrency(comparison, outlets),
    [comparison, outlets]
  );

  return { ...query, comparison, ranked, range };
}

/**
 * A single outlet's detail (KPIs, address, tax, hours).
 * @param {string} id
 */
export function useOutletDetail(id) {
  return useQuery({
    queryKey: MB_KEYS.outlet(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get(`/ho/outlets/${id}`);
      return res?.data ?? res;
    },
    staleTime: 30_000,
  });
}
