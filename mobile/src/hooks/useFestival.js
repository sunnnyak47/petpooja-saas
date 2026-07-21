/**
 * useFestival — data layer for the "Festival Mode" screen (mobile).
 *
 * Surfaces the outlet's festival / surge configs: the currently-active mode, every
 * saved config (toggle on/off), and the master catalogue for reference. Every
 * request is outlet-scoped — the backend falls back to req.user.outlet_id which is
 * often null for an owner, so we ALWAYS pass outlet_id explicitly (query for reads,
 * body for the toggle write) and key every query by outletId.
 *
 * Endpoints (backend modules/festival/*):
 *   GET  /festival/active?outlet_id=       → data: <config>|null   (POS's active mode)
 *   GET  /festival/configs?outlet_id=      → data: [config,...]     (all saved, start_date asc)
 *   GET  /festival/master                  → data: [def,...]        (catalogue, IN + AU)
 *   POST /festival/configs/:id/toggle {outlet_id} → data:<config>   (flip is_active; activating one deactivates the rest)
 *
 * Pure transforms / extractors live in ../lib/festival and are unit-tested (no
 * React, no network).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';
import {
  extractActive,
  extractConfigs,
  extractMaster,
  sortConfigs,
  toggleBody,
} from '../lib/festival';

const FESTIVAL_KEYS = {
  active: (outletId) => ['festival-active', outletId],
  configs: (outletId) => ['festival-configs', outletId],
  master: (outletId) => ['festival-master', outletId],
};

export function useFestival() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const activeQuery = useQuery({
    queryKey: FESTIVAL_KEYS.active(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/festival/active', { params: { outlet_id: outletId } });
      return extractActive(res);
    },
  });

  const configsQuery = useQuery({
    queryKey: FESTIVAL_KEYS.configs(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/festival/configs', { params: { outlet_id: outletId } });
      return sortConfigs(extractConfigs(res));
    },
  });

  const masterQuery = useQuery({
    queryKey: FESTIVAL_KEYS.master(outletId),
    enabled: !!outletId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.get('/festival/master');
      return extractMaster(res);
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: FESTIVAL_KEYS.active(outletId) });
    qc.invalidateQueries({ queryKey: FESTIVAL_KEYS.configs(outletId) });
  };

  const toggleMut = useMutation({
    mutationFn: (id) => api.post(`/festival/configs/${id}/toggle`, toggleBody(outletId)),
    onSuccess: invalidate,
  });

  return {
    outletId,
    hasOutlet: !!outletId,
    active: activeQuery.data ?? null,
    configs: configsQuery.data || [],
    master: masterQuery.data || [],
    isLoading: configsQuery.isLoading || activeQuery.isLoading,
    isError: configsQuery.isError,
    isRefetching:
      configsQuery.isRefetching || activeQuery.isRefetching || masterQuery.isRefetching,
    refetch: () => {
      activeQuery.refetch();
      configsQuery.refetch();
      masterQuery.refetch();
    },
    toggleConfig: (id) => toggleMut.mutateAsync(id),
    isToggling: toggleMut.isPending,
    togglingId: toggleMut.isPending ? toggleMut.variables : null,
  };
}
