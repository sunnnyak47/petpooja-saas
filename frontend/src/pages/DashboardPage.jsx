import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import {
  TrendingUp, ShoppingBag, IndianRupee, Users,
  ChefHat, ArrowUpRight, ArrowDownRight, AlertTriangle,
  ShoppingCart, BarChart3, UtensilsCrossed,
} from 'lucide-react';

// ── Greeting ────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const outletId  = user?.outlet_id;

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', outletId],
    queryFn: () => api.get(`/reports/dashboard?outlet_id=${outletId}`).then((r) => r.data),
    enabled: !!outletId,
    refetchInterval: 30000,
  });

  const { data: topItems } = useQuery({
    queryKey: ['topSelling', outletId],
    queryFn: () => api.get(`/reports/topSellingItems?outlet_id=${outletId}&limit=5`).then((r) => r.data),
    enabled: !!outletId,
  });

  const d = dashboard || { today: {}, comparison: {}, live: {} };

  const statCards = [
    {
      label: "Today's Revenue",
      value: `₹${(d.today?.revenue || 0).toLocaleString('en-IN')}`,
      change: d.comparison?.revenue_growth_pct || 0,
      icon: IndianRupee,
      accent: 'var(--accent)',
    },
    {
      label: "Today's Orders",
      value: d.today?.orders || 0,
      change: d.comparison?.yesterday_orders
        ? Math.round(((d.today?.orders - d.comparison.yesterday_orders) / d.comparison.yesterday_orders) * 100)
        : 0,
      icon: ShoppingBag,
      accent: '#0ea5e9',
    },
    {
      label: 'Avg Order Value',
      value: `₹${(d.today?.avg_order_value || 0).toLocaleString('en-IN')}`,
      icon: TrendingUp,
      accent: '#16a34a',
    },
    {
      label: 'Table Occupancy',
      value: `${d.live?.occupancy_pct || 0}%`,
      sub: `${d.live?.active_tables || 0}/${d.live?.total_tables || 0} tables`,
      icon: Users,
      accent: '#d97706',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-7 w-48 rounded-xl" style={{ background: 'var(--bg-hover)' }} />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <div key={i} className="h-28 rounded-2xl" style={{ background: 'var(--bg-card)' }} />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map((i) => <div key={i} className="h-48 rounded-2xl" style={{ background: 'var(--bg-card)' }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {greeting()}, {user?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Here's what's happening at your restaurant today
          </p>
        </div>
        <button
          onClick={() => navigate('/pos')}
          className="btn-primary btn-sm flex items-center gap-1.5"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          New Order
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{card.label}</p>
                <p className="text-2xl font-bold tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>{card.value}</p>
                {card.change !== undefined && card.change !== 0 && (
                  <div className="flex items-center gap-1 mt-2 text-xs font-semibold" style={{ color: card.change > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {card.change > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {Math.abs(card.change)}% vs yesterday
                  </div>
                )}
                {card.sub && <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>{card.sub}</p>}
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: card.accent + '18' }}>
                <card.icon className="w-5 h-5" style={{ color: card.accent }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Middle row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Live status */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Live Status</p>
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--success)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Live
            </span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Running Orders', value: d.today?.running_orders || 0, color: 'var(--warning)' },
              { label: 'Pending KOTs',   value: d.live?.pending_kots    || 0, color: 'var(--accent)' },
              { label: 'Paid Orders',    value: d.today?.paid_orders    || 0, color: 'var(--success)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="text-lg font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Yesterday comparison */}
        <div className="card">
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>vs Yesterday</p>
          <div className="space-y-5">
            {[
              {
                label: 'Revenue',
                today: d.today?.revenue || 0,
                yesterday: d.comparison?.yesterday_revenue || 0,
                format: (v) => `₹${v.toLocaleString('en-IN')}`,
                color: 'var(--accent)',
              },
              {
                label: 'Orders',
                today: d.today?.orders || 0,
                yesterday: d.comparison?.yesterday_orders || 0,
                format: (v) => v,
                color: '#0ea5e9',
              },
            ].map(({ label, today, yesterday, format, color }) => (
              <div key={label}>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{format(today)}</span>
                    <span className="text-xs ml-1.5" style={{ color: 'var(--text-secondary)' }}>/ {format(yesterday)} yday</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, yesterday ? (today / yesterday) * 100 : 0)}%`, background: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card">
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'New Order', icon: ShoppingCart, path: '/pos',      color: 'var(--accent)' },
              { label: 'Tables',    icon: Users,        path: '/tables',   color: '#0ea5e9' },
              { label: 'Menu',      icon: UtensilsCrossed, path: '/menu',  color: '#16a34a' },
              { label: 'Reports',   icon: BarChart3,    path: '/reports',  color: '#d97706' },
            ].map(({ label, icon: Icon, path, color }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all text-center group"
                style={{ background: color + '12' }}
                onMouseEnter={e => e.currentTarget.style.background = color + '22'}
                onMouseLeave={e => e.currentTarget.style.background = color + '12'}
              >
                <Icon className="w-5 h-5 transition-transform group-hover:scale-110" style={{ color }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top selling items */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Top Selling Items</p>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>This Month</span>
          </div>
          <div className="space-y-2">
            {topItems?.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                style={{ background: 'var(--bg-hover)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'var(--accent)', color: '#fff', opacity: 1 - idx * 0.12 }}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{item.category}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{item.count} <span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>sold</span></p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>₹{Number(item.revenue || 0).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {(!topItems || topItems.length === 0) && (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No sales data yet</p>
            )}
          </div>
        </div>

        {/* Critical stock */}
        <div className="card" style={{ borderColor: 'rgba(217,119,6,0.2)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--warning)' }} />
              Critical Stock
            </p>
            <button
              onClick={() => navigate('/inventory')}
              className="text-xs font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              Manage All →
            </button>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-3 py-3 rounded-xl border" style={{ background: 'rgba(220,38,38,0.05)', borderColor: 'rgba(220,38,38,0.15)' }}>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping flex-shrink-0" />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tomato Juice (Ltr)</span>
              </div>
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--danger)' }}>Out of Stock</span>
            </div>
            <div className="flex items-center justify-between px-3 py-3 rounded-xl border" style={{ background: 'rgba(217,119,6,0.05)', borderColor: 'rgba(217,119,6,0.15)' }}>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--warning)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Paneer Fresh (Kg)</span>
              </div>
              <span className="text-xs font-bold uppercase" style={{ color: 'var(--warning)' }}>Below Threshold</span>
            </div>
            <p className="text-[11px] text-center pt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Demo inventory data shown above</p>
          </div>
        </div>
      </div>
    </div>
  );
}
