import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Building2, CheckCircle2, AlertCircle, Wallet, ShoppingBag, CreditCard,
  TrendingUp, TrendingDown, Server, Database, Globe, Activity,
  Rocket, ShieldClose, RefreshCw,
} from 'lucide-react';

/**
 * PlatformAnalyticsPage — the super-admin landing ("Analytics" tab, route `/`).
 *
 * Previously the `/` index dropped super-admins straight onto SuperAdminPage
 * (the Restaurant-Chains list), so "Analytics" and "Restaurant Chains" showed
 * the identical screen (SA-001). This is the dedicated platform overview:
 * KPIs + platform-wide live sales + system health + a live activity stream,
 * bound to the existing /superadmin/dashboard and /superadmin/live-stats.
 */

const ACTIVITY = {
  RESTAURANT_ONBOARDED:    { label: 'New onboarding',      color: 'var(--success)', Icon: Rocket },
  RESTAURANT_ONBOARDED_V2: { label: 'New enterprise',      color: 'var(--success)', Icon: Rocket },
  SUBSCRIPTION_PAYMENT:    { label: 'Subscription payment', color: 'var(--accent)',  Icon: CreditCard },
  LICENSE_EXPIRED:         { label: 'License expired',     color: 'var(--warning)', Icon: AlertCircle },
  LICENSE_EXTENDED:        { label: 'License extended',    color: 'var(--success)', Icon: CheckCircle2 },
  RESTAURANT_SUSPENDED:    { label: 'Account suspended',   color: 'var(--danger)',  Icon: ShieldClose },
  RESTAURANT_REACTIVATED:  { label: 'Account reactivated', color: 'var(--success)', Icon: Rocket },
};

export default function PlatformAnalyticsPage() {
  const { data: dash, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['sa-dashboard'],
    queryFn: () => api.get('/superadmin/dashboard').then((r) => r.data),
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  });
  const { data: live } = useQuery({
    queryKey: ['sa-live-stats'],
    queryFn: () => api.get('/superadmin/live-stats').then((r) => r.data),
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });

  const raw = dash?.data || dash || {};
  const stats = raw.stats || {};
  const growth = raw.growth || {};
  const health = raw.platform_health || {};
  const activity = raw.activity_stream || [];
  const sym = live?.currency_symbol || '₹';

  const total = Number(stats.total_restaurants || 0);
  const active = Number(stats.active_licenses || 0);
  const activePct = total ? ((active / total) * 100).toFixed(0) : '0';
  const thisM = Number(growth.this_month_revenue || 0);
  const lastM = Number(growth.last_month_revenue || 0);
  const growthPct = lastM > 0 ? ((thisM - lastM) / lastM) * 100 : null;
  const money = (n) => `${sym}${Number(n || 0).toLocaleString('en-IN')}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading platform analytics…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Platform Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Live overview across every restaurant chain</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary btn-sm">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi Icon={Building2}   accent="var(--accent)"  label="Total Restaurants" value={total}                     sub={`+${stats.new_this_week || 0} this week`} />
        <Kpi Icon={CheckCircle2} accent="var(--success)" label="Active Licenses"    value={active}                    sub={`${activePct}% active`} />
        <Kpi Icon={AlertCircle} accent="var(--warning)" label="Expiring Soon"      value={stats.expiring_soon || 0}  sub="next 30 days" />
        <Kpi Icon={Wallet}      accent="var(--accent)"  label="Current MRR"        value={money(stats.current_mrr)}  sub="monthly recurring" />
        <Kpi Icon={ShoppingBag} accent="var(--accent)"  label="Orders Today"       value={live?.today?.orders ?? '—'} sub="platform-wide" />
        <Kpi Icon={CreditCard}  accent="var(--success)" label="Revenue Today"      value={money(live?.today?.revenue)} sub="platform-wide" />
      </div>

      {/* Growth + health + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* MRR growth */}
        <div className="card flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Revenue Growth</p>
          <div className="mt-3">
            <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{money(thisM)}</div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>this month · vs {money(lastM)} last</p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            {growthPct === null ? (
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>No prior month to compare</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-bold"
                style={{ color: growthPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {growthPct >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {Math.abs(growthPct).toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Platform health */}
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>Platform Health</p>
          <div className="space-y-2.5">
            <HealthRow Icon={Server}   label="API"       status={health.api || 'online'} />
            <HealthRow Icon={Database} label="Database"  status={health.database || 'connected'} />
            <HealthRow Icon={Globe}    label="Socket.io" status={health.socket || 'active'} />
            <HealthRow Icon={Activity} label="Redis"     status={health.redis || 'disconnected'} />
          </div>
          {health.last_checked && (
            <p className="text-[10px] mt-4 pt-3 border-t" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
              Last checked {new Date(health.last_checked).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Live activity stream */}
        <div className="card lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>Live Activity</p>
          <div className="space-y-1 max-h-[300px] overflow-y-auto -mr-2 pr-2">
            {activity.length === 0 ? (
              <div className="py-12 text-center text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>No recent activity</div>
            ) : activity.map((item) => {
              const cfg = ACTIVITY[item.type] || { label: item.type, color: 'var(--text-secondary)', Icon: Activity };
              const { Icon } = cfg;
              return (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <div className="p-1.5 rounded-lg mt-0.5 shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${cfg.color} 12%, transparent)`, color: cfg.color }}>
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: cfg.color }}>{cfg.label}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                      {item.restaurant}{item.details?.city ? `, ${item.details.city}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>{item.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ Icon, label, value, sub, accent }) {
  return (
    <div className="card">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
        <Icon size={18} />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <div className="text-2xl font-bold mt-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {sub && <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
    </div>
  );
}

function HealthRow({ Icon, label, status }) {
  const ok = /online|connected|active|healthy|up/i.test(String(status));
  const color = ok ? 'var(--success)' : 'var(--danger)';
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
          <Icon size={14} />
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        {status}
      </span>
    </div>
  );
}
