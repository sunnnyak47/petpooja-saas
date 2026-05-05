/**
 * RevenueAnalyticsPage — MRR trends, churn rate, plan & region breakdown
 * Route: /revenue-analytics
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  TrendingUp, TrendingDown, IndianRupee, Users, BarChart2,
  Globe, Activity, RefreshCw, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

const PLAN_COLORS = {
  TRIAL: '#94a3b8',
  STARTER: '#60a5fa',
  PRO: '#a78bfa',
  ENTERPRISE: '#4ade80',
};

const REGION_NAMES = { IN: '🇮🇳 India', AU: '🇦🇺 Australia', US: '🇺🇸 USA' };

function MetricCard({ icon: Icon, label, value, change, changeLabel, color = '#6366f1', positive }) {
  const isUp = parseFloat(change) > 0;
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full`}
            style={{
              background: (positive ? isUp : !isUp) ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: (positive ? isUp : !isUp) ? '#4ade80' : '#f87171'
            }}>
            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold mt-3" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      {changeLabel && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{changeLabel}</p>}
    </div>
  );
}

// Mini bar chart rendered with divs
function MrrChart({ data }) {
  if (!data?.length) return null;
  const maxMrr = Math.max(...data.map(d => d.mrr), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => {
        const h = Math.max((d.mrr / maxMrr) * 100, 2);
        const isLast = i === data.length - 1;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
              {d.label}: ₹{(d.mrr / 1000).toFixed(0)}K
            </div>
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: `${h}%`,
                background: isLast ? 'linear-gradient(to top, #6366f1, #818cf8)' : 'rgba(99,102,241,0.3)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function MrrLabels({ data }) {
  if (!data?.length) return null;
  // Show every 3rd label to avoid crowding
  return (
    <div className="flex gap-1.5 mt-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
          {i % 3 === 0 ? d.label : ''}
        </div>
      ))}
    </div>
  );
}

export default function RevenueAnalyticsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['revenue-analytics'],
    queryFn: () => api.get('/superadmin/revenue-analytics').then(r => r.data.data),
    staleTime: 5 * 60_000,
  });

  const fmt = (n) => {
    if (!n) return '₹0';
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n}`;
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
    </div>
  );

  const arr = (data?.current_mrr || 0) * 12;
  const currentMonth = data?.mrr_trend?.[data.mrr_trend.length - 1];
  const newThisMonth = currentMonth?.new_chains || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Revenue Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>SaaS platform revenue, growth, and churn</p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={IndianRupee} label="Monthly Recurring Revenue" value={fmt(data?.current_mrr)} change={data?.mrr_growth} changeLabel="vs last month" color="#6366f1" positive />
        <MetricCard icon={TrendingUp} label="Annual Recurring Revenue" value={fmt(arr)} color="#22c55e" />
        <MetricCard icon={Users} label="Total Chains" value={data?.total_chains || 0} change={newThisMonth} changeLabel={`${newThisMonth} new this month`} color="#f59e0b" positive />
        <MetricCard icon={Activity} label="Churn Rate" value={`${data?.churn_rate || 0}%`} change={data?.churn_rate} changeLabel={`${data?.churned_chains || 0} inactive chains`} color="#ef4444" positive={false} />
      </div>

      {/* MRR Trend Chart */}
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>MRR Trend — Last 12 Months</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Monthly Recurring Revenue based on active chains & plans</p>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ background: 'linear-gradient(to top, #6366f1, #818cf8)' }} /> Current month
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ background: 'rgba(99,102,241,0.3)' }} /> Past months
            </div>
          </div>
        </div>
        <MrrChart data={data?.mrr_trend} />
        <MrrLabels data={data?.mrr_trend} />

        {/* Chain count overlay */}
        <div className="mt-4 pt-4 grid grid-cols-4 gap-4" style={{ borderTop: '1px solid var(--border)' }}>
          {data?.mrr_trend?.slice(-4).map((m, i) => (
            <div key={i} className="text-center">
              <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(m.mrr)}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.label} · {m.chains} chains</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <h2 className="font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Plan Distribution</h2>
          <div className="space-y-3">
            {Object.entries(data?.by_plan || {}).sort((a, b) => {
              const order = { ENTERPRISE: 0, PRO: 1, STARTER: 2, TRIAL: 3 };
              return (order[a[0]] ?? 9) - (order[b[0]] ?? 9);
            }).map(([plan, count]) => {
              const total = data?.total_chains || 1;
              const pct = Math.round((count / total) * 100);
              const PLAN_PRICE = { TRIAL: 0, STARTER: 2999, PRO: 7999, ENTERPRISE: 19999 };
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: PLAN_COLORS[plan] || '#94a3b8' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plan}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{count} chains</span>
                      <span className="text-xs font-semibold" style={{ color: PLAN_COLORS[plan] }}>{fmt(PLAN_PRICE[plan] * count)}/mo</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--border)' }}>
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: PLAN_COLORS[plan] || '#94a3b8' }} />
                  </div>
                  <p className="text-right text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{pct}%</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Regional Breakdown */}
        <div className="rounded-xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <h2 className="font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Regional Breakdown</h2>
          {Object.keys(data?.by_region || {}).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <Globe className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No regional data</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(data?.by_region || {}).map(([region, info]) => (
                <div key={region} className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {REGION_NAMES[region] || region}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {info.chains} chains
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold" style={{ color: '#4ade80' }}>{fmt(info.mrr)}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>MRR</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
