/**
 * BusinessHealthPage — combined Square + Xero performance dashboard
 * Route: /business-health
 * Data: GET /performance/health, POST /performance/refresh, GET /performance/status
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  TrendingUp, CreditCard, Wallet, Users, Gift, Receipt, Landmark,
  AlertTriangle, CheckCircle2, RefreshCw, Percent, Clock, Info, ArrowRight,
  Tag, Package, UserCheck, PieChart, Banknote,
} from 'lucide-react';

/* ── Formatting helpers ────────────────────────────────────────────────────── */
const fmt = n => '$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num = n => Number(n || 0).toLocaleString('en-AU');
const pct = n => `${Number(n || 0).toFixed(1)}%`;

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
const TODAY = () => new Date().toISOString().split('T')[0];
const fmtDate = s => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};

const RANGES = [
  { key: 7, label: '7D' },
  { key: 30, label: '30D' },
  { key: 90, label: '90D' },
];

/* ── Primitives ────────────────────────────────────────────────────────────── */
function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{ background: 'var(--bg-card, var(--bg-secondary))', borderColor: 'var(--border)', ...style }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, right }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {right}
    </div>
  );
}

/* Neutral, enterprise-style metric tile. Color is reserved for the delta line. */
function Metric({ label, value, icon: Icon, deltaText, deltaTone = 'neutral' }) {
  const toneColor = deltaTone === 'up' ? '#16a34a' : deltaTone === 'down' ? '#dc2626' : 'var(--text-secondary)';
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {Icon && <Icon className="w-4 h-4" style={{ color: 'var(--text-secondary)', opacity: 0.55 }} />}
      </div>
      <p className="mt-2.5 text-[26px] leading-none font-semibold tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
      {deltaText && (
        <p className="mt-2 text-xs font-medium tabular-nums" style={{ color: toneColor }}>{deltaText}</p>
      )}
    </Card>
  );
}

function StatusDot({ label, connected }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: connected ? '#16a34a' : 'var(--text-secondary)', opacity: connected ? 1 : 0.45 }}
      />
      {label}
      <span style={{ color: connected ? '#16a34a' : 'var(--text-secondary)' }}>{connected ? 'Connected' : 'Not connected'}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function BusinessHealthPage() {
  const qc = useQueryClient();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;

  const [rangeDays, setRangeDays] = useState(30);
  const from = isoDaysAgo(rangeDays);
  const to = TODAY();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['performance-health', outletId, from, to],
    queryFn: () => api.get(`/performance/health?from=${from}&to=${to}`).then(r => r.data),
    staleTime: 120_000,
  });

  const refreshMut = useMutation({
    mutationFn: () => api.post('/performance/refresh').then(r => r.data),
    onSettled: (res, err) => {
      if (err) {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to pull Square data');
      } else {
        const days = res?.data?.days_pulled ?? res?.days_pulled;
        toast.success(days != null ? `Pulled ${days} day(s) of Square data` : 'Square data refreshed');
      }
      qc.invalidateQueries({ queryKey: ['performance-health'] });
    },
  });

  /* ── Loading ─────────────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
        <span className="ml-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading business health…</span>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────────────── */
  if (isError) {
    return (
      <div className="max-w-7xl mx-auto">
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <AlertTriangle className="w-8 h-8" style={{ color: '#dc2626' }} />
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Couldn’t load business health</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {error?.response?.data?.message || error?.message || 'Unexpected error'}
            </p>
          </div>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </Card>
      </div>
    );
  }

  /* ── Derived (defensive) ─────────────────────────────────────────────────── */
  const avail = data?.data_availability || {};
  const squareConnected = !!avail.square_connected;
  const xeroConnected = !!avail.xero_connected;
  const sq = data?.square || {};
  const xero = data?.xero || null;
  const kpis = data?.kpis || {};
  const recon = data?.reconciliation || null;
  const ops = data?.operations || {};
  const alerts = data?.alerts || [];
  const trends = data?.trends || [];
  const paymentMix = sq.payment_mix || [];
  const topItems = sq.top_items || [];
  const currency = data?.currency || 'AUD';
  const trendMax = Math.max(...trends.map(t => Number(t.gross_sales || 0)), 1);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Business Health</h1>
          <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Combined performance across Square payments and Xero financials
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {RANGES.map(r => {
              const active = rangeDays === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setRangeDays(r.key)}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? 'var(--accent-text, #fff)' : 'var(--text-secondary)',
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} className="btn-secondary btn-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshMut.isPending ? 'animate-spin' : ''}`} />
            {refreshMut.isPending ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Context bar: connection + period ────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-x-5 gap-y-2 pb-1">
        <div className="flex items-center gap-5">
          <StatusDot label="Square" connected={squareConnected} />
          <StatusDot label="Xero" connected={xeroConnected} />
        </div>
        {data?.period && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {fmtDate(data.period.from)} – {fmtDate(data.period.to)} · {data.period.days} days · {currency}
          </span>
        )}
      </div>

      {/* ── Not connected → primary empty state ─────────────────────────────── */}
      {!squareConnected && (
        <Card className="px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 max-w-3xl">
            <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
              <CreditCard className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Connect Square to begin</p>
              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Once connected, payments, payouts, labour and loyalty are pulled automatically and combined with
                your Xero financials to compute true profit, margins and cash flow.
              </p>
            </div>
            <a href="#/au-integrations" className="btn-primary btn-sm whitespace-nowrap">
              Connect Square <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </Card>
      )}

      {squareConnected && (
        <>
          {/* ── Summary line ──────────────────────────────────────────────── */}
          {data?.headline && (
            <div className="flex items-start gap-2.5 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{data.headline}</p>
            </div>
          )}

          {/* ── Primary KPIs ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="True Net Profit" value={fmt(kpis.true_net_profit)} icon={TrendingUp}
              deltaText={`${pct(kpis.margin_pct)} net margin`} deltaTone={Number(kpis.margin_pct) >= 0 ? 'up' : 'down'} />
            <Metric label="Gross Sales" value={fmt(sq.gross_sales)} icon={Receipt}
              deltaText={`${num(sq.payments_count)} transactions`} />
            <Metric label="Card Fees" value={fmt(sq.fees)} icon={Percent}
              deltaText={`${pct(kpis.fee_leakage_pct)} of profit`} deltaTone="down" />
            <Metric label="Avg Ticket" value={fmt(sq.avg_ticket)} icon={CreditCard} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Cash Forecast" value={fmt(kpis.cash_forecast)} icon={Wallet}
              deltaText={kpis.break_even_daily != null ? `Break-even ${fmt(kpis.break_even_daily)}/day` : undefined} />
            <Metric label="Labour Cost" value={kpis.labor_pct != null ? pct(kpis.labor_pct) : '—'} icon={Clock}
              deltaText={sq.labor_hours != null ? `${num(sq.labor_hours)} hours` : undefined} />
            <Metric label="Loyalty Members" value={num(sq.loyalty_members)} icon={Users}
              deltaText={sq.customers_count != null ? `${num(sq.customers_count)} customers` : undefined} />
            <Metric label="Gift Card Liability" value={fmt(sq.giftcard_outstanding)} icon={Gift} />
          </div>

          {/* ── Insights ──────────────────────────────────────────────────── */}
          {alerts.length > 0 && (
            <Card>
              <SectionHeader title="Insights" />
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {alerts.map((a, i) => {
                  const level = a?.level || 'info';
                  const color = level === 'good' ? '#16a34a' : level === 'warn' ? '#d97706' : 'var(--text-secondary)';
                  const Icon = level === 'good' ? CheckCircle2 : level === 'warn' ? AlertTriangle : Info;
                  return (
                    <div key={i} className="flex items-center gap-3 px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                      <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                      <span className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{a?.text}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Payment mix + Top items ───────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <SectionHeader title="Payment Mix" />
              <div className="p-5">
                {paymentMix.length === 0 ? (
                  <p className="text-xs py-6 text-center" style={{ color: 'var(--text-secondary)' }}>No payment breakdown available.</p>
                ) : (
                  <div className="space-y-3.5">
                    {paymentMix.map((p, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{p.brand || 'Other'}</span>
                          <span className="text-[13px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                            {fmt(p.amount)} · {pct(p.pct)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(Number(p.pct || 0), 100)}%`, background: 'var(--accent)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Top Items" />
              <div className="px-5">
                {topItems.length === 0 ? (
                  <p className="text-xs py-6 text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    No itemised data — this merchant may use Square for payments only.
                  </p>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {topItems.map((it, i) => (
                      <div key={i} className="flex items-center gap-3 py-3" style={{ borderColor: 'var(--border)' }}>
                        <span className="text-xs font-semibold tabular-nums w-4 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{it.name || 'Item'}</p>
                          <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{num(it.qty)} sold</p>
                        </div>
                        <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmt(it.gross)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ── Gross sales trend ─────────────────────────────────────────── */}
          <Card>
            <SectionHeader
              title="Gross Sales Trend"
              right={<span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>Peak {fmt(trendMax)}</span>}
            />
            <div className="p-5">
              {trends.length === 0 ? (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--text-secondary)' }}>No trend data for this period.</p>
              ) : (
                <>
                  <div className="flex items-end gap-[3px] h-36 border-b" style={{ borderColor: 'var(--border)' }}>
                    {trends.map((t, i) => {
                      const h = Math.max((Number(t.gross_sales || 0) / trendMax) * 100, 1.5);
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm transition-[height] duration-300 hover:opacity-80"
                          style={{ height: `${h}%`, background: 'var(--accent)', opacity: 0.85, minHeight: '2px' }}
                          title={`${fmtDate(t.date)} · ${fmt(t.gross_sales)} gross · ${fmt(t.net_profit)} net`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmtDate(trends[0]?.date)}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmtDate(trends[trends.length - 1]?.date)}</span>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* ── Order Economics ───────────────────────────────────────────── */}
          {ops.order_economics?.available && (() => {
            const oe = ops.order_economics;
            const channels = oe.channel_mix || [];
            const dayparts = oe.daypart || [];
            const chMax = Math.max(...channels.map(x => Number(x.amount || 0)), 1);
            const dpMax = Math.max(...dayparts.map(x => Number(x.amount || 0)), 1);
            return (
              <Card>
                <SectionHeader title="Order Economics" />
                <div className="p-5 space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ['Discounts Given', fmt(oe.discounts_total), Tag],
                      ['Returns / Refunds', fmt(oe.returns_total), Receipt],
                      ['Orders', num(oe.orders_count), Receipt],
                    ].map(([label, value, Icon], i) => (
                      <div key={i} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                          <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)', opacity: 0.55 }} />
                        </div>
                        <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Sales by Channel</p>
                      {channels.length === 0 ? (
                        <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No channel data.</p>
                      ) : (
                        <div className="space-y-3.5">
                          {channels.map((c, i) => (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{c.channel || 'Other'}</span>
                                <span className="text-[13px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(c.amount)} · {num(c.count)}</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                                <div className="h-full rounded-full" style={{ width: `${Math.min((Number(c.amount || 0) / chMax) * 100, 100)}%`, background: 'var(--accent)' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Sales by Daypart</p>
                      {dayparts.length === 0 ? (
                        <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No daypart data.</p>
                      ) : (
                        <div className="space-y-3.5">
                          {dayparts.map((d, i) => (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{d.part || 'Other'}</span>
                                <span className="text-[13px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmt(d.amount)}</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                                <div className="h-full rounded-full" style={{ width: `${Math.min((Number(d.amount || 0) / dpMax) * 100, 100)}%`, background: 'var(--accent)' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* ── Menu & Inventory ──────────────────────────────────────────── */}
          {(ops.catalog?.available || ops.inventory?.available) && (() => {
            const cat = ops.catalog || {};
            const inv = ops.inventory || {};
            const lowStock = inv.low_stock || [];
            const topCategories = cat.top_categories || [];
            const stats = [];
            if (cat.available) {
              stats.push(['Menu Items', num(cat.total_items), Package]);
              stats.push(['Categories', num(cat.total_categories), Tag]);
              stats.push(['Modifier Groups', num(cat.total_modifiers), Tag]);
            }
            if (inv.available) stats.push(['Out of Stock', num(inv.out_of_stock), AlertTriangle]);
            return (
              <Card>
                <SectionHeader title="Menu & Inventory" />
                <div className="p-5 space-y-6">
                  {stats.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {stats.map(([label, value, Icon], i) => (
                        <div key={i} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                            <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)', opacity: 0.55 }} />
                          </div>
                          <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {lowStock.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Low stock</p>
                        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                          {lowStock.map((s, i) => (
                            <div key={i} className="flex items-center justify-between py-2.5" style={{ borderColor: 'var(--border)' }}>
                              <span className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name || 'Item'}</span>
                              <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{num(s.qty)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {topCategories.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Top categories</p>
                        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                          {topCategories.map((c, i) => (
                            <div key={i} className="flex items-center justify-between py-2.5" style={{ borderColor: 'var(--border)' }}>
                              <span className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name || 'Category'}</span>
                              <span className="text-[13px] tabular-nums flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{num(c.item_count)} items</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* ── Staff Performance ─────────────────────────────────────────── */}
          {ops.staff?.available && (() => {
            const topStaff = ops.staff.top_staff || [];
            return (
              <Card>
                <SectionHeader title="Staff Performance" />
                <div className="px-5">
                  {topStaff.length === 0 ? (
                    <p className="text-xs py-6 text-center" style={{ color: 'var(--text-secondary)' }}>No staff sales data.</p>
                  ) : (
                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {topStaff.map((s, i) => (
                        <div key={i} className="flex items-center gap-3 py-3" style={{ borderColor: 'var(--border)' }}>
                          <span className="text-xs font-semibold tabular-nums w-4 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name || 'Staff'}</p>
                            <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>{num(s.orders)} orders · {fmt(s.tips)} tips</p>
                          </div>
                          <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmt(s.sales)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })()}

          {/* ── Customer Segments ─────────────────────────────────────────── */}
          {ops.rfm?.available && (() => {
            const segments = ops.rfm.segments || [];
            return (
              <Card>
                <SectionHeader
                  title="Customer Segments"
                  right={<span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{num(ops.rfm.total_customers)} customers</span>}
                />
                <div className="p-5">
                  {segments.length === 0 ? (
                    <p className="text-xs py-6 text-center" style={{ color: 'var(--text-secondary)' }}>No segment data.</p>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {segments.map((s, i) => (
                        <div key={i} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)', opacity: 0.6 }} />
                            <span className="text-[11px] font-medium uppercase tracking-wide truncate" style={{ color: 'var(--text-secondary)' }}>{s.segment || 'Segment'}</span>
                          </div>
                          <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>{num(s.count)}</p>
                          <p className="mt-1 text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)' }}>Avg {fmt(s.avg_spend)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })()}

          {/* ── Cash Drawer ───────────────────────────────────────────────── */}
          {ops.cash_drawer?.available && (() => {
            const cd = ops.cash_drawer;
            const overShort = Number(cd.over_short || 0);
            return (
              <Card>
                <SectionHeader title="Cash Drawer" />
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y" style={{ borderColor: 'var(--border)' }}>
                  {[
                    ['Shifts', num(cd.shifts), 'var(--text-primary)'],
                    ['Expected', fmt(cd.expected_total), 'var(--text-primary)'],
                    ['Counted', fmt(cd.actual_total), 'var(--text-primary)'],
                    ['Over / Short', fmt(cd.over_short), overShort >= 0 ? '#16a34a' : '#dc2626'],
                  ].map(([label, value, color], i) => (
                    <div key={i} className="px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })()}
        </>
      )}

      {/* ── Xero financials ─────────────────────────────────────────────────── */}
      {xero ? (
        <Card>
          <SectionHeader
            title="Xero Financials"
            right={xero.cash != null && (
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                Bank cash <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(xero.cash)}</span>
              </span>
            )}
          />
          <div className="grid grid-cols-2 lg:grid-cols-3 divide-x divide-y" style={{ borderColor: 'var(--border)' }}>
            {[
              ['Revenue', xero.revenue],
              ['Expenses', xero.expenses],
              ['COGS', xero.cogs],
              ['Net Profit', xero.net_profit],
              ['Bills Due', xero.bills_due],
              ['GST Estimate', xero.gst_estimate],
            ].map(([label, val], i) => (
              <div key={i} className="px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmt(val)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <Landmark className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Connect Xero for true profit & cash flow</p>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Reconcile Square payouts against bank deposits and surface real margins, expenses and GST.
            </p>
          </div>
          <a href="#/au-integrations" className="btn-secondary btn-sm whitespace-nowrap">Connect Xero</a>
        </Card>
      )}

      {/* ── Reconciliation ──────────────────────────────────────────────────── */}
      {recon && (
        <Card>
          <SectionHeader
            title="Payout Reconciliation"
            right={
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold"
                style={{ background: recon.match ? 'rgba(22,163,74,0.10)' : 'rgba(217,119,6,0.12)', color: recon.match ? '#16a34a' : '#d97706' }}
              >
                {recon.match ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {recon.match ? 'Matched' : 'Mismatch'}
              </span>
            }
          />
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
            {[
              ['Square Payouts', recon.square_payouts, 'var(--text-primary)'],
              ['Xero Bank Deposits', recon.xero_bank_deposits, 'var(--text-primary)'],
              ['Difference', recon.diff, recon.match ? '#16a34a' : '#dc2626'],
            ].map(([label, val, color], i) => (
              <div key={i} className="px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight" style={{ color }}>{fmt(val)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
