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
  menuItems: ['menu-items'],
  staff: ['staff'],
  reservations: ['reservations'],
  customers: ['customers'],
  kot: ['kot'],
  expenses: ['expenses'],
  eod: ['eod'],
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

const MOCK_MENU_ITEMS = [
  { id: 'm1', name: 'Paneer Butter Masala', category: 'Main Course', price: 320, is_available: true, description: 'Rich creamy tomato gravy' },
  { id: 'm2', name: 'Dal Makhani', category: 'Main Course', price: 280, is_available: true, description: 'Slow-cooked black lentils' },
  { id: 'm3', name: 'Garlic Naan', category: 'Breads', price: 60, is_available: true, description: 'Soft leavened flatbread' },
  { id: 'm4', name: 'Butter Naan', category: 'Breads', price: 50, is_available: true, description: 'Classic tandoor naan' },
  { id: 'm5', name: 'Jeera Rice', category: 'Rice', price: 120, is_available: true, description: 'Fragrant cumin rice' },
  { id: 'm6', name: 'Biryani', category: 'Rice', price: 380, is_available: true, description: 'Aromatic basmati with spices' },
  { id: 'm7', name: 'Masala Chai', category: 'Beverages', price: 50, is_available: true, description: 'Spiced Indian tea' },
  { id: 'm8', name: 'Cold Coffee', category: 'Beverages', price: 120, is_available: true, description: 'Chilled blended coffee' },
  { id: 'm9', name: 'Mango Lassi', category: 'Beverages', price: 100, is_available: true, description: 'Creamy mango yoghurt drink' },
  { id: 'm10', name: 'Samosa', category: 'Starters', price: 60, is_available: true, description: 'Crispy potato-filled pastry' },
  { id: 'm11', name: 'Hara Bhara Kebab', category: 'Starters', price: 180, is_available: false, description: 'Spinach & pea patties' },
  { id: 'm12', name: 'Chicken Tikka', category: 'Starters', price: 320, is_available: true, description: 'Marinated grilled chicken' },
  { id: 'm13', name: 'Gulab Jamun', category: 'Desserts', price: 90, is_available: true, description: 'Soft milk dumplings in syrup' },
  { id: 'm14', name: 'Rasgulla', category: 'Desserts', price: 80, is_available: true, description: 'Spongy cottage cheese balls' },
  { id: 'm15', name: 'Kheer', category: 'Desserts', price: 100, is_available: true, description: 'Creamy rice pudding' },
];

const MOCK_STAFF = [
  { id: 's1', name: 'Rajan Sharma', role: 'Manager', phone: '9876543210', shift: 'Morning', status: 'active', joined: '2024-01-15' },
  { id: 's2', name: 'Priya Patel', role: 'Chef', phone: '9876543211', shift: 'Morning', status: 'active', joined: '2024-02-01' },
  { id: 's3', name: 'Amit Kumar', role: 'Waiter', phone: '9876543212', shift: 'Evening', status: 'active', joined: '2024-03-10' },
  { id: 's4', name: 'Sunita Devi', role: 'Cashier', phone: '9876543213', shift: 'Morning', status: 'active', joined: '2024-01-20' },
  { id: 's5', name: 'Deepak Singh', role: 'Waiter', phone: '9876543214', shift: 'Evening', status: 'inactive', joined: '2024-04-05' },
  { id: 's6', name: 'Meena Rawat', role: 'Cook', phone: '9876543215', shift: 'Morning', status: 'active', joined: '2024-02-28' },
];

const MOCK_RESERVATIONS = [
  { id: 'r1', guest_name: 'Ashok Mehta', guest_phone: '9812345678', table_number: '4', party_size: 4, date: '2026-05-07', time: '19:00', status: 'confirmed', notes: 'Anniversary dinner' },
  { id: 'r2', guest_name: 'Shalini Gupta', guest_phone: '9823456789', table_number: '7', party_size: 2, date: '2026-05-07', time: '20:30', status: 'confirmed', notes: '' },
  { id: 'r3', guest_name: 'Vikram Joshi', guest_phone: '9834567890', table_number: '2', party_size: 6, date: '2026-05-08', time: '13:00', status: 'pending', notes: 'Birthday cake required' },
  { id: 'r4', guest_name: 'Nisha Verma', guest_phone: '9845678901', table_number: '5', party_size: 3, date: '2026-05-08', time: '14:30', status: 'cancelled', notes: '' },
];

const MOCK_CUSTOMERS = [
  { id: 'c1', name: 'Rahul Agarwal', phone: '9901234567', email: 'rahul@example.com', total_visits: 14, total_spent: 18400, last_visit: '2026-05-05', loyalty_points: 184 },
  { id: 'c2', name: 'Kavya Nair', phone: '9912345678', email: 'kavya@example.com', total_visits: 8, total_spent: 9600, last_visit: '2026-05-06', loyalty_points: 96 },
  { id: 'c3', name: 'Suresh Iyer', phone: '9923456789', email: 'suresh@example.com', total_visits: 22, total_spent: 31500, last_visit: '2026-05-07', loyalty_points: 315 },
  { id: 'c4', name: 'Pooja Tiwari', phone: '9934567890', email: 'pooja@example.com', total_visits: 5, total_spent: 4200, last_visit: '2026-04-28', loyalty_points: 42 },
  { id: 'c5', name: 'Manish Bhatt', phone: '9945678901', email: 'manish@example.com', total_visits: 31, total_spent: 47800, last_visit: '2026-05-04', loyalty_points: 478 },
];

const MOCK_KOT = [
  {
    id: 'o1',
    order_number: 'ORD-001',
    status: 'pending',
    table_number: '3',
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    items: [{ name: 'Paneer Butter Masala', quantity: 1 }, { name: 'Garlic Naan', quantity: 2 }],
    elapsed_minutes: 10,
  },
  {
    id: 'o2',
    order_number: 'ORD-002',
    status: 'preparing',
    table_number: '5',
    created_at: new Date(Date.now() - 18 * 60000).toISOString(),
    items: [{ name: 'Dal Makhani', quantity: 2 }, { name: 'Jeera Rice', quantity: 2 }],
    elapsed_minutes: 18,
  },
  {
    id: 'o4',
    order_number: 'ORD-004',
    status: 'ready',
    table_number: '8',
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    items: [{ name: 'Biryani', quantity: 1 }, { name: 'Raita', quantity: 1 }],
    elapsed_minutes: 30,
  },
];

const MOCK_EXPENSES = [
  { id: 'e1', title: 'LPG Cylinder', amount: 1800, category: 'Utilities', date: '2026-05-06', paid_by: 'Rajan Sharma', notes: '2 cylinders' },
  { id: 'e2', title: 'Vegetable Market', amount: 4200, category: 'Raw Materials', date: '2026-05-07', paid_by: 'Priya Patel', notes: 'Weekly purchase' },
  { id: 'e3', title: 'Staff Advance', amount: 2500, category: 'Salary', date: '2026-05-05', paid_by: 'Rajan Sharma', notes: 'Amit advance' },
  { id: 'e4', title: 'Electricity Bill', amount: 8400, category: 'Utilities', date: '2026-05-01', paid_by: 'Owner', notes: 'April bill' },
  { id: 'e5', title: 'Packaging Supplies', amount: 1200, category: 'Supplies', date: '2026-05-04', paid_by: 'Sunita Devi', notes: 'Delivery boxes' },
];

const MOCK_EOD = {
  date: '2026-05-07',
  opening_cash: 5000,
  total_revenue: 24500,
  cash_sales: 14800,
  card_sales: 6200,
  upi_sales: 3500,
  total_orders: 38,
  total_covers: 92,
  avg_order_value: 645,
  total_expenses: 3400,
  net_cash: 16400,
  top_items: [
    { name: 'Garlic Naan', count: 22, revenue: 1320 },
    { name: 'Paneer Butter Masala', count: 14, revenue: 4480 },
    { name: 'Dal Makhani', count: 11, revenue: 3080 },
  ],
  staff_on_duty: ['Rajan Sharma', 'Priya Patel', 'Amit Kumar', 'Sunita Devi'],
  closing_time: '23:45',
};

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
    mutationFn: ({ orderId, status, ...extra }) =>
      api.patch(`/orders/${orderId}/status`, { status, ...extra }),
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

// ─── Create Inventory Item ───────────────────────────────────────────────────
// Backend route: POST /api/inventory
export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/inventory', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.inventory }),
  });
}

// ─── Menu Items ──────────────────────────────────────────────────────────────
// Backend route: GET /api/menu-items
export function useMenuItems(params = {}) {
  return useQuery({
    queryKey: [...KEYS.menuItems, params],
    queryFn: async () => {
      try {
        const res = await api.get('/menu-items', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_MENU_ITEMS;
      return data;
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/menu-items', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.menuItems }),
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.patch(`/menu-items/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.menuItems }),
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/menu-items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.menuItems }),
  });
}

// ─── Staff ───────────────────────────────────────────────────────────────────
// Backend route: GET /api/staff
export function useStaff(params = {}) {
  return useQuery({
    queryKey: [...KEYS.staff, params],
    queryFn: async () => {
      try {
        const res = await api.get('/staff', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_STAFF;
      return data;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Reservations ────────────────────────────────────────────────────────────
// Backend route: GET /api/reservations
export function useReservations(params = {}) {
  return useQuery({
    queryKey: [...KEYS.reservations, params],
    queryFn: async () => {
      try {
        const res = await api.get('/reservations', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_RESERVATIONS;
      return data;
    },
    staleTime: 30 * 1000,
  });
}

// ─── Customers ───────────────────────────────────────────────────────────────
// Backend route: GET /api/customers
export function useCustomers(params = {}) {
  return useQuery({
    queryKey: [...KEYS.customers, params],
    queryFn: async () => {
      try {
        const res = await api.get('/customers', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_CUSTOMERS;
      return data;
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/customers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.customers }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.patch(`/customers/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.customers }),
  });
}

// ─── KOT ─────────────────────────────────────────────────────────────────────
// Reuses orders endpoint filtered to kitchen-relevant statuses
export function useKOT() {
  return useQuery({
    queryKey: KEYS.kot,
    queryFn: async () => {
      try {
        const res = await api.get('/orders', {
          params: { status: 'pending,preparing,ready' },
        });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_KOT;
      return data;
    },
    staleTime: 8 * 1000,
  });
}

// ─── Expenses ────────────────────────────────────────────────────────────────
// Backend route: GET /api/expenses
export function useExpenses(params = {}) {
  return useQuery({
    queryKey: [...KEYS.expenses, params],
    queryFn: async () => {
      try {
        const res = await api.get('/expenses', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_EXPENSES;
      return data;
    },
    staleTime: 30 * 1000,
  });
}

// ─── EOD Summary ─────────────────────────────────────────────────────────────
// Today   → GET /api/reports/eod/preview   (live snapshot, no save)
// Past    → GET /api/reports/eod/:date     (saved or computed for that date)
export function useEOD(date, outletId) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday  = !date || date === todayStr;

  return useQuery({
    queryKey: [...KEYS.eod, date ?? 'today', outletId],
    queryFn: async () => {
      try {
        const params = { outlet_id: outletId };
        const url    = isToday ? '/reports/eod/preview' : `/reports/eod/${date}`;
        const res    = await api.get(url, { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return MOCK_EOD;
      return data;
    },
    staleTime:  isToday ? 30 * 1000 : 5 * 60 * 1000,
    enabled:    !!outletId,
  });
}

// POST /api/reports/eod/lock — finalise & lock the day
export function useCloseDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ outlet_id, date }) =>
      api.post('/reports/eod/lock', { outlet_id, date }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: [...KEYS.eod, vars.date,   vars.outlet_id] });
      qc.invalidateQueries({ queryKey: [...KEYS.eod, 'today',    vars.outlet_id] });
    },
  });
}
