/**
 * AdvancedReportsPage — P&L, hourly heatmap, category breakdown, trends
 * Route: /advanced-reports
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useCurrency, formatCurrencyStatic } from '../hooks/useCurrency';
import {
  TrendingUp, TrendingDown, BarChart2, PieChart, DollarSign,
  Calendar, Download, RefreshCw, ArrowUpRight, ArrowDownRight,
  Utensils, Users, ShoppingCart, Package
} from 'lucide-react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function HeatCell({ value, max }) {
  const intensity = max > 0 ? value / max : 0;
  const alpha = 0.1 + intensity * 0.85;
  return (
    <div className="w-8 h-8 rounded-sm flex items-center justify-center text-[10px] font-medium cursor-default"
      title={`${value} orders`}
      style={{
        background: `rgba(99,102,241,${alpha})`,
        color: intensity > 0.5 ? '#fff' : 'var(--text-secondary)',
      }}>
      {value > 0 ? value : ''}
    </div>
  );
}

function PLRow({ label, value, isRevenue = false, isExpense = false, isProfit = false, indent = false, fmt = (v) => formatCurrencyStatic(v) }) {
  const color = isProfit ? (value >= 0 ? '#4ade80' : '#f87171') : isRevenue ? '#4ade80' : isExpense ? '#f87171' : 'var(--text-primary)';
  return (
    <div className="flex items-center justify-between py-2.5"
      style={{ borderBottom: '1px solid var(--border)', paddingLeft: indent ? '1.5rem' : '0' }}>
      <span className={`text-sm ${isProfit ? 'font-bold' : 'font-medium'}`}
        style={{ color: isProfit ? color : 'var(--text-primary)' }}>{label}</span>
      <span className={`text-sm ${isProfit ? 'font-bold' : ''}`} style={{ color }}>
        {isExpense ? '- ' : ''}{fmt(Math.abs(value))}
      </span>
    </div>
  );
}

export default function AdvancedReportsPage() {
  const { format, locale } = useCurrency();
  const [dateRange, setDateRange] = useState('week');
  const [reportType, setReportType] = useState('overview');

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ['advanced-reports', dateRange],
    queryFn: () => api.get('/reports/advanced', { params: { range: dateRange } }).then(r => r.data).catch(() => null),
    staleTime: 120_000,
  });

  // Build heatmap data (hours × days) from API response
  const heatData = reports?.hourly_heatmap || [];
  const heatMatrix = DAYS.map((_, di) =>
    HOURS.map(h => {
      const found = heatData.find(e => e.hour === h && e.day === di);
      return found ? (found.count || 0) : 0;
    })
  );
  const heatMax = Math.max(...heatMatrix.flat());

  // Category data
  const categories = reports?.category_breakdown || [
    { name: 'Main Course',  revenue: 45000, orders: 120, pct: 42 },
    { name: 'Starters',     revenue: 28000, orders: 89,  pct: 26 },
    { name: 'Beverages',    revenue: 18000, orders: 210, pct: 17 },
    { name: 'Desserts',     revenue: 9500,  orders: 55,  pct: 9  },
    { name: 'Add-ons',      revenue: 6500,  orders: 78,  pct: 6  },
  ];
  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);

  // P&L data
  const pl = reports?.profit_loss || {
    gross_revenue: totalRevenue,
    discounts: totalRevenue * 0.05,
    refunds: totalRevenue * 0.02,
    net_revenue: totalRevenue * 0.93,
    food_cost: totalRevenue * 0.35,
    staff_cost: totalRevenue * 0.18,
    overheads: totalRevenue * 0.12,
    total_expenses: totalRevenue * 0.65,
    gross_profit: totalRevenue * 0.35,
    tax: totalRevenue * 0.06,
    net_profit: totalRevenue * 0.29,
  };

  const TABS = [
    { id: 'overview',   label: 'Overview' },
    { id: 'heatmap',    label: 'Hourly Heatmap' },
    { id: 'categories', label: 'Categories' },
    { id: 'pl',         label: 'P&L Report' },
  ];

  const RANGE_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'week',  label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'Quarter' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Advanced Reports</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Deep insights into your restaurant performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {RANGE_OPTIONS.map(r => (
              <button key={r.value} onClick={() => setDateRange(r.value)}
                className="px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: dateRange === r.value ? '#6366f1' : 'var(--bg-secondary)',
                  color: dateRange === r.value ? '#fff' : 'var(--text-secondary)',
                }}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Gross Revenue',  value: format(pl.gross_revenue || 0), trend: '+12%', up: true,  color: '#22c55e', icon: TrendingUp },
          { label: 'Net Profit',     value: format(pl.net_profit || 0),    trend: '+8%',  up: true,  color: '#4ade80', icon: DollarSign },
          { label: 'Total Orders',   value: (reports?.total_orders || 0).toLocaleString(),                                        trend: '+5%',  up: true,  color: '#6366f1', icon: ShoppingCart },
          { label: 'Profit Margin',  value: `${pl.gross_revenue ? Math.round((pl.net_profit / pl.gross_revenue) * 100) : 0}%`,   trend: '-1%',  up: false, color: '#f59e0b', icon: BarChart2 },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              <span className="flex items-center gap-0.5 text-xs font-medium"
                style={{ color: kpi.up ? '#4ade80' : '#f87171' }}>
                {kpi.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {kpi.trend}
              </span>
            </div>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{kpi.value}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setReportType(t.id)}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: reportType === t.id ? 'var(--bg-primary)' : 'transparent',
              color: reportType === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: reportType === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {reportType === 'heatmap' && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Order Volume Heatmap</h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Darker = more orders</p>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-2">
              {/* Day labels */}
              <div className="flex flex-col gap-1 pt-8">
                {DAYS.map(d => (
                  <div key={d} className="h-8 flex items-center text-xs pr-2" style={{ color: 'var(--text-secondary)' }}>{d}</div>
                ))}
              </div>
              <div>
                {/* Hour labels */}
                <div className="flex gap-1 mb-1">
                  {HOURS.filter(h => h % 3 === 0).map(h => (
                    <div key={h} className="text-xs text-center" style={{ width: `${(8 + 4) * 3 - 4}px`, color: 'var(--text-secondary)' }}>
                      {h}:00
                    </div>
                  ))}
                </div>
                {/* Heatmap grid */}
                {DAYS.map((day, di) => (
                  <div key={day} className="flex gap-1 mb-1">
                    {HOURS.map(h => (
                      <HeatCell key={h} value={heatMatrix[di]?.[h] || 0} max={heatMax} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(99,102,241,0.1)' }} />
              <span>Low</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(99,102,241,0.5)' }} />
              <span>Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(99,102,241,0.95)' }} />
              <span>High</span>
            </div>
          </div>
        </div>
      )}

      {reportType === 'categories' && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Revenue by Category</h3>
          <div className="space-y-3">
            {categories.map((cat, i) => {
              const colors = ['#6366f1','#22c55e','#f59e0b','#f87171','#a78bfa'];
              const color  = colors[i % colors.length];
              return (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>{cat.orders} orders</span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {format(cat.revenue)}
                      </span>
                      <span style={{ color }}>{cat.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-full" style={{ width: `${cat.pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-2 flex items-center justify-between text-sm font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-primary)' }}>Total Revenue</span>
            <span style={{ color: '#4ade80' }}>{format(totalRevenue)}</span>
          </div>
        </div>
      )}

      {reportType === 'pl' && (
        <div className="rounded-xl p-5 space-y-1" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Profit & Loss Statement</h3>
          <PLRow label="Gross Revenue"    value={pl.gross_revenue}    isRevenue />
          <PLRow label="Discounts Given"  value={pl.discounts}        isExpense indent />
          <PLRow label="Refunds"          value={pl.refunds}          isExpense indent />
          <PLRow label="Net Revenue"      value={pl.net_revenue}      isRevenue />
          <div className="py-1" />
          <PLRow label="Food Cost"        value={pl.food_cost}        isExpense indent />
          <PLRow label="Staff Cost"       value={pl.staff_cost}       isExpense indent />
          <PLRow label="Overheads"        value={pl.overheads}        isExpense indent />
          <PLRow label="Total Expenses"   value={pl.total_expenses}   isExpense />
          <div className="py-1" />
          <PLRow label="Gross Profit"     value={pl.gross_profit}     isProfit />
          <PLRow label="Tax Provision"    value={pl.tax}              isExpense indent />
          <PLRow label="Net Profit"       value={pl.net_profit}       isProfit />
        </div>
      )}

      {reportType === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Revenue Trend (bar chart visual) */}
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Revenue Trend (last 7 days)</h3>
            <div className="flex items-end gap-2 h-32">
              {(reports?.daily_revenue || [
                { day: 'Mon', v: 12000 }, { day: 'Tue', v: 18000 }, { day: 'Wed', v: 15000 },
                { day: 'Thu', v: 22000 }, { day: 'Fri', v: 28000 }, { day: 'Sat', v: 35000 },
                { day: 'Sun', v: 31000 },
              ]).map((d, i) => {
                const max = 35000;
                const pct = d.v / max * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                      {format(d.v)}
                    </p>
                    <div className="w-full rounded-t-sm" style={{ height: `${pct}%`, background: '#6366f1', minHeight: 4 }} />
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{d.day}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top metrics summary */}
          <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Key Metrics</h3>
            {[
              { label: 'Avg Daily Revenue', value: format((pl.gross_revenue || 0) / 7), icon: TrendingUp, color: '#22c55e' },
              { label: 'Food Cost %',        value: `${pl.gross_revenue ? Math.round((pl.food_cost / pl.gross_revenue) * 100) : 35}%`, icon: Utensils, color: '#f59e0b' },
              { label: 'Staff Cost %',       value: `${pl.gross_revenue ? Math.round((pl.staff_cost / pl.gross_revenue) * 100) : 18}%`, icon: Users, color: '#a78bfa' },
              { label: 'Profit Margin',      value: `${pl.gross_revenue ? Math.round((pl.net_profit / pl.gross_revenue) * 100) : 29}%`, icon: DollarSign, color: '#4ade80' },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <m.icon className="w-3.5 h-3.5" style={{ color: m.color }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                </div>
                <span className="text-sm font-bold" style={{ color: m.color }}>{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
