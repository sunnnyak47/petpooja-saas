/**
 * useLeads — data layer for the "Demo Leads" sales-pipeline screen (mobile).
 *
 * Leads are demo / sales requests captured from the marketing website. They are
 * PLATFORM-level (not outlet-scoped) — the backend restricts the list to
 * super_admin / platform_* roles, so no outlet_id is ever sent. This hook lists
 * every non-deleted lead, exposes per-status counts for the pipeline chips, and
 * moves a lead through the pipeline (new → contacted → demo_booked → won/lost).
 *
 * Endpoints (backend modules/leads/leads.routes.js, mounted at /api/leads):
 *   GET   /leads                → { leads[], counts:{status:n}, total }  · PLATFORM roles
 *   PATCH /leads/:id  { status }→ updated lead                           · platform admin/support
 *
 * The mobile api interceptor returns the response BODY, so a sendSuccess payload
 * arrives as { success, data, message } and the real fields live under `.data`.
 *
 * Pure helpers (statuses / filtering / formatting) are React- and network-free.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// Pipeline stages — mirrors the web LeadsPage ordering + colours.
export const LEAD_STATUSES = [
  { id: 'new',         label: 'New',         color: '#2563eb' },
  { id: 'contacted',   label: 'Contacted',   color: '#f59e0b' },
  { id: 'demo_booked', label: 'Demo booked', color: '#7c3aed' },
  { id: 'won',         label: 'Won',         color: '#16a34a' },
  { id: 'lost',        label: 'Lost',        color: '#ef4444' },
];

const LEAD_KEYS = { list: ['leads'] };

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Status metadata (label + colour), tolerant of unknown / missing values. */
export function leadStatusMeta(status) {
  return (
    LEAD_STATUSES.find((s) => s.id === status) || {
      id: status || 'new',
      label: status ? String(status).replace(/_/g, ' ') : 'New',
      color: '#64748b',
    }
  );
}

/** Free-text match over name / restaurant / email / phone. Blank query = all. */
export function matchesLead(lead = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [lead.name, lead.restaurant, lead.email, lead.phone, lead.current_system]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

/** Client-side filter by status ('all' | pipeline id) + free-text query. */
export function filterLeads(rows = [], { q = '', status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(
    (l) => (status === 'all' || l.status === status) && matchesLead(l, q)
  );
}

/** Total across a counts map, tolerant of a missing / partial object. */
export function totalFromCounts(counts = {}) {
  return Object.values(counts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Compact, AU-locale timestamp for a lead's created_at. */
export function formatLeadDate(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-AU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLeads() {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: LEAD_KEYS.list,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/leads', { params: { limit: 200 } });
      // sendSuccess → body { data: { leads, counts, total } }; api unwraps to body.
      const body = res?.data || res || {};
      const leads = Array.isArray(body.leads) ? body.leads : [];
      const counts = body.counts && typeof body.counts === 'object' ? body.counts : {};
      const total = typeof body.total === 'number' ? body.total : leads.length;
      return { leads, counts, total };
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/leads/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAD_KEYS.list }),
  });

  return {
    leads: listQuery.data?.leads || [],
    counts: listQuery.data?.counts || {},
    total: listQuery.data?.total || 0,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    isRefetching: listQuery.isRefetching,
    refetch: listQuery.refetch,
    updateStatus: (id, status) => updateMut.mutateAsync({ id, status }),
    isUpdating: updateMut.isPending,
  };
}
