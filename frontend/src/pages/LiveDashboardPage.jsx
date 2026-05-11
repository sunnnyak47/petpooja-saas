/**
 * LiveDashboardPage — Real-time live operations for restaurant owners
 * Route: /live
 */
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import {
  Activity, ShoppingCart, TrendingUp, Users, Clock,
  Zap, RefreshCw, CheckCircle2, AlertCircle, ChefHat,
  DollarSign, BarChart2, Utensils, Timer
} from 'lucide-react';

function LiveCounter({ value, label, color, icon: Icon, prefix = '' }) {
  const { locale } = useCurrency();
  const target = value || 0;
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    // Snap immediately if the value hasn't changed or is the initial render
    if (display === target) return;
    let frame = 0;
    const totalFrames = 15;
    const start = display;
    const id = setInterval(() => {
      frame++;
      if (frame >= totalFrames) {
        clearInterval(id);
        setDisplay(target);
      } else {
        setDisplay(Math.round((start + (target - start) * (frame / totalFrames)) * 100) / 100);
      }
    }, 30);
    return () => clearInterval(id);
  }, [target]);

  return (
    <div className="rounded-xl p-5 flex items-start gap-4"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {prefix}{typeof display === 'number' ? display.toLocaleString(locale, { maximumFractionDigits: 0 }) : display}
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      </div>
    </div>
  );
}

function OrderStatusBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{count}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function LiveDashboardPage() {
  const { user } = useSelector(s => s.auth);
  const { symbol } = useCurrency();
  const [pulse, setPulse] = useState(false);

  const { data: stats, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['live-stats-owner'],
    queryFn: () => api.get('/dashboard/live').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  // Fallback to general dashboard
  const { data: dashData } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/dashboard').then(r => r.data).catch(() => null),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 800);
    return () => clearTimeout(t);
  }, [dataUpdatedAt]);

  const d = stats || dashData;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '--';

  // Order status breakdown
  const orderBreakdown = d?.orders_by_status || d?.order_breakdown || {};
  const totalOrders = Object.values(orderBreakdown).reduce((s, v) => s + (v || 0), 0);

  const STATUS_COLORS = {
    PENDING:    '#f59e0b',
    CONFIRMED:  '#60a5fa',
    PREPARING:  '#a78bfa',
    READY:      '#22c55e',
    DELIVERED:  '#4ade80',
    CANCELLED:  '#f87171',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Live Dashboard</h1>
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full bg-green-400 ${pulse ? '' : 'animate-pulse'}`} />
              <span className="text-xs font-medium" style={{ color: '#4ade80' }}>LIVE</span>
            </div>
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Real-time operations overview · Last updated: {lastUpdated}
          </p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Live Status Banner */}
      <div className="rounded-xl p-4 flex items-center gap-3"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
        <Activity className="w-5 h-5" style={{ color: '#4ade80' }} />
        <p className="text-sm font-medium" style={{ color: '#4ade80' }}>
          Restaurant is Open · Auto-refreshing every 30 seconds
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <LiveCounter label="Orders Today"       value={d?.orders_today || d?.today_orders || 0}     color="#6366f1" icon={ShoppingCart} />
        <LiveCounter label={`Revenue Today (${symbol})`}  value={d?.revenue_today || d?.today_revenue || 0}   color="#22c55e" icon={TrendingUp} prefix={symbol} />
        <LiveCounter label="Active Tables"       value={d?.active_tables || d?.tables_occupied || 0} color="#f59e0b" icon={Utensils} />
        <LiveCounter label={`Avg Order Value (${symbol})`} value={d?.avg_order_value || 0}                     color="#a78bfa" icon={DollarSign} prefix={symbol} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Order Status Breakdown */}
        <div className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BarChart2 className="w-4 h-4 text-indigo-400" /> Order Pipeline
          </h3>
          {totalOrders === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <ShoppingCart className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No orders yet today</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(STATUS_COLORS).map(([status, color]) => {
                const count = orderBreakdown[status] || 0;
                if (count === 0 && !['PENDING', 'PREPARING', 'READY'].includes(status)) return null;
                return <OrderStatusBar key={status} label={status} count={count} total={totalOrders} color={color} />;
              })}
              <div className="pt-2 flex items-center justify-between text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <span>Total orders today</span>
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{totalOrders}</span>
              </div>
            </div>
          )}
        </div>

        {/* Kitchen Status */}
        <div className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <ChefHat className="w-4 h-4 text-orange-400" /> Kitchen Status
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'In Queue',    value: d?.kitchen?.in_queue  || 0, color: '#f59e0b' },
              { label: 'Preparing',   value: d?.kitchen?.preparing || 0, color: '#a78bfa' },
              { label: 'Ready',       value: d?.kitchen?.ready     || 0, color: '#22c55e' },
              { label: 'Completed',   value: d?.kitchen?.completed || 0, color: '#60a5fa' },
            ].map(k => (
              <div key={k.label} className="p-3 rounded-xl text-center"
                style={{ background: 'var(--bg-primary)', border: `1px solid ${k.color}30` }}>
                <p className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{k.label}</p>
              </div>
            ))}
          </div>

          <div>
            <h4 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Performance Indicators</h4>
            <div className="space-y-2">
              {[
                { label: 'Avg Prep Time',   value: `${d?.avg_prep_time || 18} min`,  icon: Timer,        color: '#a78bfa' },
                { label: 'Online Orders',   value: d?.online_orders || 0,             icon: Activity,     color: '#60a5fa' },
                { label: 'Staff On Duty',   value: d?.staff_count || d?.active_staff || 0, icon: Users, color: '#22c55e' },
              ].map(p => (
                <div key={p.label} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <p.icon className="w-3.5 h-3.5" style={{ color: p.color }} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.label}</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
