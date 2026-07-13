/**
 * @fileoverview Unit tests for the deterministic sales forecast (pure function).
 * @module tests/forecast.test
 */

const { computeForecast, WEEKDAYS } = require('../src/modules/assistant/assistant.forecast');

// Reference "today" = 13 Jul 2026; tomorrow = 14 Jul 2026.
const NOW = new Date(2026, 6, 13);
const DOW_TOMORROW = new Date(2026, 6, 14).getDay();

// 28 consecutive days ending 13 Jul; tomorrow's weekday sells double.
function buildSeries() {
  const rows = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(2026, 6, 13 - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const isDow = d.getDay() === DOW_TOMORROW;
    rows.push({ date: key, orders: isDow ? 20 : 10, revenue: isDow ? 2000 : 1000 });
  }
  return rows;
}

describe('computeForecast', () => {
  test('day-of-week aware prediction with strong weekday signal', () => {
    const f = computeForecast(buildSeries(), NOW);
    expect(f.days_with_data).toBe(28);
    expect(f.tomorrow.weekday).toBe(WEEKDAYS[DOW_TOMORROW]);
    expect(f.tomorrow.predicted_orders).toBe(20);       // the weekday average, not the overall ~11
    expect(f.tomorrow.predicted_revenue).toBe(2000);
    expect(f.tomorrow.orders_vs_avg_pct).toBeGreaterThan(0);
    expect(f.confidence).toBe('high');
    expect(f.tomorrow.basis).toMatch(/recent/);
  });

  test('empty history → no prediction, confidence none', () => {
    const f = computeForecast([], NOW);
    expect(f.days_with_data).toBe(0);
    expect(f.tomorrow.predicted_orders).toBe(0);
    expect(f.tomorrow.orders_vs_avg_pct).toBeNull();
    expect(f.confidence).toBe('none');
  });

  test('sparse history → low confidence, falls back to overall average', () => {
    const series = [
      { date: '2026-07-11', orders: 8, revenue: 800 },
      { date: '2026-07-12', orders: 12, revenue: 1200 },
      { date: '2026-07-13', orders: 10, revenue: 1000 },
    ];
    const f = computeForecast(series, NOW);
    expect(f.confidence).toBe('low');
    expect(f.tomorrow.predicted_orders).toBe(10); // overall daily average (no 2+ same-weekday samples)
    expect(f.tomorrow.basis).toMatch(/overall daily average/);
  });

  test('week-over-week trend is detected', () => {
    const rows = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(2026, 6, 13 - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // last 7 days busier (20) than the prior 7 (10)
      rows.push({ date: key, orders: i < 7 ? 20 : 10, revenue: i < 7 ? 2000 : 1000 });
    }
    const f = computeForecast(rows, NOW);
    expect(f.trend_pct).toBe(100); // 20 vs 10
  });
});
