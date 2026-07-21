/**
 * useFraud — data layer for the "Fraud & Risk" owner monitoring screen.
 *
 * Lists staff-fraud risk ALERTS for the SELECTED outlet, a summary STATS strip,
 * and per-STAFF risk scores; plus per-alert actions (mark read / dismiss /
 * resolve). Every request is outlet-scoped — the backend reads outlet_id and an
 * owner's user.outlet_id is often null, so we ALWAYS pass it explicitly (query
 * for reads, body for writes) and put outletId in every query key.
 *
 * Endpoints (backend modules/fraud, mounted at /api/fraud):
 *   GET   /fraud/alerts?outlet_id=&unread=      → { items:[], total, page, limit, pages }
 *   GET   /fraud/stats?outlet_id=               → { total, unread, by_severity, by_type, trend_7d }
 *   GET   /fraud/staff-risks?outlet_id=         → [ { id, full_name, role, max_risk_score, risk_level, … } ]
 *   PATCH /fraud/alerts/:id/read     { outlet_id }
 *   PATCH /fraud/alerts/:id/dismiss  { outlet_id }
 *   PATCH /fraud/alerts/:id/resolve  { outlet_id, note }
 *
 * Pure transforms (extractors / severity + type maps / filters) live in
 * src/lib/fraud.js and are unit-tested — no React, no network.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';
import {
  extractAlerts, extractAlertsMeta, extractStats, extractStaffRisks,
} from '../lib/fraud';

const FRAUD_KEYS = {
  alerts: (outletId, filter) => ['fraud-alerts', outletId, filter],
  stats: (outletId) => ['fraud-stats', outletId],
  staff: (outletId) => ['fraud-staff-risks', outletId],
};

export function useFraud(filter = 'all') {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const alertsQ = useQuery({
    queryKey: FRAUD_KEYS.alerts(outletId, filter),
    enabled: !!outletId,
    staleTime: 20_000,
    queryFn: async () => {
      const params = { outlet_id: outletId, limit: 100 };
      if (filter === 'unread') params.unread = 'true';
      return api.get('/fraud/alerts', { params });
    },
  });

  const statsQ = useQuery({
    queryKey: FRAUD_KEYS.stats(outletId),
    enabled: !!outletId,
    staleTime: 20_000,
    queryFn: () => api.get('/fraud/stats', { params: { outlet_id: outletId } }),
  });

  const staffQ = useQuery({
    queryKey: FRAUD_KEYS.staff(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: () => api.get('/fraud/staff-risks', { params: { outlet_id: outletId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['fraud-alerts', outletId] });
    qc.invalidateQueries({ queryKey: FRAUD_KEYS.stats(outletId) });
    qc.invalidateQueries({ queryKey: FRAUD_KEYS.staff(outletId) });
  };

  const markReadM = useMutation({
    mutationFn: (id) => api.patch(`/fraud/alerts/${id}/read`, { outlet_id: outletId }),
    onSuccess: invalidate,
  });
  const dismissM = useMutation({
    mutationFn: (id) => api.patch(`/fraud/alerts/${id}/dismiss`, { outlet_id: outletId }),
    onSuccess: invalidate,
  });
  const resolveM = useMutation({
    mutationFn: ({ id, note }) => api.patch(`/fraud/alerts/${id}/resolve`, { outlet_id: outletId, note: note || undefined }),
    onSuccess: invalidate,
  });

  return {
    outletId,
    hasOutlet: !!outletId,

    alerts: extractAlerts(alertsQ.data),
    meta: extractAlertsMeta(alertsQ.data),
    stats: extractStats(statsQ.data),
    staffRisks: extractStaffRisks(staffQ.data),

    isLoading: alertsQ.isLoading,
    isError: alertsQ.isError,
    isRefetching: alertsQ.isRefetching || statsQ.isRefetching || staffQ.isRefetching,
    refetch: () => { alertsQ.refetch(); statsQ.refetch(); staffQ.refetch(); },

    markRead: (id) => markReadM.mutateAsync(id),
    isMarkingRead: markReadM.isPending,
    dismissAlert: (id) => dismissM.mutateAsync(id),
    isDismissing: dismissM.isPending,
    resolveAlert: (id, note) => resolveM.mutateAsync({ id, note }),
    isResolving: resolveM.isPending,
  };
}
