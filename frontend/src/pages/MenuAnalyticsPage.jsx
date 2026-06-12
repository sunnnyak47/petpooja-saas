/**
 * MenuAnalyticsPage — ABC performance analysis for menu items
 * Route: /menu-analytics
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import {
  Package, Flame, Minus, Snowflake, TrendingUp, ShoppingBag,
  DollarSign, ChevronDown,
} from 'lucide-react';

/* ── ABC config — refined palette: emerald / amber / slate (not stoplight red) ── */
const ABC = {
  A: { label: 'Top Sellers',  sub: 'High velocity, drive revenue', icon: Flame,     color: '#10b981' },
  B: { label: 'Moderate',     sub: 'Stable performers',            icon: Minus,     color: '#f59e0b' },
  C: { label: 'Slow Movers',  sub: 'Low velocity, review pricing', icon: Snowflake, color: '#94a3b8' },
};

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

/* ────────────────────────────────────────────────────────────
   KPI Cell — minimal, dense, refined typography
──────────────────────────────────────────────────────────── */
function KpiCell({ label, value, sub, icon: Icon }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
        <span className="text-[11px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums"
        style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sub}</p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Revenue Distribution — stacked bar + clickable legend tiles
──────────────────────────────────────────────────────────── */
function RevenueDistribution({ groups, totalRevenue, totalQty, active, onSelect, format }) {
  const computed = Object.entries(ABC).map(([key, cfg]) => {
    const revenue  = groups[key].reduce((s, i) => s + (i.revenue || 0), 0);
    const qty      = groups[key].reduce((s, i) => s + (i.qty || 0), 0);
    const revShare = pct(revenue, totalRevenue);
    return { key, cfg, revenue, qty, revShare, count: groups[key].length };
  });

  return (
    <div className="card">
      {/* Section header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Revenue distribution
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            How your menu's revenue is concentrated across performance tiers
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}>Total</p>
          <p className="text-base font-semibold tabular-nums"
            style={{ color: 'var(--text-primary)' }}>{format(totalRevenue)}</p>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-5"
        style={{ background: 'var(--bg-secondary)' }}>
        {computed.map(({ key, cfg, revShare }) => (
          revShare > 0 && (
            <div key={key}
              className="transition-all"
              style={{ width: `${revShare}%`, background: cfg.color, opacity: active && active !== key ? 0.35 : 1 }}
              title={`${cfg.label}: ${revShare}%`} />
          )
        ))}
      </div>

      {/* Clickable legend tiles */}
      <div className="grid grid-cols-3 gap-3">
        {computed.map(({ key, cfg, revenue, count, revShare }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className="text-left p-3 rounded-lg transition-all"
              style={{
                background:  isActive ? `color-mix(in srgb, ${cfg.color} 8%, transparent)` : 'transparent',
                border:      `1px solid ${isActive ? cfg.color : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {cfg.label}
                </span>
                <span className="text-[11px] ml-auto" style={{ color: 'var(--text-secondary)' }}>
                  {count} item{count !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold tabular-nums"
                  style={{ color: 'var(--text-primary)' }}>{revShare}%</span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  · {format(revenue)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Item row — refined table row
──────────────────────────────────────────────────────────── */
function ItemRow({ rank, item, maxQty, totalRevenue, format }) {
  const cfg      = ABC[item.abc] || ABC.C;
  const barWidth = maxQty > 0 ? Math.round((item.qty / maxQty) * 100) : 0;
  const revShare = pct(item.revenue || 0, totalRevenue);
  const avgPrice = item.qty > 0 ? (item.revenue || 0) / item.qty : 0;

  return (
    <tr className="group transition-colors hover:bg-surface-800/30"
      style={{ borderTop: '1px solid var(--border)' }}>
      {/* Rank */}
      <td className="py-3 pl-4 pr-2 w-12">
        <span className="text-xs font-medium tabular-nums"
          style={{ color: 'var(--text-secondary)' }}>{String(rank).padStart(2, '0')}</span>
      </td>

      {/* Name + category */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-8 rounded-full shrink-0" style={{ background: cfg.color }} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {item.name}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {item.category}
            </p>
          </div>
        </div>
      </td>

      {/* Units sold with mini bar */}
      <td className="py-3 pr-4 w-40 hidden md:table-cell">
        <div className="space-y-1.5">
          <p className="text-sm font-medium tabular-nums"
            style={{ color: 'var(--text-primary)' }}>{item.qty.toLocaleString()}</p>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            <div className="h-full rounded-full"
              style={{ width: `${barWidth}%`, background: cfg.color, opacity: 0.6 }} />
          </div>
        </div>
      </td>

      {/* Avg price */}
      <td className="py-3 pr-4 text-right w-28 hidden sm:table-cell">
        <span className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {format(avgPrice)}
        </span>
      </td>

      {/* Revenue */}
      <td className="py-3 pr-4 text-right w-32 whitespace-nowrap">
        <span className="text-sm font-semibold tabular-nums"
          style={{ color: 'var(--text-primary)' }}>{format(item.revenue || 0)}</span>
      </td>

      {/* % share */}
      <td className="py-3 pr-4 text-right w-16">
        <span className="text-xs font-medium tabular-nums"
          style={{ color: 'var(--text-secondary)' }}>{revShare}%</span>
      </td>
    </tr>
  );
}

/* ────────────────────────────────────────────────────────────
   Main page
──────────────────────────────────────────────────────────── */
export default function MenuAnalyticsPage() {
  const { user }   = useSelector(s => s.auth);
  const { format } = useCurrency();
  const [outletId,  setOutletId]  = useState(user?.outlet_id || '');
  const [activeTab, setActiveTab] = useState('A');

  const { data: outlets = [] } = useQuery({
    queryKey: ['outlets-list'],
    queryFn:  () => api.get('/ho/outlets').then(r => r.data || []).catch(() => []),
    staleTime: 300_000,
  });

  React.useEffect(() => {
    if (!outletId && outlets.length > 0) setOutletId(outlets[0].id);
  }, [outlets, outletId]);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['menu-analytics', outletId],
    queryFn:  () =>
      api.get('/ho/menu-analytics', { params: { outlet_id: outletId } }).then(r => r.data),
    enabled:   !!outletId,
    staleTime: 60_000,
  });

  const groups = useMemo(() => ({
    A: analytics?.top_sellers || [],
    B: analytics?.moderate    || [],
    C: analytics?.slow_movers || [],
  }), [analytics]);

  const allItems     = useMemo(() => [...groups.A, ...groups.B, ...groups.C], [groups]);
  const totalRevenue = useMemo(() => allItems.reduce((s, i) => s + (i.revenue || 0), 0), [allItems]);
  const totalQty     = useMemo(() => allItems.reduce((s, i) => s + (i.qty || 0), 0), [allItems]);
  const totalItems   = allItems.length;
  const avgRevenue   = totalItems > 0 ? totalRevenue / totalItems : 0;

  const activeItems  = groups[activeTab] || [];
  const maxQtyInTab  = Math.max(...activeItems.map(i => i.qty || 0), 1);
  const tabRevenue   = activeItems.reduce((s, i) => s + (i.revenue || 0), 0);

  /* ── Loading ───────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="card flex items-center justify-center py-32">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    );
  }

  /* ── Empty state ───────────────────────────────────────── */
  if (!analytics || totalItems === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Header outlets={outlets} outletId={outletId} setOutletId={setOutletId} />
        <div className="card flex flex-col items-center justify-center py-24 gap-3 mt-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--bg-secondary)' }}>
            <Package className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No analytics yet</p>
          <p className="text-xs max-w-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            Once you process orders for the last 30 days, performance data will appear here.
          </p>
        </div>
      </div>
    );
  }

  /* ── Main view ─────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <Header outlets={outlets} outletId={outletId} setOutletId={setOutletId} />

      {/* KPI strip — single card, 4 dense cells separated by dividers */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-6"
          style={{ '--div': 'var(--border)' }}>
          <div className="md:pr-6" style={{ borderRight: '1px solid var(--border)' }}>
            <KpiCell label="Total Revenue"   value={format(totalRevenue)} sub="Last 30 days"          icon={DollarSign} />
          </div>
          <div className="md:pr-6 md:pl-0" style={{ borderRight: '1px solid var(--border)' }}>
            <KpiCell label="Units Sold"      value={totalQty.toLocaleString()} sub="Across all items" icon={ShoppingBag} />
          </div>
          <div className="md:pr-6 md:pl-0" style={{ borderRight: '1px solid var(--border)' }}>
            <KpiCell label="Active Menu SKUs" value={totalItems.toLocaleString()} sub="With recorded sales" icon={Package} />
          </div>
          <div>
            <KpiCell label="Avg Revenue / Item" value={format(avgRevenue)} sub="Across catalogue"     icon={TrendingUp} />
          </div>
        </div>
      </div>

      {/* Revenue distribution */}
      <RevenueDistribution
        groups={groups}
        totalRevenue={totalRevenue}
        totalQty={totalQty}
        active={activeTab}
        onSelect={setActiveTab}
        format={format}
      />

      {/* Item performance table */}
      <div className="card p-0">
        {/* Table header band */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Item performance
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {ABC[activeTab].sub}
            </p>
          </div>
          {/* Tab pills */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg"
            style={{ background: 'var(--bg-secondary)' }}>
            {Object.entries(ABC).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                style={activeTab === key
                  ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                  : { color: 'var(--text-secondary)' }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
                {cfg.label}
                <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {groups[key].length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Package className="w-8 h-8" style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No items in this tier
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {[
                      { label: '#',          align: 'left',  width: 'w-12', cls: 'pl-4 pr-2' },
                      { label: 'Item',       align: 'left',  width: '',     cls: 'pr-4' },
                      { label: 'Units',      align: 'left',  width: 'w-40', cls: 'pr-4 hidden md:table-cell' },
                      { label: 'Avg price',  align: 'right', width: 'w-28', cls: 'pr-4 hidden sm:table-cell' },
                      { label: 'Revenue',    align: 'right', width: 'w-32', cls: 'pr-4' },
                      { label: 'Share',      align: 'right', width: 'w-16', cls: 'pr-4' },
                    ].map(h => (
                      <th key={h.label}
                        className={`py-2.5 ${h.cls} text-${h.align} ${h.width}`}
                        style={{ background: 'var(--bg-secondary)' }}>
                        <span className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: 'var(--text-secondary)' }}>{h.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeItems.map((item, i) => (
                    <ItemRow
                      key={item.id || i}
                      rank={i + 1}
                      item={item}
                      maxQty={maxQtyInTab}
                      totalRevenue={totalRevenue}
                      format={format}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {activeItems.length} {activeItems.length === 1 ? 'item' : 'items'}
              </p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                Subtotal{' '}
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {format(tabRevenue)}
                </span>
                <span className="ml-1.5">· {pct(tabRevenue, totalRevenue)}% of revenue</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Page header — clean title block + outlet selector
──────────────────────────────────────────────────────────── */
function Header({ outlets, outletId, setOutletId }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Menu analytics
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          ABC performance analysis · Last 30 days
        </p>
      </div>
      {outlets.length > 1 && (
        <div className="relative">
          <select
            value={outletId}
            onChange={e => setOutletId(e.target.value)}
            className="text-sm pl-3 pr-8 py-2 rounded-lg outline-none appearance-none cursor-pointer transition-colors"
            style={{
              background:  'var(--bg-card)',
              border:      '1px solid var(--border)',
              color:       'var(--text-primary)',
              minWidth:    180,
            }}
          >
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-secondary)' }} />
        </div>
      )}
    </div>
  );
}
