/**
 * useBudgets — data layer for the "Budgets" screen (mobile).
 *
 * Budgets hold per-account target amounts for a financial year; "budget vs
 * actual" compares those targets against the P&L for the year. This hook lists
 * budgets for the SELECTED outlet and (via a second hook) fetches the vs-actual
 * breakdown for one budget. Every request is outlet-scoped — the backend reads
 * req.query.outlet_id (falling back to the user's outlet), and an owner's
 * user.outlet_id is often null, so we ALWAYS pass outlet_id explicitly.
 *
 * Endpoints (backend accounting.budget.service, mounted at /api/accounting):
 *   GET /accounting/budgets?outlet_id=
 *     → data: [{ id, name, fy_year, created_at, line_count }]
 *   GET /accounting/budgets/:id/vs-actual?outlet_id=&from=&to=
 *     → data: { budget_id, name, fy_year, from, to,
 *               lines: [{ account_code, account_name, budget, actual, variance, variance_pct }],
 *               totals: { budget, actual, variance } }
 *
 * The mobile api interceptor unwraps to the response BODY ({ success, data, message }),
 * so the payload is res.data. Pure helpers below are React-free and unit-testable.
 */
import { useQuery } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

const BUDGET_KEYS = {
  list: (outletId) => ['budgets', outletId],
  vsActual: (outletId, id, from, to) => ['budget-vs-actual', outletId, id, from, to],
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/**
 * The calendar-year date range for a financial year, matching the web page:
 * FY 2026 → { from: '2026-01-01', to: '2026-12-31' }.
 */
export function fyRange(fyYear) {
  const y = Number(fyYear);
  if (!Number.isFinite(y)) return { from: null, to: null };
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Currency-aware money formatter (outlet region → AUD/INR), with 2 decimals. */
export function formatMoney(currency, amount) {
  const cur = currency || 'AUD';
  const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch (_) {
    return `${cur} ${(Number(amount) || 0).toFixed(2)}`;
  }
}

/** Free-text match over budget name / FY year. Blank query matches all. */
export function matchesBudget(budget = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [budget.name, budget.fy_year != null ? `fy ${budget.fy_year}` : '', budget.fy_year]
    .filter((x) => x !== undefined && x !== null && x !== '')
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

/** Client-side filter by free-text query. */
export function filterBudgets(rows = [], q = '') {
  return (Array.isArray(rows) ? rows : []).filter((b) => matchesBudget(b, q));
}

/** Count + total budget-line summary from a row set. */
export function summarizeBudgets(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const lines = list.reduce((sum, b) => sum + (Number(b.line_count) || 0), 0);
  return { count: list.length, lines };
}

/** The largest budget/actual value across all lines — the bar scale. */
export function maxLineValue(lines = []) {
  const list = Array.isArray(lines) ? lines : [];
  let max = 0;
  for (const l of list) {
    max = Math.max(max, Math.abs(Number(l.budget) || 0), Math.abs(Number(l.actual) || 0));
  }
  return max;
}

/** A value's share of the scale, clamped to 0–100 (%). */
export function pctOf(value, max) {
  const m = Number(max) || 0;
  if (m <= 0) return 0;
  const p = (Math.abs(Number(value) || 0) / m) * 100;
  return Math.max(0, Math.min(100, p));
}

/**
 * Matches the web's favourability rule: a non-negative variance (actual ≥
 * budget) is treated as favourable/green, negative as unfavourable/red.
 */
export function varianceIsFavourable(variance) {
  return (Number(variance) || 0) >= 0;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/** List budgets for the selected outlet. */
export function useBudgets() {
  const { outletId } = useOutlet();

  const listQuery = useQuery({
    queryKey: BUDGET_KEYS.list(outletId),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/accounting/budgets', { params: { outlet_id: outletId } });
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      return rows;
    },
  });

  const rows = listQuery.data || [];

  return {
    outletId,
    rows,
    stats: summarizeBudgets(rows),
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    isRefetching: listQuery.isRefetching,
    refetch: () => listQuery.refetch(),
    hasOutlet: !!outletId,
  };
}

/**
 * Budget-vs-actual for a single budget. Pass the budget row (needs id + fy_year);
 * the query is disabled until both an outlet and a budget are present.
 */
export function useBudgetVsActual(budget) {
  const { outletId } = useOutlet();
  const id = budget?.id || null;
  const { from, to } = fyRange(budget?.fy_year);

  const query = useQuery({
    queryKey: BUDGET_KEYS.vsActual(outletId, id, from, to),
    enabled: !!outletId && !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get(`/accounting/budgets/${id}/vs-actual`, {
        params: { outlet_id: outletId, from, to },
      });
      return res?.data || res || null;
    },
  });

  const data = query.data || null;
  return {
    from,
    to,
    data,
    lines: Array.isArray(data?.lines) ? data.lines : [],
    totals: data?.totals || { budget: 0, actual: 0, variance: 0 },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}
