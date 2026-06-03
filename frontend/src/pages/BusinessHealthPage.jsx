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
  HeartPulse, TrendingUp, CreditCard, Wallet, Users, Gift, Receipt,
  AlertTriangle, CheckCircle2, RefreshCw, DollarSign, Percent, Clock,
  Info,
} from 'lucide-react';

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const fmt = n => '$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = n => `${Number(n || 0).toFixed(1)}%`;

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
const TODAY = () => new Date().toISOString().split('T')[0];

const RANGES = [
  { key: 7, label: '7d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
];

/* ── Reusable Card / StatCard ──────────────────────────────────────────────── */
function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ background: 'var(--bg-card, var(--bg-secondary))', borderColor: 'var(--border)', ...style }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, color, icon: Icon, subtext }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          <p className="text-2xl font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
          {subtext && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{subtext}</p>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── Connection chip ───────────────────────────────────────────────────────── */
function ConnChip({ label, connected }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
      style={{
        borderColor: connected ? 'rgba(22,163,74,0.35)' : 'var(--border)',
        background: connected ? 'rgba(22,163,74,0.10)' : 'var(--bg-primary)',
        color: connected ? '#16a34a' : 'var(--text-secondary)',
      }}
    >
      {connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
      {label} {connected ? '✓' : '✗'}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
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
    queryFn: () => api.get(`/performance/health?from=${from}&to=${to}`).then(r => r.data.data),
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
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
        <span className="ml-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Loading business health…</span>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────────────── */
  if (isError) {
    return (
      <div className="max-w-7xl mx-auto">
        <Card className="p-8 flex flex-col items-center text-center gap-4">
          <AlertTriangle className="w-10 h-10" style={{ color: '#dc2626' }} />
          <div>
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Couldn’t load business health</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {error?.response?.data?.message || error?.message || 'Unexpected error'}
            </p>
          </div>
          <button onClick={() => refetch()} className="btn-primary btn-sm">
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
  const alerts = data?.alerts || [];
  const trends = data?.trends || [];
  const paymentMix = sq.payment_mix || [];
  const topItems = sq.top_items || [];
  const currency = data?.currency || 'AUD';

  const trendMax = Math.max(...trends.map(t => Number(t.gross_sales || 0)), 1);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#dc262618' }}>
            <HeartPulse className="w-6 h-6" style={{ color: '#dc2626' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Business Health</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Square + Xero combined performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Range selector */}
          <div className="inline-flex gap-1 p-1 rounded-lg border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            {RANGES.map(r => {
              const active = rangeDays === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setRangeDays(r.key)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150"
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
          {/* Refresh */}
          <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} className="btn-secondary btn-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshMut.isPending ? 'animate-spin' : ''}`} />
            {refreshMut.isPending ? 'Pulling Square data…' : 'Refresh data'}
          </button>
        </div>
      </div>

      {/* ── Connection chips ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <ConnChip label="Square" connected={squareConnected} />
        <ConnChip label="Xero" connected={xeroConnected} />
        {data?.period && (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {data.period.from} → {data.period.to} · {data.period.days} days · {currency}
          </span>
        )}
      </div>

      {/* ── Headline / connect prompt ───────────────────────────────────────── */}
      {!squareConnected ? (
        <Card className="p-6" style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(124,58,237,0.10))' }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <CreditCard className="w-9 h-9 flex-shrink-0" style={{ color: '#0ea5e9' }} />
            <div className="flex-1">
              <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Connect Square to see your business health</p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Once connected, we’ll pull payments, payouts, labor and loyalty to compute your true performance.
              </p>
            </div>
            <a href="#/au-integrations" className="btn-primary btn-sm whitespace-nowrap">Connect Square</a>
          </div>
        </Card>
      ) : (
        <Card className="p-6" style={{ background: 'linear-gradient(135deg, rgba(22,163,74,0.14), rgba(14,165,233,0.10))' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-secondary)' }}>Headline</p>
          <p className="text-xl sm:text-2xl font-extrabold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {data?.headline || 'Your business performance summary will appear here.'}
          </p>
        </Card>
      )}

      {/* ── KPI grid (only when Square connected) ───────────────────────────── */}
      {squareConnected && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="True Net Profit"
              value={fmt(kpis.true_net_profit)}
              color="#16a34a"
              icon={TrendingUp}
              subtext={`${pct(kpis.margin_pct)} margin`}
            />
            <StatCard
              label="Card Fees"
              value={fmt(sq.fees)}
              color="#dc2626"
              icon={Percent}
              subtext={`${pct(kpis.fee_leakage_pct)} of profit`}
            />
            <StatCard
              label="Gross Sales"
              value={fmt(sq.gross_sales)}
              color="#0ea5e9"
              icon={DollarSign}
              subtext={`${Number(sq.payments_count || 0).toLocaleString('en-AU')} txns`}
            />
            <StatCard
              label="Avg Ticket"
              value={fmt(sq.avg_ticket)}
              color="#0ea5e9"
              icon={Receipt}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Cash Forecast"
              value={fmt(kpis.cash_forecast)}
              color="#16a34a"
              icon={Wallet}
              subtext={kpis.break_even_daily != null ? `Break-even ${fmt(kpis.break_even_daily)}/day` : undefined}
            />
            <StatCard
              label="Labor %"
              value={kpis.labor_pct != null ? pct(kpis.labor_pct) : '—'}
              color="#dc2626"
              icon={Clock}
              subtext={sq.labor_hours != null ? `${Number(sq.labor_hours || 0).toLocaleString('en-AU')} hrs` : undefined}
            />
            <StatCard
              label="Loyalty Members"
              value={Number(sq.loyalty_members || 0).toLocaleString('en-AU')}
              color="#7c3aed"
              icon={Users}
              subtext={sq.customers_count != null ? `${Number(sq.customers_count || 0).toLocaleString('en-AU')} customers` : undefined}
            />
            <StatCard
              label="Gift Card Liability"
              value={fmt(sq.giftcard_outstanding)}
              color="#7c3aed"
              icon={Gift}
            />
          </div>
        </>
      )}

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const level = a?.level || 'info';
            const cfg = level === 'good'
              ? { color: '#16a34a', bg: 'rgba(22,163,74,0.10)', Icon: CheckCircle2 }
              : level === 'warn'
              ? { color: '#d97706', bg: 'rgba(217,119,6,0.10)', Icon: AlertTriangle }
              : { color: '#64748b', bg: 'rgba(100,116,139,0.10)', Icon: Info };
            const Icon = cfg.Icon;
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                style={{ background: cfg.bg, borderColor: 'var(--border)' }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a?.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Payment mix + Top items ─────────────────────────────────────────── */}
      {squareConnected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment mix */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4" style={{ color: '#0ea5e9' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Payment Mix</h3>
            </div>
            {paymentMix.length === 0 ? (
              <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No payment breakdown available.</p>
            ) : (
              <div className="space-y-3">
                {paymentMix.map((p, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{p.brand || 'Other'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(p.amount)}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(14,165,233,0.12)', color: '#0ea5e9' }}>{pct(p.pct)}</span>
                      </div>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(Number(p.pct || 0), 100)}%`, background: 'linear-gradient(90deg, #0ea5e9, #0284c7)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Top items */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-4 h-4" style={{ color: '#7c3aed' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Top Items</h3>
            </div>
            {topItems.length === 0 ? (
              <p className="text-xs py-8 text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                No itemised data — merchant may use Square for payments only.
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {topItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: i < 3 ? '#7c3aed' : 'var(--bg-primary)', color: i < 3 ? '#fff' : 'var(--text-secondary)' }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{it.name || 'Item'}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{Number(it.qty || 0).toLocaleString('en-AU')} sold</p>
                    </div>
                    <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmt(it.gross)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Xero financial strip ────────────────────────────────────────────── */}
      {xero ? (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4" style={{ color: '#16a34a' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Xero Financials</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Revenue" value={fmt(xero.revenue)} color="#16a34a" icon={TrendingUp} />
            <StatCard label="Expenses" value={fmt(xero.expenses)} color="#dc2626" icon={Receipt} />
            <StatCard label="COGS" value={fmt(xero.cogs)} color="#d97706" icon={Receipt} />
            <StatCard label="Net Profit" value={fmt(xero.net_profit)} color="#16a34a" icon={TrendingUp} />
            <StatCard label="Bills Due" value={fmt(xero.bills_due)} color="#dc2626" icon={Wallet} />
            <StatCard label="GST Estimate" value={fmt(xero.gst_estimate)} color="#0ea5e9" icon={Percent} />
          </div>
          {xero.cash != null && (
            <p className="text-xs mt-4" style={{ color: 'var(--text-secondary)' }}>
              Bank cash on hand: <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(xero.cash)}</span>
            </p>
          )}
        </Card>
      ) : (
        <Card className="p-6 flex flex-col sm:flex-row sm:items-center gap-4" style={{ opacity: 0.95 }}>
          <Wallet className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Connect Xero to unlock true profit & cash-flow analytics</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              We’ll reconcile Square payouts against bank deposits and surface real margins.
            </p>
          </div>
          <a href="#/au-integrations" className="btn-secondary btn-sm whitespace-nowrap">Connect Xero</a>
        </Card>
      )}

      {/* ── Reconciliation ──────────────────────────────────────────────────── */}
      {recon && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4" style={{ color: '#0ea5e9' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Payout Reconciliation</h3>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{
                background: recon.match ? 'rgba(22,163,74,0.10)' : 'rgba(217,119,6,0.10)',
                color: recon.match ? '#16a34a' : '#d97706',
              }}
            >
              {recon.match ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {recon.match ? 'Matched' : 'Mismatch'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Square Payouts</p>
              <p className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{fmt(recon.square_payouts)}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Xero Bank Deposits</p>
              <p className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{fmt(recon.xero_bank_deposits)}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Difference</p>
              <p className="text-xl font-extrabold" style={{ color: recon.match ? '#16a34a' : '#dc2626' }}>{fmt(recon.diff)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Trend mini-chart ────────────────────────────────────────────────── */}
      {squareConnected && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4" style={{ color: '#16a34a' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Gross Sales Trend</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Daily gross sales across the selected period</p>
          {trends.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No trend data for this period.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {trends.map((t, i) => {
                const h = Math.max((Number(t.gross_sales || 0) / trendMax) * 100, 2);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${t.date}: ${fmt(t.gross_sales)} gross · ${fmt(t.net_profit)} net`}>
                    <div
                      className="w-full rounded-t-md transition-all duration-500"
                      style={{ height: `${h}%`, background: 'linear-gradient(180deg, #22c55e, #16a34a)', minHeight: '2px' }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {trends.length > 0 && (
            <div className="flex justify-between mt-2">
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{trends[0]?.date}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{trends[trends.length - 1]?.date}</span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
