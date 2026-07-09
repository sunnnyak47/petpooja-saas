import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Kitchen Order Ticket (KOT / KDS) data layer.
 *
 * Talks to the real backend (mounted at /api/kitchen — see
 * backend/src/modules/orders/kot.routes.js). NO mock fallbacks: on a network /
 * server error the query surfaces `isError` so the screen can show a retry.
 *
 * Endpoints used:
 *   GET  /kitchen/kots?outlet_id=            → listPendingKOTs (pending|preparing|ready)
 *   PUT  /kitchen/kots/:id/status            → bump ticket (pending→preparing→ready→served)
 *   PUT  /kitchen/kots/:kotId/items/:id/ready → mark a single item ready
 *   PUT  /kitchen/kots/:kotId/items/:id/serve → hand a single ready item off (dine-in)
 *   PUT  /kitchen/orders/:orderId/serve       → serve every ready station of an order
 */

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const KOT_KEYS = {
  all: ['kot'],
  list: (outletId) => ['kot', 'list', outletId ?? null],
};

// ─── Helper: pull the array out of the { success, data, message } envelope ─────
function extractData(res) {
  if (!res) return null;
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data?.items)) return res.data.items;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.items)) return res.items;
  return res.data ?? res;
}

// ─── Normalizer: real KOT shape → shape the KOT screen renders ────────────────
// Backend KOT: { id, order_id, kot_number, station, status, created_at,
//   order: { order_number, order_type, table: { table_number } },
//   kot_items: [{ id, order_item_id, quantity, status,
//                 order_item: { name, variant_name, quantity, notes, addons } }] }
function itemDisplayStatus(kotStatus, itemStatus) {
  if (itemStatus === 'ready' || itemStatus === 'served') return 'done';
  if (kotStatus === 'preparing') return 'cooking';
  return 'waiting';
}

export function normalizeKot(k) {
  const rawItems = Array.isArray(k.kot_items) ? k.kot_items : (Array.isArray(k.items) ? k.items : []);
  return {
    id: k.id,
    kot_id: k.id,
    order_id: k.order_id ?? k.order?.id ?? null,
    order_number: k.order?.order_number ?? k.order_number ?? k.kot_number ?? '—',
    kot_number: k.kot_number ?? null,
    table_number: k.order?.table?.table_number ?? k.table_number ?? null,
    order_type: k.order?.order_type ?? null,
    station: k.station ?? null,
    created_at: k.created_at ?? new Date().toISOString(),
    status: k.status ?? 'pending',
    items: rawItems.map((ki) => {
      const oi = ki.order_item ?? {};
      const base = oi.name ?? ki.name ?? 'Item';
      const name = oi.variant_name ? `${base} (${oi.variant_name})` : base;
      return {
        id: ki.id,
        kot_item_id: ki.id,
        order_item_id: ki.order_item_id ?? null,
        name,
        quantity: ki.quantity ?? oi.quantity ?? 1,
        raw_status: ki.status ?? 'pending',
        item_status: itemDisplayStatus(k.status ?? 'pending', ki.status),
        notes: oi.notes ?? null,
        addons: Array.isArray(oi.addons) ? oi.addons : [],
      };
    }),
  };
}

// ─── List: pending KOTs for a kitchen station ─────────────────────────────────
export function useKotList({ outlet_id } = {}) {
  return useQuery({
    queryKey: KOT_KEYS.list(outlet_id),
    queryFn: async () => {
      const params = {};
      if (outlet_id) params.outlet_id = outlet_id;
      // No try/catch — let errors propagate so `isError` is surfaced (no silent mock).
      return await api.get('/kitchen/kots', { params });
    },
    select: (res) => {
      const raw = extractData(res);
      return Array.isArray(raw) ? raw.map(normalizeKot) : [];
    },
    enabled: !!outlet_id,
    staleTime: 8 * 1000,       // kitchen board is live
    refetchInterval: 20 * 1000, // keep the board fresh without a manual pull
  });
}

// ─── Mutation: bump a whole ticket (pending → preparing → ready → served) ──────
export function useBumpKot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kotId, status, outlet_id }) =>
      api.put(`/kitchen/kots/${kotId}/status`, { status, ...(outlet_id ? { outlet_id } : {}) }),
    onMutate: async ({ kotId, status, outlet_id }) => {
      const key = KOT_KEYS.list(outlet_id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, (old) => {
        if (!old?.data) return old;
        const list = Array.isArray(old.data) ? old.data : old.data.items;
        if (!Array.isArray(list)) return old;
        const next = list.map((k) => (k.id === kotId ? { ...k, status } : k));
        return Array.isArray(old.data) ? { ...old, data: next } : { ...old, data: { ...old.data, items: next } };
      });
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_data, _err, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ctx?.key ?? KOT_KEYS.all });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// ─── Mutation: mark a single KOT item ready ───────────────────────────────────
export function useMarkItemReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kotId, itemId }) => api.put(`/kitchen/kots/${kotId}/items/${itemId}/ready`),
    onMutate: async ({ kotId, itemId, outlet_id }) => {
      const key = KOT_KEYS.list(outlet_id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, (old) => {
        if (!old?.data) return old;
        const list = Array.isArray(old.data) ? old.data : old.data.items;
        if (!Array.isArray(list)) return old;
        const next = list.map((k) => {
          if (k.id !== kotId) return k;
          return {
            ...k,
            kot_items: (k.kot_items ?? []).map((ki) =>
              ki.id === itemId ? { ...ki, status: 'ready', ready_at: new Date().toISOString() } : ki
            ),
          };
        });
        return Array.isArray(old.data) ? { ...old, data: next } : { ...old, data: { ...old.data, items: next } };
      });
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_data, _err, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ctx?.key ?? KOT_KEYS.all });
    },
  });
}

// ─── Mutation: hand a single ready item off (READY → SERVED, dine-in only) ─────
export function useMarkItemServed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kotId, itemId }) => api.put(`/kitchen/kots/${kotId}/items/${itemId}/serve`),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: KOT_KEYS.list(vars?.outlet_id) });
    },
  });
}

// ─── Mutation: serve every ready station of an order at once ───────────────────
export function useServeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId }) => api.put(`/kitchen/orders/${orderId}/serve`),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: KOT_KEYS.list(vars?.outlet_id) });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
