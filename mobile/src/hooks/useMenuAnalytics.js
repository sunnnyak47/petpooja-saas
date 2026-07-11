/**
 * useMenuAnalytics — owner-facing "Item performance" data layer.
 *
 * Primary source:
 *   GET /ho/menu-analytics?outlet_id=  → ABC menu performance (last 30 days).
 *   Response shape (from superadmin analytics.service.getMenuAnalytics):
 *     {
 *       top_sellers:  [{ id, name, category, price, qty, revenue, order_count, abc:'A' }] (≤10),
 *       moderate:     [... abc:'B'] (≤10),
 *       slow_movers:  [... abc:'C'] (≤10),
 *       total_items_sold: number,
 *       period_days: 30
 *     }
 *
 * Complement / fallback source (used only when the primary yields no items):
 *   GET /reports/summary?outlet_id=&range=30d → { top_items:[{name,count,revenue,category}], ... }
 *   These rows carry no ABC class, so we derive one with the same 70/90 cumulative
 *   -quantity rule the backend uses.
 *
 * All money/qty math is left un-formatted here (pure numbers) — the screen formats
 * with useCurrency so the outlet's own symbol (AU $ / IN ₹) is applied.
 *
 * EVERY fetch is scoped to the SELECTED outlet (owner's user.outlet_id is often
 * null), so outlet_id comes from useOutlet().outletId.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

// ─── Query keys ───────────────────────────────────────────────────────────────
export const MA_KEYS = {
  analytics: (outletId) => ['ho', 'menu-analytics', outletId || 'none'],
  summary: (outletId, range) => ['reports', 'summary', outletId || 'none', range],
};

export const SORT_MODES = { REVENUE: 'revenue', QTY: 'qty' };
export const ABC_ORDER = ['A', 'B', 'C'];

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Normalize a raw menu-analytics item into the shape the screen consumes.
 * Tolerant of the summary shape too (count/name only).
 * @param {object} raw
 * @returns {{id,name,category,qty,revenue,orderCount,price,abc}}
 */
export function normalizeItem(raw = {}) {
  const qty = num(raw.qty != null ? raw.qty : raw.count);
  return {
    id: String(raw.id != null ? raw.id : raw.menu_item_id != null ? raw.menu_item_id : raw.name || 'item'),
    name: raw.name || 'Unnamed item',
    category: raw.category || 'Uncategorized',
    qty,
    revenue: num(raw.revenue),
    orderCount: num(raw.order_count != null ? raw.order_count : raw.orders),
    price: num(raw.price),
    abc: raw.abc ? String(raw.abc).toUpperCase() : null,
  };
}

/**
 * Assign an A/B/C class to items by cumulative quantity share (70% → A, 90% → B,
 * rest → C) — mirrors the backend. Items are ranked by qty desc first.
 * @param {Array} items normalized items (may lack abc)
 * @returns {Array} items with abc filled in
 */
export function deriveABCByQty(items = []) {
  const ranked = items.slice().sort((a, b) => num(b.qty) - num(a.qty));
  const totalQty = ranked.reduce((s, i) => s + num(i.qty), 0);
  let cumulative = 0;
  return ranked.map((item) => {
    cumulative += num(item.qty);
    const pct = totalQty > 0 ? (cumulative / totalQty) * 100 : 0;
    return { ...item, abc: pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C' };
  });
}

/**
 * Flatten the primary /ho/menu-analytics payload (three ABC buckets) into one
 * de-duplicated, normalized item list.
 * @param {object} data
 * @returns {{items:Array,totalItemsSold:number,periodDays:number}}
 */
export function normalizeAnalytics(data = {}) {
  const buckets = [data.top_sellers, data.moderate, data.slow_movers];
  const seen = new Map();
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const raw of bucket) {
      const item = normalizeItem(raw);
      // Keep the first occurrence (buckets are already ABC-tagged & disjoint).
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
  }
  const items = Array.from(seen.values());
  const totalItemsSold = num(data.total_items_sold) || items.reduce((s, i) => s + i.qty, 0);
  return {
    items,
    totalItemsSold,
    periodDays: num(data.period_days) || 30,
  };
}

/**
 * Normalize the reports/summary top_items fallback and derive an ABC class
 * (summary rows carry none).
 * @param {Array} topItems
 * @returns {Array}
 */
export function normalizeSummaryItems(topItems = []) {
  if (!Array.isArray(topItems)) return [];
  return deriveABCByQty(topItems.map(normalizeItem));
}

/**
 * Sort items by the active toggle. Ties break on the other metric so the order
 * is stable and meaningful.
 * @param {Array} items
 * @param {'revenue'|'qty'} mode
 * @returns {Array} new sorted array
 */
export function sortItems(items = [], mode = SORT_MODES.REVENUE) {
  const byQty = mode === SORT_MODES.QTY;
  return items.slice().sort((a, b) => {
    const primary = byQty ? num(b.qty) - num(a.qty) : num(b.revenue) - num(a.revenue);
    if (primary !== 0) return primary;
    return byQty ? num(b.revenue) - num(a.revenue) : num(b.qty) - num(a.qty);
  });
}

/**
 * KPI roll-up for the header. Pure numbers — the screen formats money.
 * @param {Array} items
 * @param {number} [totalItemsSold] units sold from the payload (falls back to sum of qty)
 * @returns {{itemCount,totalRevenue,totalQty,avgItemRevenue,topRevenueItem}}
 */
export function computeKpis(items = [], totalItemsSold) {
  const itemCount = items.length;
  const totalRevenue = items.reduce((s, i) => s + num(i.revenue), 0);
  const totalQty = totalItemsSold != null ? num(totalItemsSold) : items.reduce((s, i) => s + num(i.qty), 0);
  const avgItemRevenue = itemCount > 0 ? totalRevenue / itemCount : 0;
  const topRevenueItem = items.reduce(
    (best, i) => (best == null || num(i.revenue) > num(best.revenue) ? i : best),
    null
  );
  return { itemCount, totalRevenue, totalQty, avgItemRevenue, topRevenueItem };
}

/**
 * Group items into category buckets with their own revenue/qty totals and a
 * revenue share (0–1) of the grand total. Sorted by revenue desc.
 * @param {Array} items
 * @returns {Array<{category,revenue,qty,itemCount,share}>}
 */
export function groupByCategory(items = []) {
  const grand = items.reduce((s, i) => s + num(i.revenue), 0);
  const buckets = new Map();
  for (const i of items) {
    const key = i.category || 'Uncategorized';
    if (!buckets.has(key)) buckets.set(key, { category: key, revenue: 0, qty: 0, itemCount: 0 });
    const b = buckets.get(key);
    b.revenue += num(i.revenue);
    b.qty += num(i.qty);
    b.itemCount += 1;
  }
  return Array.from(buckets.values())
    .map((b) => ({ ...b, share: grand > 0 ? b.revenue / grand : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Best-seller = most units sold. Null when there's no data.
 * @param {Array} items
 * @returns {object|null}
 */
export function pickBestSeller(items = []) {
  return items.reduce(
    (best, i) => (best == null || num(i.qty) > num(best.qty) ? i : best),
    null
  );
}

/**
 * Underperformer = the item that actually sold (qty > 0) with the LOWEST revenue.
 * We ignore zero-sale rows so the callout is actionable ("this is on the menu and
 * barely earning"), and return null when fewer than 2 items exist (nothing to
 * contrast the best-seller against).
 * @param {Array} items
 * @returns {object|null}
 */
export function pickUnderperformer(items = []) {
  const sold = items.filter((i) => num(i.qty) > 0);
  if (sold.length < 2) return null;
  return sold.reduce((worst, i) => (num(i.revenue) < num(worst.revenue) ? i : worst), sold[0]);
}

/**
 * Revenue share of one item vs the grand total (0–1), clamped.
 * @param {number} revenue
 * @param {number} totalRevenue
 * @returns {number}
 */
export function revenueShare(revenue, totalRevenue) {
  const t = num(totalRevenue);
  if (t <= 0) return 0;
  return Math.max(0, Math.min(1, num(revenue) / t));
}

// ─── React-query hook ─────────────────────────────────────────────────────────

/**
 * Fetch + shape menu analytics for the selected outlet. The reports/summary
 * fallback only runs when the primary endpoint returns zero items.
 * @param {{sortMode?:'revenue'|'qty'}} [opts]
 */
export function useMenuAnalytics({ sortMode = SORT_MODES.REVENUE } = {}) {
  const { outletId } = useOutlet();

  const primary = useQuery({
    queryKey: MA_KEYS.analytics(outletId),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/ho/menu-analytics', { params: { outlet_id: outletId } });
      const data = res?.data ?? res;
      return normalizeAnalytics(data || {});
    },
  });

  const primaryEmpty = !primary.isLoading && (primary.data?.items?.length ?? 0) === 0;

  // Complementary source — only fetched if the ABC endpoint has nothing yet.
  const fallback = useQuery({
    queryKey: MA_KEYS.summary(outletId, '30d'),
    enabled: !!outletId && primaryEmpty && !primary.isError,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/reports/summary', { params: { outlet_id: outletId, range: '30d' } });
      const data = res?.data ?? res;
      return normalizeSummaryItems(data?.top_items || []);
    },
  });

  const usingFallback = primaryEmpty && (fallback.data?.length ?? 0) > 0;

  const base = useMemo(() => {
    if (usingFallback) {
      return { items: fallback.data || [], periodDays: 30, totalItemsSold: undefined };
    }
    return {
      items: primary.data?.items || [],
      periodDays: primary.data?.periodDays || 30,
      totalItemsSold: primary.data?.totalItemsSold,
    };
  }, [usingFallback, fallback.data, primary.data]);

  const items = useMemo(() => sortItems(base.items, sortMode), [base.items, sortMode]);
  const kpis = useMemo(() => computeKpis(base.items, base.totalItemsSold), [base.items, base.totalItemsSold]);
  const categories = useMemo(() => groupByCategory(base.items), [base.items]);
  const bestSeller = useMemo(() => pickBestSeller(base.items), [base.items]);
  const underperformer = useMemo(() => pickUnderperformer(base.items), [base.items]);

  const isLoading = primary.isLoading || (primaryEmpty && fallback.isLoading);
  const isRefetching = primary.isRefetching || fallback.isRefetching;

  const refetch = () => {
    primary.refetch();
    if (primaryEmpty) fallback.refetch();
  };

  return {
    items,
    kpis,
    categories,
    bestSeller,
    underperformer,
    periodDays: base.periodDays,
    usingFallback,
    isLoading,
    isError: primary.isError,
    isRefetching,
    refetch,
    hasOutlet: !!outletId,
  };
}
