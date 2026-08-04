/**
 * useAdvancedReports — data layer for the "Advanced Reports" (revenue analytics)
 * screen (mobile). Mirrors the web AdvancedReportsPage / RevenueAnalyticsPage.
 *
 * The backend serves one rich, read-only payload per range: an hourly heatmap
 * (24h × 7 days of order counts), a category revenue breakdown, a full profit &
 * loss statement, and a daily-revenue trend. This is NOT the same as the plain
 * /reports/summary the Analytics tab already uses — that one has no P&L, no
 * category mix and no real 24×7 grid.
 *
 * Every request is outlet-scoped — the backend's enforceOutletScope needs
 * outlet_id, and an owner's user.outlet_id is often null, so we ALWAYS pass it
 * explicitly as a query param.
 *
 * Endpoint (backend reports/reports.routes.js + reports.service.getAdvancedReport):
 *   GET /reports/advanced?outlet_id=&range=today|week|month|quarter · VIEW_REPORTS
 *     → sendSuccess → body { success, message, data: {
 *         hourly_heatmap:   [{ hour:0-23, day:0-6, count }],
 *         category_breakdown:[{ name, revenue, orders, pct }],
 *         profit_loss: { gross_revenue, discounts, refunds, net_revenue,
 *                        food_cost, staff_cost, overheads, total_expenses,
 *                        gross_profit, tax, net_profit },
 *         daily_revenue:    [{ day:'Mon', v }],
 *         total_orders, period:{ from, to, range } } }
 *   (mobile api interceptor unwraps the response to the BODY → read res.data)
 *
 * Pure helpers (normalising / deriving) are exported and unit-testable — no
 * React, no network.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

/** Ranges understood by GET /reports/advanced?range= (unknown → backend 'week'). */
export const AR_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
];

export const AR_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AR_KEYS = {
  report: (outletId, range) => ['advanced-reports', outletId, range],
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Coerce anything to a finite number (defaults to 0). */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Empty, fully-shaped P&L so the UI never dereferences undefined. */
export function emptyProfitLoss() {
  return {
    gross_revenue: 0, discounts: 0, refunds: 0, net_revenue: 0,
    food_cost: 0, staff_cost: 0, overheads: 0, total_expenses: 0,
    gross_profit: 0, tax: 0, net_profit: 0,
  };
}

/** Normalise the raw advanced-report payload into a stable, fully-shaped object. */
export function normalizeReport(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const pl = r.profit_loss && typeof r.profit_loss === 'object' ? r.profit_loss : {};
  return {
    hourly_heatmap: Array.isArray(r.hourly_heatmap) ? r.hourly_heatmap : [],
    category_breakdown: Array.isArray(r.category_breakdown) ? r.category_breakdown : [],
    daily_revenue: Array.isArray(r.daily_revenue) ? r.daily_revenue : [],
    profit_loss: {
      gross_revenue: num(pl.gross_revenue),
      discounts: num(pl.discounts),
      refunds: num(pl.refunds),
      net_revenue: num(pl.net_revenue),
      food_cost: num(pl.food_cost),
      staff_cost: num(pl.staff_cost),
      overheads: num(pl.overheads),
      total_expenses: num(pl.total_expenses),
      gross_profit: num(pl.gross_profit),
      tax: num(pl.tax),
      net_profit: num(pl.net_profit),
    },
    total_orders: num(r.total_orders),
    period: r.period && typeof r.period === 'object' ? r.period : null,
  };
}

/** True when the report carries anything worth rendering (else show empty state). */
export function hasReportData(report) {
  if (!report) return false;
  const pl = report.profit_loss || {};
  return (
    num(report.total_orders) > 0 ||
    num(pl.gross_revenue) > 0 ||
    num(pl.net_revenue) > 0 ||
    (report.category_breakdown || []).length > 0 ||
    (report.daily_revenue || []).some((d) => num(d.v) > 0)
  );
}

/** Net profit margin as a whole-number percentage of net revenue. */
export function profitMargin(report) {
  const pl = report?.profit_loss || {};
  const net = num(pl.net_revenue);
  if (net <= 0) return 0;
  return Math.round((num(pl.net_profit) / net) * 100);
}

/**
 * Build a 7×24 heatmap grid (grid[day][hour] = order count) plus the max cell
 * value, for colour-scaling. Tolerant of out-of-range / missing cells.
 */
export function buildHeatmap(cells) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let max = 0;
  for (const c of Array.isArray(cells) ? cells : []) {
    const d = Number(c?.day);
    const h = Number(c?.hour);
    const n = num(c?.count);
    if (d >= 0 && d < 7 && h >= 0 && h < 24) {
      grid[d][h] = n;
      if (n > max) max = n;
    }
  }
  return { grid, max };
}

/** The single busiest {day, hour, count} cell, or null when the grid is empty. */
export function peakCell(cells) {
  let best = null;
  for (const c of Array.isArray(cells) ? cells : []) {
    const n = num(c?.count);
    if (n > 0 && (!best || n > best.count)) {
      best = { day: Number(c.day), hour: Number(c.hour), count: n };
    }
  }
  return best;
}

/** Largest single day value in the daily-revenue trend (for bar scaling; min 1). */
export function maxDaily(daily) {
  return Math.max(1, ...(Array.isArray(daily) ? daily : []).map((d) => num(d.v)));
}

/** "3 PM" style label for an hour-of-day 0-23. */
export function fmtHour(h) {
  const hour = Number(h);
  if (!Number.isFinite(hour)) return '';
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAdvancedReports(initialRange = 'week') {
  const { outletId } = useOutlet();
  const [range, setRange] = useState(initialRange);

  const query = useQuery({
    queryKey: AR_KEYS.report(outletId, range),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/reports/advanced', {
        params: { outlet_id: outletId, range },
      });
      // sendSuccess → body { success, message, data }; api unwraps to the body.
      return normalizeReport(res?.data ?? res);
    },
  });

  return {
    outletId,
    range,
    setRange,
    report: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    hasOutlet: !!outletId,
  };
}
