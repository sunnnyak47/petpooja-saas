import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// ─── Query Keys ────────────────────────────────────────────────────────────
export const KEYS = {
  dashboard: ['dashboard'],
  orders: ['orders'],
  order: (id) => ['orders', id],
  inventory: ['inventory'],
  reports: (range) => ['reports', range],
  purchaseOrders: ['purchase-orders'],
};

// ─── Dashboard ──────────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery({
    queryKey: KEYS.dashboard,
    queryFn: () => api.get('/dashboard/summary'),
    staleTime: 15 * 1000, // refresh every 15s for live feel
  });
}

// ─── Orders ─────────────────────────────────────────────────────────────────
export function useOrders(params = {}) {
  return useQuery({
    queryKey: [...KEYS.orders, params],
    queryFn: () => api.get('/orders', { params }),
    staleTime: 10 * 1000,
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }) =>
      api.patch(`/orders/${orderId}/status`, { status }),
    // Optimistic update — UI changes before server responds
    onMutate: async ({ orderId, status }) => {
      await qc.cancelQueries({ queryKey: KEYS.orders });
      const prev = qc.getQueryData(KEYS.orders);
      qc.setQueryData(KEYS.orders, (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((o) =>
            o.id === orderId || o._id === orderId ? { ...o, status } : o
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback on failure
      if (ctx?.prev) qc.setQueryData(KEYS.orders, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.orders });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

// ─── Inventory ──────────────────────────────────────────────────────────────
export function useInventory(params = {}) {
  return useQuery({
    queryKey: [...KEYS.inventory, params],
    queryFn: () => api.get('/inventory', { params }),
    staleTime: 60 * 1000,
  });
}

export function useUpdateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }) => api.patch(`/inventory/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.inventory }),
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────
export function useReports(range = '7d') {
  return useQuery({
    queryKey: KEYS.reports(range),
    queryFn: () => api.get('/reports/summary', { params: { range } }),
    staleTime: 5 * 60 * 1000, // reports are slow to change
  });
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────
export function usePurchaseOrders() {
  return useQuery({
    queryKey: KEYS.purchaseOrders,
    queryFn: () => api.get('/purchase-orders'),
    staleTime: 30 * 1000,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/purchase-orders', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.purchaseOrders }),
  });
}
