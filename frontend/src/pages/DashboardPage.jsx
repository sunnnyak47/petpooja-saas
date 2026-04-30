import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import {
  TrendingUp, ShoppingBag, IndianRupee, Users,
  ArrowUpRight, ArrowDownRight, ShoppingCart,
  BarChart3, UtensilsCrossed, Clock, CheckCircle2,
  AlertCircle, Loader2,
} from 'lucide-react';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

/* today's ISO date range */
function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/* order status → label + colour */
const STATUS_META = {
  created:    { label: 'New',        color: '#6366f1' },
  running:    { label: 'Running',    color: '#f59e0b' },
  pending:    { label: 'Pending',    color: '#f59e0b' },
  completed:  { label: 'Completed',  color: '#10b981' },
  paid:       { label: 'Paid',       color: '#10b981' },
  cancelled:  { label: 'Cancelled',  color: '#ef4444' },
  voided:     { label: 'Voided',     color: '#94a3b8' },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status, color: '#94a3b8' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: meta.color + '18', color: meta.color,
      letterSpacing: '0.03em', textTransform: 'uppercase',
    }}>
      {meta.label}
    </span>
  );
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000); // minutes
  if (diff < 1)  return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

export default function DashboardPage() {
  const navigate  = useNavigate();
  const { user }  = useSelector((s) => s.auth);
  const outletId  = user?.outlet_id;
  const { from, to } = todayRange();

  /* dashboard KPIs */
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', outletId],
    queryFn:  () => api.get(`/reports/dashboard?outlet_id=${outletId}`).then((r) => r.data),
    enabled:  !!outletId,
    refetchInterval: 30000,
  });

  /* top selling items */
  const { data: topItems } = useQuery({
    queryKey: ['topSelling', outletId],
    queryFn:  () => api.get(`/reports/topSellingItems?outlet_id=${outletId}&limit=5`).then((r) => r.data),
    enabled:  !!outletId,
  });

  /* recent orders — today, latest 6 */
  const { data: recentOrdersRes, isLoading: ordersLoading } = useQuery({
    queryKey: ['recentOrders', outletId],
    queryFn:  () => api.get(
      `/orders?outlet_id=${outletId}&from=${from}&to=${to}&limit=6&sort=created_at&order=desc`
    ).then((r) => r.data),
    enabled:  !!outletId,
    refetchInterval: 20000,
  });

  const d             = dashboard || { today: {}, comparison: {}, live: {} };
  const recentOrders  = recentOrdersRes?.data || recentOrdersRes?.orders || [];

  const statCards = [
    {
      label:  "Today's Revenue",
      value:  `₹${(d.today?.revenue || 0).toLocaleString('en-IN')}`,
      change: d.comparison?.revenue_growth_pct || 0,
      icon:   IndianRupee,
      accent: 'var(--accent)',
    },
    {
      label:  "Today's Orders",
      value:  d.today?.orders || 0,
      change: d.comparison?.yesterday_orders
        ? Math.round(((d.today?.orders - d.comparison.yesterday_orders) / d.comparison.yesterday_orders) * 100)
        : 0,
      icon:   ShoppingBag,
      accent: '#0ea5e9',
    },
    {
      label:  'Avg Order Value',
      value:  `₹${(d.today?.avg_order_value || 0).toLocaleString('en-IN')}`,
      icon:   TrendingUp,
      accent: '#16a34a',
    },
    {
      label:  'Table Occupancy',
      value:  `${d.live?.occupancy_pct || 0}%`,
      sub:    `${d.live?.active_tables || 0}/${d.live?.total_tables || 0} tables`,
      icon:   Users,
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
              { label: 'Pending KOTs',   value: d.live?.pending_kots    || 0, color: 'var(--accent)'  },
              { label: 'Paid Orders',    value: d.today?.paid_orders    || 0, color: 'var(--success)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="text-lg font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent Orders (replaces "vs Yesterday") ── */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Recent Orders
            </p>
            <button
              onClick={() => navigate('/orders')}
              className="text-xs font-semibold"
              style={{ color: 'var(--accent)' }}
            >
              View All →
            </button>
          </div>

          {ordersLoading ? (
            <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading orders…</span>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <ShoppingBag className="w-8 h-8" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No orders yet today</p>
              <button
                onClick={() => navigate('/pos')}
                className="btn-primary btn-sm mt-1"
              >
                Take First Order
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order) => {
                const tableLabel = order.table?.table_number
                  ? `Table ${order.table.table_number}`
                  : order.order_type === 'takeaway'  ? 'Takeaway'
                  : order.order_type === 'delivery'  ? 'Delivery'
                  : order.source     === 'swiggy'    ? 'Swiggy'
                  : order.source     === 'zomato'    ? 'Zomato'
                  : 'Counter';

                const Icon = order.status === 'paid' || order.status === 'completed'
                  ? CheckCircle2
                  : order.status === 'cancelled' || order.status === 'voided'
                  ? AlertCircle
                  : Clock;

                const iconColor = order.status === 'paid' || order.status === 'completed'
                  ? 'var(--success)'
                  : order.status === 'cancelled' || order.status === 'voided'
                  ? 'var(--danger)'
                  : 'var(--warning)';

                return (
                  <div
                    key={order.id}
                    onClick={() => navigate('/orders')}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                    style={{ background: 'var(--bg-hover)' }}
                    onMouseEnter={e  => e.currentTarget.style.background = 'var(--bg-active)'}
                    onMouseLeave={e  => e.currentTarget.style.background = 'var(--bg-hover)'}
                  >
                    {/* icon */}
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: iconColor }} />

                    {/* order number + table */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          #{order.order_number || order.id?.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {tableLabel}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {order._count?.order_items ?? 0} item{(order._count?.order_items ?? 0) !== 1 ? 's' : ''}
                        {order.staff?.full_name ? ` · ${order.staff.full_name}` : ''}
                        {' · '}{timeAgo(order.created_at)}
                      </p>
                    </div>

                    {/* amount + status */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        ₹{Number(order.total_amount || 0).toLocaleString('en-IN')}
                      </p>
                      <StatusPill status={order.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg-hover)' }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: 'var(--accent)', color: '#fff', opacity: 1 - idx * 0.12 }}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{item.category}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                    {item.count} <span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>sold</span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>₹{Number(item.revenue || 0).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {(!topItems || topItems.length === 0) && (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No sales data yet</p>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card">
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Quick Actions</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'New Order',  icon: ShoppingCart,    path: '/pos',      color: 'var(--accent)', desc: 'Open POS terminal'       },
              { label: 'Tables',     icon: Users,           path: '/tables',   color: '#0ea5e9',       desc: 'View floor plan'         },
              { label: 'Menu',       icon: UtensilsCrossed, path: '/menu',     color: '#16a34a',       desc: 'Edit items & categories' },
              { label: 'Reports',    icon: BarChart3,       path: '/reports',  color: '#d97706',       desc: 'Sales & analytics'       },
            ].map(({ label, icon: Icon, path, color, desc }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="flex items-center gap-3 p-4 rounded-xl text-left transition-all group"
                style={{ background: color + '12', border: `1px solid ${color}20` }}
                onMouseEnter={e => e.currentTarget.style.background = color + '22'}
                onMouseLeave={e => e.currentTarget.style.background = color + '12'}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                  style={{ background: color + '25' }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
