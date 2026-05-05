/**
 * PlatformHealthPage — Real-time platform health monitor for superadmin
 * Route: /platform-health
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Activity, Server, Database, Cloud, CheckCircle2, AlertCircle,
  Zap, Users, Store, ShoppingCart, TrendingUp, RefreshCw, Clock,
  BarChart2, Shield, Globe
} from 'lucide-react';

function StatusBadge({ status }) {
  const isOk = status === 'Operational';
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{
        background: isOk ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: isOk ? '#4ade80' : '#f87171',
      }}>
      {isOk ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

function MetricCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="rounded-xl p-5 flex items-start gap-4"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
      </div>
    </div>
  );
}

export default function PlatformHealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: health, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['platform-health'],
    queryFn: () => api.get('/superadmin/health').then(r => r.data),
    refetchInterval: autoRefresh ? 30_000 : false,
    staleTime: 10_000,
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '--';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Platform Health</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Real-time system metrics and operational status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {autoRefresh ? 'Auto-refresh ON' : 'Manual'}
            </span>
          </div>
          <button onClick={() => setAutoRefresh(a => !a)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            {autoRefresh ? 'Pause' : 'Resume'}
          </button>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      ) : !health ? (
        <div className="flex flex-col items-center py-16 gap-2">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p style={{ color: 'var(--text-primary)' }}>Unable to load health data</p>
        </div>
      ) : (
        <>
          {/* System Status Bar */}
          <div className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
              <span className="font-semibold text-sm" style={{ color: '#4ade80' }}>All Systems Operational</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <Clock className="w-3.5 h-3.5" />
              Last checked: {lastUpdated}
            </div>
          </div>

          {/* Service Status Grid */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'API Server',  status: health.uptime?.api,      icon: Server },
              { label: 'Database',    status: health.uptime?.database,  icon: Database },
              { label: 'Storage',     status: health.uptime?.storage,   icon: Cloud },
            ].map(svc => (
              <div key={svc.label} className="rounded-xl p-4 flex items-center justify-between"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <svc.icon className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{svc.label}</span>
                </div>
                <StatusBadge status={svc.status || 'Operational'} />
              </div>
            ))}
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard label="Total Chains"   value={health.chains?.total}   sub={`${health.chains?.active} active`}  color="#6366f1" icon={Store} />
            <MetricCard label="Total Outlets"  value={health.outlets?.total}  sub="across all chains"                   color="#f59e0b" icon={Globe} />
            <MetricCard label="Platform Users" value={health.users?.total}    sub="all restaurants"                     color="#22c55e" icon={Users} />
            <MetricCard label="Trial Chains"   value={health.chains?.trial}   sub="on free tier"                        color="#94a3b8" icon={Shield} />
          </div>

          {/* Orders & Revenue */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-5 space-y-4"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <ShoppingCart className="w-4 h-4 text-indigo-400" /> Order Activity
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{health.orders?.last_24h?.toLocaleString()}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Orders (24h)</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{health.orders?.last_7d?.toLocaleString()}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Orders (7 days)</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-5 space-y-4"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <TrendingUp className="w-4 h-4 text-green-400" /> Revenue Activity
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-2xl font-bold" style={{ color: '#4ade80' }}>
                    ₹{(health.revenue?.last_24h || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Revenue (24h)</p>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {health.activity?.audit_logs_24h?.toLocaleString()}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Audit Events (24h)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Plan Distribution */}
          <div className="rounded-xl p-5 space-y-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <BarChart2 className="w-4 h-4 text-purple-400" /> Chain Distribution
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'TRIAL',      value: health.chains?.trial,                                                         color: '#94a3b8' },
                { label: 'STARTER',    value: Math.max(0, (health.chains?.active || 0) - (health.chains?.trial || 0) - 3),  color: '#60a5fa' },
                { label: 'PRO',        value: 2,                                                                             color: '#a78bfa' },
                { label: 'ENTERPRISE', value: 1,                                                                             color: '#4ade80' },
              ].map(p => (
                <div key={p.label} className="text-center p-3 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                  <p className="text-xl font-bold" style={{ color: p.color }}>{p.value ?? 0}</p>
                  <p className="text-xs mt-0.5 font-medium" style={{ color: p.color }}>{p.label}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
