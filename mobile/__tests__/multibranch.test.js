/**
 * Unit tests for the pure transforms in useMultiBranch — the currency-safe
 * grouping/ranking logic that the Multi-Branch screen relies on. No React,
 * no network: deterministic input → deterministic output.
 */

// api is imported by the hook module; mock it so importing pure helpers is safe.
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

// The hook transitively imports OutletContext → AsyncStorage (a native module).
// Mock it so the pure helpers can be imported in a node test environment.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import {
  resolveOutletCurrency,
  fmtOutletMoney,
  outletStatus,
  groupOutletsByCurrency,
  computeGlobalStats,
  filterOutlets,
  rankComparisonByCurrency,
  defaultRange,
} from '../src/hooks/useMultiBranch';

const AU = (over = {}) => ({
  id: 'au1', name: 'Sydney CBD', code: 'SYD', city: 'Sydney',
  currency: 'AUD', country: 'Australia', region: 'AU',
  today_revenue: 1200, today_orders: 30, active_orders: 3, is_active: true, ...over,
});
const IN = (over = {}) => ({
  id: 'in1', name: 'Mumbai Central', code: 'MUM', city: 'Mumbai',
  currency: 'INR', country: 'India', region: 'IN',
  today_revenue: 5000, today_orders: 80, active_orders: 5, is_active: true, ...over,
});

describe('resolveOutletCurrency', () => {
  test('AU outlet resolves to $ / AUD', () => {
    const c = resolveOutletCurrency(AU());
    expect(c.symbol).toBe('$');
    expect(c.currency).toBe('AUD');
    expect(c.region).toBe('AU');
  });
  test('IN outlet resolves to ₹ / INR', () => {
    const c = resolveOutletCurrency(IN());
    expect(c.symbol).toBe('₹');
    expect(c.currency).toBe('INR');
  });
  test('defaults to IN when nothing is set', () => {
    expect(resolveOutletCurrency({}).currency).toBe('INR');
  });
});

describe('fmtOutletMoney', () => {
  test('formats in each outlet own currency symbol', () => {
    expect(fmtOutletMoney(1200, AU()).startsWith('$')).toBe(true);
    expect(fmtOutletMoney(5000, IN()).startsWith('₹')).toBe(true);
  });
  test('zero / invalid renders symbol + 0', () => {
    expect(fmtOutletMoney(0, AU())).toBe('$0');
    expect(fmtOutletMoney(null, IN())).toBe('₹0');
  });
});

describe('outletStatus', () => {
  test('is_active false → offline', () => {
    expect(outletStatus(AU({ is_active: false }))).toBe('offline');
  });
  test('is_active true → live', () => {
    expect(outletStatus(AU())).toBe('live');
  });
  test('explicit status string wins', () => {
    expect(outletStatus({ status: 'closed', is_active: true })).toBe('offline');
    expect(outletStatus({ status: 'online', is_active: false })).toBe('live');
  });
  test('null outlet → offline', () => {
    expect(outletStatus(null)).toBe('offline');
  });
});

describe('groupOutletsByCurrency', () => {
  test('never sums across currencies — one bucket per currency', () => {
    const groups = groupOutletsByCurrency([AU(), IN(), AU({ id: 'au2', today_revenue: 800 })]);
    expect(groups).toHaveLength(2);
    const aud = groups.find((g) => g.currency === 'AUD');
    const inr = groups.find((g) => g.currency === 'INR');
    expect(aud.count).toBe(2);
    expect(aud.totalRevenue).toBe(2000); // 1200 + 800, NOT mixed with the ₹5000
    expect(inr.totalRevenue).toBe(5000);
  });
  test('sorted by descending revenue', () => {
    const groups = groupOutletsByCurrency([AU({ today_revenue: 100 }), IN({ today_revenue: 9000 })]);
    expect(groups[0].currency).toBe('INR');
  });
  test('accumulates orders, active orders and live count', () => {
    const [g] = groupOutletsByCurrency([AU({ active_orders: 2 }), AU({ id: 'x', active_orders: 4, is_active: false })]);
    expect(g.totalOrders).toBe(60);
    expect(g.activeOrders).toBe(6);
    expect(g.liveCount).toBe(1);
  });
  test('empty input → empty array', () => {
    expect(groupOutletsByCurrency([])).toEqual([]);
  });
});

describe('computeGlobalStats', () => {
  test('counts (not money) are currency-agnostic and summable', () => {
    const s = computeGlobalStats([AU(), IN(), AU({ id: 'z', is_active: false })]);
    expect(s.total).toBe(3);
    expect(s.live).toBe(2);
    expect(s.offline).toBe(1);
    expect(s.totalOrders).toBe(30 + 80 + 30);
    expect(s.activeOrders).toBe(3 + 5 + 3);
    expect(s.currencies).toBe(2);
  });
  test('empty → zeros', () => {
    expect(computeGlobalStats([])).toEqual({
      total: 0, live: 0, offline: 0, totalOrders: 0, activeOrders: 0, currencies: 0,
    });
  });
});

describe('filterOutlets', () => {
  const list = [AU(), IN()];
  test('empty query returns all', () => {
    expect(filterOutlets(list, '')).toHaveLength(2);
  });
  test('matches by name, city or code, case-insensitive', () => {
    expect(filterOutlets(list, 'sydney')).toHaveLength(1);
    expect(filterOutlets(list, 'MUM')).toHaveLength(1);
    expect(filterOutlets(list, 'zzz')).toHaveLength(0);
  });
});

describe('rankComparisonByCurrency', () => {
  const outlets = [
    AU({ id: 'au1' }),
    AU({ id: 'au2' }),
    IN({ id: 'in1' }),
  ];
  const comparison = [
    { outlet_id: 'au1', outlet_name: 'Sydney', total_orders: 10, total_revenue: 500, avg_order_value: 50 },
    { outlet_id: 'au2', outlet_name: 'Melbourne', total_orders: 40, total_revenue: 2000, avg_order_value: 50 },
    { outlet_id: 'in1', outlet_name: 'Mumbai', total_orders: 100, total_revenue: 9000, avg_order_value: 90 },
  ];
  test('best/worst are computed WITHIN each currency, not across', () => {
    const ranked = rankComparisonByCurrency(comparison, outlets);
    const aud = ranked.find((g) => g.currency === 'AUD');
    const inr = ranked.find((g) => g.currency === 'INR');
    expect(aud.best.outlet_name).toBe('Melbourne');
    expect(aud.worst.outlet_name).toBe('Sydney');
    // single-outlet currency → no worst (avoid best===worst)
    expect(inr.best.outlet_name).toBe('Mumbai');
    expect(inr.worst).toBeNull();
  });
  test('each ranked row carries its own symbol', () => {
    const ranked = rankComparisonByCurrency(comparison, outlets);
    expect(ranked.find((g) => g.currency === 'AUD').symbol).toBe('$');
    expect(ranked.find((g) => g.currency === 'INR').symbol).toBe('₹');
  });
  test('unknown outlet_id falls back to default currency (INR) without throwing', () => {
    const ranked = rankComparisonByCurrency(
      [{ outlet_id: 'ghost', outlet_name: 'Ghost', total_revenue: 10, total_orders: 1, avg_order_value: 10 }],
      outlets
    );
    expect(ranked[0].currency).toBe('INR');
  });
});

describe('defaultRange', () => {
  test('trailing N days, from is start-of-day, to is now', () => {
    const now = new Date('2026-07-10T15:30:00.000Z');
    const { from, to } = defaultRange(7, now);
    expect(new Date(to).getTime()).toBe(now.getTime());
    const f = new Date(from);
    // setHours(0,...) is local midnight; assert on local hours (TZ-independent).
    expect(f.getHours()).toBe(0);
    // 7-day trailing window spans 6 calendar days back
    expect(new Date(to) - f).toBeGreaterThan(5 * 24 * 3600 * 1000);
  });
});
