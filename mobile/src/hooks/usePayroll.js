/**
 * usePayroll — data layer for the "Payroll" screen (mobile).
 *
 * Pay runs are the AU payroll document: for a period they total gross wages,
 * PAYG tax withheld, superannuation and net pay across a set of payslips (one
 * per employee). This hook lists pay runs for the SELECTED outlet and loads a
 * single run's payslips on demand. Every request is outlet-scoped — the
 * backend's controller falls back to req.user.outlet_id, but an owner's user row
 * often carries no single outlet, so we ALWAYS pass outlet_id explicitly.
 *
 * Endpoints (backend modules/payroll/*, mounted at /api/payroll):
 *   GET /payroll/pay-runs?outlet_id=       → { data: payRuns[] }  (each has _count.payslips)
 *   GET /payroll/pay-runs/:id?outlet_id=   → { data: payRun }     (with payslips[])
 *
 * Reads only. Creating / finalising pay runs is a heavier accounting action kept
 * on the web app; this screen is a mobile viewer. PAYG here is a simplified
 * estimate — not ATO-lodged.
 *
 * Pure helpers (formatting / summarising) are exported for unit tests — no React,
 * no network.
 */
import { useQuery } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

export const PR_STATUS = { DRAFT: 'draft', FINALISED: 'finalised' };

const PR_KEYS = {
  list: (outletId) => ['pay-runs', outletId],
  detail: (outletId, id) => ['pay-run', outletId, id],
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Coerce a possibly-string Prisma Decimal to a finite number. */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Currency-aware money formatter (AUD default; AUD/INR aware). */
export function formatMoney(currency, amount) {
  const cur = currency || 'AUD';
  const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(num(amount));
  } catch (_) {
    return `${cur} ${num(amount).toFixed(2)}`;
  }
}

/** Number of payslips on a run, tolerant of list (_count) vs detail (payslips[]) shape. */
export function payslipCount(run = {}) {
  if (run && run._count && typeof run._count.payslips === 'number') return run._count.payslips;
  if (Array.isArray(run.payslips)) return run.payslips.length;
  return 0;
}

/** Normalise the status string to draft | finalised. */
export function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'finalized') return PR_STATUS.FINALISED;
  return s === PR_STATUS.FINALISED ? PR_STATUS.FINALISED : PR_STATUS.DRAFT;
}

export function isFinalised(run = {}) {
  return normalizeStatus(run.status) === PR_STATUS.FINALISED;
}

export function statusLabel(status) {
  return normalizeStatus(status) === PR_STATUS.FINALISED ? 'Finalised' : 'Draft';
}

/** "12 Aug 2025 – 18 Aug 2025" style period label. */
export function periodLabel(run = {}, locale = 'en-AU') {
  const fmt = (v) => {
    if (!v) return '';
    try {
      return new Date(v).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return ''; }
  };
  const a = fmt(run.period_start);
  const b = fmt(run.period_end);
  if (a && b) return `${a} – ${b}`;
  return a || b || 'Pay run';
}

/** Client-side filter by status ('all' | 'draft' | 'finalised'). */
export function filterPayRuns(rows = [], { status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => status === 'all' || normalizeStatus(r.status) === status
  );
}

/** Roll a set of pay runs up into headline counts + money totals. */
export function summarizePayRuns(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return list.reduce(
    (acc, r) => {
      acc.count += 1;
      if (isFinalised(r)) acc.finalised += 1; else acc.draft += 1;
      acc.gross += num(r.gross_total);
      acc.paye += num(r.paye_total);
      acc.super += num(r.super_total);
      acc.net += num(r.net_total);
      return acc;
    },
    { count: 0, finalised: 0, draft: 0, gross: 0, paye: 0, super: 0, net: 0 }
  );
}

/** Sum a payslip array into gross / paye / super / net totals. */
export function sumPayslips(payslips = []) {
  return (Array.isArray(payslips) ? payslips : []).reduce(
    (acc, p) => {
      acc.gross += num(p.gross);
      acc.paye += num(p.paye);
      acc.super += num(p.super_amt);
      acc.net += num(p.net);
      return acc;
    },
    { gross: 0, paye: 0, super: 0, net: 0 }
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** List pay runs for the selected outlet. */
export function usePayroll() {
  const { outletId } = useOutlet();

  const listQuery = useQuery({
    queryKey: PR_KEYS.list(outletId),
    enabled: !!outletId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/payroll/pay-runs', { params: { outlet_id: outletId } });
      // sendSuccess → body { data: rows[] }; api interceptor unwraps to the body.
      return Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    },
  });

  const rows = listQuery.data || [];

  return {
    outletId,
    rows,
    stats: summarizePayRuns(rows),
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    isRefetching: listQuery.isRefetching,
    refetch: () => listQuery.refetch(),
    hasOutlet: !!outletId,
  };
}

/** Load a single pay run (with payslips) on demand. */
export function usePayRunDetail(id) {
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: PR_KEYS.detail(outletId, id),
    enabled: !!outletId && !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get(`/payroll/pay-runs/${id}`, { params: { outlet_id: outletId } });
      return res?.data || res || null;
    },
  });

  const payRun = query.data || null;

  return {
    payRun,
    payslips: Array.isArray(payRun?.payslips) ? payRun.payslips : [],
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: () => query.refetch(),
  };
}
