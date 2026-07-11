/**
 * Unit tests for the pure transforms in useMenuAnalytics — the ABC ranking,
 * KPI roll-up, category grouping and best/underperformer picks the Menu
 * Analytics screen relies on. No React, no network: deterministic in → out.
 */

// api is imported by the hook module; mock it so importing pure helpers is safe.
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

// The hook transitively imports OutletContext → AsyncStorage (a native module).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import {
  normalizeItem,
  deriveABCByQty,
  normalizeAnalytics,
  normalizeSummaryItems,
  sortItems,
  computeKpis,
  groupByCategory,
  pickBestSeller,
  pickUnderperformer,
  revenueShare,
  SORT_MODES,
} from '../src/hooks/useMenuAnalytics';

// A realistic /ho/menu-analytics payload (three ABC buckets).
const payload = () => ({
  top_sellers: [
    { id: 'i1', name: 'Butter Chicken', category: 'Mains', price: 320, qty: 120, revenue: 38400, order_count: 100, abc: 'A' },
    { id: 'i2', name: 'Garlic Naan', category: 'Breads', price: 60, qty: 90, revenue: 5400, order_count: 80, abc: 'A' },
  ],
  moderate: [
    { id: 'i3', name: 'Paneer Tikka', category: 'Starters', price: 260, qty: 40, revenue: 10400, order_count: 35, abc: 'B' },
  ],
  slow_movers: [
    { id: 'i4', name: 'Kulfi', category: 'Desserts', price: 90, qty: 6, revenue: 540, order_count: 6, abc: 'C' },
  ],
  total_items_sold: 256,
  period_days: 30,
});

describe('normalizeItem', () => {
  test('maps analytics shape with numeric coercion', () => {
    const it = normalizeItem({ id: 'i1', name: 'X', category: 'C', qty: '5', revenue: '10.5', order_count: '3', price: '2', abc: 'a' });
    expect(it).toEqual({ id: 'i1', name: 'X', category: 'C', qty: 5, revenue: 10.5, orderCount: 3, price: 2, abc: 'A' });
  });
  test('tolerates the summary shape (count/name only)', () => {
    const it = normalizeItem({ name: 'Fries', count: 12, revenue: 240 });
    expect(it.qty).toBe(12);
    expect(it.revenue).toBe(240);
    expect(it.id).toBe('Fries'); // falls back to name when no id
    expect(it.abc).toBeNull();
  });
  test('bad numbers coerce to 0 and defaults fill in', () => {
    const it = normalizeItem({});
    expect(it).toEqual({ id: 'item', name: 'Unnamed item', category: 'Uncategorized', qty: 0, revenue: 0, orderCount: 0, price: 0, abc: null });
  });
});

describe('normalizeAnalytics', () => {
  test('flattens the three buckets into one de-duplicated list', () => {
    const { items, totalItemsSold, periodDays } = normalizeAnalytics(payload());
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.id)).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(totalItemsSold).toBe(256);
    expect(periodDays).toBe(30);
  });
  test('keeps the ABC class from whichever bucket the item came from', () => {
    const { items } = normalizeAnalytics(payload());
    expect(items.find((i) => i.id === 'i1').abc).toBe('A');
    expect(items.find((i) => i.id === 'i3').abc).toBe('B');
    expect(items.find((i) => i.id === 'i4').abc).toBe('C');
  });
  test('empty / missing payload → empty, safe defaults', () => {
    expect(normalizeAnalytics({})).toEqual({ items: [], totalItemsSold: 0, periodDays: 30 });
    expect(normalizeAnalytics(undefined)).toEqual({ items: [], totalItemsSold: 0, periodDays: 30 });
  });
  test('totalItemsSold falls back to sum of qty when not provided', () => {
    const p = payload();
    delete p.total_items_sold;
    expect(normalizeAnalytics(p).totalItemsSold).toBe(120 + 90 + 40 + 6);
  });
});

describe('deriveABCByQty', () => {
  test('assigns A/B/C by cumulative quantity share (70/90 rule)', () => {
    // qty: 70, 20, 10 → cum% 70, 90, 100 → A, B, C
    const items = [
      { name: 'a', qty: 70, revenue: 700 },
      { name: 'b', qty: 20, revenue: 200 },
      { name: 'c', qty: 10, revenue: 100 },
    ].map(normalizeItem);
    const out = deriveABCByQty(items);
    expect(out.map((i) => i.abc)).toEqual(['A', 'B', 'C']);
  });
  test('sorts by qty desc before classifying', () => {
    // big 60% cum → A, small 100% cum → C
    const items = [
      { name: 'small', qty: 40, revenue: 400 },
      { name: 'big', qty: 60, revenue: 600 },
    ].map(normalizeItem);
    const out = deriveABCByQty(items);
    expect(out[0].name).toBe('big');
    expect(out[0].abc).toBe('A');
  });
  test('all-zero qty does not divide by zero (everything → A)', () => {
    const out = deriveABCByQty([{ name: 'x', qty: 0, revenue: 0 }].map(normalizeItem));
    expect(out[0].abc).toBe('A');
  });
});

describe('normalizeSummaryItems', () => {
  test('normalizes top_items and derives an ABC class', () => {
    // cum% 70 → A, 90 → B, 100 → C (mirrors the backend rule)
    const out = normalizeSummaryItems([
      { name: 'Big', count: 70, revenue: 700, category: 'Food' },
      { name: 'Mid', count: 20, revenue: 200, category: 'Food' },
      { name: 'Low', count: 10, revenue: 100, category: 'Food' },
    ]);
    expect(out.map((i) => i.abc)).toEqual(['A', 'B', 'C']);
    expect(out[0].qty).toBe(70);
  });
  test('non-array → empty', () => {
    expect(normalizeSummaryItems(null)).toEqual([]);
    expect(normalizeSummaryItems(undefined)).toEqual([]);
  });
});

describe('sortItems', () => {
  const items = normalizeAnalytics(payload()).items;
  test('by revenue desc', () => {
    const out = sortItems(items, SORT_MODES.REVENUE);
    expect(out.map((i) => i.id)).toEqual(['i1', 'i3', 'i2', 'i4']);
  });
  test('by qty desc', () => {
    const out = sortItems(items, SORT_MODES.QTY);
    expect(out.map((i) => i.id)).toEqual(['i1', 'i2', 'i3', 'i4']);
  });
  test('does not mutate the input array', () => {
    const copy = items.slice();
    sortItems(items, SORT_MODES.QTY);
    expect(items).toEqual(copy);
  });
  test('revenue ties break on qty', () => {
    const tie = [
      { id: 'a', name: 'a', qty: 5, revenue: 100 },
      { id: 'b', name: 'b', qty: 9, revenue: 100 },
    ].map(normalizeItem);
    expect(sortItems(tie, SORT_MODES.REVENUE).map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('computeKpis', () => {
  const items = normalizeAnalytics(payload()).items;
  test('rolls up count, revenue, avg and top-revenue item', () => {
    const k = computeKpis(items, 256);
    expect(k.itemCount).toBe(4);
    expect(k.totalRevenue).toBe(38400 + 5400 + 10400 + 540);
    expect(k.totalQty).toBe(256); // uses provided total, not sum of shown items
    expect(k.avgItemRevenue).toBeCloseTo((38400 + 5400 + 10400 + 540) / 4);
    expect(k.topRevenueItem.id).toBe('i1');
  });
  test('falls back to sum of qty when total not provided', () => {
    expect(computeKpis(items).totalQty).toBe(120 + 90 + 40 + 6);
  });
  test('empty → zeros and null top item', () => {
    const k = computeKpis([]);
    expect(k).toEqual({ itemCount: 0, totalRevenue: 0, totalQty: 0, avgItemRevenue: 0, topRevenueItem: null });
  });
});

describe('groupByCategory', () => {
  const items = normalizeAnalytics(payload()).items;
  test('one bucket per category, sorted by revenue desc, with share', () => {
    const groups = groupByCategory(items);
    expect(groups.map((g) => g.category)).toEqual(['Mains', 'Starters', 'Breads', 'Desserts']);
    const mains = groups.find((g) => g.category === 'Mains');
    expect(mains.revenue).toBe(38400);
    expect(mains.itemCount).toBe(1);
    const total = 38400 + 5400 + 10400 + 540;
    expect(mains.share).toBeCloseTo(38400 / total);
  });
  test('merges items sharing a category', () => {
    const items2 = [
      { id: '1', name: 'a', category: 'Food', qty: 2, revenue: 100 },
      { id: '2', name: 'b', category: 'Food', qty: 3, revenue: 200 },
    ].map(normalizeItem);
    const [g] = groupByCategory(items2);
    expect(g.itemCount).toBe(2);
    expect(g.qty).toBe(5);
    expect(g.revenue).toBe(300);
  });
  test('empty → empty', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe('pickBestSeller', () => {
  test('highest qty wins', () => {
    const items = normalizeAnalytics(payload()).items;
    expect(pickBestSeller(items).id).toBe('i1');
  });
  test('empty → null', () => {
    expect(pickBestSeller([])).toBeNull();
  });
});

describe('pickUnderperformer', () => {
  test('lowest-revenue item that actually sold', () => {
    const items = normalizeAnalytics(payload()).items;
    expect(pickUnderperformer(items).id).toBe('i4');
  });
  test('ignores zero-sale rows', () => {
    const items = [
      { id: 'a', name: 'a', qty: 5, revenue: 500 },
      { id: 'b', name: 'b', qty: 3, revenue: 200 },
      { id: 'z', name: 'zero', qty: 0, revenue: 0 },
    ].map(normalizeItem);
    expect(pickUnderperformer(items).id).toBe('b');
  });
  test('needs at least 2 sold items to contrast against best-seller', () => {
    const items = [{ id: 'a', name: 'a', qty: 5, revenue: 500 }].map(normalizeItem);
    expect(pickUnderperformer(items)).toBeNull();
    expect(pickUnderperformer([])).toBeNull();
  });
});

describe('revenueShare', () => {
  test('fraction of the grand total', () => {
    expect(revenueShare(250, 1000)).toBe(0.25);
  });
  test('clamps to 0..1 and guards divide-by-zero', () => {
    expect(revenueShare(50, 0)).toBe(0);
    expect(revenueShare(-10, 100)).toBe(0);
    expect(revenueShare(9999, 100)).toBe(1);
  });
});
