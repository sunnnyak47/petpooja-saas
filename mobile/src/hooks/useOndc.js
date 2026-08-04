/**
 * useOndc — data layer for the "ONDC Network" screen (mobile).
 *
 * ONDC (Open Network for Digital Commerce) is India's public commerce network.
 * This hook surfaces, for the SELECTED outlet: the seller profile + go-live
 * status, network order analytics, and the live ONDC order queue with the
 * seller-side actions (accept / reject / advance). Every request is
 * outlet-scoped — the backend reads outlet_id from the query (reads) or body
 * (writes); an owner's user.outlet_id is often null, so we ALWAYS pass it.
 *
 * Endpoints (backend modules/ondc/ondc.routes.js — mounted at /api/ondc):
 *   GET  /ondc/profile?outlet_id=            → { data: profile }
 *   GET  /ondc/orders?outlet_id=&limit=      → { data: orders[], meta:{ total } }
 *   GET  /ondc/analytics?outlet_id=          → { data: { total_orders, status_breakdown, total_revenue, ... } }
 *   POST /ondc/profile/toggle-live { outlet_id, live }  → go live / offline (verified first)
 *   POST /ondc/profile/submit      { outlet_id }        → submit onboarding for review
 *   POST /ondc/orders/:id/accept   { prep_time_minutes } → accept a pending order
 *   POST /ondc/orders/:id/reject   { reason }            → reject a pending order
 *   PATCH /ondc/orders/:id/status  { status }            → advance accepted→preparing→ready
 *
 * ONDC is India-only, so amounts are always INR.
 * Pure helpers (filtering / formatting / transitions) are unit-tested — no React.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

// Seller onboarding lifecycle.
export const SELLER_STATUS = {
  DRAFT: 'draft',
  UNDER_REVIEW: 'under_review',
  VERIFIED: 'verified',
  LIVE: 'live',
};

// ONDC order lifecycle (seller side).
export const ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  PICKED_UP: 'picked_up',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

const ORDER_FILTERS = ['all', 'pending', 'accepted', 'preparing', 'ready', 'picked_up', 'rejected'];

const ONDC_KEYS = {
  profile: (outletId) => ['ondc-profile', outletId],
  orders: (outletId) => ['ondc-orders', outletId],
  analytics: (outletId) => ['ondc-analytics', outletId],
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Human label for a seller onboarding status. */
export function sellerStatusLabel(status) {
  switch (status) {
    case SELLER_STATUS.DRAFT: return 'Draft';
    case SELLER_STATUS.UNDER_REVIEW: return 'Under review';
    case SELLER_STATUS.VERIFIED: return 'Verified';
    case SELLER_STATUS.LIVE: return 'Live';
    default: return status ? String(status).replace(/_/g, ' ') : 'Unknown';
  }
}

/** Human label for an ONDC order status. */
export function orderStatusLabel(status) {
  switch (status) {
    case ORDER_STATUS.PENDING: return 'New';
    case ORDER_STATUS.ACCEPTED: return 'Accepted';
    case ORDER_STATUS.PREPARING: return 'Preparing';
    case ORDER_STATUS.READY: return 'Ready';
    case ORDER_STATUS.PICKED_UP: return 'Picked up';
    case ORDER_STATUS.REJECTED: return 'Rejected';
    case ORDER_STATUS.CANCELLED: return 'Cancelled';
    default: return status ? String(status).replace(/_/g, ' ') : '';
  }
}

/**
 * The next status a seller can advance an order to via PATCH /status.
 * Only the transitions the backend actually accepts (Joi ∩ service) are offered:
 *   accepted → preparing, preparing → ready. ('pending' uses accept/reject.)
 */
export function nextOrderStatus(status) {
  if (status === ORDER_STATUS.ACCEPTED) return ORDER_STATUS.PREPARING;
  if (status === ORDER_STATUS.PREPARING) return ORDER_STATUS.READY;
  return null;
}

/** Can this order be accepted / rejected? (only brand-new orders) */
export function isPendingOrder(order = {}) {
  return order.status === ORDER_STATUS.PENDING;
}

/** INR money formatter — ONDC is an India-only network. */
export function formatMoney(amount) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch (_) {
    return `₹${(Number(amount) || 0).toFixed(2)}`;
  }
}

/** Number of line items on an order, tolerant of shape drift. */
export function orderItemCount(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((n, i) => n + (Number(i?.quantity) || 1), 0);
}

/** Free-text match over customer / id / bap. Blank query matches all. */
export function matchesOrder(order = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [order.customer_name, order.ondc_order_id, order.bap_id, order.customer_phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

/** Client-side filter by status chip + query. */
export function filterOrders(rows = [], { q = '', status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter(
    (o) => (status === 'all' || o.status === status) && matchesOrder(o, q)
  );
}

/** Counts used for filter chips + header badge. */
export function summarizeOrders(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = { all: list.length };
  for (const k of ORDER_FILTERS) if (k !== 'all') counts[k] = 0;
  for (const o of list) if (o.status in counts) counts[o.status] += 1;
  return counts;
}

export const ORDER_FILTER_KEYS = ORDER_FILTERS;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOndc() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ONDC_KEYS.profile(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/ondc/profile', { params: { outlet_id: outletId } });
      return res?.data || null;
    },
  });

  const ordersQuery = useQuery({
    queryKey: ONDC_KEYS.orders(outletId),
    enabled: !!outletId,
    staleTime: 20_000,
    queryFn: async () => {
      const res = await api.get('/ondc/orders', { params: { outlet_id: outletId, limit: 100 } });
      const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const total = res?.meta?.total ?? rows.length;
      return { rows, total };
    },
  });

  const analyticsQuery = useQuery({
    queryKey: ONDC_KEYS.analytics(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/ondc/analytics', { params: { outlet_id: outletId } });
      return res?.data || { total_orders: 0, status_breakdown: {}, total_revenue: 0, items_revenue: 0, bap_breakdown: [] };
    },
  });

  const invalidateOrders = () => {
    qc.invalidateQueries({ queryKey: ONDC_KEYS.orders(outletId) });
    qc.invalidateQueries({ queryKey: ONDC_KEYS.analytics(outletId) });
  };
  const invalidateProfile = () => qc.invalidateQueries({ queryKey: ONDC_KEYS.profile(outletId) });

  const toggleLiveMut = useMutation({
    mutationFn: (live) => api.post('/ondc/profile/toggle-live', { outlet_id: outletId, live }),
    onSuccess: invalidateProfile,
  });

  const submitMut = useMutation({
    mutationFn: () => api.post('/ondc/profile/submit', { outlet_id: outletId }),
    onSuccess: invalidateProfile,
  });

  const acceptMut = useMutation({
    mutationFn: ({ id, prepMinutes }) => {
      const body = {};
      if (Number.isFinite(prepMinutes) && prepMinutes > 0) body.prep_time_minutes = prepMinutes;
      return api.post(`/ondc/orders/${id}/accept`, body);
    },
    onSuccess: invalidateOrders,
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/ondc/orders/${id}/reject`, { reason }),
    onSuccess: invalidateOrders,
  });

  const advanceMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/ondc/orders/${id}/status`, { status }),
    onSuccess: invalidateOrders,
  });

  return {
    outletId,
    hasOutlet: !!outletId,

    profile: profileQuery.data || null,
    analytics: analyticsQuery.data || { total_orders: 0, status_breakdown: {}, total_revenue: 0, items_revenue: 0, bap_breakdown: [] },
    rows: ordersQuery.data?.rows || [],
    total: ordersQuery.data?.total || 0,

    isLoading: profileQuery.isLoading || ordersQuery.isLoading,
    isError: profileQuery.isError || ordersQuery.isError,
    isRefetching: profileQuery.isRefetching || ordersQuery.isRefetching || analyticsQuery.isRefetching,
    refetch: () => { profileQuery.refetch(); ordersQuery.refetch(); analyticsQuery.refetch(); },

    toggleLive: (live) => toggleLiveMut.mutateAsync(live),
    isToggling: toggleLiveMut.isPending,
    submitForReview: () => submitMut.mutateAsync(),
    isSubmitting: submitMut.isPending,
    acceptOrder: (id, prepMinutes) => acceptMut.mutateAsync({ id, prepMinutes }),
    isAccepting: acceptMut.isPending,
    rejectOrder: (id, reason) => rejectMut.mutateAsync({ id, reason }),
    isRejecting: rejectMut.isPending,
    advanceOrder: (id, status) => advanceMut.mutateAsync({ id, status }),
    isAdvancing: advanceMut.isPending,
  };
}
