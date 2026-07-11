import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';

// ─── Query Keys ──────────────────────────────────────────────────────────────
export const WASTE_KEYS = {
  logs: (outletId) => ['wastage-logs', outletId],
  stock: (outletId) => ['wastage-stock', outletId],
};

// ─── Preset reasons (matches server free-text `reason`; we constrain in the UI) ─
export const WASTE_REASONS = [
  'Spoilage',
  'Expired',
  'Overproduction',
  'Prep Error',
  'Spillage',
  'Other',
];

// Icon + accent per reason for the list/chips. Falls back to a neutral tag.
export const REASON_META = {
  Spoilage:       { icon: 'nutrition-outline',    color: '#d97706' },
  Expired:        { icon: 'time-outline',         color: '#dc2626' },
  Overproduction: { icon: 'layers-outline',       color: '#2563eb' },
  'Prep Error':   { icon: 'construct-outline',    color: '#9333ea' },
  Spillage:       { icon: 'water-outline',        color: '#0891b2' },
  Other:          { icon: 'ellipsis-horizontal',  color: '#64748b' },
};

export function reasonMeta(reason) {
  return REASON_META[reason] || REASON_META.Other;
}

// ─── Envelope helper (mirrors useApi.extractData) ─────────────────────────────
// /inventory/wastage → sendSuccess(res, logs) → { success, data: [...] }
// /inventory/stock   → sendSuccess(res, { items, total, ... })
function extractData(res) {
  if (!res) return null;
  if (res.data?.items) return res.data.items;
  if (res.data) return res.data;
  if (res.items) return res.items;
  return res;
}

// ─── Pure transforms (unit-tested in __tests__/wastelog.test.js) ──────────────

/**
 * Normalise one raw wastage row from GET /inventory/wastage.
 * Row shape: { id, quantity, reason, created_at, logged_by,
 *              inventory_item: { name, unit, cost_per_unit } }
 */
export function normalizeWasteRow(row) {
  if (!row || typeof row !== 'object') return null;
  const item = row.inventory_item || {};
  const quantity = Math.abs(Number(row.quantity ?? 0)) || 0;
  const costPerUnit = Number(item.cost_per_unit ?? 0) || 0;
  return {
    id: String(row.id ?? `${row.inventory_item_id ?? 'x'}-${row.created_at ?? Math.random()}`),
    itemName: item.name ?? 'Unknown item',
    unit: item.unit ?? '',
    quantity,
    reason: row.reason ?? 'Other',
    createdAt: row.created_at ?? row.createdAt ?? null,
    loggedBy: row.logged_by ?? row.loggedBy ?? null,
    costPerUnit,
    lineCost: quantity * costPerUnit,
    hasCost: costPerUnit > 0,
  };
}

// Local YYYY-MM-DD key for a date-ish value (groups by calendar day, not UTC).
export function dayKey(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return 'unknown';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Human label for a day key relative to `now` — "Today" / "Yesterday" / date.
export function dayLabel(key, now = new Date()) {
  if (!key || key === 'unknown') return 'Unknown date';
  const todayKey = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === todayKey) return 'Today';
  if (key === dayKey(yesterday)) return 'Yesterday';
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Short HH:MM time for a row.
export function timeLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Group normalised rows into day-buckets, newest day first, newest entry first.
 * Each group: { key, entries, totalCost, entryCount, hasCost }.
 */
export function groupWasteByDay(rows, now = new Date()) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const buckets = new Map();
  for (const r of list) {
    const key = dayKey(r.createdAt);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  const groups = [];
  for (const [key, entries] of buckets) {
    entries.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const totalCost = entries.reduce((s, e) => s + (e.lineCost || 0), 0);
    groups.push({
      key,
      label: dayLabel(key, now),
      entries,
      entryCount: entries.length,
      totalCost,
      hasCost: entries.some((e) => e.hasCost),
    });
  }
  groups.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  return groups;
}

/**
 * Top-of-screen summary: today's entry count + estimated waste cost.
 * `hasCost` is false when NO entry carried a cost_per_unit — the screen then
 * hides the money figure rather than showing a dishonest $0.
 */
export function computeTodaySummary(rows, now = new Date()) {
  const todayKey = dayKey(now);
  const today = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && dayKey(r.createdAt) === todayKey
  );
  const totalCost = today.reduce((s, e) => s + (e.lineCost || 0), 0);
  const totalQty = today.reduce((s, e) => s + (e.quantity || 0), 0);
  return {
    count: today.length,
    totalCost,
    totalQty,
    hasCost: today.some((e) => e.hasCost),
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Wastage log list, scoped to the selected outlet. Returns normalised rows;
 * the screen groups them by day with groupWasteByDay().
 */
export function useWasteLog() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: WASTE_KEYS.logs(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/inventory/wastage', {
          params: { outlet_id: outletId, limit: 200 },
        });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (!Array.isArray(data)) return [];
      return data.map(normalizeWasteRow).filter(Boolean);
    },
    enabled: !!outletId,
    staleTime: 30 * 1000,
  });
}

/**
 * Inventory items for the "Record Waste" picker. Uses /inventory/stock so we get
 * name, unit, cost_per_unit and current_stock in one shot.
 */
export function useStockItems() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: WASTE_KEYS.stock(outletId),
    queryFn: async () => {
      try {
        const res = await api.get('/inventory/stock', {
          params: { outlet_id: outletId, limit: 500 },
        });
        return res;
      } catch {
        return null;
      }
    },
    select: (res) => {
      const data = extractData(res);
      if (!Array.isArray(data)) return [];
      return data.map((it) => ({
        id: String(it.id),
        name: it.name ?? 'Item',
        unit: it.unit ?? '',
        costPerUnit: Number(it.cost_per_unit ?? 0) || 0,
        currentStock: Number(it.current_stock ?? 0) || 0,
        category: it.category ?? null,
      }));
    },
    enabled: !!outletId,
    staleTime: 60 * 1000,
  });
}

/**
 * Record a wastage entry. Backend contract (recordWastageSchema) is a BATCH:
 *   POST /inventory/wastage { outlet_id, items: [{ item_id, quantity, reason }] }
 * We wrap a single entry into the items array.
 */
export function useRecordWaste() {
  const qc = useQueryClient();
  const { outletId } = useOutlet();
  return useMutation({
    mutationFn: ({ outlet_id, item_id, quantity, reason }) =>
      api.post('/inventory/wastage', {
        outlet_id: outlet_id ?? outletId,
        items: [{ item_id, quantity: Number(quantity), reason }],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WASTE_KEYS.logs(outletId) });
      qc.invalidateQueries({ queryKey: WASTE_KEYS.stock(outletId) });
      // Stock levels changed → keep the Inventory screen honest too.
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
