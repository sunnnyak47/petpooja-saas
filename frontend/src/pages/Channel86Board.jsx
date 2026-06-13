/**
 * Channel86Board — live "86 Board" for menu-item availability across delivery channels.
 * Staff can manually 86 / un-86 items, see ingredient stock status, re-sync vs stock,
 * and toggle automatic 86-ing when stock runs out.
 *
 * API contract:
 *   GET  /auto86/board   → { data: { items: [...], summary: { total, out, low } } }
 *   POST /auto86/toggle  body { menu_item_id, available }   → updated item
 *   POST /auto86/sync    → { data: { changed: [...], pushed } }
 *   GET  /auto86/config  → { data: { auto_86_enabled } }
 *   PUT  /auto86/config  body { auto_86_enabled }
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Power,
  RefreshCw,
  Loader2,
  Search,
  CircleCheck,
  CircleAlert,
  CircleSlash,
  PackageX,
} from 'lucide-react';

const COLORS = {
  ok: '#16a34a',
  low: '#f59e0b',
  out: '#ef4444',
  neutral: '#64748b',
};

const STATUS_META = {
  ok: { label: 'Available', color: COLORS.ok, Icon: CircleCheck },
  low: { label: 'Low', color: COLORS.low, Icon: CircleAlert },
  out: { label: "86'd", color: COLORS.out, Icon: CircleSlash },
};

/** Derive the pill status: an unavailable item always reads as 86'd. */
function pillStatusFor(item) {
  if (!item.is_available) return 'out';
  return STATUS_META[item.stock_status] ? item.stock_status : 'ok';
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.ok;
  const { Icon } = meta;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
    >
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

/** Accessible availability toggle switch. */
function ToggleSwitch({ checked, disabled, onChange, busy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center h-6 w-11 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: checked ? COLORS.ok : COLORS.neutral }}
    >
      <span
        className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin" style={{ color: COLORS.neutral }} />}
      </span>
    </button>
  );
}

function SummaryChip({ label, value, color }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      <span
        className="text-lg font-bold leading-none"
        style={{ color: color || 'var(--text-primary)' }}
      >
        {value}
      </span>
      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </div>
  );
}

export default function Channel86Board() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  // ── Board data ──────────────────────────────────────────────────────────
  const {
    data: board,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['auto86-board'],
    queryFn: () => api.get('/auto86/board').then((r) => r.data || { items: [], summary: {} }),
    staleTime: 15_000,
  });

  const items = Array.isArray(board?.items) ? board.items : [];
  const summary = board?.summary || { total: items.length, out: 0, low: 0 };

  // ── Auto-86 config ──────────────────────────────────────────────────────
  const { data: config } = useQuery({
    queryKey: ['auto86-config'],
    queryFn: () => api.get('/auto86/config').then((r) => r.data || {}),
    staleTime: 30_000,
  });
  const autoEnabled = !!config?.auto_86_enabled;

  const configMutation = useMutation({
    mutationFn: (enabled) => api.put('/auto86/config', { auto_86_enabled: enabled }),
    onSuccess: (_res, enabled) => {
      qc.setQueryData(['auto86-config'], (prev) => ({ ...(prev || {}), auto_86_enabled: enabled }));
      toast.success(enabled ? 'Auto-86 enabled' : 'Auto-86 disabled');
    },
    onError: (err) => toast.error(err.message || 'Could not update setting'),
  });

  // ── Manual toggle ───────────────────────────────────────────────────────
  const [pendingId, setPendingId] = useState(null);
  const toggleMutation = useMutation({
    mutationFn: ({ id, available }) =>
      api.post('/auto86/toggle', { menu_item_id: id, available }),
    onMutate: ({ id }) => setPendingId(id),
    onSuccess: (_res, { available }) => {
      qc.invalidateQueries({ queryKey: ['auto86-board'] });
      toast.success(available ? 'Item is back on' : "Item 86'd");
    },
    onError: (err) => toast.error(err.message || 'Could not update item'),
    onSettled: () => setPendingId(null),
  });

  // ── Re-sync ─────────────────────────────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: () => api.post('/auto86/sync').then((r) => r.data || {}),
    onSuccess: (res) => {
      const changed = Array.isArray(res?.changed) ? res.changed.length : 0;
      qc.invalidateQueries({ queryKey: ['auto86-board'] });
      toast.success(
        changed === 0 ? 'Everything is already in sync' : `Updated ${changed} item${changed === 1 ? '' : 's'}`
      );
    },
    onError: (err) => toast.error(err.message || 'Sync failed'),
  });

  // ── Filtered rows ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => (it.name || '').toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
        >
          <PackageX className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>86 Board</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Pause items across every delivery channel when you run out
          </p>
        </div>
      </div>

      {/* Control row */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border p-4"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        {/* Auto-86 toggle */}
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg border"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        >
          <Power
            className="w-4 h-4"
            style={{ color: autoEnabled ? COLORS.ok : 'var(--text-secondary)' }}
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Auto-86</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Auto-pause items when stock runs out
            </div>
          </div>
          <ToggleSwitch
            checked={autoEnabled}
            disabled={configMutation.isPending}
            busy={configMutation.isPending}
            onChange={(next) => configMutation.mutate(next)}
          />
        </div>

        {/* Re-sync */}
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          Re-sync now
        </button>

        <div className="flex-1" />

        {/* Summary chips */}
        <div className="flex items-center gap-2">
          <SummaryChip label="Total" value={summary.total ?? items.length} />
          <SummaryChip label="86'd" value={summary.out ?? 0} color={COLORS.out} />
          <SummaryChip label="Low" value={summary.low ?? 0} color={COLORS.low} />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-secondary)' }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading the board…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Couldn't load the 86 board</p>
            <button
              onClick={() => refetch()}
              className="text-xs font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <PackageX className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {items.length === 0 ? 'No menu items to show yet' : 'No items match your search'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Item</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Stock</th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Available</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const status = pillStatusFor(it);
                const isOff = !it.is_available;
                const isPending = pendingId === it.id;
                const lim = it.limiting_ingredient;
                const showLimiting = (it.stock_status === 'low' || it.stock_status === 'out') && lim;
                return (
                  <tr
                    key={it.id}
                    style={{ borderTop: '1px solid var(--border)', opacity: isOff ? 0.55 : 1 }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{it.name || '—'}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {it.category_id ? `Category ${it.category_id}` : 'Uncategorised'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={status} />
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {!it.tracked ? (
                        <span className="text-xs">Not tracked</span>
                      ) : showLimiting ? (
                        <span className="text-xs" style={{ color: STATUS_META[it.stock_status]?.color }}>
                          {STATUS_META[it.stock_status]?.label}: {lim.name} — {lim.current} left
                        </span>
                      ) : (
                        <span className="text-xs">In stock</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ToggleSwitch
                          checked={it.is_available}
                          disabled={isPending || toggleMutation.isPending}
                          busy={isPending}
                          onChange={(next) => toggleMutation.mutate({ id: it.id, available: next })}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
