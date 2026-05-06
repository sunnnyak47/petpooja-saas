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

// ─── Mock Data ─────────────────────────────────────────────────────────────
const MOCK_DASHBOARD = {
  today_revenue: 24500,
  today_orders: 38,
  pending_orders: 5,
  active_tables: 8,
  low_stock_items: 3,
  top_items: [
    { name: 'Paneer Butter Masala', count: 14 },
    { name: 'Dal Makhani', count: 11 },
    { name: 'Garlic Naan', count: 22 },
  ],
  revenue_trend: [18000, 21000, 19500, 23000, 24500],
};

const MOCK_ORDERS = [
  {
    id: 'o1',
    order_number: 'ORD-001',
    status: 'pending',
    total_amount: 850,
    table_number: '3',
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    items: [{ name: 'Paneer Butter Masala', quantity: 1, price: 320 }, { name: 'Naan', quantity: 2, price: 60 }],
  },
  {
    id: 'o2',
    order_number: 'ORD-002',
    status: 'preparing',
    total_amount: 1240,
    table_number: '5',
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    items: [{ name: 'Dal Makhani', quantity: 2, price: 380 }, { name: 'Jeera Rice', quantity: 2, price: 240 }],
  },
  {
    id: 'o3',
    order_number: 'ORD-003',
    status: 'served',
    total_amount: 560,
    table_number: '1',
    created_at: new Date(Date.now() - 55 * 60000).toISOString(),
    items: [{ name: 'Masala Chai', quantity: 4, price: 80 }, { name: 'Samosa', quantity: 4, price: 60 }],
  },
];

const MOCK_INVENTORY = [
  { id: 'i1', name: 'Tomatoes', unit: 'kg', quantity: 8.5, min_quantity: 5, cost_per_unit: 40, category: 'Vegetables' },
  { id: 'i2', name: 'Paneer', unit: 'kg', quantity: 3.2, min_quantity: 4, cost_per_unit: 320, category: 'Dairy' },
  { id: 'i3', name: 'Chicken', unit: 'kg', quantity: 15, min_quantity: 10, cost_per_unit: 280, category: 'Proteins' },
  { id: 'i4', name: 'Basmati Rice', unit: 'kg', quantity: 22, min_quantity: 10, cost_per_unit: 90, category: 'Grains' },
  { id: 'i5', name: 'Cooking Oil', unit: 'L', quantity: 6, min_quantity: 5, cost_per_unit: 130, category: 'Oils' },
];

const MOCK_REPORTS = {
  range: '7d',
  total_revenue: 168500,
  total_orders: 284,
  avg_order_value: 593,
  top_items: [
    { name: 'Paneer Butter Masala', revenue: 18240, count: 57 },
    { name: 'Dal Makhani', revenue: 14440, count: 38 },
    { name: 'Garlic Naan', revenue: 7920, count: 132 },
  ],
  daily_revenue: [
    { date: '2026-05-01', revenue: 21500 },
    { date: '2026-05-02', revenue: 19800 },
    { date: '2026-05-03', revenue: 24200 },
    { date: '2026-05-04', revenue: 22600 },
    { date: '2026-05-05', revenue: 26400 },
    { date: '2026-05-06', revenue: 29500 },
    { date: '2026-05-07', revenue: 24500 },
  ],
};

const MOCK_PURCHASE_ORDERS = [
  {
    id: '1',
    po_number: 'PO-2026-001',
    supplier_name: 'Fresh Farms Co.',
    status: 'pending',
    total_amount: 12500,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    items: [{ name: 'Tomatoes', qty: '10kg', price: 400 }, { name: 'Onions', qty: '20kg', price: 700 }],
  },
  {
    id: '2',
    po_number: 'PO-2026-002',
    supplier_name: 'Premium Proteins',
    status: 'delivered',
    total_amount: 28000,
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    items: [{ name: 'Chicken', qty: '100kg', price: 28000 }],
  },
  {
    id: '3',
    po_number: 'PO-2026-003',
    supplier_name: 'Spice Route',
    status: 'ordered',
    total_amount: 5500,
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    items: [{ name: 'Spice Mix', qty: '5kg', price: 5500 }],
  },
];

// ─── Helper: extract data array or object from response ───────────────────
function extractData(res) {
  // Handles: { data: { items: [] } }, { data: [] }, { items: [] }, raw array, raw object
  if (!res) return null;
  if (res.data?.items) return res.data.items;
  if (res.data) return res.data;
  if (res.items) return res.items;
  return res;
}

function isEmptyResult(data) {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
// Backend route: GET /api/dashboard/summary (not registered — falls back to mock)
export function useDashboard() {
  return useQuery({
    queryKey: KEYS.dashboard,
    queryFn: async () => {
      try {
        const res = await api.get('/dashboard/summary');
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_DASHBOARD;
      return data;
    },
    staleTime: 15 * 1000, // refresh every 15s for live feel
  });
}

// ─── Orders ─────────────────────────────────────────────────────────────────
// Backend route: GET /api/orders
export function useOrders(params = {}) {
  return useQuery({
    queryKey: [...KEYS.orders, params],
    queryFn: async () => {
      try {
        const res = await api.get('/orders', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_ORDERS;
      return data;
    },
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
// Backend route: GET /api/inventory
export function useInventory(params = {}) {
  return useQuery({
    queryKey: [...KEYS.inventory, params],
    queryFn: async () => {
      try {
        const res = await api.get('/inventory', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_INVENTORY;
      return data;
    },
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
// Backend route: GET /api/reports (summary via /api/reports/summary)
export function useReports(range = '7d') {
  return useQuery({
    queryKey: KEYS.reports(range),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/summary', { params: { range } });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return { ...MOCK_REPORTS, range };
      return data;
    },
    staleTime: 5 * 60 * 1000, // reports are slow to change
  });
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────
// Backend route: GET /api/purchase-orders (via procurement.routes mounted at /api)
export function usePurchaseOrders() {
  return useQuery({
    queryKey: KEYS.purchaseOrders,
    queryFn: async () => {
      try {
        const res = await api.get('/purchase-orders');
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_PURCHASE_ORDERS;
      return data;
    },
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
