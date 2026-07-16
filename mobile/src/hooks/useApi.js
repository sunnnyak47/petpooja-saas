import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';
import { KEYS } from '../lib/queryKeys';

// ─── Query Keys ────────────────────────────────────────────────────────────
// Defined in ../lib/queryKeys (dependency-free) so the realtime layer can share
// them without importing this hook's RN/native chain. Re-exported for the many
// call sites that already do `import { KEYS } from './useApi'`.
export { KEYS };

// ─── Empty-state shapes ──────────────────────────────────────────────────────
// NO demo/mock data. When an endpoint returns nothing (empty outlet, or a
// transient failure) we surface an HONEST zero/empty state — never fabricated
// numbers. An owner must always see their real data, or a truthful "nothing yet".
const EMPTY_DASHBOARD = {
  today_revenue: 0,
  today_orders: 0,
  pending_orders: 0,
  active_tables: 0,
  low_stock_items: 0,
  top_items: [],
  revenue_trend: [],
};

const EMPTY_REPORTS = {
  range: '7d',
  total_revenue: 0,
  total_orders: 0,
  avg_order_value: 0,
  top_items: [],
  daily_revenue: [],
};

const EMPTY_EOD = {
  date: '',
  opening_cash: 0,
  total_revenue: 0,
  cash_sales: 0,
  card_sales: 0,
  upi_sales: 0,
  total_orders: 0,
  total_covers: 0,
  avg_order_value: 0,
  total_expenses: 0,
  net_cash: 0,
  top_items: [],
  staff_on_duty: [],
  closing_time: '',
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

// ─── Normalizers ─────────────────────────────────────────────────────────────
function normalizeReservation(r) {
  return {
    ...r,
    id: r.id,
    guestName: r.customer_name ?? r.guestName ?? 'Guest',
    phone: r.customer_phone ?? r.phone ?? '',
    partySize: r.party_size ?? r.partySize ?? r.guests ?? 2,
    guests: r.party_size ?? r.partySize ?? r.guests ?? 2,
    time: r.reservation_time ?? r.time ?? '',
    date: (r.reservation_date ?? r.date ?? '').toString().slice(0, 10),
    table: r.table_preference ?? (r.table?.table_number ? `T-${r.table.table_number}` : (typeof r.table === 'string' ? r.table : '')),
    notes: r.special_requests ?? r.notes ?? '',
    type: r.type ?? 'Reservation',
    status: (() => {
      if (!r.status) return 'Confirmed';
      const s = r.status.toLowerCase();
      if (s === 'no_show') return 'No-Show';
      if (s === 'completed') return 'Seated';
      return s.charAt(0).toUpperCase() + s.slice(1);
    })(),
    customer_name: r.customer_name ?? r.guestName ?? 'Guest',
    customer_phone: r.customer_phone ?? r.phone ?? '',
    party_size: r.party_size ?? r.partySize ?? 2,
    reservation_date: (r.reservation_date ?? r.date ?? '').toString().slice(0, 10),
    reservation_time: r.reservation_time ?? r.time ?? '',
    special_requests: r.special_requests ?? r.notes ?? '',
    table_preference: r.table_preference ?? '',
    table_id: r.table_id ?? r.table?.id ?? null,
  };
}

function isEmptyResult(data) {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
// Backend route: GET /api/dashboard/summary
//
// The backend returns a NESTED shape (confirmed in
// backend/src/modules/dashboard/dashboard.controller.js getSummary):
//   { date, revenue: { total, currency, paid_orders },
//     orders: { total, by_status: {created,confirmed,preparing,ready,served,paid,cancelled} },
//     top_items: [{ menu_item_id, quantity_sold, name }],
//     hourly_breakdown: [{ hour, revenue, orders }] }
// dashboard.jsx reads FLAT snake_case fields (today_revenue, total_orders,
// pending_orders, …). We flatten here — mirroring useOwnerApi's transformDashboard.
function transformDashboardSummary(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DASHBOARD };
  const byStatus = raw.orders?.by_status || {};
  const totalOrders = Number(raw.orders?.total ?? 0);
  const todayRevenue = Number(raw.revenue?.total ?? 0);
  const paidOrders = Number(raw.revenue?.paid_orders ?? 0);

  const pending = (byStatus.pending || 0) + (byStatus.created || 0);
  const preparing = (byStatus.preparing || 0) + (byStatus.cooking || 0) + (byStatus.confirmed || 0);
  const ready = byStatus.ready || 0;
  const completed = (byStatus.completed || 0) + (byStatus.served || 0) + (byStatus.paid || 0);

  return {
    today_revenue: todayRevenue,
    total_orders: totalOrders,
    pending_orders: pending,
    preparing_orders: preparing,
    ready_orders: ready,
    completed_orders: completed,
    avg_order_value: paidOrders > 0 ? Math.round(todayRevenue / paidOrders) : 0,
    revenue_growth: 0, // /dashboard/summary has no comparison window
    top_items: (raw.top_items || []).map((item) => ({
      name: item.name || 'Unknown',
      count: Number(item.quantity_sold ?? item.count ?? 0),
      revenue: Number(item.revenue ?? 0),
    })),
    hourly_revenue: (raw.hourly_breakdown || []).map((h) => Number(h.revenue ?? 0)),
  };
}

export function useDashboard() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: [...KEYS.dashboard, outletId],
    queryFn: async () => {
      try {
        // MUST scope to the selected outlet — without outlet_id the backend uses
        // the user's default outlet, so an owner viewing another outlet (e.g. an
        // AU outlet) saw "No data yet" even with real sales.
        const res = await api.get('/dashboard/summary', { params: { outlet_id: outletId } });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return { ...EMPTY_DASHBOARD };
      return transformDashboardSummary(data);
    },
    enabled: !!outletId,
    staleTime: 15 * 1000, // refresh every 15s for live feel
  });
}

// ─── Orders ─────────────────────────────────────────────────────────────────
// Backend route: GET /api/orders
export function useOrders(params = {}) {
  const { outletId } = useOutlet();
  const scoped = { outlet_id: outletId, ...params };
  return useQuery({
    queryKey: [...KEYS.orders, scoped],
    queryFn: async () => {
      try {
        const res = await api.get('/orders', { params: scoped });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return [];
      return data;
    },
    enabled: !!outletId,
    staleTime: 10 * 1000,
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status, ...extra }) =>
      api.patch(`/orders/${orderId}/status`, { status, ...extra }),
    // Optimistic update — UI changes before server responds.
    // useOrders keys on ['orders', params] (NOT the bare ['orders']), so an exact
    // getQueryData(['orders']) never matched and the optimistic write silently no-op'd.
    // Target every ['orders', …] cache via a prefix filter with getQueriesData/setQueriesData.
    onMutate: async ({ orderId, status }) => {
      await qc.cancelQueries({ queryKey: KEYS.orders });
      const prev = qc.getQueriesData({ queryKey: KEYS.orders });
      qc.setQueriesData({ queryKey: KEYS.orders }, (old) => {
        if (!old?.data || !Array.isArray(old.data)) return old;
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
      // Rollback every cache entry we touched.
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.orders });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

// ─── Inventory ──────────────────────────────────────────────────────────────
// Backend route: GET /api/inventory/stock  (confirmed in inventory.routes.js →
// inventory.service.js getStock). The bare GET /api/inventory (listItems) returns
// item DEFINITIONS only — no current_stock — which is why the screen showed all-0
// and all-low-stock. /stock enriches each item with current_stock + stock_status
// from the InventoryStock table.
//
// Stock/threshold/cost live under different backend names than the screen reads;
// map them: current_stock (already present), reorder_point ← min_threshold,
// max_quantity ← max_threshold, price ← cost_per_unit.
function normalizeStockItem(it) {
  if (!it || typeof it !== 'object') return it;
  return {
    ...it,
    current_stock: Number(it.current_stock ?? 0),
    reorder_point: Number(it.min_threshold ?? it.reorder_point ?? 0),
    max_quantity: Number(it.max_threshold ?? it.max_quantity ?? 0),
    price: Number(it.cost_per_unit ?? it.price ?? 0),
  };
}

export function useInventory(params = {}) {
  const { outletId } = useOutlet();
  const scoped = { outlet_id: outletId, ...params };
  return useQuery({
    queryKey: [...KEYS.inventory, scoped],
    queryFn: async () => {
      try {
        const res = await api.get('/inventory/stock', { params: scoped });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return [];
      return Array.isArray(data) ? data.map(normalizeStockItem) : data;
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

// Item-definition edit — PATCH /api/inventory/:itemId (updateItem). Unknown keys
// are stripped server-side (validate middleware stripUnknown), so callers must
// pass the real backend field names (cost_per_unit, min_threshold, unit, …).
export function useUpdateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }) => api.patch(`/inventory/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.inventory }),
  });
}

// Stock level change — POST /api/inventory/adjust with a signed DELTA (quantity),
// not an absolute value. This is the only endpoint that mutates InventoryStock;
// PATCH /inventory/:id does NOT touch stock, which is why +/- was a no-op before.
export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ outlet_id, item_id, quantity, reason }) =>
      api.post('/inventory/adjust', {
        outlet_id,
        item_id,
        quantity,
        reason: reason || 'Manual adjustment',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.inventory }),
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────
// Backend route: GET /api/reports (summary via /api/reports/summary)
export function useReports(range = '7d') {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: [...KEYS.reports(range), outletId],
    queryFn: async () => {
      try {
        const res = await api.get('/reports/summary', { params: { range, outlet_id: outletId } });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return { ...EMPTY_REPORTS, range };
      return data;
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000, // reports are slow to change
  });
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────
// Backend route: GET /api/purchase-orders (via procurement.routes mounted at /api)
export function usePurchaseOrders() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: [...KEYS.purchaseOrders, outletId],
    queryFn: async () => {
      try {
        const res = await api.get('/purchase-orders', { params: { outlet_id: outletId } });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return [];
      return data;
    },
    enabled: !!outletId,
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

export function useReceivePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outlet_id }) =>
      api.post(`/purchase-orders/${id}/receive`, { outlet_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.purchaseOrders }),
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outlet_id }) =>
      api.patch(`/purchase-orders/${id}`, { status: 'cancelled', outlet_id }),
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
// Backend route: GET /api/menu/items  (mounted at /api/menu → menu.routes.js).
// The old '/menu-items' path 404'd. Responses use `base_price` + `food_type`
// (confirmed in menu.service.js listMenuItems / menu.validation.js), so we map
// those to the flat price + is_veg the screens read.
function normalizeMenuItem(m) {
  if (!m || typeof m !== 'object') return m;
  return {
    ...m,
    price: Number(m.base_price ?? m.price ?? 0) || 0,
    is_veg: m.food_type != null ? m.food_type === 'veg' : !!(m.is_veg ?? m.isVeg),
    category: m.category?.name ?? (typeof m.category === 'string' ? m.category : ''),
    category_id: m.category_id ?? m.category?.id ?? null,
    is_available: m.is_available ?? m.isAvailable ?? true,
  };
}

export function useMenuItems(params = {}) {
  return useQuery({
    queryKey: [...KEYS.menuItems, params],
    queryFn: async () => {
      try {
        const res = await api.get('/menu/items', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return [];
      return Array.isArray(data) ? data.map(normalizeMenuItem) : data;
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/menu/items', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.menuItems }),
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.patch(`/menu/items/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.menuItems }),
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  // Backend DELETE /api/menu/items/:id reads outlet_id from the query string.
  return useMutation({
    mutationFn: ({ id, outlet_id }) =>
      api.delete(`/menu/items/${id}`, { params: outlet_id ? { outlet_id } : {} }),
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
      if (isEmptyResult(data)) return [];
      return data;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Reservations ────────────────────────────────────────────────────────────
// Backend route: GET /api/reservations?outlet_id=&date=
export function useReservations({ outlet_id, date } = {}) {
  return useQuery({
    queryKey: KEYS.reservations(outlet_id, date),
    queryFn: async () => {
      const params = { outlet_id };
      if (date) params.date = date;
      const res = await api.get('/reservations', { params });
      const raw = extractData(res) ?? [];
      return Array.isArray(raw) ? raw.map(normalizeReservation) : [];
    },
    enabled: !!outlet_id,
    staleTime: 60_000,
  });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/reservations', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
  });
}

export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/reservations/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
  });
}

export function useDeleteReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/reservations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
  });
}

// ─── Customers ───────────────────────────────────────────────────────────────
// Backend route: GET /api/customers
export function useCustomers(params = {}) {
  const { outletId } = useOutlet();
  const scoped = { outlet_id: outletId, ...params };
  return useQuery({
    queryKey: [...KEYS.customers, scoped],
    queryFn: async () => {
      try {
        const res = await api.get('/customers', { params: scoped });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return [];
      return data;
    },
    enabled: !!outletId,
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
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: [...KEYS.kot, outletId],
    queryFn: async () => {
      try {
        const res = await api.get('/orders', {
          params: { outlet_id: outletId, status: 'pending,preparing,ready' },
        });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (isEmptyResult(data)) return [];
      return data;
    },
    enabled: !!outletId,
    staleTime: 8 * 1000,
  });
}

// ─── Expenses ────────────────────────────────────────────────────────────────
// Backend route: GET /api/expenses
function normalizeExpense(e) {
  return {
    ...e,
    description: e.title ?? e.description ?? '',
    category:    e.category ?? 'Misc',
    amount:      parseFloat(e.amount ?? 0),
    date:        (e.expense_date ?? e.date ?? '').toString().slice(0, 10),
    method:      e.payment_method ?? e.method ?? 'Cash',
  };
}

export function useExpenses({ outlet_id, month, year } = {}) {
  return useQuery({
    queryKey: [...KEYS.expenses, outlet_id, month, year],
    queryFn: async () => {
      try {
        const params = {};
        if (outlet_id) params.outlet_id = outlet_id;
        if (month)     params.month     = month;
        if (year)      params.year      = year;
        const res = await api.get('/expenses', { params });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const raw  = extractData(res);
      // API returns { items, total_amount, total_count } OR just array
      const items = raw?.items ?? (Array.isArray(raw) ? raw : null);
      if (isEmptyResult(items)) return { items: [], total_amount: 0 };
      return {
        items:        items.map(normalizeExpense),
        total_amount: parseFloat(raw?.total_amount ?? 0),
      };
    },
    staleTime: 30 * 1000,
    enabled:   !!outlet_id,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/expenses', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenses }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.expenses }),
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
      if (isEmptyResult(data)) return EMPTY_EOD;
      return data;
    },
    staleTime:  isToday ? 30 * 1000 : 5 * 60 * 1000,
    enabled:    !!outletId,
  });
}

// Close Day is a TWO-STEP flow against the deployed backend:
//   1) POST /api/reports/eod/save  → upserts an EODReport draft, returns it
//      (sendSuccess → { success, data: { id, …report, snapshot } }). We need the
//      report's `id`.
//   2) POST /api/reports/eod/lock  → finalises & locks, and REQUIRES { outlet_id,
//      report_id } (lockEODSchema). Posting only { outlet_id, date } 400'd because
//      report_id is a required UUID.
// Both routes are confirmed in backend/src/modules/reports/eod.routes.js +
// eod.validation.js. If /save is missing on an older prod deploy the axios call
// rejects and the mutation surfaces the error (handled by the caller) instead of
// silently 400-ing on lock.
export function useCloseDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ outlet_id, date }) => {
      // Step 1 — save/upsert today's draft to obtain a report_id.
      const saveRes = await api.post('/reports/eod/save', { outlet_id, date });
      // api unwraps to the response body: { success, data: report, message }.
      const report  = saveRes?.data ?? saveRes;
      const reportId = report?.id ?? report?.report_id;
      if (!reportId) {
        throw new Error('Could not save the end-of-day report (no report id returned). Day was not closed.');
      }
      // Step 2 — lock using the saved report_id.
      return api.post('/reports/eod/lock', { outlet_id, report_id: reportId });
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: [...KEYS.eod, vars.date,   vars.outlet_id] });
      qc.invalidateQueries({ queryKey: [...KEYS.eod, 'today',    vars.outlet_id] });
    },
  });
}

// ─── Discount/Offer hooks ─────────────────────────────────────────────────────
function normalizeDiscount(d) {
  return {
    ...d,
    id: d.id,
    name: d.name ?? d.title ?? 'Offer',
    description: d.description ?? '',
    type: d.type ?? 'percentage',
    value: parseFloat(d.value ?? d.discount_value ?? 0),
    min_order_value: parseFloat(d.min_order_value ?? d.minOrder ?? 0),
    max_discount: parseFloat(d.max_discount ?? d.maxDiscount ?? 0),
    is_active: d.is_active ?? d.isActive ?? true,
    start_date: (d.start_date ?? d.startDate ?? d.valid_from ?? '').toString().slice(0, 10) || null,
    end_date: (d.end_date ?? d.endDate ?? d.valid_until ?? '').toString().slice(0, 10) || null,
    coupon_code: d.coupon_code ?? d.couponCode ?? null,
    usage_count: d.usage_count ?? d.usageCount ?? 0,
    max_uses: d.max_uses ?? d.maxUses ?? null,
    applicable_days: d.applicable_days ?? d.applicableDays ?? [],
    start_time: d.start_time ?? d.startTime ?? null,
    end_time: d.end_time ?? d.endTime ?? null,
  };
}

export function useDiscounts({ outlet_id, is_active } = {}) {
  return useQuery({
    queryKey: ['discounts', outlet_id, is_active],
    queryFn: async () => {
      const params = { outlet_id };
      if (is_active !== undefined) params.is_active = is_active;
      const res = await api.get('/discounts', { params });
      const raw = extractData(res) ?? [];
      return Array.isArray(raw) ? raw.map(normalizeDiscount) : [];
    },
    enabled: !!outlet_id,
    staleTime: 60_000,
  });
}

export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/discounts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discounts'] }),
  });
}

export function useUpdateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/discounts/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discounts'] }),
  });
}

export function useDeleteDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outlet_id }) => api.delete(`/discounts/${id}`, { params: { outlet_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discounts'] }),
  });
}
