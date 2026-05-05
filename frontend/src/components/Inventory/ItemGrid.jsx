import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Search, Package, Filter, SlidersHorizontal } from 'lucide-react';

const STATUS_CONFIG = {
  OK:       { bg: 'color-mix(in srgb, var(--success) 10%, transparent)', bar: 'var(--success)',  badge: 'bg-emerald-500/15 text-emerald-400' },
  LOW:      { bg: 'color-mix(in srgb, var(--warning) 8%, transparent)',  bar: 'var(--warning)',  badge: 'bg-yellow-500/15 text-yellow-400' },
  CRITICAL: { bg: 'color-mix(in srgb, var(--danger) 10%, transparent)',  bar: 'var(--danger)',   badge: 'bg-orange-500/20 text-orange-400' },
  OUT:      { bg: 'color-mix(in srgb, var(--danger) 15%, transparent)',  bar: 'var(--danger)',   badge: 'bg-red-500/20 text-red-400 animate-pulse' },
};

const CAT_ICONS = {
  Vegetables: '🥦', Dairy: '🥛', Meat: '🥩', Seafood: '🐟',
  Groceries: '🌾', Beverages: '🧃', Packaging: '📦', Cleaning: '🧹', Other: '📦',
};

function StockBar({ current, min, max, status }) {
  const safeMax = Math.max(max || min * 3 || 10, current + 1);
  const pct = Math.min(100, Math.max(0, (current / safeMax) * 100));
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden mt-2"
      style={{ background: 'var(--bg-hover)' }}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: STATUS_CONFIG[status]?.bar || 'var(--success)' }} />
    </div>
  );
}

export default function ItemGrid({ outletId, onItemClick, onAdjust }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');   // all | low | ok

  const { data, isLoading } = useQuery({
    queryKey: ['inv-stock', outletId, search, filter],
    queryFn: () => {
      const params = new URLSearchParams({ outlet_id: outletId, limit: '200' });
      if (search) params.set('search', search);
      if (filter === 'low') params.set('low_stock', 'true');
      return api.get(`/inventory/stock?${params}`);
    },
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  const raw = data?.data;
  const items = Array.isArray(raw) ? raw : (raw?.items || raw || []);

  // Group by status priority for display
  const sorted = [...items].sort((a, b) => {
    const order = { OUT: 0, CRITICAL: 1, LOW: 2, OK: 3 };
    return (order[a.stock_status] ?? 4) - (order[b.stock_status] ?? 4);
  });

  const counts = items.reduce((acc, i) => {
    acc[i.stock_status] = (acc[i.stock_status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Search + Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <input
            className="flex-1 bg-transparent text-sm font-bold outline-none"
            style={{ color: 'var(--text-primary)' }}
            placeholder="Search ingredients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'low', label: `⚠ Low (${(counts.LOW || 0) + (counts.CRITICAL || 0) + (counts.OUT || 0)})` },
          ].map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all"
              style={{
                background: filter === f.key ? 'var(--accent)' : 'var(--bg-hover)',
                color: filter === f.key ? '#fff' : 'var(--text-secondary)',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary badges */}
      {!search && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = counts[status] || 0;
            if (!count) return null;
            return (
              <div key={status}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{ background: cfg.bg }}>
                <span className={`text-[10px] font-black uppercase ${cfg.badge.split(' ')[1]}`}>
                  {count} {status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl h-28 animate-pulse"
              style={{ background: 'var(--bg-secondary)' }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>
          <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-bold">
            {search ? 'No items match your search' : 'No inventory items yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sorted.map(item => {
            const status = item.stock_status || 'OK';
            const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OK;
            const catIcon = CAT_ICONS[item.category] || '📦';

            return (
              <button key={item.id}
                onClick={() => onItemClick?.(item)}
                className="rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: cfg.bg,
                  border: `1.5px solid ${status !== 'OK' ? cfg.bar : 'var(--border)'}`,
                }}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-lg">{catIcon}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${cfg.badge}`}>
                    {status}
                  </span>
                </div>

                <p className="text-sm font-black leading-tight mb-0.5 line-clamp-2"
                  style={{ color: 'var(--text-primary)' }}>
                  {item.name}
                </p>

                <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                  {item.current_stock ?? 0} {item.unit}
                </p>

                <StockBar
                  current={parseFloat(item.current_stock) || 0}
                  min={parseFloat(item.min_threshold) || 1}
                  max={parseFloat(item.max_threshold)}
                  status={status}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
