/**
 * useRostering — data layer for the Rostering (staff shift roster) screen.
 *
 * VIEW-focused, outlet-scoped. Lists this outlet's rosters (each already carries
 * its `assignments` with staff), plus who is available today, and exposes the one
 * safe write: publishing a draft roster. The backend enforces outlet scope and an
 * owner's user.outlet_id is often null, so outlet_id is ALWAYS passed explicitly
 * (query for reads, body for the publish) and is part of every query key.
 *
 * Endpoints (backend/src/modules/staff/rostering.routes.js, mounted /api/rostering):
 *   GET  /rostering?outlet_id=                       → data: Roster[] (with assignments)
 *   GET  /rostering/available-staff?outlet_id=&date= → data: Staff[]  (availability-filtered)
 *   POST /rostering/:id/publish   { outlet_id }       → draft → published
 *
 * Pure shaping/formatting lives in src/lib/rostering.js and is unit-tested.
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';
import { extractRosters, extractAvailableStaff, todayKey } from '../lib/rostering';

const KEYS = {
  rosters: (outletId) => ['rostering', outletId],
  available: (outletId, date) => ['rostering-available', outletId, date],
};

export function useRostering() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();
  const date = useMemo(() => todayKey(), []);

  const rostersQuery = useQuery({
    queryKey: KEYS.rosters(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/rostering', { params: { outlet_id: outletId } });
      return extractRosters(res);
    },
  });

  const availableQuery = useQuery({
    queryKey: KEYS.available(outletId, date),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/rostering/available-staff', {
        params: { outlet_id: outletId, date },
      });
      return extractAvailableStaff(res);
    },
  });

  const publishMut = useMutation({
    mutationFn: (rosterId) => api.post(`/rostering/${rosterId}/publish`, { outlet_id: outletId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.rosters(outletId) }),
  });

  return {
    outletId,
    hasOutlet: !!outletId,
    rosters: rostersQuery.data || [],
    availableStaff: availableQuery.data || [],
    isLoading: rostersQuery.isLoading,
    isError: rostersQuery.isError,
    availableError: availableQuery.isError,
    isRefetching: rostersQuery.isRefetching || availableQuery.isRefetching,
    refetch: () => {
      rostersQuery.refetch();
      availableQuery.refetch();
    },
    publishRoster: (rosterId) => publishMut.mutateAsync(rosterId),
    isPublishing: publishMut.isPending,
  };
}
