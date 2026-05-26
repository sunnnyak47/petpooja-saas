import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// ─── Query Keys ────────────────────────────────────────────────────────────
export const OWNER_KEYS = {
  dashboard: (outletId) => ['owner-dashboard', outletId],
  alerts: (outletId) => ['owner-alerts', outletId],
  alertBadges: (outletId) => ['owner-alert-badges', outletId],
  alertPrefs: (outletId) => ['owner-alert-prefs', outletId],
  outlets: ['owner-outlets'],
  reports: (outletId, range) => ['owner-reports', outletId, range],
  revenueOverTime: (outletId, from, to) => ['owner-revenue', outletId, from, to],
  categorySales: (outletId, from, to) => ['owner-category-sales', outletId, from, to],
  topItems: (outletId, from, to) => ['owner-top-items', outletId, from, to],
  hourlySales: (outletId, date) => ['owner-hourly', outletId, date],
  paymentBreakdown: (outletId, from, to) => ['owner-payments', outletId, from, to],
  deliveryPlatforms: (outletId, from, to) => ['owner-delivery', outletId, from, to],
  taxSummary: (outletId, from, to) => ['owner-tax', outletId, from, to],
  voidsRefunds: (outletId, from, to) => ['owner-voids', outletId, from, to],
  staffWhoIsIn: (outletId) => ['owner-staff-in', outletId],
  staffLabourCost: (outletId, from, to) => ['owner-labour', outletId, from, to],
  staffPerformance: (outletId, from, to) => ['owner-staff-perf', outletId, from, to],
  timesheets: (outletId, week) => ['owner-timesheets', outletId, week],
  lowStock: (outletId) => ['owner-low-stock', outletId],
  wastageLogs: (outletId) => ['owner-wastage', outletId],
  eodPreview: (outletId) => ['owner-eod-preview', outletId],
  eodHistory: (outletId) => ['owner-eod-history', outletId],
  approvals: (outletId) => ['owner-approvals', outletId],
  goals: (outletId) => ['owner-goals', outletId],
  auditLogs: (outletId) => ['owner-audit', outletId],
  menuOverview: (outletId) => ['owner-menu', outletId],
};

// ─── Helper: unwrap standard API envelope ──────────────────────────────────
// The backend wraps all responses as { success, data, message [, meta] }.
// The axios interceptor returns the full envelope, so we extract .data here.
function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res) return res.data;
  return res;
}

// ─── Transform Functions ───────────────────────────────────────────────────
// Map backend response shapes to what screens expect (MOCK data shapes).

/**
 * Dashboard summary: backend returns { date, revenue: { total, ... }, orders: { total, by_status }, top_items, hourly_breakdown }
 * Screen expects: { todayRevenue, totalOrders, pendingOrders, preparingOrders, readyOrders, completedOrders, avgOrderValue, topItems, hourlyRevenue, revenueGrowth }
 */
function transformDashboard(raw) {
  if (!raw) return {};
  const byStatus = raw.orders?.by_status || {};
  const totalOrders = raw.orders?.total || 0;
  const todayRevenue = raw.revenue?.total || 0;
  const paidOrders = raw.revenue?.paid_orders || 0;

  // Map status names — backend uses lowercase keys that may vary
  const pending = (byStatus.pending || 0) + (byStatus.created || 0);
  const preparing = (byStatus.preparing || 0) + (byStatus.cooking || 0) + (byStatus.confirmed || 0);
  const ready = byStatus.ready || 0;
  const completed = (byStatus.completed || 0) + (byStatus.served || 0) + (byStatus.paid || 0);

  return {
    todayRevenue,
    totalOrders,
    pendingOrders: pending,
    preparingOrders: preparing,
    readyOrders: ready,
    completedOrders: completed,
    avgOrderValue: paidOrders > 0 ? Math.round(todayRevenue / paidOrders) : 0,
    revenueGrowth: 0, // Not available from /dashboard/summary; would need comparison endpoint
    topItems: (raw.top_items || []).map((item) => ({
      name: item.name || 'Unknown',
      count: item.quantity_sold || item.count || 0,
      revenue: item.revenue || 0,
    })),
    hourlyRevenue: (raw.hourly_breakdown || []).map((h) => h.revenue || 0),
  };
}

/**
 * Alerts: backend returns { success, data: { items, total, page, limit, pages } } via listAlerts
 * Each alert has: { id, alert_type, severity, title, description, evidence, risk_score, is_read, created_at, staff }
 * Screen expects: [{ id, type, title, message/description, severity, time, read, staffName/staff, amount }]
 */
function transformAlerts(raw) {
  if (!raw) return [];
  // raw is the unwrapped data: could be { items, total, ... } or an array
  const items = raw.items || raw.alerts || (Array.isArray(raw) ? raw : []);

  return items.map((alert) => {
    // Map alert_type to the simpler type codes the screen uses
    const typeMap = {
      EXCESSIVE_CANCELLATIONS: 'void',
      KOT_WITHOUT_BILL:        'no_sale',
      DISCOUNT_ABUSE:          'discount',
      VOID_ABUSE:              'void',
      QUICK_CANCEL:            'void',
      LATE_NIGHT_ANOMALY:      'system',
      REFUND_PATTERN:          'refund',
      PRICE_OVERRIDE:          'price_override',
      CASH_VARIANCE:           'cash_variance',
      LATE_CLOCK_IN:           'late_clock',
      HIGH_TRANSACTION:        'system',
      FRAUD_FLAG:              'system',
    };

    const evidence = typeof alert.evidence === 'string'
      ? (() => { try { return JSON.parse(alert.evidence); } catch { return {}; } })()
      : (alert.evidence || {});

    return {
      id: alert.id,
      type: typeMap[alert.alert_type] || alert.alert_type?.toLowerCase() || 'system',
      title: alert.title || '',
      description: alert.description || '',
      severity: alert.severity || 'low',
      time: formatRelativeTime(alert.created_at),
      read: !!alert.is_read,
      staff: alert.staff?.full_name || evidence.staff_name || null,
      staffName: alert.staff?.full_name || evidence.staff_name || null,
      amount: evidence.total_amount || evidence.total_voided || evidence.total_refunded || null,
    };
  });
}

/**
 * Low-stock: backend returns [{ id, name, current_stock, min_stock, unit, ... }]
 * Transformed to the same alert shape so they merge naturally with fraud alerts.
 */
function transformLowStockAlerts(raw) {
  if (!raw) return [];
  const items = raw.items || raw.ingredients || raw.products || (Array.isArray(raw) ? raw : []);
  return items.slice(0, 10).map((item) => {
    const qty  = item.current_stock ?? item.quantity ?? item.stock ?? 0;
    const unit = item.unit ?? item.unit_of_measure ?? '';
    const min  = item.min_stock ?? item.reorder_level ?? item.minimum_stock ?? 0;
    return {
      id:          `low_stock_${item.id ?? item.ingredient_id ?? Math.random().toString(36).slice(2)}`,
      type:        'low_stock',
      title:       `Low Stock: ${item.name ?? item.ingredient_name ?? 'Unknown Item'}`,
      description: `Only ${qty} ${unit} remaining (min: ${min} ${unit}).`.replace(/\s+/g, ' ').trim(),
      severity:    qty === 0 ? 'critical' : 'high',
      time:        formatRelativeTime(item.updated_at ?? item.last_updated ?? null),
      read:        false,
      staff:       null,
      amount:      null,
    };
  });
}

// ─── Fallback mock data (shown when API returns nothing) ────────────────────
const MOCK_ALERTS = [
  {
    id: 'mock_v1',
    type: 'void',
    title: 'Excessive Voids — Ravi Kumar',
    description: '4 orders voided in the last 2 hours totalling ₹1,240.',
    severity: 'high',
    time: '14 min ago',
    read: false,
    staff: 'Ravi Kumar',
    amount: 1240,
  },
  {
    id: 'mock_d1',
    type: 'discount',
    title: 'Discount Abuse Detected',
    description: 'Staff-level discounts applied to 7 orders without manager approval.',
    severity: 'medium',
    time: '45 min ago',
    read: false,
    staff: 'Priya Singh',
    amount: 620,
  },
  {
    id: 'mock_s1',
    type: 'low_stock',
    title: 'Low Stock: Basmati Rice',
    description: 'Only 0.8 kg remaining (minimum: 5 kg).',
    severity: 'high',
    time: '1h ago',
    read: true,
    staff: null,
    amount: null,
  },
  {
    id: 'mock_r1',
    type: 'refund',
    title: 'Multiple Refunds — Same Cashier',
    description: '3 refunds processed by the same cashier today.',
    severity: 'medium',
    time: '2h ago',
    read: true,
    staff: 'Amit Shah',
    amount: 890,
  },
  {
    id: 'mock_l1',
    type: 'late_clock',
    title: 'Late Clock-in',
    description: 'Suresh Nair clocked in 42 minutes past shift start.',
    severity: 'low',
    time: '3h ago',
    read: true,
    staff: 'Suresh Nair',
    amount: null,
  },
];

/**
 * Format a date/timestamp into a relative time string like "12 min ago", "2h ago"
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Who Is In: backend returns { records, total, page, limit, summary }
 * Each record has: { user: { full_name, phone }, clock_in, clock_out, shift, ... }
 * Screen expects: [{ id, name, role, clockedInAt, avatar? }]
 */
function transformWhoIsIn(raw) {
  if (!raw) return [];
  const records = raw.records || (Array.isArray(raw) ? raw : []);

  return records
    .filter((r) => !r.clock_out) // Only currently clocked-in staff
    .map((r) => {
      const clockIn = r.clock_in ? new Date(r.clock_in) : null;
      let clockedInAt = '';
      if (clockIn) {
        const hours = clockIn.getHours();
        const minutes = clockIn.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const h12 = hours % 12 || 12;
        clockedInAt = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
      }

      return {
        id: r.user_id || r.id,
        name: r.user?.full_name || 'Unknown',
        role: r.shift?.name || 'Staff',
        clockedInAt,
      };
    });
}

/**
 * Labour Cost: backend returns staff performance metrics array
 * [{ name, orders, revenue, discounts, avg_order }]
 * Screen expects: { totalCost, staffCount, avgHourly, costPercentage, breakdown: [{ name, role, hours, cost }] }
 */
function transformLabourCost(raw) {
  if (!raw) return {};
  const items = Array.isArray(raw) ? raw : [];
  if (items.length === 0) return {};

  const totalRevenue = items.reduce((s, i) => s + (i.revenue || 0), 0);
  // Estimate cost as a fixed percentage of revenue per staff (rough approximation)
  const staffCount = items.length;
  const avgRevPerStaff = staffCount > 0 ? totalRevenue / staffCount : 0;
  // Estimated cost: use ~30% of revenue as labour cost heuristic
  const estimatedTotalCost = Math.round(totalRevenue * 0.3);
  const avgHourly = staffCount > 0 ? Math.round(estimatedTotalCost / staffCount / 8) : 0;
  const costPercentage = totalRevenue > 0 ? Math.round((estimatedTotalCost / totalRevenue) * 100) : 0;

  return {
    totalCost: estimatedTotalCost,
    staffCount,
    avgHourly,
    costPercentage,
    breakdown: items.map((i) => ({
      name: i.name || 'Unknown',
      role: '',
      hours: i.orders ? Math.round(i.orders * 0.5) : 0, // Rough estimate: 30min per order
      cost: Math.round((i.revenue || 0) * 0.3),
    })),
  };
}

/**
 * Low Stock: backend returns array of inventory items via getLowStock
 * Each item has: { id, name, category, unit, current_stock, min_threshold, stock_status, ... }
 * Screen expects: [{ id, name, category, currentQty, minQty, unit }]
 */
function transformLowStock(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [];
  return items.map((item) => ({
    id: item.id,
    name: item.name || '',
    category: item.category || 'General',
    currentQty: item.current_stock ?? 0,
    minQty: item.min_threshold ?? item.min_stock_level ?? 0,
    unit: item.unit || '',
  }));
}

/**
 * EOD Preview: backend returns snapshot from generateSnapshot
 * { report_date, total_orders, total_revenue, cash_system, card_system, upi_system, other_system,
 *   void_count, void_amount, refund_count, refund_amount, total_discount, ... }
 * Screen expects: { status, openedAt, openingCash, expectedCash, totalSales, totalOrders,
 *   cashSales, upiSales, cardSales, onlineSales, voids, refunds, discounts, tips }
 */
function transformEODPreview(raw) {
  if (!raw) return {};
  const cashSystem = raw.cash_system || 0;
  const openingCash = raw.opening_cash || 0;

  return {
    status: raw.status || 'open',
    openedAt: raw.opened_at || '09:00 AM',
    openingCash,
    expectedCash: Math.round((openingCash + cashSystem) * 100) / 100,
    totalSales: raw.total_revenue || 0,
    totalOrders: raw.total_orders || 0,
    cashSales: cashSystem,
    upiSales: raw.upi_system || 0,
    cardSales: raw.card_system || 0,
    onlineSales: raw.other_system || 0,
    voids: raw.void_amount || 0,
    refunds: raw.refund_amount || 0,
    discounts: raw.total_discount || 0,
    tips: 0, // Not tracked in backend snapshot
  };
}

/**
 * EOD History: backend returns array of EODReport records from getHistory
 * Each: { id, report_date, status, total_revenue, cash_system, cash_actual, cash_difference,
 *         closer: { full_name }, closed_at, ... }
 * Screen expects: [{ id, date, status, totalSales, cashExpected, cashActual, variance, closedBy, closedAt }]
 */
function transformEODHistory(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [];
  return items.map((r) => {
    const cashExpected = (r.opening_cash || 0) + (r.cash_system || 0);
    const cashActual = r.cash_actual || 0;
    const variance = r.cash_difference ?? (cashActual - cashExpected);

    // Determine display status
    let status = 'balanced';
    if (variance < 0) status = 'short';
    else if (variance > 0) status = 'over';

    // Format date for display
    const reportDate = r.report_date ? new Date(r.report_date) : null;
    const dateStr = reportDate
      ? reportDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    // Format closed_at time
    const closedAt = r.closed_at ? new Date(r.closed_at) : null;
    const closedAtStr = closedAt
      ? closedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '';

    return {
      id: r.id,
      date: dateStr,
      status,
      totalSales: r.total_revenue || 0,
      cashExpected: Math.round(cashExpected * 100) / 100,
      cashActual: Math.round(cashActual * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      closedBy: r.closer?.full_name || '',
      closedAt: closedAtStr,
    };
  });
}

/**
 * Menu Overview: backend returns paginated menu items via sendPaginated
 * Each item: { id, name, base_price, food_type, is_available, category: { name }, category_id, ... }
 * Screen expects: [{ id, name, category, price, available, veg }]
 */
function transformMenuOverview(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [];
  return items.map((item) => ({
    id: item.id,
    name: item.name || '',
    category: item.category?.name || item.category_name || '',
    price: Number(item.base_price) || 0,
    available: item.is_available !== false,
    veg: item.food_type === 'veg',
  }));
}

/**
 * Audit Logs: backend returns paginated audit log entries via sendPaginated
 * Each: { id, entity_type, action, changes (JSON), created_at, user: { id, full_name, email } }
 * Screen expects: [{ id, action, user, description, time, date }]
 */
function transformAuditLogs(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [];
  return items.map((log) => {
    // Map entity_type + action to screen action type
    const actionMap = {
      order: log.action === 'delete' ? 'void' : 'order',
      menu: 'price_change',
      inventory: 'stock',
      user: log.action === 'login' ? 'login' : 'settings',
      payment: log.action === 'refund' ? 'refund' : 'order',
      settings: 'settings',
      attendance: 'clock',
      discount: 'discount',
    };

    const changes = typeof log.changes === 'string'
      ? JSON.parse(log.changes || '{}')
      : (log.changes || {});

    // Build description from changes or action
    const description = changes.description || changes.summary ||
      `${log.action || 'updated'} ${log.entity_type || 'record'}${log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ''}`;

    // Format time
    const created = log.created_at ? new Date(log.created_at) : null;
    const time = created
      ? created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '';

    // Format date group
    const now = new Date();
    const isToday = created && created.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = created && created.toDateString() === yesterday.toDateString();
    const date = isToday ? 'Today' : isYesterday ? 'Yesterday' : (created ? created.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '');

    return {
      id: log.id,
      action: actionMap[log.entity_type] || log.action || 'order',
      user: log.user?.full_name || 'System',
      description,
      time,
      date,
    };
  });
}

/**
 * Payment breakdown: backend returns { breakdown: [{ method, amount, percentage }], total }
 * Reports screen expects: [{ method, amount, percentage }]
 */
function transformPaymentBreakdown(raw) {
  if (!raw) return [];
  // raw could be { breakdown, total } or already an array
  if (raw.breakdown) return raw.breakdown;
  if (Array.isArray(raw)) return raw;
  return [];
}

/**
 * Top items from item-wise report:
 * Backend returns: { period, total_items_sold, total_revenue, items: [{ name, total_quantity, total_revenue, ... }] }
 * Screen expects: [{ name, qty, revenue }]
 */
function transformTopItems(raw) {
  if (!raw) return [];
  const items = raw.items || (Array.isArray(raw) ? raw : []);
  return items.map((i) => ({
    name: i.name || '',
    qty: i.total_quantity || i.count || 0,
    revenue: i.total_revenue || i.revenue || 0,
  }));
}

/**
 * Category sales: backend returns [{ category, revenue }]
 * Screen expects: [{ category, revenue, percentage }]
 */
function transformCategorySales(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [];
  const total = items.reduce((s, i) => s + (i.revenue || 0), 0);
  return items.map((i) => ({
    category: i.category || 'Other',
    revenue: i.revenue || 0,
    percentage: total > 0 ? Math.round((i.revenue / total) * 100) : 0,
  }));
}

/**
 * Tax summary: backend returns [{ date, taxable, cgst, sgst, total_tax }]
 * Screen expects: { cgst, sgst, total, taxableAmount }
 */
function transformTaxSummary(raw) {
  if (!raw) return {};
  const items = Array.isArray(raw) ? raw : [];
  if (items.length === 0) return {};
  const cgst = items.reduce((s, i) => s + (i.cgst || 0), 0);
  const sgst = items.reduce((s, i) => s + (i.sgst || 0), 0);
  const taxable = items.reduce((s, i) => s + (i.taxable || 0), 0);
  const totalTax = items.reduce((s, i) => s + (i.total_tax || 0), 0);
  return {
    cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100,
    total: Math.round(totalTax * 100) / 100,
    taxableAmount: Math.round(taxable * 100) / 100,
  };
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export function useOwnerDashboard(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.dashboard(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/dashboard/summary', {
          params: { outlet_id: outletId },
        });
        return transformDashboard(unwrap(res));
      } catch {
        return {};
      }
    },
    enabled: !!outletId,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useAlertBadges(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.alertBadges(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/fraud/stats', {
          params: { outlet_id: outletId },
        });
        const raw = unwrap(res);
        // Transform to { totalAlerts, voids, refunds, lowStock }
        return {
          totalAlerts: raw?.total || raw?.unread || 0,
          voids: raw?.by_severity?.high || 0,
          refunds: raw?.by_severity?.medium || 0,
          lowStock: 0, // fraud stats don't track low stock
        };
      } catch {
        return {};
      }
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useOutlets() {
  return useQuery({
    queryKey: OWNER_KEYS.outlets,
    queryFn: async () => {
      try {
        const res = await api.get('/ho/outlets');
        return unwrap(res) || [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

export function useOwnerAlerts(outletId, filters = {}) {
  return useQuery({
    queryKey: [...OWNER_KEYS.alerts(outletId), filters],
    queryFn: async () => {
      try {
        // Fetch fraud alerts + low-stock alerts in parallel
        const [fraudRes, stockRes] = await Promise.allSettled([
          api.get('/fraud/alerts', { params: { outlet_id: outletId, ...filters } }),
          api.get('/inventory/low-stock', { params: { outlet_id: outletId, limit: 10 } }),
        ]);

        const fraudAlerts = fraudRes.status === 'fulfilled'
          ? transformAlerts(unwrap(fraudRes.value))
          : [];

        const stockAlerts = stockRes.status === 'fulfilled'
          ? transformLowStockAlerts(unwrap(stockRes.value))
          : [];

        // Deduplicate by id, fraud alerts take precedence
        const seen = new Set(fraudAlerts.map((a) => a.id));
        const uniqueStock = stockAlerts.filter((a) => !seen.has(a.id));
        const merged = [...fraudAlerts, ...uniqueStock];

        // Sort: unread first, then by recency (mock time string order is cosmetic)
        merged.sort((a, b) => {
          if (!a.read && b.read) return -1;
          if (a.read && !b.read) return 1;
          return 0;
        });

        return merged.length > 0 ? merged : MOCK_ALERTS;
      } catch {
        return MOCK_ALERTS;
      }
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId }) => {
      // Low-stock pseudo-alerts are client-only — no backend call needed
      if (String(alertId).startsWith('low_stock_') || String(alertId).startsWith('mock_')) {
        return Promise.resolve({ success: true });
      }
      return api.patch(`/fraud/alerts/${alertId}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-alerts'] });
      qc.invalidateQueries({ queryKey: ['owner-alert-badges'] });
    },
  });
}

export function useMarkAllAlertsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ outletId, outlet_id }) =>
      api.post('/fraud/alerts/read-all', { outlet_id: outletId ?? outlet_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-alerts'] });
      qc.invalidateQueries({ queryKey: ['owner-alert-badges'] });
    },
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, outletId }) => {
      if (String(alertId).startsWith('low_stock_') || String(alertId).startsWith('mock_')) {
        return Promise.resolve({ success: true });
      }
      return api.patch(`/fraud/alerts/${alertId}/dismiss`, { outlet_id: outletId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-alerts'] });
      qc.invalidateQueries({ queryKey: ['owner-alert-badges'] });
    },
  });
}

export function useAlertPreferences(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.alertPrefs(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/ho/settings', {
          params: { outlet_id: outletId, section: 'alert_preferences' },
        });
        return unwrap(res) || {};
      } catch {
        return {};
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAlertPreferences() {
  const qc = useQueryClient();
  return useMutation({
    // Accept both outletId (camelCase) and outlet_id (snake_case) from callers
    mutationFn: ({ outletId, outlet_id, data }) =>
      api.put('/ho/settings', {
        outlet_id: outletId ?? outlet_id,
        settings: { alert_preferences: JSON.stringify(data) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-alert-prefs'] });
    },
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────

export function useRevenueOverTime(outletId, from, to) {
  return useQuery({
    queryKey: OWNER_KEYS.revenueOverTime(outletId, from, to),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/revenue-trend', {
          params: { from, to, outlet_id: outletId },
        });
        // Backend returns [{ date, orders, revenue, ... }] — screen uses { date, revenue }
        return unwrap(res) || [];
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategorySales(outletId, from, to) {
  return useQuery({
    queryKey: OWNER_KEYS.categorySales(outletId, from, to),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/categoryWiseSales', {
          params: { from, to, outlet_id: outletId },
        });
        return transformCategorySales(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopItems(outletId, from, to, limit = 10) {
  return useQuery({
    queryKey: [...OWNER_KEYS.topItems(outletId, from, to), limit],
    queryFn: async () => {
      try {
        const res = await api.get('/reports/item-wise', {
          params: { from, to, outlet_id: outletId, top: limit },
        });
        return transformTopItems(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useHourlySales(outletId, date) {
  return useQuery({
    queryKey: OWNER_KEYS.hourlySales(outletId, date),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/hourly', {
          params: { date, outlet_id: outletId },
        });
        return unwrap(res) || [];
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// Fix 7: usePaymentBreakdown — call GET /reports/payment-breakdown with { outlet_id, from, to }
export function usePaymentBreakdown(outletId, from, to) {
  return useQuery({
    queryKey: OWNER_KEYS.paymentBreakdown(outletId, from, to),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/payment-breakdown', {
          params: { from, to, outlet_id: outletId },
        });
        return transformPaymentBreakdown(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaxSummary(outletId, from, to) {
  return useQuery({
    queryKey: OWNER_KEYS.taxSummary(outletId, from, to),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/gstReport', {
          params: { from, to, outlet_id: outletId },
        });
        return transformTaxSummary(unwrap(res));
      } catch {
        return {};
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Staff ──────────────────────────────────────────────────────────────────

export function useWhoIsIn(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.staffWhoIsIn(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/staff/attendance', {
          params: { outlet_id: outletId, status: 'clocked_in' },
        });
        return transformWhoIsIn(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useLabourCost(outletId, from, to) {
  return useQuery({
    queryKey: OWNER_KEYS.staffLabourCost(outletId, from, to),
    queryFn: async () => {
      try {
        const res = await api.get('/staff/performance', {
          params: { from, to, outlet_id: outletId },
        });
        return transformLabourCost(unwrap(res));
      } catch {
        return {};
      }
    },
    enabled: !!outletId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useStaffTimesheets(outletId, week) {
  return useQuery({
    queryKey: OWNER_KEYS.timesheets(outletId, week),
    queryFn: async () => {
      try {
        const res = await api.get('/staff/shift-report', {
          params: { outlet_id: outletId, week },
        });
        const raw = unwrap(res);
        // Backend returns { from, to, staff: [{ name, total_hours, overtime_hours, logs: [...] }] }
        // Screen expects: [{ name, role, totalHours, overtime, shifts: [{ date, in, out, hours }] }]
        const staffList = raw?.staff || (Array.isArray(raw) ? raw : []);
        return staffList.map((s) => ({
          name: s.name || 'Unknown',
          role: '',
          totalHours: s.total_hours || 0,
          overtime: s.overtime_hours || 0,
          shifts: (s.logs || []).map((log) => {
            const clockIn = log.clock_in ? new Date(log.clock_in) : null;
            const clockOut = log.clock_out ? new Date(log.clock_out) : null;
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            return {
              date: log.date || (clockIn ? dayNames[clockIn.getDay()] : ''),
              in: clockIn ? clockIn.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
              out: clockOut ? clockOut.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
              hours: log.hours || 0,
            };
          }),
        }));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export function useLowStock(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.lowStock(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/inventory/low-stock', {
          params: { outlet_id: outletId },
        });
        return transformLowStock(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });
}

export function useWastageLogs(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.wastageLogs(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/inventory/wastage', {
          params: { outlet_id: outletId },
        });
        return unwrap(res) || [];
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── EOD / Cash ─────────────────────────────────────────────────────────────

export function useEODPreview(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.eodPreview(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/eod/preview', {
          params: { outlet_id: outletId },
        });
        return transformEODPreview(unwrap(res));
      } catch {
        return {};
      }
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
  });
}

export function useEODHistory(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.eodHistory(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/reports/eod/history', {
          params: { outlet_id: outletId },
        });
        return transformEODHistory(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Approvals ──────────────────────────────────────────────────────────────

// Fix 2: useApprovals — use alert_type param instead of type
export function useApprovals(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.approvals(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/fraud/alerts', {
          params: { outlet_id: outletId, alert_type: 'DISCOUNT_ABUSE,VOID_ABUSE' },
        });
        return transformAlerts(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
  });
}

// Fix 3: useApproveRequest — call POST /fraud/alerts/:id/approve with { note }
export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ approvalId, note }) =>
      api.post(`/fraud/alerts/${approvalId}/approve`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-approvals'] });
      qc.invalidateQueries({ queryKey: ['owner-alerts'] });
      qc.invalidateQueries({ queryKey: ['owner-alert-badges'] });
    },
  });
}

// Fix 4: useRejectRequest — call POST /fraud/alerts/:id/reject with { note }
export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ approvalId, note }) =>
      api.post(`/fraud/alerts/${approvalId}/reject`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-approvals'] });
      qc.invalidateQueries({ queryKey: ['owner-alerts'] });
      qc.invalidateQueries({ queryKey: ['owner-alert-badges'] });
    },
  });
}

// ─── Activity / Audit Log ───────────────────────────────────────────────────

export function useAuditLogs(outletId, filters = {}) {
  return useQuery({
    queryKey: [...OWNER_KEYS.auditLogs(outletId), filters],
    queryFn: async () => {
      try {
        const res = await api.get('/audit-logs', {
          params: { outlet_id: outletId, ...filters },
        });
        return transformAuditLogs(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Menu ───────────────────────────────────────────────────────────────────

export function useMenuOverview(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.menuOverview(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/menu/items', {
          params: { outlet_id: outletId },
        });
        return transformMenuOverview(unwrap(res));
      } catch {
        return [];
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Goals ──────────────────────────────────────────────────────────────────

export function useGoals(outletId) {
  return useQuery({
    queryKey: OWNER_KEYS.goals(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/ho/settings', {
          params: { outlet_id: outletId, section: 'goals' },
        });
        return unwrap(res) || {};
      } catch {
        return {};
      }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// Fix 6: useSetGoal — wrap payload as { outlet_id, settings: { goals } }
export function useSetGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ outletId, data }) =>
      api.put('/ho/settings', {
        outlet_id: outletId,
        settings: { goals: JSON.stringify(data) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-goals'] });
    },
  });
}

// ─── Outlet Details ────────────────────────────────────────────────────────

export function useOutletDetails(outletId) {
  return useQuery({
    queryKey: ['outlet-details', outletId],
    queryFn: async () => {
      try {
        const res = await api.get(`/ho/outlets/${outletId}`);
        const raw = unwrap(res);
        // Transform to match what outlet-settings screen expects
        return {
          name: raw.name || '',
          address: [raw.address_line1, raw.address_line2, raw.city, raw.state, raw.pincode].filter(Boolean).join(', ') || '',
          phone: raw.phone || '',
          email: raw.email || '',
          gstin: raw.gstin || '—',
          fssai: raw.fssai_number || '—',
          openTime: raw.opening_time || '—',
          closeTime: raw.closing_time || '—',
          cgst: raw.cgst_rate ? `${raw.cgst_rate}%` : '—',
          sgst: raw.sgst_rate ? `${raw.sgst_rate}%` : '—',
          serviceCharge: raw.service_charge_rate ? `${raw.service_charge_rate}%` : '—',
          currency: raw.currency || '₹ (INR)',
          timezone: raw.timezone || 'Asia/Kolkata',
          tables: raw.table_count || 0,
          terminals: raw.terminal_count || 0,
        };
      } catch { return null; }
    },
    enabled: !!outletId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Staff List ────────────────────────────────────────────────────────────

export function useStaffList(outletId) {
  return useQuery({
    queryKey: ['staff-list', outletId],
    queryFn: async () => {
      try {
        const res = await api.get('/staff', { params: { outlet_id: outletId, limit: 100 } });
        const raw = unwrap(res);
        const staff = Array.isArray(raw) ? raw : (raw.staff || raw.records || []);
        return staff.map(s => ({
          id: s.id,
          name: s.full_name || s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
          role: s.role?.name || s.role || '—',
          email: s.email || '',
          phone: s.phone || '',
          active: s.is_active !== false,
          lastLogin: s.last_login ? formatTimeAgo(s.last_login) : '—',
        }));
      } catch { return []; }
    },
    enabled: !!outletId,
    staleTime: 2 * 60 * 1000,
  });
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
