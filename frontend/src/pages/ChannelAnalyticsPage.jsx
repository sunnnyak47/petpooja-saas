/**
 * ChannelAnalyticsPage — Sales performance per channel (aggregators + Dine-in/QR/Direct)
 * Route: /channel-analytics
 *
 * Consumes (contract):
 *   GET /channel-analytics/summary?from=&to=
 *     → { data: { rows: [{ channel, label, orders, gross, aov, cancelled,
 *                           cancel_rate, avg_prep_min, commission_pct,
 *                           commission_amount, net }], totals: {...} } }
 *   GET /channel-analytics/top-items?from=&to=&channel=
 *     → { data: [{ name, qty, revenue }] }
 *   GET /channel-analytics/trend?from=&to=
 *     → { data: { days: ['YYYY-MM-DD'...], series: { '<channel>': [n...] } } }
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import {
  BarChart3, ShoppingBag, TrendingUp, Wallet, AlertCircle,
  PackageX, Clock, Percent, Layers, Trophy,
} from 'lucide-react';

// Semantic colours
const POSITIVE = '#16a34a'; // net / positive
const COST = '#ef4444';     // commission / cost
const NEUTRAL = '#64748b';  // neutral

// Stable per-channel accent dots. Falls back to a hashed palette for unknown channels.
const CHANNEL_COLORS = {
  ubereats: '#06c167',
  doordash: '#ff3008',
  deliveroo: '#00ccbc',
  swiggy: '#fc8019',
  zomato: '#e23744',
  menulog: '#ff8000',
  dinein: '#6366f1',
  qr: '#8b5cf6',
  direct: '#0ea5e9',
};
const FALLBACK_PALETTE = ['#6366f1', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#64748b'];

function channelColor(channel) {
  const key = String(channel || '').toLowerCase().replace(/[^a-z]/g, '');
  if (CHANNEL_COLORS[key]) return CHANNEL_COLORS[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

function monogram(label) {
  return String(label || '?').trim().charAt(0).toUpperCase() || '?';
}

// Default date range = last 30 days
function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

function KpiCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="rounded-xl p-5 flex items-start gap-4"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  );
}

function ChannelDot({ channel, label }) {
  const color = channelColor(channel);
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold flex-shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      {monogram(label || channel)}
    </span>
  );
}

export default function ChannelAnalyticsPage() {
  const { format, formatShort } = useCurrency();
  const [range, setRange] = useState(defaultRange);
  const [itemChannel, setItemChannel] = useState('all');

  const params = { from: range.from, to: range.to };

  const summaryQ = useQuery({
    queryKey: ['channel-analytics', 'summary', range.from, range.to],
    queryFn: () => api.get('/channel-analytics/summary', { params }).then(r => r.data),
    keepPreviousData: true,
  });

  const trendQ = useQuery({
    queryKey: ['channel-analytics', 'trend', range.from, range.to],
    queryFn: () => api.get('/channel-analytics/trend', { params }).then(r => r.data),
    keepPreviousData: true,
  });

  const itemsQ = useQuery({
    queryKey: ['channel-analytics', 'top-items', range.from, range.to, itemChannel],
    queryFn: () => api.get('/channel-analytics/top-items', {
      params: { ...params, channel: itemChannel === 'all' ? undefined : itemChannel },
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const rows = useMemo(() => {
    const r = summaryQ.data?.rows || [];
    return [...r].sort((a, b) => (b.gross || 0) - (a.gross || 0));
  }, [summaryQ.data]);

  const totals = summaryQ.data?.totals || {};
  const maxGross = useMemo(() => Math.max(1, ...rows.map(r => r.gross || 0)), [rows]);

  const updateRange = (key) => (e) => setRange(prev => ({ ...prev, [key]: e.target.value }));

  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
  const fmtNum = (v) => Number(v || 0).toLocaleString();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <BarChart3 className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            Channel Analytics
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Sales performance across delivery aggregators, dine-in, QR and direct orders
          </p>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>From</span>
            <input type="date" value={range.from} max={range.to} onChange={updateRange('from')}
              className="px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>To</span>
            <input type="date" value={range.to} min={range.from} onChange={updateRange('to')}
              className="px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </label>
        </div>
      </div>

      {/* Summary error */}
      {summaryQ.isError && (
        <div className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'color-mix(in srgb, #ef4444 8%, transparent)', border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: COST }} />
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {summaryQ.error?.message || 'Unable to load channel analytics'}
          </span>
        </div>
      )}

      {/* KPI cards */}
      {summaryQ.isLoading ? (
        <Spinner />
      ) : !summaryQ.isError && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Orders" icon={ShoppingBag} color="var(--accent)"
              value={fmtNum(totals.orders)} sub={`${rows.length} channels`} />
            <KpiCard label="Gross Sales" icon={TrendingUp} color="var(--accent)"
              value={format(totals.gross)} />
            <KpiCard label="Commission" icon={Percent} color={COST}
              value={format(totals.commission_amount)} sub="aggregator fees" />
            <KpiCard label="Net Revenue" icon={Wallet} color={POSITIVE}
              value={format(totals.net)} sub="after commission" />
          </div>

          {/* Empty state */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 rounded-xl"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <Layers className="w-10 h-10" style={{ color: NEUTRAL }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No channel data for this range</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Try widening the date range above</p>
            </div>
          ) : (
            <>
              {/* Per-channel table */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <Layers className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Performance by Channel</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-secondary)' }}>
                        <th className="text-left font-medium px-5 py-2.5">Channel</th>
                        <th className="text-right font-medium px-3 py-2.5">Orders</th>
                        <th className="text-right font-medium px-3 py-2.5">Gross</th>
                        <th className="text-right font-medium px-3 py-2.5">AOV</th>
                        <th className="text-right font-medium px-3 py-2.5">Cancel %</th>
                        <th className="text-right font-medium px-3 py-2.5">Avg Prep</th>
                        <th className="text-right font-medium px-3 py-2.5">Comm %</th>
                        <th className="text-right font-medium px-3 py-2.5">Commission</th>
                        <th className="text-right font-medium px-5 py-2.5">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.channel}
                          style={{ borderTop: '1px solid var(--border)' }}
                          className="transition-colors hover:[background:var(--bg-hover)]">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <ChannelDot channel={row.channel} label={row.label} />
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {row.label || row.channel}
                              </span>
                            </div>
                          </td>
                          <td className="text-right px-3 py-3" style={{ color: 'var(--text-primary)' }}>{fmtNum(row.orders)}</td>
                          <td className="text-right px-3 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{format(row.gross)}</td>
                          <td className="text-right px-3 py-3" style={{ color: 'var(--text-secondary)' }}>{format(row.aov)}</td>
                          <td className="text-right px-3 py-3"
                            style={{ color: (row.cancel_rate || 0) > 0 ? COST : 'var(--text-secondary)' }}>
                            {fmtPct(row.cancel_rate)}
                          </td>
                          <td className="text-right px-3 py-3" style={{ color: 'var(--text-secondary)' }}>
                            <span className="inline-flex items-center gap-1 justify-end">
                              <Clock className="w-3 h-3" style={{ color: NEUTRAL }} />
                              {Number(row.avg_prep_min || 0).toFixed(0)}m
                            </span>
                          </td>
                          <td className="text-right px-3 py-3" style={{ color: 'var(--text-secondary)' }}>{fmtPct(row.commission_pct)}</td>
                          <td className="text-right px-3 py-3" style={{ color: COST }}>
                            {(row.commission_amount || 0) > 0 ? `-${format(row.commission_amount)}` : format(0)}
                          </td>
                          <td className="text-right px-5 py-3 font-semibold" style={{ color: POSITIVE }}>{format(row.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-primary)' }}>
                        <td className="px-5 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>Total</td>
                        <td className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtNum(totals.orders)}</td>
                        <td className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{format(totals.gross)}</td>
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3" />
                        <td className="px-3 py-3" />
                        <td className="text-right px-3 py-3 font-semibold" style={{ color: COST }}>
                          {(totals.commission_amount || 0) > 0 ? `-${format(totals.commission_amount)}` : format(0)}
                        </td>
                        <td className="text-right px-5 py-3 font-bold" style={{ color: POSITIVE }}>{format(totals.net)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Gross share bars */}
              <div className="rounded-xl p-5 space-y-4"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Gross Sales by Channel</h3>
                </div>
                <div className="space-y-3">
                  {rows.map((row) => {
                    const pct = ((row.gross || 0) / maxGross) * 100;
                    const share = totals.gross ? ((row.gross || 0) / totals.gross) * 100 : 0;
                    return (
                      <div key={row.channel} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <ChannelDot channel={row.channel} label={row.label} />
                            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.label || row.channel}</span>
                          </div>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {format(row.gross)} <span style={{ color: NEUTRAL }}>· {share.toFixed(0)}%</span>
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(2, pct)}%`, background: 'var(--accent)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom grid: top items + trend */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top items */}
                <div className="rounded-xl p-5 space-y-4"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                      <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Top Items</h3>
                    </div>
                    <select value={itemChannel} onChange={(e) => setItemChannel(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                      <option value="all">All Channels</option>
                      {rows.map((row) => (
                        <option key={row.channel} value={row.channel}>{row.label || row.channel}</option>
                      ))}
                    </select>
                  </div>

                  {itemsQ.isLoading ? (
                    <Spinner />
                  ) : itemsQ.isError ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: COST }}>
                      <AlertCircle className="w-4 h-4" /> {itemsQ.error?.message || 'Failed to load items'}
                    </div>
                  ) : (itemsQ.data || []).length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <PackageX className="w-8 h-8" style={{ color: NEUTRAL }} />
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No items for this selection</p>
                    </div>
                  ) : (
                    <ol className="space-y-1">
                      {(itemsQ.data || []).map((item, i) => (
                        <li key={`${item.name}-${i}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                          style={{ background: 'var(--bg-primary)' }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-semibold w-5 text-right flex-shrink-0" style={{ color: NEUTRAL }}>{i + 1}</span>
                            <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtNum(item.qty)} sold</span>
                            <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>{format(item.revenue)}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Trend strip */}
                <div className="rounded-xl p-5 space-y-4"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Daily Gross Trend</h3>
                  </div>
                  {trendQ.isLoading ? (
                    <Spinner />
                  ) : trendQ.isError ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: COST }}>
                      <AlertCircle className="w-4 h-4" /> {trendQ.error?.message || 'Failed to load trend'}
                    </div>
                  ) : !(trendQ.data?.days?.length) ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <BarChart3 className="w-8 h-8" style={{ color: NEUTRAL }} />
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No trend data</p>
                    </div>
                  ) : (
                    <TrendStrip trend={trendQ.data} rows={rows} formatShort={formatShort} />
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Lightweight CSS sparkline-ish: total daily gross summed across all channel series.
function TrendStrip({ trend, rows, formatShort }) {
  const labelByChannel = useMemo(() => {
    const m = {};
    rows.forEach(r => { m[r.channel] = r.label || r.channel; });
    return m;
  }, [rows]);

  const days = trend.days || [];
  const series = trend.series || {};

  const dailyTotals = useMemo(() => {
    return days.map((_, idx) =>
      Object.values(series).reduce((sum, arr) => sum + Number(arr?.[idx] || 0), 0)
    );
  }, [days, series]);

  const max = Math.max(1, ...dailyTotals);
  const peak = dailyTotals.reduce((a, b) => Math.max(a, b), 0);
  const sum = dailyTotals.reduce((a, b) => a + b, 0);
  const channelCount = Object.keys(series).length;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-[3px] h-28">
        {dailyTotals.map((v, i) => {
          const h = (v / max) * 100;
          return (
            <div key={days[i] || i} className="flex-1 flex flex-col justify-end group relative"
              title={`${days[i]}: ${formatShort(v)}`}>
              <div className="w-full rounded-t transition-all"
                style={{ height: `${Math.max(2, h)}%`, background: 'var(--accent)' }} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px]" style={{ color: NEUTRAL }}>
        <span>{days[0]}</span>
        <span>{days[days.length - 1]}</span>
      </div>
      <div className="flex items-center gap-4 text-xs pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="pt-2" style={{ color: 'var(--text-secondary)' }}>
          Peak day <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatShort(peak)}</span>
        </span>
        <span className="pt-2" style={{ color: 'var(--text-secondary)' }}>
          Period total <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatShort(sum)}</span>
        </span>
        <span className="pt-2" style={{ color: 'var(--text-secondary)' }}>
          {channelCount} {channelCount === 1 ? 'channel' : 'channels'}
        </span>
      </div>
    </div>
  );
}
