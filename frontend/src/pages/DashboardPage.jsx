import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import {
  TrendingUp, ShoppingBag, IndianRupee, DollarSign, Users,
  ArrowUpRight, ArrowDownRight, ShoppingCart,
  BarChart3, UtensilsCrossed, Clock, CheckCircle2,
  AlertCircle, Loader2, Sparkles, ChevronRight,
  Package, ClipboardList, Receipt, ChefHat,
} from 'lucide-react';
import { useRegion } from '../hooks/useRegion';
import GetStartedChecklist from '../components/onboarding/GetStartedChecklist';
import PaymentBreakdown from '../components/Dashboard/PaymentBreakdown';
import PeakHoursChart from '../components/Dashboard/PeakHoursChart';
import AgingOrdersAlert from '../components/Dashboard/AgingOrdersAlert';
import CancellationRate from '../components/Dashboard/CancellationRate';

/* ── Confidence badge colours ─────────────────────────────── */
const CONFIDENCE_META = {
  high:   { label: 'High confidence',   color: '#10b981' },
  medium: { label: 'Medium confidence', color: '#f59e0b' },
  low:    { label: 'Low confidence',    color: '#94a3b8' },
};

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
  const { data: dashboard, isLoading, isError, refetch } = useQuery({
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

  /* recent orders — today, sample large enough to compute open-tab value
     (we still only render the first 6 in the Recent Orders list).
     Bump the limit so client-side open_tabs_value isn't capped by pagination. */
  const { data: recentOrdersRes, isLoading: ordersLoading } = useQuery({
    queryKey: ['recentOrders', outletId],
    queryFn:  () => api.get(
      `/orders?outlet_id=${outletId}&from=${from}&to=${to}&limit=100&sort=created_at&order=desc`
    ).then((r) => r.data),
    enabled:  !!outletId,
    refetchInterval: 20000,
  });

  /* AI demand forecast — tomorrow's prediction */
  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: ['forecast', outletId],
    queryFn:  () => api.get(`/reports/forecast?outlet_id=${outletId}`).then((r) => r.data),
    enabled:  !!outletId,
    staleTime: 5 * 60 * 1000,   // cache 5 min — forecast doesn't change often
    refetchInterval: 10 * 60 * 1000,
  });

  /* low-stock count for Inventory quick-action card */
  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['low-stock-dashboard', outletId],
    queryFn:  () => api.get('/inventory/low-stock').then(r => r.data || []).catch(() => []),
    enabled:  !!outletId,
    staleTime: 2 * 60 * 1000,
  });

  const { format, locale } = useCurrency();
  const userRegion = useRegion();
  const isAU = userRegion === 'AU';
  const CurrencyIcon = isAU ? DollarSign : IndianRupee;

  const d             = dashboard || { today: {}, comparison: {}, live: {} };
  const recentOrders  = (Array.isArray(recentOrdersRes?.data) ? recentOrdersRes.data : null)
    ?? (Array.isArray(recentOrdersRes?.orders) ? recentOrdersRes.orders : null)
    ?? (Array.isArray(recentOrdersRes) ? recentOrdersRes : []);

  // Open-tabs value: prefer backend's open_tabs_value if it exposes it; otherwise
  // compute from recentOrders client-side (only when we have a representative sample).
  const openTabsValueFromBackend = Number(d.today?.open_tabs_value ?? 0);
  const openTabsValueClientside = recentOrders
    .filter(o => !o.is_paid && o.status !== 'cancelled' && o.status !== 'voided')
    .reduce((s, o) => s + Number(o.grand_total || o.total_amount || 0), 0);
  const openTabsValue = openTabsValueFromBackend || openTabsValueClientside;

  const paidCount    = Number(d.today?.paid_orders    ?? 0);
  const runningCount = Number(d.today?.running_orders ?? 0);
  const ordersTotal  = Number(d.today?.orders         ?? 0);
  const hasOpenTabs  = runningCount > 0;

  const statCards = [
    {
      label:  "Today's Revenue",
      value:  format(d.today?.revenue || 0),
      change: d.comparison?.revenue_growth_pct || 0,
      icon:   CurrencyIcon,
      accent: 'var(--accent)',
      sub:    hasOpenTabs
        ? `${format(openTabsValue)} pending in ${runningCount} open tab${runningCount > 1 ? 's' : ''}`
        : (paidCount > 0 ? `from ${paidCount} settled order${paidCount > 1 ? 's' : ''}` : null),
    },
    {
      label:  "Today's Orders",
      value:  ordersTotal,
      change: d.comparison?.yesterday_orders
        ? Math.round(((d.today?.orders - d.comparison.yesterday_orders) / d.comparison.yesterday_orders) * 100)
        : 0,
      icon:   ShoppingBag,
      accent: 'var(--accent)',
      sub:    ordersTotal > 0 ? `${paidCount} paid · ${runningCount} open` : null,
    },
    {
      label:  'Avg Order Value',
      value:  format(d.today?.avg_order_value || 0),
      icon:   TrendingUp,
      accent: 'var(--accent)',
      sub:    paidCount > 0 ? 'across paid orders' : 'no paid orders yet',
    },
    {
      label:  'Table Occupancy',
      value:  `${d.live?.occupancy_pct || 0}%`,
      sub:    `${d.live?.active_tables || 0}/${d.live?.total_tables || 0} tables`,
      icon:   Users,
      accent: 'var(--accent)',
    },
  ];

  if (isError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 text-lg mb-4">Failed to load dashboard data</p>
        <button onClick={() => refetch()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>
      </div>
    );
  }

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
    // Centered max-width container — balanced whitespace, modern SaaS look.
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {greeting()}, {user?.full_name?.split(' ')[0]}
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

      {/* ── First-run get-started checklist (owners/managers; self-hides when done) ── */}
      {(user?.role === 'owner' || user?.role === 'manager') && <GetStartedChecklist />}

      {/* ══ Command Bar — editorial hero + secondary actions with live data ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* ─── Hero PRIMARY action — left, large, dark gradient ─── */}
        <button
          onClick={() => navigate('/pos')}
          className="group relative overflow-hidden text-left col-span-1 lg:col-span-3 rounded-2xl transition-all"
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 45%, #312e81 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            minHeight: 180,
            boxShadow: '0 12px 32px -8px rgba(15,23,42,0.35)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 18px 40px -8px rgba(15,23,42,0.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)';    e.currentTarget.style.boxShadow = '0 12px 32px -8px rgba(15,23,42,0.35)'; }}
        >
          {/* Subtle radial accent */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(circle at 100% 0%, rgba(99,102,241,0.25), transparent 50%)',
          }} />
          {/* Grid line texture */}
          <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none" style={{ opacity: 0.07 }}>
            <defs>
              <pattern id="qa-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#qa-grid)" />
          </svg>

          <div className="relative z-10 p-7 h-full flex flex-col justify-between">
            {/* Top — eyebrow + status pill */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(199,210,254,0.7)' }}>
                Command bar
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{
                  background: '#10b981',
                  boxShadow: '0 0 0 0 rgba(16,185,129,0.5)',
                  animation: 'pulse 2s ease-out infinite',
                }} />
                <span className="text-[10px] font-semibold tracking-wide" style={{ color: '#6ee7b7' }}>LIVE</span>
              </div>
            </div>

            {/* Center — headline + arrow */}
            <div>
              <h2 className="font-black leading-none tracking-tight mb-2"
                style={{
                  color: '#fff',
                  fontSize: 'clamp(28px, 3vw, 36px)',
                  letterSpacing: '-0.035em',
                }}>
                Take a new order
              </h2>
              <p className="text-sm" style={{ color: 'rgba(199,210,254,0.65)', lineHeight: 1.55, maxWidth: 380 }}>
                Open the POS terminal — split bill, modifiers, split tender, KOT routing all in one place.
              </p>
            </div>

            {/* Bottom — live context bar */}
            <div className="flex items-end justify-between gap-4 mt-7">
              <div className="grid grid-cols-3 gap-5 flex-1 min-w-0">
                {[
                  { label: 'Avg ticket today',  value: format(d.today?.avg_order_value || 0) },
                  { label: 'Pending orders',     value: `${d.today?.running_orders || 0}` },
                  { label: 'Tables occupied',    value: `${d.live?.active_tables || 0}/${d.live?.total_tables || 0}` },
                ].map(m => (
                  <div key={m.label} className="min-w-0">
                    <div className="text-[9.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(199,210,254,0.4)' }}>
                      {m.label}
                    </div>
                    <div className="text-base font-bold truncate" style={{ color: '#fff', letterSpacing: '-0.015em', fontFeatureSettings: '"tnum"' }}>
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
              {/* Arrow CTA */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 group-hover:translate-x-1"
                style={{
                  background: 'linear-gradient(135deg, #fff, #e0e7ff)',
                  boxShadow: '0 6px 20px rgba(255,255,255,0.25)',
                }}
              >
                <ArrowUpRight className="w-5 h-5" style={{ color: '#1e1b4b' }} strokeWidth={2.5} />
              </div>
            </div>
          </div>
        </button>

        {/* ─── Secondary actions — right, 2x2 grid, list-style cards ─── */}
        <div className="col-span-1 lg:col-span-2 grid grid-cols-2 gap-3">
          {[
            {
              label: 'Tables',
              path:  '/tables',
              icon:  Users,
              metric: `${d.live?.active_tables || 0}/${d.live?.total_tables || 0}`,
              metricLabel: 'occupied',
              accent: '#10b981',
            },
            {
              label: 'Kitchen',
              path:  '/kitchen',
              icon:  ChefHat,
              metric: `${d.live?.pending_kots || 0}`,
              metricLabel: 'in queue',
              accent: '#ef4444',
            },
            {
              label: 'Inventory',
              path:  '/inventory',
              icon:  Package,
              metric: `${lowStockItems?.length || 0}`,
              metricLabel: 'low stock',
              accent: '#f59e0b',
            },
            {
              label: 'Reports',
              path:  '/reports',
              icon:  BarChart3,
              metric: format(d.today?.revenue || 0),
              metricLabel: 'today',
              accent: '#8b5cf6',
            },
          ].map(({ label, path, icon: Icon, metric, metricLabel, accent }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="group relative text-left rounded-xl p-4 transition-all overflow-hidden"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                minHeight: 84,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = accent + '60';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = `0 8px 20px -6px ${accent}22`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* left edge accent bar */}
              <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                style={{ background: accent, opacity: 0.85 }} />

              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accent }} strokeWidth={2.2} />
                  <span className="text-xs font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {label}
                  </span>
                </div>
                <ChevronRight
                  className="w-3.5 h-3.5 flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                  style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                />
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black leading-none tracking-tight" style={{
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.025em',
                  fontFeatureSettings: '"tnum"',
                }}>
                  {metric}
                </span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {metricLabel}
                </span>
              </div>
            </button>
          ))}
        </div>
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

      {/* ── Operational health row — Aging Orders + Cancellation Rate ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AgingOrdersAlert
            orders={recentOrders}
            onNavigateToRunning={() => navigate('/running-orders')}
          />
        </div>
        <div className="lg:col-span-1">
          <CancellationRate orders={recentOrders} outletId={outletId} />
        </div>
      </div>

      {/* ── Middle row — AI Forecast (replaces Health Score) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* AI Forecast — primary widget for daily ops */}
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Forecast</p>
            </div>
            {forecastData && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{
                  background: (CONFIDENCE_META[forecastData.confidence] || CONFIDENCE_META.low).color + '18',
                  color:      (CONFIDENCE_META[forecastData.confidence] || CONFIDENCE_META.low).color,
                }}
              >
                {forecastData.day_of_week}
              </span>
            )}
          </div>

          {forecastLoading ? (
            <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Forecasting…</span>
            </div>
          ) : !forecastData ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>Forecast unavailable</p>
          ) : (
            <div className="space-y-3">
              <div className="px-3 py-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Predicted Revenue</p>
                <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {format(forecastData.predicted_revenue)}
                </p>
                {forecastData.revenue_range && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Range: {format(forecastData.revenue_range.low)} – {format(forecastData.revenue_range.high)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-2.5 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>Orders</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{forecastData.predicted_orders}</p>
                </div>
                <div className="px-3 py-2.5 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>Avg Order</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{format(forecastData.avg_order_value)}</p>
                </div>
              </div>
              {forecastData.top_predicted_items?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Expected top sellers</p>
                  <div className="space-y-1.5">
                    {forecastData.top_predicted_items.slice(0, 3).map((item, idx) => (
                      <div key={item.menu_item_id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: 'var(--accent)' + '22', color: 'var(--accent)' }}>{idx + 1}</span>
                        <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>~{item.predicted_qty}/day</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: (CONFIDENCE_META[forecastData.confidence] || CONFIDENCE_META.low).color }} />
                {(CONFIDENCE_META[forecastData.confidence] || CONFIDENCE_META.low).label}
                {' · '}{forecastData.data_points} day{forecastData.data_points !== 1 ? 's' : ''} of data
              </p>
            </div>
          )}
        </div>

        {/* Live status */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Live Status</p>
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--success)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: 'var(--success)' }} />
              Live
            </span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Running Orders', value: d.today?.running_orders || 0, color: 'var(--text-primary)' },
              { label: 'Pending KOTs',   value: d.live?.pending_kots    || 0, color: 'var(--text-primary)' },
              { label: 'Paid Orders',    value: d.today?.paid_orders    || 0, color: 'var(--text-primary)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="text-lg font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top selling items — now beside Live Status */}
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
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{format(Number(item.revenue || 0))}</p>
                </div>
              </div>
            ))}
            {(!topItems || topItems.length === 0) && (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No sales data yet</p>
            )}
          </div>
        </div>

      </div>

      {/* ── Financial insights row — Payment Breakdown + Peak Hours ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <PaymentBreakdown outletId={outletId} />
        </div>
        <div className="lg:col-span-2">
          <PeakHoursChart outletId={outletId} />
        </div>
      </div>

      {/* ── Recent Orders ── */}
      <div className="rounded-xl border shadow-sm overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>

        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent)', opacity: 0.9 }}>
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Recent Orders</p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Today's activity</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/orders')}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
            style={{
              color: 'var(--accent)',
              borderColor: 'var(--accent)',
              background: 'transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent)'; }}
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Column headers */}
        {!ordersLoading && recentOrders.length > 0 && (
          <div className="grid px-5 py-2.5"
            style={{
              gridTemplateColumns: '2fr 1.3fr 0.8fr 0.8fr 1.1fr',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-primary)',
            }}>
            {['Order', 'Location', 'Items', 'Time', 'Amount'].map(col => (
              <span key={col}
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--text-secondary)' }}>
                {col}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        {ordersLoading ? (
          <div className="flex items-center justify-center py-14 gap-2.5"
            style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading orders…</span>
          </div>

        ) : recentOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center border"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
              <ShoppingBag className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No orders yet today</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Take the first order from POS</p>
            </div>
            <button onClick={() => navigate('/pos')} className="btn-primary btn-sm mt-1">
              Open POS Terminal
            </button>
          </div>

        ) : (
          <div>
            {recentOrders.slice(0, 8).map((order, idx) => {
              const isLast     = idx === Math.min(recentOrders.length, 8) - 1;
              const isPaid     = order.status === 'paid' || order.status === 'completed';
              const isCancelled = order.status === 'cancelled' || order.status === 'voided';
              const StatusIcon = isPaid ? CheckCircle2 : isCancelled ? AlertCircle : Clock;

              // Icon bubble — solid Tailwind colours that work in both light & dark
              const iconBg   = isPaid ? 'bg-emerald-100' : isCancelled ? 'bg-red-100'   : 'bg-amber-100';
              const iconClr  = isPaid ? 'text-emerald-600' : isCancelled ? 'text-red-600' : 'text-amber-600';

              // Status pill
              const pillCls  = isPaid ? 'badge-success' : isCancelled ? 'badge-danger' : 'badge-warning';
              const pillText = isPaid ? 'Paid' : isCancelled ? (order.status === 'voided' ? 'Voided' : 'Cancelled') : 'Open';

              // Location / order-type badge
              const isDineIn   = !!order.table?.table_number;
              const isTakeaway = order.order_type === 'takeaway';
              const isDelivery = order.order_type === 'delivery';
              const typeLabel  =
                isDineIn    ? `Table ${order.table.table_number}` :
                isTakeaway  ? 'Takeaway' :
                isDelivery  ? 'Delivery' :
                order.source === 'swiggy' ? 'Swiggy' :
                order.source === 'zomato' ? 'Zomato' : 'Counter';
              const typeCls    =
                isDineIn    ? 'badge-info'    :
                isTakeaway  ? 'badge-warning' :
                isDelivery  ? 'badge-info'    : 'badge-neutral';

              const itemCount = order._count?.order_items ?? order.order_items?.length ?? 0;

              return (
                <div
                  key={order.id}
                  onClick={() => navigate('/orders')}
                  className="grid items-center px-5 py-3.5 cursor-pointer"
                  style={{
                    gridTemplateColumns: '2fr 1.3fr 0.8fr 0.8fr 1.1fr',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Order # + customer */}
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                      <StatusIcon className={`w-3.5 h-3.5 ${iconClr}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-none truncate"
                        style={{ color: 'var(--text-primary)' }}>
                        #{order.order_number || order.id?.slice(-6).toUpperCase()}
                      </p>
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {order.customer?.full_name || (order.staff?.full_name ? `via ${order.staff.full_name}` : 'Walk-in')}
                      </p>
                    </div>
                  </div>

                  {/* Location badge */}
                  <div className="pr-3">
                    <span className={`badge ${typeCls}`}>{typeLabel}</span>
                  </div>

                  {/* Items */}
                  <div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {itemCount}
                    </span>
                    <span className="text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>
                      {itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {timeAgo(order.created_at)}
                    </span>
                  </div>

                  {/* Amount + status */}
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {format(order.grand_total || order.total_amount || 0)}
                    </span>
                    <span className={`badge ${pillCls}`}>{pillText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {!ordersLoading && recentOrders.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Showing {Math.min(recentOrders.length, 8)} of {recentOrders.length} orders today
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              Total today: {format(recentOrders.reduce((s, o) => s + Number(o.grand_total || o.total_amount || 0), 0))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
