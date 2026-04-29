/**
 * Prep Time Analytics — KDS generates avg cook time per item/station.
 * Routes: /prep-analytics
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Timer, ChefHat, Utensils, Coffee, IceCream, Package,
  TrendingUp, TrendingDown, Minus, BarChart2, Clock,
  CheckCircle2, AlertTriangle, XCircle, Download, RefreshCw,
  ArrowLeft, Flame, Zap, Award, Activity,
} from 'lucide-react';

/* ─── Constants ──────────────────────────────────────────── */

const STATION_META = {
  KITCHEN: { label: 'Kitchen',  icon: Utensils, color: '#f97316', bg: '#fff7ed' },
  BAR:     { label: 'Bar',      icon: Coffee,   color: '#a855f7', bg: '#faf5ff' },
  DESSERT: { label: 'Dessert',  icon: IceCream, color: '#ec4899', bg: '#fdf2f8' },
  PACKING: { label: 'Packing',  icon: Package,  color: '#14b8a6', bg: '#f0fdfa' },
  DEFAULT: { label: 'Other',    icon: ChefHat,  color: '#6366f1', bg: '#eef2ff' },
};

const DOW_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const HOURS = Array.from({length: 24}, (_, i) => i);

/* ─── Utility ────────────────────────────────────────────── */

function fmtSecs(s) {
  if (!s || s <= 0) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function pctBar(pct, color = '#22c55e') {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full bg-surface rounded-full h-2 mt-1">
      <div style={{ width: `${clamped}%`, background: color }} className="h-2 rounded-full transition-all duration-500" />
    </div>
  );
}

function slaColor(pct) {
  if (pct >= 90) return '#22c55e';
  if (pct >= 70) return '#f59e0b';
  return '#ef4444';
}

function stationMeta(st) {
  return STATION_META[st] || STATION_META.DEFAULT;
}

/* ─── KPI Card ───────────────────────────────────────────── */

function KPICard({ icon: Icon, label, value, sub, color = '#6366f1', trend }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl" style={{ background: color + '20' }}>
          <Icon size={20} style={{ color }} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs flex items-center gap-0.5 ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-secondary'}`}>
            {trend > 0 ? <TrendingUp size={12}/> : trend < 0 ? <TrendingDown size={12}/> : <Minus size={12}/>}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold mb-0.5">{value}</div>
      <div className="text-xs text-secondary font-medium">{label}</div>
      {sub && <div className="text-xs text-secondary mt-0.5 opacity-70">{sub}</div>}
    </div>
  );
}

/* ─── Trend Sparkline (pure SVG) ─────────────────────────── */

function Sparkline({ data, color = '#6366f1' }) {
  if (!data || data.length < 2) return <div className="text-xs text-secondary text-center py-4">Not enough data</div>;

  const vals = data.map(d => d.avg_secs);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;

  const W = 400, H = 80, PAD = 8;
  const pts = vals.map((v, i) => {
    const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }}>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={pts} />
      {vals.map((v, i) => {
        const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
        const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
      })}
    </svg>
  );
}

/* ─── Heatmap Cell ───────────────────────────────────────── */

function HeatmapCell({ value, max }) {
  if (!value) return <td className="border border-border p-1 text-center text-xs text-secondary" style={{ background: 'var(--surface)' }}>—</td>;
  const intensity = max > 0 ? value / max : 0;
  const r = Math.round(239 + (239 - 239) * (1 - intensity));
  const g = Math.round(68  + (68  - 68)  * (1 - intensity));
  const b = Math.round(68  + (68  - 68)  * (1 - intensity));
  // Red-ish gradient: light = fast, dark = slow
  const bg = `rgba(239, 68, 68, ${(intensity * 0.8).toFixed(2)})`;
  const fg = intensity > 0.5 ? '#fff' : 'var(--text-primary)';
  return (
    <td className="border border-border p-1 text-center" style={{ background: bg, color: fg, fontSize: 10, minWidth: 36 }}>
      {fmtSecs(value)}
    </td>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */

export default function PrepTimeAnalyticsPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const navigate = useNavigate();

  const [range, setRange] = useState('7d');
  const [activeTab, setActiveTab] = useState('overview'); // overview | stations | items | heatmap | trend
  const [stationFilter, setStationFilter] = useState('ALL');

  /* ── date range from preset ── */
  const { from, to } = useMemo(() => {
    const now = new Date();
    const to  = now.toISOString().slice(0, 10);
    const days = range === '1d' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const f = new Date(now); f.setDate(f.getDate() - days);
    return { from: f.toISOString().slice(0, 10), to };
  }, [range]);

  /* ── fetch all analytics in one shot ── */
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['prep-analytics', outletId, from, to],
    queryFn: () =>
      api.get(`/kitchen/analytics/full?outlet_id=${outletId}&from=${from}&to=${to}`)
         .then(r => r.data?.data || r.data),
    enabled: !!outletId,
    staleTime: 60_000,
    onError: () => toast.error('Failed to load analytics'),
  });

  const summary  = data?.summary  || {};
  const stations = data?.stations || [];
  const items    = data?.items    || [];
  const sla      = data?.sla      || [];
  const heatmap  = data?.heatmap  || [];
  const trend    = data?.trend    || [];

  /* ── heatmap grid ── */
  const heatGrid = useMemo(() => {
    const grid = {};
    for (const cell of heatmap) {
      if (!grid[cell.dow]) grid[cell.dow] = {};
      grid[cell.dow][cell.hour] = cell.avg_secs;
    }
    return grid;
  }, [heatmap]);

  const heatMax = useMemo(() =>
    Math.max(0, ...heatmap.map(c => c.avg_secs)), [heatmap]);

  /* ── filtered items ── */
  const filteredItems = stationFilter === 'ALL'
    ? items
    : items.filter(i => i.station === stationFilter);

  /* ── export CSV ── */
  const exportCSV = (rows, headers, filename) => {
    const lines = [headers.join(','), ...rows.map(r => headers.map(h => r[h] ?? '').join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  /* ── TABS ── */
  const TABS = [
    { id: 'overview',  label: 'Overview',  icon: Activity },
    { id: 'stations',  label: 'Stations',  icon: ChefHat  },
    { id: 'items',     label: 'Items',     icon: Utensils },
    { id: 'heatmap',   label: 'Heatmap',   icon: Flame    },
    { id: 'trend',     label: 'Trend',     icon: TrendingUp },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/kitchen')} className="p-2 rounded-lg hover:bg-surface transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Timer size={24} className="text-accent" /> Prep Time Analytics
            </h1>
            <p className="text-secondary text-sm">Avg cook time per item &amp; station · KDS intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Range selector */}
          <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
            {['1d','7d','30d','90d'].map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${range === r ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}>
                {r}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="p-2 rounded-lg border border-border hover:bg-surface transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw size={32} className="animate-spin text-accent" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard icon={Timer}       label="Avg Prep Time"      value={summary.avg_fmt || '—'}      color="#6366f1" />
            <KPICard icon={Zap}         label="Fastest KOT"        value={summary.fastest_fmt || '—'}  color="#22c55e" />
            <KPICard icon={Flame}       label="Slowest KOT"        value={summary.slowest_fmt || '—'}  color="#ef4444" />
            <KPICard icon={BarChart2}   label="KOTs Analysed"      value={summary.total_kots ?? 0}     color="#f97316" />
          </div>

          {/* SLA bar (always visible) */}
          {sla.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-accent" /> SLA Compliance by Station
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {sla.map(s => {
                  const meta = stationMeta(s.station);
                  const Icon = meta.icon;
                  const clr  = slaColor(s.compliance_pct);
                  return (
                    <div key={s.station} className="rounded-xl border border-border p-4" style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon size={14} style={{ color: meta.color }} />
                        <span className="font-medium text-sm">{meta.label}</span>
                      </div>
                      <div className="text-2xl font-bold" style={{ color: clr }}>{s.compliance_pct}%</div>
                      <div className="text-xs text-secondary mb-1">Within {s.sla_target_fmt} target</div>
                      {pctBar(s.compliance_pct, clr)}
                      <div className="flex justify-between text-xs text-secondary mt-2">
                        <span>✓ {s.within_sla} on time</span>
                        <span className="text-red-500">✗ {s.breached} breached</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}>
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Top 5 slowest items */}
              <div className="card p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Flame size={16} className="text-red-500" /> Slowest Items (avg)
                </h3>
                {items.length === 0 ? (
                  <div className="text-secondary text-sm text-center py-6">No completed KOTs in this period</div>
                ) : (
                  <div className="space-y-3">
                    {items.slice(0, 5).map((item, i) => {
                      const meta = stationMeta(item.station);
                      const maxSecs = items[0]?.avg_secs || 1;
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium truncate max-w-[180px]">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                              <span className="font-bold text-red-500">{item.avg_fmt}</span>
                            </div>
                          </div>
                          <div className="w-full bg-surface rounded-full h-1.5">
                            <div style={{ width: `${(item.avg_secs / maxSecs) * 100}%`, background: '#ef4444' }} className="h-1.5 rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top 5 fastest items */}
              <div className="card p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Zap size={16} className="text-green-500" /> Fastest Items (avg)
                </h3>
                {items.length === 0 ? (
                  <div className="text-secondary text-sm text-center py-6">No completed KOTs in this period</div>
                ) : (
                  <div className="space-y-3">
                    {[...items].sort((a,b) => a.avg_secs - b.avg_secs).slice(0, 5).map((item, i) => {
                      const meta = stationMeta(item.station);
                      const minSecs = [...items].sort((a,b) => a.avg_secs - b.avg_secs)[0]?.avg_secs || 1;
                      const maxSecs = items[0]?.avg_secs || 1;
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium truncate max-w-[180px]">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                              <span className="font-bold text-green-600">{item.avg_fmt}</span>
                            </div>
                          </div>
                          <div className="w-full bg-surface rounded-full h-1.5">
                            <div style={{ width: `${(item.avg_secs / maxSecs) * 100}%`, background: '#22c55e' }} className="h-1.5 rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Trend mini */}
              <div className="card p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <TrendingUp size={16} className="text-accent" /> Daily Avg Prep Time Trend
                  </h3>
                  {trend.length > 0 && (
                    <button onClick={() => exportCSV(trend, ['date','count','avg_secs','avg_fmt'], 'prep_trend.csv')}
                      className="btn-secondary flex items-center gap-1 text-xs py-1.5 px-3">
                      <Download size={12} /> CSV
                    </button>
                  )}
                </div>
                {trend.length < 2 ? (
                  <div className="text-secondary text-sm text-center py-8">Need at least 2 days of data</div>
                ) : (
                  <>
                    <Sparkline data={trend} color="#6366f1" />
                    <div className="flex justify-between text-xs text-secondary mt-2">
                      <span>{trend[0]?.date}</span>
                      <span>{trend[trend.length-1]?.date}</span>
                    </div>
                    <div className="flex justify-center gap-6 mt-2 text-xs text-secondary">
                      <span>Min: <strong>{fmtSecs(Math.min(...trend.map(d => d.avg_secs)))}</strong></span>
                      <span>Max: <strong>{fmtSecs(Math.max(...trend.map(d => d.avg_secs)))}</strong></span>
                      <span>Latest: <strong>{trend[trend.length-1]?.avg_fmt}</strong></span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── STATIONS TAB ── */}
          {activeTab === 'stations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Prep Time by Kitchen Station</h2>
                {stations.length > 0 && (
                  <button onClick={() => exportCSV(stations, ['station','kots_completed','items_processed','avg_total_fmt','avg_cook_fmt'], 'station_stats.csv')}
                    className="btn-secondary flex items-center gap-2 text-sm">
                    <Download size={14} /> Export CSV
                  </button>
                )}
              </div>
              {stations.length === 0 ? (
                <div className="card p-12 text-center text-secondary">No completed KOTs in this period</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stations.map(s => {
                    const meta = stationMeta(s.station);
                    const Icon = meta.icon;
                    return (
                      <div key={s.station} className="card p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-3 rounded-xl" style={{ background: meta.bg }}>
                            <Icon size={24} style={{ color: meta.color }} />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">{meta.label}</h3>
                            <p className="text-xs text-secondary">{s.kots_completed} KOTs · {s.items_processed} items</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-surface rounded-xl p-3">
                            <div className="text-xs text-secondary mb-1">Avg Total Time</div>
                            <div className="text-xl font-bold">{s.avg_total_fmt}</div>
                            <div className="text-xs text-secondary">(ticket open → done)</div>
                          </div>
                          <div className="bg-surface rounded-xl p-3">
                            <div className="text-xs text-secondary mb-1">Avg Cook Time</div>
                            <div className="text-xl font-bold">{s.avg_cook_fmt}</div>
                            <div className="text-xs text-secondary">(start cooking → done)</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ITEMS TAB ── */}
          {activeTab === 'items' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-semibold">Avg Prep Time per Menu Item</h2>
                <div className="flex gap-2">
                  {/* station filter */}
                  {['ALL', 'KITCHEN', 'BAR', 'DESSERT', 'PACKING'].map(st => (
                    <button key={st} onClick={() => setStationFilter(st)}
                      className={`px-3 py-1.5 text-xs rounded-lg border font-medium capitalize transition-colors ${stationFilter === st ? 'bg-accent text-white border-accent' : 'border-border text-secondary hover:text-primary'}`}>
                      {st === 'ALL' ? 'All Stations' : stationMeta(st).label}
                    </button>
                  ))}
                  {items.length > 0 && (
                    <button onClick={() => exportCSV(filteredItems, ['name','station','count','avg_fmt','min_fmt','max_fmt'], 'item_prep.csv')}
                      className="btn-secondary flex items-center gap-1 text-xs py-1.5 px-3 ml-2">
                      <Download size={12} /> CSV
                    </button>
                  )}
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <div className="card p-12 text-center text-secondary">No data for this station in the selected period</div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-4 text-xs font-semibold text-secondary uppercase tracking-wider">#</th>
                        <th className="text-left p-4 text-xs font-semibold text-secondary uppercase tracking-wider">Item</th>
                        <th className="text-left p-4 text-xs font-semibold text-secondary uppercase tracking-wider">Station</th>
                        <th className="text-right p-4 text-xs font-semibold text-secondary uppercase tracking-wider">Avg</th>
                        <th className="text-right p-4 text-xs font-semibold text-secondary uppercase tracking-wider">Min</th>
                        <th className="text-right p-4 text-xs font-semibold text-secondary uppercase tracking-wider">Max</th>
                        <th className="text-right p-4 text-xs font-semibold text-secondary uppercase tracking-wider">Orders</th>
                        <th className="text-left p-4 text-xs font-semibold text-secondary uppercase tracking-wider w-40">Bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item, i) => {
                        const meta   = stationMeta(item.station);
                        const maxAvg = filteredItems[0]?.avg_secs || 1;
                        const pct    = (item.avg_secs / maxAvg) * 100;
                        const clr    = pct > 75 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#22c55e';
                        return (
                          <tr key={i} className="border-b border-border hover:bg-surface/50 transition-colors">
                            <td className="p-4 text-secondary text-sm">{i + 1}</td>
                            <td className="p-4 font-medium text-sm">{item.name}</td>
                            <td className="p-4">
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: meta.bg, color: meta.color }}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="p-4 text-right font-bold" style={{ color: clr }}>{item.avg_fmt}</td>
                            <td className="p-4 text-right text-sm text-green-600">{item.min_fmt}</td>
                            <td className="p-4 text-right text-sm text-red-500">{item.max_fmt}</td>
                            <td className="p-4 text-right text-sm text-secondary">{item.count}</td>
                            <td className="p-4">
                              <div className="w-full bg-surface rounded-full h-2">
                                <div style={{ width: `${pct}%`, background: clr }} className="h-2 rounded-full" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── HEATMAP TAB ── */}
          {activeTab === 'heatmap' && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Flame size={16} className="text-red-500" /> Avg Prep Time Heatmap — Hour × Day
                </h2>
                <div className="flex items-center gap-3 text-xs text-secondary">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-100 inline-block"></span> Fast
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-500 inline-block"></span> Slow
                  </span>
                </div>
              </div>
              {heatmap.length === 0 ? (
                <div className="text-secondary text-center py-12">No completed KOTs in this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-secondary text-left font-medium w-12">Day</th>
                        {HOURS.map(h => (
                          <th key={h} className="p-1 text-secondary text-center font-normal" style={{ minWidth: 36 }}>
                            {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DOW_LABELS.map((day, dow) => (
                        <tr key={dow}>
                          <td className="p-2 text-secondary font-medium">{day}</td>
                          {HOURS.map(h => (
                            <HeatmapCell key={h} value={heatGrid[dow]?.[h]} max={heatMax} />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-secondary mt-3">
                Each cell shows avg KOT completion time for orders created in that hour. Darker = slower.
              </p>
            </div>
          )}

          {/* ── TREND TAB ── */}
          {activeTab === 'trend' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Daily Avg Prep Time Trend</h2>
                {trend.length > 0 && (
                  <button onClick={() => exportCSV(trend, ['date','count','avg_secs','avg_fmt'], 'prep_trend.csv')}
                    className="btn-secondary flex items-center gap-2 text-sm">
                    <Download size={14} /> Export CSV
                  </button>
                )}
              </div>

              {trend.length < 2 ? (
                <div className="card p-12 text-center text-secondary">Need at least 2 days of completed KOTs</div>
              ) : (
                <>
                  <div className="card p-5">
                    <Sparkline data={trend} color="#6366f1" />
                    <div className="flex justify-between text-xs text-secondary mt-2">
                      <span>{trend[0]?.date}</span>
                      <span>{trend[trend.length-1]?.date}</span>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-4 text-xs font-semibold text-secondary uppercase">Date</th>
                          <th className="text-right p-4 text-xs font-semibold text-secondary uppercase">KOTs</th>
                          <th className="text-right p-4 text-xs font-semibold text-secondary uppercase">Avg Prep</th>
                          <th className="text-left p-4 text-xs font-semibold text-secondary uppercase w-48">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trend.map((d, i) => {
                          const prev = trend[i - 1];
                          const delta = prev ? d.avg_secs - prev.avg_secs : 0;
                          const maxSecs = Math.max(...trend.map(t => t.avg_secs)) || 1;
                          const clr = delta > 30 ? '#ef4444' : delta < -30 ? '#22c55e' : '#6366f1';
                          return (
                            <tr key={d.date} className="border-b border-border hover:bg-surface/50">
                              <td className="p-4 font-medium text-sm">{d.date}</td>
                              <td className="p-4 text-right text-sm text-secondary">{d.count}</td>
                              <td className="p-4 text-right font-bold" style={{ color: clr }}>{d.avg_fmt}</td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-surface rounded-full h-2">
                                    <div style={{ width: `${(d.avg_secs / maxSecs) * 100}%`, background: clr }} className="h-2 rounded-full" />
                                  </div>
                                  {delta !== 0 && (
                                    <span className="text-xs" style={{ color: clr }}>
                                      {delta > 0 ? '▲' : '▼'} {fmtSecs(Math.abs(delta))}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
