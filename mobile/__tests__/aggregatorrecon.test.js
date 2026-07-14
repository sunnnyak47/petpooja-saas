/**
 * Unit tests for the pure transforms in useAggregatorRecon — the row
 * normalization, header roll-up, reconciliation status, range presets and sort
 * the Delivery Payouts screen relies on. No React, no network: deterministic
 * in → out.
 */

// api is imported by the hook module; mock it so importing pure helpers is safe.
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

// The hook transitively imports OutletContext → AsyncStorage (a native module).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import {
  round2,
  titleCasePlatform,
  platformMeta,
  rangeToParams,
  normalizePlatformRow,
  reconcileStatus,
  computeTotals,
  normalizeReport,
  sortRows,
  SORT_MODES,
  PLATFORM_META,
} from '../src/hooks/useAggregatorRecon';

// A realistic /commission-report payload (per-platform rows).
const payload = () => ({
  rows: [
    {
      platform: 'uber_eats',
      platform_name: 'Uber Eats',
      order_count: 40,
      gross: 4000,
      commission_pct: 30,
      commission_amount: 1200,
      net_payout: 2800,
    },
    {
      platform: 'swiggy',
      platform_name: 'Swiggy',
      order_count: 100,
      gross: 10000,
      commission_pct: 18,
      commission_amount: 1800,
      net_payout: 8200,
    },
  ],
  totals: { order_count: 140, gross: 14000, commission_amount: 3000, net_payout: 11000 },
});

describe('round2', () => {
  test('rounds numeric-ish values to 2dp and guards NaN', () => {
    expect(round2('10.005')).toBe(10.01);
    expect(round2(3.14159)).toBe(3.14);
    expect(round2('nope')).toBe(0);
    expect(round2(undefined)).toBe(0);
  });
});

describe('titleCasePlatform', () => {
  test('title-cases underscored keys', () => {
    expect(titleCasePlatform('uber_eats')).toBe('Uber Eats');
    expect(titleCasePlatform('swiggy')).toBe('Swiggy');
    expect(titleCasePlatform('')).toBe('Unknown');
  });
});

describe('platformMeta', () => {
  test('returns known platform meta and a generic fallback', () => {
    expect(platformMeta('swiggy')).toBe(PLATFORM_META.swiggy);
    expect(platformMeta('SWIGGY').icon).toBe(PLATFORM_META.swiggy.icon);
    const unknown = platformMeta('grubhub');
    expect(unknown.icon).toBe('storefront');
    expect(unknown.hue).toBeNull();
  });
});

describe('rangeToParams', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  test('maps day presets to from/to ISO dates', () => {
    expect(rangeToParams('7d', now)).toEqual({ from: '2026-07-03', to: '2026-07-10' });
    expect(rangeToParams('30d', now)).toEqual({ from: '2026-06-10', to: '2026-07-10' });
  });
  test('all-time / unknown yield no date bound', () => {
    expect(rangeToParams('all', now)).toEqual({});
    expect(rangeToParams('bogus', now)).toEqual({});
  });
});

describe('normalizePlatformRow', () => {
  test('normalizes a report row with numeric coercion', () => {
    const r = normalizePlatformRow({
      platform: 'ZOMATO',
      order_count: '50',
      gross: '5000.005',
      commission_pct: '15',
      commission_amount: '750',
      net_payout: '4250',
    });
    expect(r.platform).toBe('zomato');
    expect(r.platform_name).toBe('Zomato');
    expect(r.order_count).toBe(50);
    expect(r.gross).toBe(5000.01);
    expect(r.net_payout).toBe(4250);
    expect(r.received).toBeUndefined();
  });
  test('falls back to the `aggregator` alias and passes a received signal through', () => {
    const r = normalizePlatformRow({ aggregator: 'menulog', net_payout: 100, received: 90 });
    expect(r.platform).toBe('menulog');
    expect(r.platform_name).toBe('Menulog');
    expect(r.received).toBe(90);
  });
});

describe('reconcileStatus', () => {
  test('pending when no received signal', () => {
    expect(reconcileStatus({ net_payout: 500 })).toEqual({ key: 'pending', received: null, discrepancy: 0 });
  });
  test('matched when received equals expected (within tolerance)', () => {
    expect(reconcileStatus({ net_payout: 500, received: 500 })).toEqual({
      key: 'matched',
      received: 500,
      discrepancy: 0,
    });
  });
  test('short-paid when received is less than expected', () => {
    const st = reconcileStatus({ net_payout: 500, received: 450 });
    expect(st.key).toBe('short');
    expect(st.discrepancy).toBe(-50);
  });
  test('over-paid when received exceeds expected', () => {
    const st = reconcileStatus({ net_payout: 500, payout_received: 520 });
    expect(st.key).toBe('over');
    expect(st.discrepancy).toBe(20);
  });
});

describe('computeTotals', () => {
  test('rolls up rows and counts platforms', () => {
    const rows = payload().rows.map(normalizePlatformRow);
    const t = computeTotals(rows);
    expect(t.order_count).toBe(140);
    expect(t.gross).toBe(14000);
    expect(t.commission_amount).toBe(3000);
    expect(t.net_payout).toBe(11000);
    expect(t.platform_count).toBe(2);
    expect(t.reconciled_count).toBe(0);
    expect(t.discrepancy).toBe(0);
  });
  test('aggregates received + discrepancy and flags short-paid platforms', () => {
    const rows = [
      normalizePlatformRow({ platform: 'swiggy', net_payout: 8200, received: 8000 }),
      normalizePlatformRow({ platform: 'zomato', net_payout: 2000, received: 2000 }),
    ];
    const t = computeTotals(rows);
    expect(t.received).toBe(10000);
    expect(t.discrepancy).toBe(-200);
    expect(t.reconciled_count).toBe(2);
    expect(t.short_count).toBe(1);
  });
  test('empty input yields zeroed totals', () => {
    const t = computeTotals([]);
    expect(t.order_count).toBe(0);
    expect(t.net_payout).toBe(0);
    expect(t.platform_count).toBe(0);
  });
});

describe('normalizeReport', () => {
  test('normalizes rows and recomputes totals locally', () => {
    const { rows, totals } = normalizeReport(payload());
    expect(rows).toHaveLength(2);
    expect(rows[0].platform).toBe('uber_eats');
    expect(totals.net_payout).toBe(11000);
    expect(totals.platform_count).toBe(2);
  });
  test('tolerates a missing / non-array rows field', () => {
    expect(normalizeReport({}).rows).toEqual([]);
    expect(normalizeReport({ rows: null }).totals.gross).toBe(0);
    expect(normalizeReport(undefined).rows).toEqual([]);
  });
});

describe('sortRows', () => {
  const rows = payload().rows.map(normalizePlatformRow);
  test('sorts by net payout desc by default', () => {
    const sorted = sortRows(rows, SORT_MODES.PAYOUT);
    expect(sorted.map((r) => r.platform)).toEqual(['swiggy', 'uber_eats']);
  });
  test('sorts by commission desc', () => {
    const sorted = sortRows(rows, SORT_MODES.COMMISSION);
    expect(sorted[0].platform).toBe('swiggy'); // 1800 > 1200
  });
  test('does not mutate the input and falls back to payout for unknown mode', () => {
    const copy = rows.slice();
    const sorted = sortRows(rows, 'bogus');
    expect(rows).toEqual(copy);
    expect(sorted[0].platform).toBe('swiggy');
  });
});
