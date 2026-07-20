/**
 * useDevices — data layer for the Devices & Security screen (web parity).
 *
 * Lists the current user's active device sessions + recent login history, and
 * exposes revoke (sign out one device) and logout-others (sign out everywhere
 * else). Endpoints: GET /auth/sessions, GET /auth/login-history, POST
 * /auth/sessions/:sid/revoke, POST /auth/sessions/logout-others.
 *
 * Pure transforms live in src/lib/devices.js (unit-tested).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { extractSessions, extractHistory, lastLoginAt } from '../lib/devices';

export function useDevices() {
  const qc = useQueryClient();

  const sessionsQ = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.get('/auth/sessions'),
    refetchInterval: 60_000,
  });
  const historyQ = useQuery({
    queryKey: ['auth-login-history'],
    queryFn: () => api.get('/auth/login-history?limit=25'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['auth-sessions'] });
    qc.invalidateQueries({ queryKey: ['auth-login-history'] });
  };

  const revokeM = useMutation({
    mutationFn: (sid) => api.post(`/auth/sessions/${sid}/revoke`),
    onSuccess: invalidate,
  });
  const logoutOthersM = useMutation({
    mutationFn: () => api.post('/auth/sessions/logout-others'),
    onSuccess: invalidate,
  });

  return {
    sessions: extractSessions(sessionsQ.data),
    history: extractHistory(historyQ.data),
    lastLogin: lastLoginAt(sessionsQ.data),
    isLoading: sessionsQ.isLoading,
    isError: sessionsQ.isError,
    refetch: () => { sessionsQ.refetch(); historyQ.refetch(); },
    revoke: revokeM.mutate,
    revoking: revokeM.isPending,
    logoutOthers: logoutOthersM.mutate,
    loggingOut: logoutOthersM.isPending,
  };
}
