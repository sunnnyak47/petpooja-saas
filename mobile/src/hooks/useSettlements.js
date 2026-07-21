/**
 * useSettlements — read-only data layer for the Settlements screen (mobile).
 *
 * Payment / aggregator settlement reconciliation for the SELECTED outlet: list
 * settlement batches, a summary header (net settled / pending / count), and a
 * per-settlement detail (with reconciliation lines). Every request is
 * outlet-scoped — the backend's enforceOutletScope needs outlet_id, and an
 * owner's user.outlet_id is often null, so we ALWAYS pass it explicitly.
 *
 * Endpoints (backend modules/settlements, mounted at /api/settlements):
 *   GET /settlements?outlet_id=&limit=   → sendPaginated { data: rows[], meta:{ total } }
 *   GET /settlements/stats?outlet_id=    → sendSuccess   { data:{ total, by_status, total_net, total_variance } }
 *   GET /settlements/:id?outlet_id=      → sendSuccess   { data: settlement + lines[] }
 *
 * Read-only by design: create/reconcile/close/delete require MANAGE_PAYMENTS and
 * are intentionally not exposed here. Pure transforms live in ../lib/settlements
 * and are unit-tested (no React, no network).
 */
import { useQuery } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';
import {
  extractSettlements,
  extractTotal,
  extractStats,
  extractSettlement,
  EMPTY_STATS,
} from '../lib/settlements';

export const SETTLEMENT_KEYS = {
  list: (outletId) => ['settlements', outletId],
  stats: (outletId) => ['settlements-stats', outletId],
  detail: (outletId, id) => ['settlement', outletId, id],
};

/**
 * List + stats for the selected outlet.
 */
export function useSettlements() {
  const { outletId } = useOutlet();

  const listQuery = useQuery({
    queryKey: SETTLEMENT_KEYS.list(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/settlements', { params: { outlet_id: outletId, limit: 200 } });
      const rows = extractSettlements(res);
      return { rows, total: extractTotal(res, rows) };
    },
  });

  const statsQuery = useQuery({
    queryKey: SETTLEMENT_KEYS.stats(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/settlements/stats', { params: { outlet_id: outletId } });
      return extractStats(res);
    },
  });

  return {
    outletId,
    rows: listQuery.data?.rows || [],
    total: listQuery.data?.total || 0,
    stats: statsQuery.data || EMPTY_STATS,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    isRefetching: listQuery.isRefetching || statsQuery.isRefetching,
    refetch: () => {
      listQuery.refetch();
      statsQuery.refetch();
    },
    hasOutlet: !!outletId,
  };
}

/**
 * A single settlement (with its reconciliation lines). Fetched lazily — pass a
 * falsy id (e.g. when no row is selected) and the query stays idle.
 * @param {string|null} id
 */
export function useSettlementDetail(id) {
  const { outletId } = useOutlet();

  const query = useQuery({
    queryKey: SETTLEMENT_KEYS.detail(outletId, id),
    enabled: !!outletId && !!id,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get(`/settlements/${id}`, { params: { outlet_id: outletId } });
      return extractSettlement(res);
    },
  });

  return {
    settlement: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
