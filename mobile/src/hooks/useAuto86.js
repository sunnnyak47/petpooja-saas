/**
 * useAuto86 — data layer for the "86 Board" screen (mobile).
 *
 * The 86 Board is the live menu-item availability view for the SELECTED outlet:
 * every active item with its computed makeability, stock status, and limiting
 * ingredient. Staff can manually 86 / un-86 an item (fans out to every connected
 * delivery channel), re-sync availability against current stock, and toggle the
 * automatic stock-driven 86 engine on/off.
 *
 * Every request is outlet-scoped. The auto86 routes resolve the outlet from
 * `req.query.outlet_id` (an owner's user.outlet_id is often null), so we ALWAYS
 * pass outlet_id as a QUERY param — on reads AND writes (POST/PUT).
 *
 * Endpoints (backend integrations/auto86.routes, mounted at /api/auto86):
 *   GET  /auto86/board?outlet_id=                       → { items[], summary:{ total, out, low } }
 *   GET  /auto86/config?outlet_id=                       → { auto_86_enabled }
 *   POST /auto86/toggle?outlet_id=  { menu_item_id, available } → updated item · MANAGE_MENU
 *   POST /auto86/sync?outlet_id=                         → { changed[], pushed } · MANAGE_MENU
 *   PUT  /auto86/config?outlet_id=  { auto_86_enabled }  → { auto_86_enabled } · MANAGE_MENU
 *
 * The mobile api interceptor returns the response BODY, so `res.data` is the
 * sendSuccess payload. Pure helpers (filter / status) are unit-tested — no React,
 * no network.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutlet } from '../context/OutletContext';
import api from '../lib/api';

// ─── Status model (shared with the web 86 board) ────────────────────────────

/** Visual status buckets: label + tone key resolved against theme in the screen. */
export const STATUS_META = {
  ok: { key: 'ok', label: 'Available' },
  low: { key: 'low', label: 'Low' },
  out: { key: 'out', label: "86'd" },
};

const A86_KEYS = {
  board: (outletId) => ['auto86-board', outletId],
  config: (outletId) => ['auto86-config', outletId],
};

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/**
 * The pill status for an item: an unavailable item always reads as 86'd,
 * otherwise it follows its computed stock_status ('ok' | 'low' | 'out').
 */
export function pillStatusFor(item = {}) {
  if (!item.is_available) return 'out';
  return STATUS_META[item.stock_status] ? item.stock_status : 'ok';
}

/** Free-text match over item name. Blank query matches all. */
export function matchesItem(item = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  return String(item.name || '').toLowerCase().includes(s);
}

/** Client-side filter by name query. */
export function filterItems(rows = [], q = '') {
  return (Array.isArray(rows) ? rows : []).filter((it) => matchesItem(it, q));
}

/**
 * A short stock description for an item → { text, tone }.
 *   tone: 'muted' | 'low' | 'out' — the screen maps tone to a colour.
 */
export function stockLine(item = {}) {
  if (!item.tracked) return { text: 'Not tracked', tone: 'muted' };
  const lim = item.limiting_ingredient;
  if ((item.stock_status === 'low' || item.stock_status === 'out') && lim) {
    const label = STATUS_META[item.stock_status]?.label || '';
    return { text: `${label}: ${lim.name} — ${lim.current} left`, tone: item.stock_status };
  }
  return { text: 'In stock', tone: 'muted' };
}

/** Summary counts from a row set (fallback when the API summary is absent). */
export function computeSummary(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  let out = 0;
  let low = 0;
  for (const it of list) {
    const st = pillStatusFor(it);
    if (st === 'out') out += 1;
    else if (st === 'low') low += 1;
  }
  return { total: list.length, out, low };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAuto86() {
  const { outletId } = useOutlet();
  const qc = useQueryClient();

  const boardQuery = useQuery({
    queryKey: A86_KEYS.board(outletId),
    enabled: !!outletId,
    staleTime: 15_000,
    queryFn: async () => {
      const res = await api.get('/auto86/board', { params: { outlet_id: outletId } });
      const data = res?.data || {};
      const items = Array.isArray(data.items) ? data.items : [];
      const summary = data.summary || computeSummary(items);
      return { items, summary };
    },
  });

  const configQuery = useQuery({
    queryKey: A86_KEYS.config(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await api.get('/auto86/config', { params: { outlet_id: outletId } });
      return res?.data || { auto_86_enabled: false };
    },
  });

  const invalidateBoard = () => qc.invalidateQueries({ queryKey: A86_KEYS.board(outletId) });

  const toggleMut = useMutation({
    mutationFn: ({ id, available }) =>
      api.post('/auto86/toggle', { menu_item_id: id, available }, { params: { outlet_id: outletId } }),
    onSuccess: invalidateBoard,
  });

  const syncMut = useMutation({
    mutationFn: () =>
      api.post('/auto86/sync', {}, { params: { outlet_id: outletId } }).then((r) => r?.data || {}),
    onSuccess: invalidateBoard,
  });

  const configMut = useMutation({
    mutationFn: (enabled) =>
      api.put('/auto86/config', { auto_86_enabled: enabled }, { params: { outlet_id: outletId } }),
    onSuccess: (_res, enabled) => {
      qc.setQueryData(A86_KEYS.config(outletId), (prev) => ({ ...(prev || {}), auto_86_enabled: enabled }));
    },
  });

  const items = boardQuery.data?.items || [];
  const summary = boardQuery.data?.summary || { total: 0, out: 0, low: 0 };

  return {
    outletId,
    items,
    summary,
    autoEnabled: !!configQuery.data?.auto_86_enabled,
    isLoading: boardQuery.isLoading,
    isError: boardQuery.isError,
    isRefetching: boardQuery.isRefetching || configQuery.isRefetching,
    refetch: () => { boardQuery.refetch(); configQuery.refetch(); },
    toggleItem: (id, available) => toggleMut.mutateAsync({ id, available }),
    isToggling: toggleMut.isPending,
    resync: () => syncMut.mutateAsync(),
    isSyncing: syncMut.isPending,
    setAutoEnabled: (enabled) => configMut.mutateAsync(enabled),
    isSavingConfig: configMut.isPending,
    hasOutlet: !!outletId,
  };
}
