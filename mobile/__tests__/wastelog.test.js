// Pure-logic tests for the Waste Log feature transforms.
// We mock the api module so importing the hook file never hits the network.
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

// The hook file imports useOutlet (→ AsyncStorage). We only test pure transforms,
// so stub the context module to keep the import graph off native deps.
jest.mock('../src/context/OutletContext', () => ({
  useOutlet: () => ({ outletId: 'outlet-1', currentOutlet: null }),
}));

import {
  normalizeWasteRow,
  dayKey,
  dayLabel,
  timeLabel,
  groupWasteByDay,
  computeTodaySummary,
  reasonMeta,
  WASTE_REASONS,
} from '../src/hooks/useWasteLog';

// Fixed reference "now": 2026-07-10 14:00 local.
const NOW = new Date(2026, 6, 10, 14, 0, 0);

function iso(y, mo, d, h = 12, mi = 0) {
  return new Date(y, mo, d, h, mi, 0).toISOString();
}

describe('normalizeWasteRow', () => {
  test('maps nested inventory_item and computes line cost', () => {
    const row = normalizeWasteRow({
      id: 'w1',
      quantity: 2.5,
      reason: 'Spoilage',
      created_at: iso(2026, 6, 10, 9),
      logged_by: 'user-1',
      inventory_item: { name: 'Tomatoes', unit: 'kg', cost_per_unit: 40 },
    });
    expect(row.itemName).toBe('Tomatoes');
    expect(row.unit).toBe('kg');
    expect(row.quantity).toBe(2.5);
    expect(row.costPerUnit).toBe(40);
    expect(row.lineCost).toBe(100);
    expect(row.hasCost).toBe(true);
  });

  test('takes absolute value of quantity and defaults missing fields', () => {
    const row = normalizeWasteRow({ id: 'w2', quantity: -3, inventory_item: {} });
    expect(row.quantity).toBe(3);
    expect(row.itemName).toBe('Unknown item');
    expect(row.reason).toBe('Other');
    expect(row.costPerUnit).toBe(0);
    expect(row.hasCost).toBe(false);
    expect(row.lineCost).toBe(0);
  });

  test('returns null for invalid input', () => {
    expect(normalizeWasteRow(null)).toBeNull();
    expect(normalizeWasteRow(undefined)).toBeNull();
  });
});

describe('dayKey / dayLabel', () => {
  test('dayKey uses local calendar day (YYYY-MM-DD)', () => {
    expect(dayKey(new Date(2026, 6, 10, 23, 30))).toBe('2026-07-10');
  });

  test('dayLabel resolves Today / Yesterday relative to now', () => {
    expect(dayLabel('2026-07-10', NOW)).toBe('Today');
    expect(dayLabel('2026-07-09', NOW)).toBe('Yesterday');
  });

  test('dayLabel formats older dates', () => {
    const label = dayLabel('2026-07-01', NOW);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
});

describe('timeLabel', () => {
  test('returns empty string for missing value', () => {
    expect(timeLabel(null)).toBe('');
    expect(timeLabel('')).toBe('');
  });
  test('returns a non-empty string for a valid date', () => {
    expect(timeLabel(iso(2026, 6, 10, 9, 30)).length).toBeGreaterThan(0);
  });
});

describe('groupWasteByDay', () => {
  const rows = [
    normalizeWasteRow({ id: 'a', quantity: 1, reason: 'Spoilage', created_at: iso(2026, 6, 10, 8), inventory_item: { name: 'Milk', unit: 'l', cost_per_unit: 10 } }),
    normalizeWasteRow({ id: 'b', quantity: 2, reason: 'Expired', created_at: iso(2026, 6, 10, 11), inventory_item: { name: 'Curd', unit: 'kg', cost_per_unit: 20 } }),
    normalizeWasteRow({ id: 'c', quantity: 5, reason: 'Spillage', created_at: iso(2026, 6, 9, 10), inventory_item: { name: 'Oil', unit: 'l' } }),
  ];

  test('buckets rows into days, newest day first', () => {
    const groups = groupWasteByDay(rows, NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe('2026-07-10');
    expect(groups[1].key).toBe('2026-07-09');
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Yesterday');
  });

  test('day total cost sums line costs and entry count is correct', () => {
    const groups = groupWasteByDay(rows, NOW);
    const today = groups[0];
    expect(today.entryCount).toBe(2);
    expect(today.totalCost).toBe(1 * 10 + 2 * 20); // 50
    expect(today.hasCost).toBe(true);
  });

  test('day with no cost data flags hasCost false and zero total', () => {
    const groups = groupWasteByDay(rows, NOW);
    const yesterday = groups[1];
    expect(yesterday.hasCost).toBe(false);
    expect(yesterday.totalCost).toBe(0);
  });

  test('entries within a day are ordered newest first', () => {
    const groups = groupWasteByDay(rows, NOW);
    expect(groups[0].entries[0].id).toBe('b'); // 11:00 before 08:00
    expect(groups[0].entries[1].id).toBe('a');
  });

  test('handles empty / non-array input', () => {
    expect(groupWasteByDay([], NOW)).toEqual([]);
    expect(groupWasteByDay(null, NOW)).toEqual([]);
  });
});

describe('computeTodaySummary', () => {
  test('counts only today entries and sums cost + qty', () => {
    const rows = [
      normalizeWasteRow({ id: 'a', quantity: 1, created_at: iso(2026, 6, 10, 8), inventory_item: { name: 'Milk', cost_per_unit: 10 } }),
      normalizeWasteRow({ id: 'b', quantity: 3, created_at: iso(2026, 6, 10, 9), inventory_item: { name: 'Curd', cost_per_unit: 20 } }),
      normalizeWasteRow({ id: 'c', quantity: 5, created_at: iso(2026, 6, 9, 10), inventory_item: { name: 'Oil', cost_per_unit: 5 } }),
    ];
    const s = computeTodaySummary(rows, NOW);
    expect(s.count).toBe(2);
    expect(s.totalCost).toBe(10 + 60); // 70
    expect(s.totalQty).toBe(4);
    expect(s.hasCost).toBe(true);
  });

  test('hasCost false when today has no cost data', () => {
    const rows = [
      normalizeWasteRow({ id: 'a', quantity: 2, created_at: iso(2026, 6, 10, 8), inventory_item: { name: 'Bread' } }),
    ];
    const s = computeTodaySummary(rows, NOW);
    expect(s.count).toBe(1);
    expect(s.hasCost).toBe(false);
    expect(s.totalCost).toBe(0);
  });

  test('empty summary for no rows', () => {
    const s = computeTodaySummary([], NOW);
    expect(s).toEqual({ count: 0, totalCost: 0, totalQty: 0, hasCost: false });
  });
});

describe('reason presets', () => {
  test('WASTE_REASONS has the expected presets', () => {
    expect(WASTE_REASONS).toEqual([
      'Spoilage', 'Expired', 'Overproduction', 'Prep Error', 'Spillage', 'Other',
    ]);
  });
  test('reasonMeta returns icon+color, falling back to Other', () => {
    expect(reasonMeta('Spoilage').icon).toBeDefined();
    expect(reasonMeta('Nonexistent')).toBe(reasonMeta('Other'));
  });
});
