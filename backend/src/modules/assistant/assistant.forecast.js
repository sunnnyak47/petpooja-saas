/**
 * @fileoverview Deterministic, grounded sales forecast for the assistant.
 *
 * Given a daily sales series (from reports.getRevenueTrendRange), it projects
 * tomorrow's orders + revenue using a day-of-week-aware average, compares that
 * to the window's daily average, and reports a week-over-week trend and a
 * confidence level based on how much history exists. Pure function (no I/O),
 * so it's fully unit-testable and never fabricates — it only averages real days.
 * @module modules/assistant/assistant.forecast
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const numOf = (v) => Number(v) || 0;
const avgBy = (arr, key) => (arr.length ? arr.reduce((s, d) => s + numOf(d[key]), 0) / arr.length : 0);

/**
 * @param {Array<{date:string, orders:number, revenue:number}>} series - daily rows (YYYY-MM-DD), any order
 * @param {Date} now - reference "today"
 * @returns {object} forecast summary
 */
function computeForecast(series, now = new Date()) {
  const days = (Array.isArray(series) ? series : []).filter((d) => d && d.date);
  const daysWithData = days.length;

  const avgOrders = avgBy(days, 'orders');
  const avgRevenue = avgBy(days, 'revenue');

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dow = tomorrow.getDay();
  const weekday = WEEKDAYS[dow];

  // Same-weekday history (restaurants have strong day-of-week patterns).
  const sameDow = days.filter((d) => new Date(`${d.date}T00:00:00`).getDay() === dow);
  const useWeekday = sameDow.length >= 2;
  const baseOrders = useWeekday ? avgBy(sameDow, 'orders') : avgOrders;
  const baseRevenue = useWeekday ? avgBy(sameDow, 'revenue') : avgRevenue;

  const predictedOrders = Math.round(baseOrders);
  const predictedRevenue = Math.round(baseRevenue);
  const ordersVsAvgPct = avgOrders ? Math.round(((predictedOrders - avgOrders) / avgOrders) * 100) : null;
  const revenueVsAvgPct = avgRevenue ? Math.round(((predictedRevenue - avgRevenue) / avgRevenue) * 100) : null;

  // Week-over-week momentum: last 7 active days vs the 7 before.
  const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const prev7 = sorted.slice(-14, -7);
  const recent = avgBy(last7, 'orders');
  const prior = avgBy(prev7, 'orders');
  const trendPct = prior ? Math.round(((recent - prior) / prior) * 100) : null;

  const confidence = daysWithData >= 21 ? 'high' : daysWithData >= 7 ? 'medium' : daysWithData >= 1 ? 'low' : 'none';

  return {
    window_days: 30,
    days_with_data: daysWithData,
    avg_orders_per_day: Math.round(avgOrders * 10) / 10,
    avg_revenue_per_day: Math.round(avgRevenue),
    tomorrow: {
      weekday,
      predicted_orders: predictedOrders,
      predicted_revenue: predictedRevenue,
      orders_vs_avg_pct: ordersVsAvgPct,
      revenue_vs_avg_pct: revenueVsAvgPct,
      basis: useWeekday ? `${sameDow.length} recent ${weekday}s` : 'overall daily average',
    },
    trend_pct: trendPct,
    confidence,
  };
}

module.exports = { computeForecast, WEEKDAYS };
