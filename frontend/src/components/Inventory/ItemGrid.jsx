import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Search, Package, AlertTriangle, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

const STATUS_CONFIG = {
  OK:       { color: '#10b981', label: 'In stock', Icon: CheckCircle2 },
  LOW:      { color: '#f59e0b', label: 'Low',      Icon: AlertTriangle },
  CRITICAL: { color: '#f97316', label: 'Critical', Icon: AlertCircle },
  OUT:      { color: '#ef4444', label: 'Out',      Icon: XCircle },
};

function StockBar({ current, min, max, status }) {
  const safeMax = Math.max(max || min * 3 || 10, current + 1);
  const pct = Math.min(100, Math.max(0, (current / safeMax) * 100));
  const color = STATUS_CONFIG[status]?.color || '#10b981';
  return (
    <div className="w-full h-1 rounded-full overflow-hidden mt-2.5"
      style={{ background: 'rgba(15,23,42,0.06)' }}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(pct, 4)}%`, background: color }} />
    </div>
  );
}

export default function ItemGrid({ outletId, onItemClick, onAdjust }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');   // all | low | ok | out

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

  // sort by priority
  const sorted = [...items].sort((a, b) => {
    const order = { OUT: 0, CRITICAL: 1, LOW: 2, OK: 3 };
    return (order[a.stock_status] ?? 4) - (order[b.stock_status] ?? 4);
  });

  const counts = items.reduce((acc, i) => {
    acc[i.stock_status] = (acc[i.stock_status] || 0) + 1;
    return acc;
  }, {});

  // local filter chip filter
  const visible = sorted.filter(i => {
    if (filter === 'all') return true;
    if (filter === 'ok')  return i.stock_status === 'OK';
    if (filter === 'low') return ['LOW','CRITICAL'].includes(i.stock_status);
    if (filter === 'out') return i.stock_status === 'OUT';
    return true;
  });

  return (
    <div className="space-y-4">

      {/* ── Refined search + filter bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* search */}
        <div className="flex-1 min-w-[200px] flex items-center gap-2 px-3.5 py-2 rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-60"
            style={{ color: 'var(--text-primary)' }}
            placeholder="Search ingredients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* status segmented control */}
        <div className="inline-flex p-1 rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {[
            { key: 'all', label: 'All',      n: items.length,                              dot: '#94a3b8' },
            { key: 'ok',  label: 'In stock', n: counts.OK || 0,                            dot: '#10b981' },
            { key: 'low', label: 'Low',      n: (counts.LOW || 0) + (counts.CRITICAL || 0), dot: '#f59e0b' },
            { key: 'out', label: 'Out',      n: counts.OUT || 0,                           dot: '#ef4444' },
          ].map(f => {
            const active = filter === f.key;
            return (
              <button key={f.key}
                onClick={() => setFilter(f.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: active ? 'var(--bg-secondary)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 3px rgba(15,23,42,0.05)' : 'none',
                }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.dot }} />
                {f.label}
                <span className="font-mono opacity-60">{f.n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-xl h-32 animate-pulse"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)' }}>
          <Package className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {search ? 'No ingredients match your search' : 'No inventory items yet'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {search ? 'Try a different keyword' : 'Add your first material to get started'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {visible.map(item => {
            const status  = item.stock_status || 'OK';
            const cfg     = STATUS_CONFIG[status] || STATUS_CONFIG.OK;
            const StatusIcon = cfg.Icon;
            const min     = parseFloat(item.min_threshold) || 0;
            const current = parseFloat(item.current_stock) || 0;

            return (
              <button key={item.id}
                onClick={() => onItemClick?.(item)}
                className="relative text-left rounded-xl p-4 transition-all overflow-hidden group"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  minHeight: 130,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = cfg.color + '70';
                  e.currentTarget.style.boxShadow = `0 8px 22px -10px ${cfg.color}40`;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}>

                {/* Left-edge accent bar (status colour) */}
                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r"
                  style={{ background: cfg.color, opacity: 0.9 }} />

                {/* Header: status + category */}
                <div className="flex items-start justify-between mb-2.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {item.category || 'Misc'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wider"
                    style={{
                      background: cfg.color + '14',
                      color: cfg.color,
                      border: `1px solid ${cfg.color}30`,
                    }}>
                    <StatusIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
                    {cfg.label}
                  </span>
                </div>

                {/* Name */}
                <p className="text-sm font-bold leading-tight line-clamp-2 mb-2"
                  style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  {item.name}
                </p>

                {/* Quantity */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black leading-none tracking-tight"
                    style={{
                      color: status === 'OUT' ? '#ef4444' : 'var(--text-primary)',
                      letterSpacing: '-0.025em',
                      fontFeatureSettings: '"tnum"',
                    }}>
                    {current}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {item.unit || 'units'}
                  </span>
                  {min > 0 && (
                    <span className="text-[10px] ml-auto" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                      min {min}
                    </span>
                  )}
                </div>

                {/* Stock progress */}
                <StockBar current={current} min={min} max={parseFloat(item.max_threshold)} status={status} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
