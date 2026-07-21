/**
 * useAccounting — data layer for the read-only "Accounting" owner-books snapshot.
 *
 * Fetches the owner's plain-language books summary for the SELECTED outlet and
 * the supporting reports. Every request is outlet-scoped — the backend resolves
 * outlet_id from the query param (an owner's user.outlet_id is often null), so we
 * ALWAYS pass it explicitly and put it in every react-query key.
 *
 * READ-ONLY: no mutations. Endpoints (backend modules/accounting, mounted /api/accounting):
 *   GET /accounting/owner-dashboard?outlet_id=    → this-month P&L, BAS, receivables/payables, expenses
 *   GET /accounting/profit-loss?outlet_id=        → P&L detail (all-time when no from/to)
 *   GET /accounting/bas?outlet_id=                → BAS/GST summary
 *   GET /accounting/receivables-aging?outlet_id=  → aged unpaid orders (the short list)
 *
 * Pure transforms live in src/lib/accounting.js and are unit-tested (no network).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';
import {
  extractDashboard,
  extractProfitLoss,
  extractBas,
  extractReceivables,
} from '../lib/accounting';

const ACC_KEYS = {
  dashboard: (outletId) => ['accounting-dashboard', outletId],
  profitLoss: (outletId) => ['accounting-profit-loss', outletId],
  bas: (outletId) => ['accounting-bas', outletId],
  receivables: (outletId) => ['accounting-receivables', outletId],
};

const STALE = 60_000;

export function useAccounting() {
  const { outletId, currentOutlet } = useOutlet();
  const qc = useQueryClient();
  const enabled = !!outletId;
  const params = { outlet_id: outletId };

  const dashboardQuery = useQuery({
    queryKey: ACC_KEYS.dashboard(outletId),
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const res = await api.get('/accounting/owner-dashboard', { params });
      return extractDashboard(res);
    },
  });

  const receivablesQuery = useQuery({
    queryKey: ACC_KEYS.receivables(outletId),
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const res = await api.get('/accounting/receivables-aging', { params });
      return extractReceivables(res);
    },
  });

  // Supporting reports — the owner-dashboard already folds these in, but we fetch
  // them too so the screen can show ledger-accurate P&L / BAS figures and degrade
  // gracefully if a single endpoint hiccups.
  const profitLossQuery = useQuery({
    queryKey: ACC_KEYS.profitLoss(outletId),
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const res = await api.get('/accounting/profit-loss', { params });
      return extractProfitLoss(res);
    },
  });

  const basQuery = useQuery({
    queryKey: ACC_KEYS.bas(outletId),
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const res = await api.get('/accounting/bas', { params });
      return extractBas(res);
    },
  });

  const refetch = () => {
    dashboardQuery.refetch();
    receivablesQuery.refetch();
    profitLossQuery.refetch();
    basQuery.refetch();
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ACC_KEYS.dashboard(outletId) });
    qc.invalidateQueries({ queryKey: ACC_KEYS.receivables(outletId) });
    qc.invalidateQueries({ queryKey: ACC_KEYS.profitLoss(outletId) });
    qc.invalidateQueries({ queryKey: ACC_KEYS.bas(outletId) });
  };

  return {
    outletId,
    outletName: currentOutlet?.name || null,
    hasOutlet: enabled,

    dashboard: dashboardQuery.data || null,
    receivables: receivablesQuery.data || null,
    profitLoss: profitLossQuery.data || null,
    bas: basQuery.data || null,

    // The dashboard is the primary payload — its load/error state drives the screen.
    isLoading: dashboardQuery.isLoading,
    isError: dashboardQuery.isError,
    error: dashboardQuery.error || null,
    isRefetching:
      dashboardQuery.isRefetching ||
      receivablesQuery.isRefetching ||
      profitLossQuery.isRefetching ||
      basQuery.isRefetching,

    refetch,
    invalidate,
  };
}

export { ACC_KEYS };
