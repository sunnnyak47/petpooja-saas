import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid, Area, AreaChart,
} from 'recharts';
import {
  Calendar, Users, TrendingUp, TrendingDown, Clock,
  Download, Printer, Package, DollarSign, BarChart2, Layers,
  AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useCurrency } from '../hooks/useCurrency';
import { useRegion } from '../hooks/useRegion';
import { formatCurrencyStatic } from '../hooks/useCurrency';
import { format, subDays, startOfWeek, startOfMonth, subMonths, endOfMonth } from 'date-fns';

const DATE_PRESETS = [
  { label: 'Today', getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Yesterday', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: 'This Week', getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: new Date() }) },
  { label: 'This Month', getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: 'Last Month', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

function fmtCurrency(val, sym) {
  if (!val && val !== 0) return '—';
  return `${sym}${Number(val).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function GrowthBadge({ value }) {
  if (value === null || value === undefined) return null;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${positive ? 'text-success-400' : 'text-red-400'}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function ReportsPage() {
  const { user } = useSelector((s) => s.auth);
  const currency = user?.outlet?.currency || 'INR';
  const { symbol } = useCurrency();
  const navigate = useNavigate();
  const region = useRegion();
  const isAU = region === 'AU';

  const [dateRange, setDateRange] = useState(DATE_PRESETS[0].getValue());
  const [presetIndex, setPresetIndex] = useState(0);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState(user?.outlet_id || '');
  const [topItemsBy, setTopItemsBy] = useState('revenue');
  const [activeTab, setActiveTab] = useState('overview'); // overview | inventory | staff | tax

  // H13: guard against Invalid Date (e.g. a cleared custom date input). date-fns
  // format() throws RangeError on an invalid date, which would crash the whole page.
  const fromStr = dateRange.from && !isNaN(dateRange.from) ? format(dateRange.from, 'yyyy-MM-dd') : '';
  const toStr = dateRange.to && !isNaN(dateRange.to) ? format(dateRange.to, 'yyyy-MM-dd') : '';

  const { data: outlets } = useQuery({
    queryKey: ['outlets'],
    queryFn: () => api.get('/ho/outlets').then(r => r.data),
    enabled: user?.role === 'owner' || user?.role === 'super_admin',
  });

  const qp = { outlet_id: selectedOutlet, from: fromStr, to: toStr };

  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ['reports', 'franchiseKpis', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/franchise-kpis', { params: qp }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  const { data: salesSummary, isLoading: loadingSales } = useQuery({
    queryKey: ['reports', 'salesSummary', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/daily-sales', { params: { outlet_id: selectedOutlet, date: fromStr, from: fromStr, to: toStr } }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  // H14: Payment Methods must cover the whole selected range. daily-sales' by_payment
  // is single-day only; the range-aware payment-breakdown endpoint sums across from..to.
  const { data: paymentBreakdown } = useQuery({
    queryKey: ['reports', 'paymentBreakdown', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/payment-breakdown', { params: { outlet_id: selectedOutlet, from: fromStr, to: toStr } }).then(r => r.data),
    enabled: !!selectedOutlet && !!fromStr && !!toStr,
  });

  const { data: revenueTrend, isLoading: loadingTrend } = useQuery({
    queryKey: ['reports', 'revenueTrendRange', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/revenue-trend-range', { params: qp }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  // M27: Peak Hours must aggregate across the whole range, not just the first day.
  // The /reports/hourly endpoint is single-day only, so fetch each day in the range
  // and sum the hourly buckets client-side.
  const { data: hourlyData } = useQuery({
    queryKey: ['reports', 'hourly', selectedOutlet, fromStr, toStr],
    queryFn: async () => {
      const days = [];
      const start = new Date(fromStr + 'T00:00:00');
      const end = new Date(toStr + 'T00:00:00');
      for (let d = new Date(start); d <= end && days.length < 92; d.setDate(d.getDate() + 1)) {
        days.push(format(d, 'yyyy-MM-dd'));
      }
      const results = await Promise.all(
        days.map((date) => api.get('/reports/hourly', { params: { outlet_id: selectedOutlet, date } }).then(r => r.data).catch(() => []))
      );
      const byHour = {};
      for (const dayRows of results) {
        for (const row of dayRows || []) {
          if (!byHour[row.hour]) byHour[row.hour] = { hour: row.hour, revenue: 0, orders: 0 };
          byHour[row.hour].revenue += row.revenue || 0;
          byHour[row.hour].orders += row.orders || 0;
        }
      }
      return Object.values(byHour).sort((a, b) => a.hour - b.hour);
    },
    enabled: !!selectedOutlet && !!fromStr && !!toStr,
  });

  const { data: itemWiseData } = useQuery({
    queryKey: ['reports', 'itemWise', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/item-wise', { params: { outlet_id: selectedOutlet, from: fromStr, to: toStr, top: 10 } }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  const { data: categoryData } = useQuery({
    queryKey: ['reports', 'category', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/categoryWiseSales', { params: { outlet_id: selectedOutlet, from: fromStr, to: toStr } }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  const { data: invValuation } = useQuery({
    queryKey: ['reports', 'invValuation', selectedOutlet],
    queryFn: () => api.get('/reports/inventory-valuation', { params: { outlet_id: selectedOutlet } }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  const { data: gstData } = useQuery({
    queryKey: ['reports', 'gst', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/gstReport', { params: { outlet_id: selectedOutlet, from: fromStr, to: toStr } }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  const { data: staffData } = useQuery({
    queryKey: ['reports', 'staff', selectedOutlet, fromStr, toStr],
    queryFn: () => api.get('/reports/staffPerformance', { params: { outlet_id: selectedOutlet, from: fromStr, to: toStr } }).then(r => r.data),
    enabled: !!selectedOutlet,
  });

  // AU-only: Advanced reports (P&L, heatmap, categories)
  const { data: advancedReports, isLoading: loadingAdvanced } = useQuery({
    queryKey: ['advanced-reports', 'week'],
    queryFn: () => api.get('/reports/advanced', { params: { range: 'week' } }).then(r => r.data).catch(() => null),
    enabled: isAU,
    staleTime: 120_000,
  });

  // --- Processed data ---
  const processedHourly = useMemo(() => {
    if (!hourlyData) return [];
    const sorted = [...hourlyData].sort((a, b) => b.revenue - a.revenue);
    const peakVals = sorted.slice(0, 3).map(d => d.revenue).filter(v => v > 0);
    return hourlyData.filter(d => d.hour >= 7 && d.hour <= 23).map(h => ({
      name: `${h.hour % 12 || 12}${h.hour >= 12 ? 'PM' : 'AM'}`,
      revenue: h.revenue,
      orders: h.orders,
      isPeak: peakVals.includes(h.revenue),
    }));
  }, [hourlyData]);

  const paymentData = useMemo(() => {
    // H14: source from the range-aware payment-breakdown endpoint ({ breakdown:[{method,amount}] }).
    if (!paymentBreakdown?.breakdown) return [];
    return paymentBreakdown.breakdown
      .filter((b) => b.amount > 0)
      .map((b) => ({ name: b.method.toUpperCase(), value: b.amount }));
  }, [paymentBreakdown]);

  const topItems = (itemWiseData?.items || []).map(i => ({
    name: i.name, revenue: i.total_revenue, quantity: i.total_quantity,
  }));

  const costPieData = useMemo(() => {
    if (!kpis) return [];
    const revenue = kpis.revenue || 1;
    const food = kpis.food_cost || 0;
    const waste = kpis.waste_value || 0;
    const other = Math.max(0, revenue - food - waste);
    return [
      { name: 'Food Cost', value: Math.round(food * 100) / 100 },
      { name: 'Waste', value: Math.round(waste * 100) / 100 },
      { name: 'Gross Profit', value: Math.round(other * 100) / 100 },
    ].filter(d => d.value > 0);
  }, [kpis]);

  // H15: wire each export button to its actual dataset instead of the generic
  // one-row daily CSV the backend /export fallback emits. GST routes to the real
  // server-side exporter (type=gstr1); the rest are built client-side from the
  // datasets already loaded for the selected range.
  const csvEscape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (header, rows) =>
    [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';

  const downloadCsv = (csv, filename) => {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async (type) => {
    try {
      const rangeLabel = `${fromStr}_to_${toStr}`;

      if (type === 'gst') {
        // Real GST daily register from the backend exporter (BOM-prefixed CSV).
        const response = await api.get(
          `/reports/export?type=gstr1&outlet_id=${selectedOutlet}&from=${fromStr}&to=${toStr}&format=csv`,
          { responseType: 'blob' }
        );
        const blob = new Blob([response.data || response], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `gst-register-${rangeLabel}.csv`; a.click();
        window.URL.revokeObjectURL(url);
        return;
      }

      if (type === 'revenue') {
        const rows = (revenueTrend || []).map((d) => [d.date, d.revenue ?? 0]);
        downloadCsv(toCsv(['Date', 'Revenue'], rows), `revenue-${rangeLabel}.csv`);
        return;
      }
      if (type === 'hourly') {
        const rows = (hourlyData || []).map((h) => [h.hour, h.revenue ?? 0, h.orders ?? 0]);
        downloadCsv(toCsv(['Hour', 'Revenue', 'Orders'], rows), `peak-hours-${rangeLabel}.csv`);
        return;
      }
      if (type === 'items') {
        const rows = (itemWiseData?.items || []).map((i) => [i.name, i.total_quantity ?? 0, i.total_revenue ?? 0]);
        downloadCsv(toCsv(['Item', 'Quantity', 'Revenue'], rows), `top-items-${rangeLabel}.csv`);
        return;
      }
      if (type === 'category') {
        const rows = (categoryData || []).map((c) => [c.category, c.revenue ?? 0]);
        downloadCsv(toCsv(['Category', 'Revenue'], rows), `category-${rangeLabel}.csv`);
        return;
      }
      if (type === 'staff') {
        const rows = (staffData || []).map((s) => [
          s.name, s.orders ?? 0, s.revenue ?? 0, s.orders > 0 ? Math.round((s.revenue / s.orders) * 100) / 100 : 0, s.voids ?? 0,
        ]);
        downloadCsv(toCsv(['Staff', 'Orders', 'Revenue', 'Avg Order', 'Voids'], rows), `staff-${rangeLabel}.csv`);
        return;
      }

      // full_report (header Export button) — combined summary across the range.
      const k2 = kpis || {};
      const rows = [
        ['Revenue', k2.revenue ?? 0],
        ['Orders', k2.total_orders ?? 0],
        ['Avg Check', k2.avg_check ?? 0],
        ['Food Cost', k2.food_cost ?? 0],
        ['Food Cost %', k2.food_cost_pct ?? 0],
        ['Waste Value', k2.waste_value ?? 0],
        ['Waste %', k2.waste_pct ?? 0],
        ['Gross Margin %', k2.gross_margin_pct ?? 0],
      ];
      downloadCsv(toCsv(['Metric', 'Value'], rows), `full-report-${rangeLabel}.csv`);
    } catch { toast.error('Export failed'); }
  };

  const pieColors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
  const isLoading = loadingKpis || loadingSales || loadingTrend;

  const k = kpis || {};

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-surface-900 p-4 rounded-2xl border border-surface-800 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-white px-2 pr-4 border-r border-surface-700">Analytics</h1>
          <div className="flex bg-surface-950 p-1 rounded-xl shadow-inner overflow-x-auto">
            {DATE_PRESETS.map((preset, idx) => (
              <button key={preset.label}
                onClick={() => { setPresetIndex(idx); setDateRange(preset.getValue()); setShowCustomRange(false); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${presetIndex === idx && !showCustomRange ? 'bg-brand-500 text-white shadow-md' : 'text-surface-400 hover:text-surface-200'}`}>
                {preset.label}
              </button>
            ))}
            <button onClick={() => { setShowCustomRange(true); setPresetIndex(-1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${showCustomRange ? 'bg-brand-500 text-white shadow-md' : 'text-surface-400 hover:text-surface-200'}`}>
              <Calendar className="w-3.5 h-3.5" /> Custom
            </button>
          </div>
          {showCustomRange && (
            <div className="flex items-center gap-2 animate-slide-right">
              <input type="date" className="input text-sm py-1" value={fromStr} onChange={e => { const d = new Date(e.target.value + 'T00:00:00'); if (e.target.value && !isNaN(d)) setDateRange(p => ({ ...p, from: d })); }} />
              <span className="text-surface-500">→</span>
              <input type="date" className="input text-sm py-1" value={toStr} onChange={e => { const d = new Date(e.target.value + 'T00:00:00'); if (e.target.value && !isNaN(d)) setDateRange(p => ({ ...p, to: d })); }} />
            </div>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-3 w-full lg:w-auto">
          {outlets?.length > 1 && (
            <select className="input font-bold" value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)}>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <button onClick={() => navigate('/eod-report')} className="btn-secondary font-semibold shrink-0 gap-2 flex items-center"><CheckCircle className="w-4 h-4" /> Close Day</button>
          <button onClick={() => window.print()} className="btn-surface font-semibold shrink-0 gap-2"><Printer className="w-4 h-4" /> Print</button>
          <button onClick={() => handleExport('full_report')} className="btn-primary font-semibold shrink-0 gap-2"><Download className="w-4 h-4" /> Export</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-950 p-1 rounded-xl w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          ...(isAU ? [{ id: 'pl', label: 'P&L Report', icon: DollarSign }] : []),
          ...(isAU ? [{ id: 'heatmap', label: 'Heatmap', icon: Clock }] : []),
          { id: 'inventory', label: 'Inventory', icon: Package },
          { id: 'staff', label: 'Staff', icon: Users },
          { id: 'tax', label: isAU ? 'GST (AU)' : 'GST Register', icon: Layers },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-brand-500 text-white shadow-md' : 'text-surface-400 hover:text-white'}`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-brand-400 gap-4">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold tracking-widest uppercase text-sm">Compiling Data…</p>
        </div>
      ) : (
        <>
          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {/* Franchise KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Revenue', value: fmtCurrency(k.revenue, symbol), sub: <GrowthBadge value={k.revenue_growth} />, color: 'bg-brand-500' },
                  { label: 'Orders', value: k.total_orders || 0, sub: <GrowthBadge value={k.orders_growth} />, color: 'bg-brand-500' },
                  { label: 'Avg Check', value: fmtCurrency(k.avg_check, symbol), sub: <span className="text-xs text-surface-400">per order</span>, color: 'bg-brand-500' },
                  { label: 'Food Cost %', value: k.food_cost_pct ? `${k.food_cost_pct}%` : '—', sub: <span className="text-xs text-surface-400">{fmtCurrency(k.food_cost, symbol)}</span>, color: 'bg-brand-500' },
                  { label: 'Waste %', value: k.waste_pct ? `${k.waste_pct}%` : '—', sub: <span className="text-xs text-surface-400">{fmtCurrency(k.waste_value, symbol)}</span>, color: 'bg-brand-500' },
                  { label: 'Gross Margin', value: k.gross_margin_pct ? `${k.gross_margin_pct}%` : '—', sub: <span className="text-xs text-surface-400">net of COGS</span>, color: 'bg-brand-500' },
                ].map((card, i) => (
                  <div key={i} className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-2">{card.label}</p>
                    <h3 className="text-xl font-black text-white">{card.value}</h3>
                    <div className="mt-1">{card.sub}</div>
                  </div>
                ))}
              </div>

              {/* Revenue Trend + Cost Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Revenue Trend */}
                <div className="col-span-2 bg-surface-900 border border-surface-800 rounded-2xl p-5">
                  <div className="flex justify-between items-center mb-5">
                    <h3 className="font-bold text-white text-sm uppercase tracking-wider">Revenue Trend</h3>
                    <button onClick={() => handleExport('revenue')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="h-[240px]">
                    {revenueTrend && revenueTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revenueTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                            tickFormatter={d => format(new Date(d), 'dd MMM')} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                            tickFormatter={v => fmtCurrency(v, symbol)} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                            formatter={v => [fmtCurrency(v, symbol), 'Revenue']}
                            labelFormatter={d => format(new Date(d), 'dd MMM yyyy')}
                          />
                          <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-surface-500 italic text-sm">No trend data — select a wider range</div>
                    )}
                  </div>
                </div>

                {/* Cost Breakdown Pie */}
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-4">Cost Breakdown</h3>
                  {costPieData.length > 0 ? (
                    <>
                      <div className="h-[170px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={costPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value" stroke="none">
                              {costPieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                              formatter={v => [fmtCurrency(v, symbol)]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2 mt-2">
                        {costPieData.map((d, i) => (
                          <div key={d.name} className="flex justify-between items-center">
                            <span className="flex items-center gap-1.5 text-xs text-surface-400 font-bold">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }}></span>
                              {d.name}
                            </span>
                            <span className="text-xs font-bold text-white">{fmtCurrency(d.value, symbol)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-40 text-surface-500 italic text-sm">Link inventory recipes for cost data</div>
                  )}
                </div>
              </div>

              {/* Hourly + Payment Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-2 bg-surface-900 border border-surface-800 rounded-2xl p-5">
                  <div className="flex justify-between items-center mb-5">
                    <h3 className="font-bold text-white text-sm uppercase tracking-wider">Peak Hours</h3>
                    <button onClick={() => handleExport('hourly')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800"><Download className="w-4 h-4" /></button>
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={processedHourly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => fmtCurrency(v, symbol)} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                          formatter={(v, n) => [fmtCurrency(v, symbol), 'Revenue']} cursor={{ fill: '#1e293b' }} />
                        <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                          {processedHourly.map((entry, i) => <Cell key={i} fill={entry.isPeak ? '#ef4444' : '#3b82f6'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 justify-center mt-3 text-[10px] font-bold text-surface-500 uppercase">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Normal</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Peak</span>
                  </div>
                </div>

                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 flex flex-col">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-3">Payment Methods</h3>
                  {paymentData.length > 0 ? (
                    <>
                      <div className="flex-1 min-h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={paymentData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value" stroke="none">
                              {paymentData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                              formatter={v => [fmtCurrency(v, symbol)]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2 mt-auto">
                        {paymentData.map((d, i) => (
                          <div key={d.name} className="flex justify-between">
                            <span className="flex items-center gap-1.5 text-xs text-surface-400 font-bold">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }}></span>
                              {d.name}
                            </span>
                            <span className="text-xs font-bold text-white">{fmtCurrency(d.value, symbol)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-surface-500 italic text-sm">No payment data</div>
                  )}
                </div>
              </div>

              {/* Top Items + Category */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                  <div className="flex justify-between items-center mb-5 border-b border-surface-800 pb-3">
                    <h3 className="font-bold text-white text-sm uppercase tracking-wider">Top Sellers</h3>
                    <div className="flex gap-2">
                      <select className="input py-1 text-xs" value={topItemsBy} onChange={e => setTopItemsBy(e.target.value)}>
                        <option value="revenue">By Revenue</option>
                        <option value="quantity">By Quantity</option>
                      </select>
                      <button onClick={() => handleExport('items')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 border border-surface-700"><Download className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[...topItems].sort((a, b) => b[topItemsBy] - a[topItemsBy]).map((item, idx) => {
                      const max = Math.max(...topItems.map(i => i[topItemsBy]), 1);
                      const pct = (item[topItemsBy] / max) * 100;
                      return (
                        <div key={idx}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-surface-200 truncate max-w-[60%]">{item.name}</span>
                            <span className="text-sm font-black text-brand-400">
                              {topItemsBy === 'revenue' ? fmtCurrency(item.revenue, symbol) : `${item.quantity} qty`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-surface-950 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                    {topItems.length === 0 && <p className="text-center text-surface-500 py-8 italic text-sm">No items sold in this period</p>}
                  </div>
                </div>

                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                  <div className="flex justify-between items-center mb-5 border-b border-surface-800 pb-3">
                    <h3 className="font-bold text-white text-sm uppercase tracking-wider">Category Performance</h3>
                    <button onClick={() => handleExport('category')} className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 border border-surface-700"><Download className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="h-[260px]">
                    {categoryData && categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => fmtCurrency(v, symbol)} />
                          <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: '#cbd5e1', fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                            formatter={v => [fmtCurrency(v, symbol), 'Revenue']} cursor={{ fill: '#1e293b' }} />
                          <Bar dataKey="revenue" fill="#10b981" radius={[0, 6, 6, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-surface-500 italic text-sm">No category data</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── INVENTORY TAB ── */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              {/* Inventory Valuation Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 md:col-span-1">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-4">Stock Valuation</h3>
                  <div className="text-4xl font-black text-white mb-1">{fmtCurrency(invValuation?.total_value, symbol)}</div>
                  <p className="text-surface-400 text-sm">{invValuation?.total_items || 0} active items</p>
                  <div className="mt-4 space-y-2">
                    {(invValuation?.by_category || []).map((cat, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-xs text-surface-400 capitalize font-bold">{cat.category}</span>
                        <span className="text-xs font-black text-white">{fmtCurrency(cat.value, symbol)}</span>
                      </div>
                    ))}
                    {(!invValuation || invValuation.by_category?.length === 0) && (
                      <p className="text-surface-500 text-xs italic">No inventory items linked</p>
                    )}
                  </div>
                </div>

                <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 md:col-span-2">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-4">Inventory by Category</h3>
                  <div className="h-[260px]">
                    {invValuation?.by_category?.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={invValuation.by_category} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => fmtCurrency(v, symbol)} />
                          <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: '#cbd5e1', fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                            formatter={v => [fmtCurrency(v, symbol), 'Stock Value']} cursor={{ fill: '#1e293b' }} />
                          <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-surface-500 italic text-sm">
                        No inventory data — add items via Inventory page
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Food Cost vs Revenue */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Food Cost', value: fmtCurrency(k.food_cost, symbol), pct: `${k.food_cost_pct || 0}% of revenue`, color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Package },
                  { label: 'Waste Value', value: fmtCurrency(k.waste_value, symbol), pct: `${k.waste_pct || 0}% of revenue`, color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertTriangle },
                  { label: 'Gross Margin', value: `${k.gross_margin_pct || 0}%`, pct: fmtCurrency((k.revenue || 0) - (k.food_cost || 0), symbol) + ' gross profit', color: 'text-success-400', bg: 'bg-success-500/10', icon: TrendingUp },
                ].map((card, i) => (
                  <div key={i} className={`${card.bg} border border-surface-800 rounded-2xl p-5`}>
                    <div className="flex items-center gap-2 mb-2">
                      <card.icon className={`w-5 h-5 ${card.color}`} />
                      <span className={`text-xs font-bold uppercase tracking-widest ${card.color}`}>{card.label}</span>
                    </div>
                    <div className={`text-3xl font-black ${card.color}`}>{card.value}</div>
                    <p className="text-surface-400 text-xs mt-1">{card.pct}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STAFF TAB ── */}
          {activeTab === 'staff' && (
            <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
              <div className="flex justify-between items-center p-4 bg-surface-950 border-b border-surface-800">
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">Staff Performance</h3>
                <button onClick={() => handleExport('staff')} className="btn-surface btn-sm"><Download className="w-3.5 h-3.5 mr-1" /> Export</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-900 text-surface-400 text-xs uppercase font-bold border-b border-surface-800">
                    <tr>
                      <th className="p-3">Staff Name</th>
                      <th className="p-3 text-center">Orders</th>
                      <th className="p-3">Revenue</th>
                      <th className="p-3">Avg Order</th>
                      <th className="p-3 text-red-400">Voids</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/50">
                    {(staffData || []).map((row, i) => (
                      <tr key={i} className="hover:bg-surface-800/30">
                        <td className="p-3 font-medium text-surface-100">{row.name}</td>
                        <td className="p-3 text-center bg-surface-950">{row.orders}</td>
                        <td className="p-3 font-bold text-success-400">{fmtCurrency(row.revenue, symbol)}</td>
                        <td className="p-3 text-surface-300">{fmtCurrency(row.orders > 0 ? row.revenue / row.orders : 0, symbol)}</td>
                        <td className="p-3 font-bold text-red-400">{row.voids}</td>
                      </tr>
                    ))}
                    {(!staffData || staffData.length === 0) && (
                      <tr><td colSpan="5" className="p-8 text-center text-surface-500 italic">No staff data for this period</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAX TAB ── */}
          {activeTab === 'tax' && (
            <div className="space-y-4">
              <div className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
                <div className="flex justify-between items-center p-4 bg-surface-950 border-b border-surface-800">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">
                    {isAU ? 'GST Tax Register (10% AU)' : 'GST Tax Register'}
                  </h3>
                  <button onClick={() => handleExport('gst')} className="btn-surface btn-sm"><Download className="w-3.5 h-3.5 mr-1" /> Export</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-900 text-surface-400 text-xs uppercase font-bold border-b border-surface-800">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Taxable Amount</th>
                        {!isAU && <><th className="p-3">CGST</th><th className="p-3">SGST</th></>}
                        <th className="p-3 bg-brand-500/10 text-brand-400">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-800/50">
                      {(gstData || []).map((row, i) => (
                        <tr key={i} className="hover:bg-surface-800/30">
                          <td className="p-3 text-surface-200">{format(new Date(row.date), 'dd MMM yyyy')}</td>
                          <td className="p-3">{fmtCurrency(row.taxable, symbol)}</td>
                          {!isAU && (
                            <><td className="p-3">{fmtCurrency(row.cgst, symbol)}</td><td className="p-3">{fmtCurrency(row.sgst, symbol)}</td></>
                          )}
                          <td className="p-3 font-bold text-brand-400 bg-brand-500/5">{fmtCurrency(row.total_tax, symbol)}</td>
                        </tr>
                      ))}
                      {(!gstData || gstData.length === 0) && (
                        <tr><td colSpan={!isAU ? 5 : 3} className="p-8 text-center text-surface-500 italic">No tax data for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {isAU && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-300 font-bold text-sm">Australian GST (10%)</p>
                    <p className="text-blue-400/80 text-xs mt-0.5">All prices include GST. BAS reports can be exported via the Xero/MYOB integration.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── P&L TAB (AU only) ── */}
          {activeTab === 'pl' && isAU && (() => {
            const pl = advancedReports?.profit_loss || {};
            const fmtPL = (v) => fmtCurrency(v, symbol);
            const PLRow = ({ label, value, isRevenue, isExpense, isProfit, indent }) => (
              <div className={`flex items-center justify-between py-3 border-b border-surface-800 ${indent ? 'pl-6' : ''}`}>
                <span className={`text-sm ${isProfit ? 'font-bold text-white' : 'text-surface-300'}`}>{label}</span>
                <span className={`text-sm font-semibold ${isProfit ? (value >= 0 ? 'text-success-400' : 'text-red-400') : isRevenue ? 'text-success-400' : isExpense ? 'text-red-400' : 'text-white'}`}>
                  {isExpense && value ? '- ' : ''}{fmtPL(Math.abs(value || 0))}
                </span>
              </div>
            );
            return (
              <div className="space-y-6">
                <div className="bg-surface-900 rounded-2xl border border-surface-800 p-6">
                  <h3 className="text-lg font-black text-white mb-4">Profit & Loss Statement</h3>
                  <PLRow label="Gross Revenue" value={pl.gross_revenue} isRevenue />
                  <PLRow label="Discounts Given" value={pl.discounts} isExpense indent />
                  <PLRow label="Refunds" value={pl.refunds} isExpense indent />
                  <PLRow label="Net Revenue" value={pl.net_revenue} isRevenue />
                  <div className="py-2" />
                  <PLRow label="Food Cost" value={pl.food_cost} isExpense indent />
                  <PLRow label="Staff Cost" value={pl.staff_cost} isExpense indent />
                  <PLRow label="Overheads" value={pl.overheads} isExpense indent />
                  <PLRow label="Total Expenses" value={pl.total_expenses} isExpense />
                  <div className="py-2" />
                  <PLRow label="Gross Profit" value={pl.gross_profit} isProfit />
                  <PLRow label="Tax Provision" value={pl.tax} isExpense indent />
                  <PLRow label="Net Profit" value={pl.net_profit} isProfit />
                </div>
                {loadingAdvanced && <p className="text-surface-500 text-sm text-center">Loading P&L data...</p>}
              </div>
            );
          })()}

          {/* ── HEATMAP TAB (AU only) ── */}
          {activeTab === 'heatmap' && isAU && (() => {
            const HOURS = Array.from({ length: 24 }, (_, i) => i);
            const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // index === backend day (0=Sun)
            const heatData = advancedReports?.hourly_heatmap || [];
            const heatMatrix = DAYS.map((_, di) =>
              HOURS.map(h => {
                const found = heatData.find(e => e.hour === h && e.day === di);
                return found ? (found.count || 0) : 0;
              })
            );
            const heatMax = Math.max(1, ...heatMatrix.flat());
            return (
              <div className="space-y-6">
                <div className="bg-surface-900 rounded-2xl border border-surface-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-white">Order Volume Heatmap</h3>
                    <span className="text-xs text-surface-500">Darker = more orders</span>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="flex gap-2">
                      <div className="flex flex-col gap-1 pt-8">
                        {DAYS.map(d => (
                          <div key={d} className="h-8 flex items-center text-xs text-surface-400 pr-2">{d}</div>
                        ))}
                      </div>
                      <div>
                        <div className="flex gap-1 mb-1">
                          {HOURS.filter(h => h % 3 === 0).map(h => (
                            <div key={h} className="text-xs text-surface-500 text-center" style={{ width: `${(8 + 4) * 3 - 4}px` }}>
                              {h}:00
                            </div>
                          ))}
                        </div>
                        {DAYS.map((day, di) => (
                          <div key={day} className="flex gap-1 mb-1">
                            {HOURS.map(h => {
                              const val = heatMatrix[di]?.[h] || 0;
                              const intensity = heatMax > 0 ? val / heatMax : 0;
                              const alpha = 0.1 + intensity * 0.85;
                              return (
                                <div key={h} className="w-8 h-8 rounded-sm flex items-center justify-center text-[10px] font-medium cursor-default"
                                  title={`${val} orders`}
                                  style={{ background: `rgba(99,102,241,${alpha})`, color: intensity > 0.5 ? '#fff' : 'var(--text-secondary)' }}>
                                  {val > 0 ? val : ''}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-surface-500">
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(99,102,241,0.1)' }} /> Low</div>
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(99,102,241,0.5)' }} /> Medium</div>
                    <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(99,102,241,0.95)' }} /> High</div>
                  </div>
                </div>
                {loadingAdvanced && <p className="text-surface-500 text-sm text-center">Loading heatmap data...</p>}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
