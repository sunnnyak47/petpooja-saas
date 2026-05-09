/**
 * XeroAnalyticsPage — Financial Analytics powered by Xero
 * Route: /xero-analytics
 * Tabs: Overview, P&L, Expenses, Labour, Seasonal
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  TrendingUp, TrendingDown, DollarSign, Percent, BarChart3,
  PieChart, Users, CalendarDays, ArrowUpRight, ArrowDownRight,
  RefreshCw, Loader2, WifiOff, CheckCircle2, AlertCircle,
  Landmark, FileText, Receipt, Building2, Tag, Wallet,
  Brain, Target, Banknote, ShieldCheck, Zap, Calculator,
  SlidersHorizontal, ChevronRight, Lightbulb, AlertTriangle,
} from 'lucide-react';

/* ── Currency helpers ──────────────────────────────────────────────────────── */
const audFull = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const audCompact = new Intl.NumberFormat('en-AU', {
  style: 'currency', currency: 'AUD',
  notation: 'compact', maximumFractionDigits: 1,
});

function fmtAUD(v) {
  if (v == null) return '$0';
  return Math.abs(v) >= 100000 ? audCompact.format(v) : audFull.format(v);
}
function fmtAUDFull(v) {
  if (v == null) return '$0.00';
  return audFull.format(v);
}
function fmtPct(v) {
  if (v == null) return '0%';
  return `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(1)}%`;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */
const TABS = [
  { key: 'overview',  label: 'Overview',     icon: BarChart3 },
  { key: 'pnl',       label: 'P&L',          icon: DollarSign },
  { key: 'expenses',  label: 'Expenses',     icon: PieChart },
  { key: 'labour',    label: 'Labour',        icon: Users },
  { key: 'seasonal',  label: 'Seasonal',     icon: CalendarDays },
  { key: 'bank',      label: 'Cash Flow',    icon: Wallet },
  { key: 'balsheet',  label: 'Balance Sheet', icon: Landmark },
  { key: 'invoices',  label: 'Invoices',     icon: FileText },
  { key: 'bas',       label: 'BAS / Tax',    icon: Receipt },
  { key: 'contacts',  label: 'Contacts',     icon: Building2 },
  { key: 'tracking',  label: 'Tracking',     icon: Tag },
  { key: 'predictions', label: 'Predictions', icon: Brain },
];

const RANGES = [
  { key: 'month',   label: 'Last Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year',    label: 'Year' },
  { key: 'all',     label: 'All Time' },
];

const EXPENSE_COLORS = {
  Labour: '#6366f1',
  'Cost of Sales': '#ef4444',
  Occupancy: '#f59e0b',
  Marketing: '#a78bfa',
  Operations: '#06b6d4',
  Admin: '#94a3b8',
  Depreciation: '#64748b',
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── Reusable Card ─────────────────────────────────────────────────────────── */
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
    <Card className="p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-extrabold tracking-tight" style={{ color }}>{value}</p>
      {subtext && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{subtext}</p>}
    </Card>
  );
}

/* ── Loading / Error states ────────────────────────────────────────────────── */
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      <span className="ml-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Loading financial data...</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle className="w-10 h-10" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message || 'No data available for this period.'}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function XeroAnalyticsPage() {
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState('all');

  /* ── API Queries ──────────────────────────────────────────────────────── */
  const { data: connection, isLoading: connLoading } = useQuery({
    queryKey: ['xero-connection'],
    queryFn: () => api.get('/xero/connection').then(r => r.data),
    staleTime: 300_000,
  });

  const { data: overview, isLoading: ovLoading, refetch: refetchOv } = useQuery({
    queryKey: ['xero-overview', range],
    queryFn: () => api.get(`/xero/overview?range=${range}`).then(r => r.data),
    enabled: tab === 'overview',
    staleTime: 120_000,
  });

  const { data: pnl, isLoading: pnlLoading } = useQuery({
    queryKey: ['xero-pnl', range],
    queryFn: () => api.get(`/xero/profit-loss?range=${range}`).then(r => r.data),
    enabled: tab === 'pnl',
    staleTime: 120_000,
  });

  const { data: expenses, isLoading: expLoading } = useQuery({
    queryKey: ['xero-expenses', range],
    queryFn: () => api.get(`/xero/expenses?range=${range}`).then(r => r.data),
    enabled: tab === 'expenses',
    staleTime: 120_000,
  });

  const { data: labour, isLoading: labLoading } = useQuery({
    queryKey: ['xero-labour', range],
    queryFn: () => api.get(`/xero/labour?range=${range}`).then(r => r.data),
    enabled: tab === 'labour',
    staleTime: 120_000,
  });

  const { data: seasonal, isLoading: seaLoading } = useQuery({
    queryKey: ['xero-seasonal', range],
    queryFn: () => api.get(`/xero/seasonal?range=${range}`).then(r => r.data),
    enabled: tab === 'seasonal',
    staleTime: 120_000,
  });

  const { data: bankData, isLoading: bankLoading } = useQuery({
    queryKey: ['xero-bank', range],
    queryFn: () => api.get(`/xero/bank-cashflow?range=${range}`).then(r => r.data),
    enabled: tab === 'bank',
    staleTime: 120_000,
  });

  const { data: balSheet, isLoading: bsLoading } = useQuery({
    queryKey: ['xero-balsheet', range],
    queryFn: () => api.get(`/xero/balance-sheet?range=${range}`).then(r => r.data),
    enabled: tab === 'balsheet',
    staleTime: 120_000,
  });

  const { data: invoiceData, isLoading: invLoading } = useQuery({
    queryKey: ['xero-invoices', range],
    queryFn: () => api.get(`/xero/invoices?range=${range}`).then(r => r.data),
    enabled: tab === 'invoices',
    staleTime: 120_000,
  });

  const { data: basData, isLoading: basLoading } = useQuery({
    queryKey: ['xero-bas'],
    queryFn: () => api.get('/xero/bas-returns').then(r => r.data),
    enabled: tab === 'bas',
    staleTime: 120_000,
  });

  const { data: contactsData, isLoading: conLoading } = useQuery({
    queryKey: ['xero-contacts'],
    queryFn: () => api.get('/xero/contacts').then(r => r.data),
    enabled: tab === 'contacts',
    staleTime: 120_000,
  });

  const { data: trackingData, isLoading: trkLoading } = useQuery({
    queryKey: ['xero-tracking', range],
    queryFn: () => api.get(`/xero/tracking?range=${range}`).then(r => r.data),
    enabled: tab === 'tracking',
    staleTime: 120_000,
  });

  const { data: predictionsData, isLoading: predLoading } = useQuery({
    queryKey: ['xero-predictions'],
    queryFn: () => api.get('/xero/predictions').then(r => r.data),
    enabled: tab === 'predictions',
    staleTime: 300_000,
  });

  const isConnected = connection?.is_connected;
  const orgName = connection?.org_name || 'Not Connected';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Financial Analytics
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Powered by Xero &middot; 3 years of financial data
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection badge */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border"
            style={{
              borderColor: isConnected ? 'rgba(34,197,94,0.3)' : 'var(--border)',
              background: isConnected ? 'rgba(34,197,94,0.08)' : 'var(--bg-secondary)',
              color: isConnected ? '#22c55e' : 'var(--text-secondary)',
            }}
          >
            {connLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{isConnected ? `Connected to ${orgName}` : 'Not Connected'}</span>
          </div>
        </div>
      </div>

      {/* ── Range selector ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150 border"
            style={{
              background: range === r.key ? 'var(--accent)' : 'var(--bg-secondary)',
              color: range === r.key ? '#fff' : 'var(--text-secondary)',
              borderColor: range === r.key ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* ── Tab selector ──────────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-1 p-1 rounded-xl border min-w-max" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap"
                style={{
                  background: active ? 'var(--bg-card, var(--bg-primary))' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      {tab === 'overview'  && <OverviewTab data={overview} loading={ovLoading} refetch={refetchOv} />}
      {tab === 'pnl'       && <PnlTab data={pnl} loading={pnlLoading} />}
      {tab === 'expenses'  && <ExpensesTab data={expenses} loading={expLoading} />}
      {tab === 'labour'    && <LabourTab data={labour} loading={labLoading} />}
      {tab === 'seasonal'  && <SeasonalTab data={seasonal} loading={seaLoading} />}
      {tab === 'bank'      && <BankCashFlowTab data={bankData} loading={bankLoading} />}
      {tab === 'balsheet'  && <BalanceSheetTab data={balSheet} loading={bsLoading} />}
      {tab === 'invoices'  && <InvoicesTab data={invoiceData} loading={invLoading} />}
      {tab === 'bas'       && <BASTab data={basData} loading={basLoading} />}
      {tab === 'contacts'  && <ContactsTab data={contactsData} loading={conLoading} />}
      {tab === 'tracking'  && <TrackingTab data={trackingData} loading={trkLoading} />}
      {tab === 'predictions' && <PredictionsTab data={predictionsData} loading={predLoading} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1: OVERVIEW                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
function OverviewTab({ data, loading, refetch }) {
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="Connect Xero to view financial overview." />;

  const summary = data?.summary || {};
  const {
    total_revenue = 0, gross_profit = 0, net_profit = 0, net_margin_pct: profit_margin = 0,
  } = summary;
  const revenue_trend = data?.revenue_trend || [];
  const expense_breakdown = data?.expense_breakdown || [];
  const yoy = data?.yoy_comparison || {};
  const yoy_current = yoy.current_year_revenue || 0;
  const yoy_previous = yoy.previous_year_revenue || 0;
  const yoy_growth = yoy.growth_pct || 0;

  const trendMax = Math.max(...revenue_trend.map(m => m.revenue || 0), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={fmtAUD(total_revenue)} color="#22c55e" icon={DollarSign} />
        <StatCard label="Gross Profit" value={fmtAUD(gross_profit)} color="#6366f1" icon={TrendingUp} />
        <StatCard label="Net Profit" value={fmtAUD(net_profit)} color="#a78bfa" icon={TrendingUp} />
        <StatCard label="Profit Margin" value={fmtPct(profit_margin)} color="#f59e0b" icon={Percent} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Revenue Trend</h3>
            <button onClick={() => refetch?.()} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {revenue_trend.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No trend data</p>
          ) : (
            <div className="space-y-2">
              {revenue_trend.map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-12 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {m.period || m.month || `M${i + 1}`}
                  </span>
                  <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{
                        width: `${Math.max((m.revenue / trendMax) * 100, 2)}%`,
                        background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-20 text-right flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {fmtAUD(m.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Expense Breakdown */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Expense Breakdown</h3>
          {expense_breakdown.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No expense data</p>
          ) : (
            <div className="space-y-3">
              {expense_breakdown.map((cat, i) => {
                const color = EXPENSE_COLORS[cat.category] || '#94a3b8';
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{cat.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(cat.amount)}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>{fmtPct(cat.pct)}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(cat.pct || 0, 100)}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* YoY Growth */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Year-over-Year Growth</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Current Year Revenue</p>
            <p className="text-xl font-extrabold" style={{ color: '#22c55e' }}>{fmtAUD(yoy_current)}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Previous Year Revenue</p>
            <p className="text-xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(yoy_previous)}</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Growth</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-extrabold" style={{ color: yoy_growth >= 0 ? '#22c55e' : '#ef4444' }}>
                {yoy_growth >= 0 ? '+' : ''}{fmtPct(yoy_growth)}
              </p>
              {yoy_growth >= 0 ? (
                <ArrowUpRight className="w-5 h-5" style={{ color: '#22c55e' }} />
              ) : (
                <ArrowDownRight className="w-5 h-5" style={{ color: '#ef4444' }} />
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2: P&L STATEMENT                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
function PnlTab({ data, loading }) {
  if (loading) return <LoadingState />;
  const months = Array.isArray(data) ? data : [];
  if (months.length === 0) return <EmptyState message="No P&L data for this period." />;

  // Compute totals from the rows
  const totals = months.reduce((acc, row) => ({
    revenue: (acc.revenue || 0) + (row.revenue || 0),
    cogs: (acc.cogs || 0) + (row.cogs || 0),
    gross_profit: (acc.gross_profit || 0) + (row.gross_profit || 0),
    labour: (acc.labour || 0) + (row.labour || 0),
    other: (acc.other || 0) + (row.other_expenses || 0),
    net_profit: (acc.net_profit || 0) + (row.net_profit || 0),
  }), {});
  totals.gp_pct = totals.revenue > 0 ? (totals.gross_profit / totals.revenue) * 100 : 0;
  totals.np_pct = totals.revenue > 0 ? (totals.net_profit / totals.revenue) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Profit & Loss Statement</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{months.length} months shown</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-primary)' }}>
              {['Month', 'Revenue', 'COGS', 'Gross Profit', 'GP%', 'Labour', 'Other', 'Net Profit', 'NP%'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((row, i) => (
              <tr
                key={i}
                style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}
              >
                <td className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{row.month_label}</td>
                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#22c55e' }}>{fmtAUDFull(row.revenue)}</td>
                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#ef4444' }}>{fmtAUDFull(row.cogs)}</td>
                <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: row.gross_profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtAUDFull(row.gross_profit)}</td>
                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{fmtPct(row.gross_margin_pct)}</td>
                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#6366f1' }}>{fmtAUDFull(row.labour)}</td>
                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{fmtAUDFull(row.other_expenses)}</td>
                <td className="px-4 py-2.5 text-xs font-bold" style={{ color: row.net_profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtAUDFull(row.net_profit)}</td>
                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: row.net_margin_pct >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPct(row.net_margin_pct)}</td>
              </tr>
            ))}
            {/* Totals row */}
            <tr style={{ background: 'var(--bg-primary)', borderTop: '2px solid var(--border)' }}>
              <td className="px-4 py-3 text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>TOTAL</td>
              <td className="px-4 py-3 text-xs font-bold" style={{ color: '#22c55e' }}>{fmtAUDFull(totals.revenue)}</td>
              <td className="px-4 py-3 text-xs font-bold" style={{ color: '#ef4444' }}>{fmtAUDFull(totals.cogs)}</td>
              <td className="px-4 py-3 text-xs font-bold" style={{ color: totals.gross_profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtAUDFull(totals.gross_profit)}</td>
              <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{fmtPct(totals.gp_pct)}</td>
              <td className="px-4 py-3 text-xs font-bold" style={{ color: '#6366f1' }}>{fmtAUDFull(totals.labour)}</td>
              <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{fmtAUDFull(totals.other)}</td>
              <td className="px-4 py-3 text-xs font-extrabold" style={{ color: totals.net_profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtAUDFull(totals.net_profit)}</td>
              <td className="px-4 py-3 text-xs font-bold" style={{ color: totals.np_pct >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPct(totals.np_pct)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3: EXPENSES                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ExpensesTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="No expense data for this period." />;

  const { by_category = [], by_supplier: top_suppliers = [] } = data;
  const catMax = Math.max(...by_category.map(c => c.amount || 0), 1);
  const supplierMax = Math.max(...top_suppliers.map(s => s.total_spend || 0), 1);

  return (
    <div className="space-y-6">
      {/* By Category */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-5" style={{ color: 'var(--text-primary)' }}>Expenses by Category</h3>
        {by_category.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No category data</p>
        ) : (
          <div className="space-y-4">
            {by_category.map((cat, i) => {
              const color = EXPENSE_COLORS[cat.category] || '#94a3b8';
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cat.category}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUDFull(cat.amount)}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>{fmtPct(cat.pct)}</span>
                    </div>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max((cat.amount / catMax) * 100, 2)}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Top Suppliers */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Top Suppliers</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Ranked by total spend</p>
        </div>
        {top_suppliers.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No supplier data</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {top_suppliers.slice(0, 15).map((s, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: i < 3 ? 'var(--accent)' : 'var(--bg-primary)',
                    color: i < 3 ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.contact}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{(s.categories || []).join(', ') || 'General'}</p>
                </div>
                <div className="w-32 hidden sm:block">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.total_spend / supplierMax) * 100}%`,
                        background: 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmtAUD(s.total_spend)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 4: LABOUR                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */
function LabourTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="No labour data for this period." />;

  const labourSummary = data?.summary || {};
  const total_labour = labourSummary.total_labour || 0;
  const labour_pct = labourSummary.labour_pct_of_revenue || 0;
  const benchmark = data?.benchmark?.industry_target || 30;
  const breakdown = data?.breakdown || [];
  const monthly_trend = data?.monthly_trend || [];

  const breakdownMax = Math.max(...breakdown.map(b => b.amount || 0), 1);
  const trendMax = Math.max(...monthly_trend.map(m => m.labour_pct || 0), 1);

  // Gauge: clamp between 0 and 60 for display
  const gaugeAngle = Math.min(labour_pct, 60);
  const gaugeColor = labour_pct > 35 ? '#ef4444' : labour_pct > benchmark ? '#f59e0b' : '#22c55e';

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Total Labour Cost</p>
          <p className="text-2xl font-extrabold" style={{ color: '#6366f1' }}>{fmtAUD(total_labour)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Labour % of Revenue</p>
          <p className="text-2xl font-extrabold" style={{ color: gaugeColor }}>{fmtPct(labour_pct)}</p>
          {/* Simple gauge bar */}
          <div className="mt-3 h-3 rounded-full overflow-hidden relative" style={{ background: 'var(--bg-primary)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((labour_pct / 60) * 100, 100)}%`, background: gaugeColor }} />
            {/* Benchmark marker */}
            <div
              className="absolute top-0 h-full w-0.5"
              style={{ left: `${(benchmark / 60) * 100}%`, background: 'var(--text-primary)', opacity: 0.5 }}
              title={`Benchmark: ${benchmark}%`}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>0%</span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Benchmark {benchmark}%</span>
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>60%</span>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Industry Benchmark</p>
          <p className="text-2xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{benchmark}%</p>
          <p className="text-xs mt-1" style={{ color: labour_pct <= benchmark ? '#22c55e' : '#ef4444' }}>
            {labour_pct <= benchmark
              ? `You are ${(benchmark - labour_pct).toFixed(1)}% below benchmark`
              : `You are ${(labour_pct - benchmark).toFixed(1)}% above benchmark`}
          </p>
        </Card>
      </div>

      {/* Breakdown */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Labour Breakdown</h3>
        {breakdown.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No breakdown data</p>
        ) : (
          <div className="space-y-3">
            {breakdown.map((item, i) => {
              const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#06b6d4', '#f59e0b'];
              const color = colors[i % colors.length];
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.account_name}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUDFull(item.amount)}</span>
                  </div>
                  <div className="h-4 rounded-md overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div
                      className="h-full rounded-md transition-all duration-500 flex items-center justify-end px-2"
                      style={{
                        width: `${Math.max((item.amount / breakdownMax) * 100, 5)}%`,
                        background: `linear-gradient(90deg, ${color}cc, ${color})`,
                      }}
                    >
                      {(item.amount / breakdownMax) > 0.15 && (
                        <span className="text-[10px] font-bold text-white">{fmtPct(item.pct)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Monthly Labour Trend */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Monthly Labour % of Revenue</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Green if at or below 35%, amber if above</p>
        {monthly_trend.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No trend data</p>
        ) : (
          <div className="space-y-2">
            {monthly_trend.map((m, i) => {
              const overThreshold = m.labour_pct > 35;
              const barColor = overThreshold ? '#f59e0b' : '#22c55e';
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-12 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {m.month || `M${i + 1}`}
                  </span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{
                        width: `${Math.max((m.labour_pct / Math.max(trendMax, 50)) * 100, 3)}%`,
                        background: barColor,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-12 text-right flex-shrink-0" style={{ color: barColor }}>
                    {fmtPct(m.labour_pct)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 5: SEASONAL                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
function SeasonalTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data) return <EmptyState message="No seasonal data available." />;

  const monthly_averages = data?.by_month || [];
  const best_month = data?.best_month;
  const worst_month = data?.worst_month;
  const quarterly = data?.quarterly || [];

  // Generate insights from the data
  const insights = [];
  if (best_month) insights.push({ title: 'Strongest Month', text: `${best_month.month_name} averages ${fmtAUD(best_month.avg_revenue)} in revenue.` });
  if (worst_month) insights.push({ title: 'Weakest Month', text: `${worst_month.month_name} averages ${fmtAUD(worst_month.avg_revenue)} in revenue.` });
  if (best_month && worst_month) {
    const diff = best_month.avg_revenue - worst_month.avg_revenue;
    insights.push({ title: 'Seasonal Swing', text: `${fmtAUD(diff)} difference between best and worst months.` });
  }
  if (quarterly.length === 4) {
    const bestQ = quarterly.reduce((best, q) => q.avg_revenue > best.avg_revenue ? q : best, quarterly[0]);
    insights.push({ title: 'Strongest Quarter', text: `${bestQ.quarter} averages ${fmtAUD(bestQ.avg_revenue)} per month.` });
  }

  const avgValues = monthly_averages.map(m => m.avg_revenue || 0);
  const avgMax = Math.max(...avgValues, 1);
  const avgMin = Math.min(...avgValues);
  const bestIdx = avgValues.indexOf(Math.max(...avgValues));
  const worstIdx = avgValues.indexOf(Math.min(...avgValues));

  return (
    <div className="space-y-6">
      {/* Monthly Averages — Vertical bar chart */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Monthly Revenue Averages</h3>
        <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>Average monthly revenue across all years</p>
        <div className="flex items-end gap-2 justify-between" style={{ height: 200 }}>
          {monthly_averages.map((m, i) => {
            const val = m.avg_revenue || 0;
            const heightPct = avgMax > 0 ? (val / avgMax) * 100 : 0;
            const isBest = i === bestIdx;
            const isWorst = i === worstIdx;
            const barColor = isBest ? '#22c55e' : isWorst ? '#ef4444' : '#6366f1';
            return (
              <div key={i} className="flex flex-col items-center gap-1 flex-1" style={{ height: '100%' }}>
                <span className="text-[10px] font-bold" style={{ color: barColor }}>{fmtAUD(val)}</span>
                <div className="w-full flex-1 flex flex-col justify-end">
                  <div
                    className="w-full rounded-t-md transition-all duration-500 min-h-[4px]"
                    style={{
                      height: `${Math.max(heightPct, 3)}%`,
                      background: `linear-gradient(180deg, ${barColor}, ${barColor}aa)`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {MONTH_LABELS[i] || m.month_name}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#22c55e' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Best month</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#ef4444' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Weakest month</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#6366f1' }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Other months</span>
          </div>
        </div>
      </Card>

      {/* Key Insights */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Key Insights</h3>
        {insights.length === 0 ? (
          <Card className="p-5">
            <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>No insights available</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {insights.map((insight, i) => {
              const icons = [TrendingUp, CalendarDays, BarChart3, TrendingDown, Percent];
              const colors = ['#22c55e', '#6366f1', '#f59e0b', '#ef4444', '#a78bfa'];
              const Icon = icons[i % icons.length];
              const color = colors[i % colors.length];
              return (
                <Card key={i} className="p-4 flex gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                    <Icon className="w-4.5 h-4.5" style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    {insight.title && <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>{insight.title}</p>}
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{insight.text || insight}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 6: BANK & CASH FLOW                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BankCashFlowTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data || !data.summary) return <EmptyState message="No bank data available." />;

  const { summary, monthly_cash_flow = [], running_balance = [] } = data;
  const cfMax = Math.max(...monthly_cash_flow.map(m => Math.max(m.inflows, m.outflows)), 1);
  const balances = running_balance.map(b => b.balance);
  const balMax = Math.max(...balances, 1);
  const balMin = Math.min(...balances, 0);
  const balRange = balMax - balMin || 1;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current Balance" value={fmtAUD(summary.current_balance)} color={summary.current_balance >= 0 ? '#22c55e' : '#ef4444'} icon={Wallet} />
        <StatCard label="Total Inflows" value={fmtAUD(summary.total_inflows)} color="#22c55e" icon={ArrowUpRight} subtext="Revenue received" />
        <StatCard label="Total Outflows" value={fmtAUD(summary.total_outflows)} color="#ef4444" icon={ArrowDownRight} subtext="Bills & wages paid" />
        <StatCard label="Avg Monthly Net" value={fmtAUD(summary.avg_monthly_net)} color={summary.avg_monthly_net >= 0 ? '#22c55e' : '#f59e0b'} icon={TrendingUp} />
      </div>

      {/* Bank details */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Bank Account</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-secondary)' }}>Account</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.account_name}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-secondary)' }}>BSB</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.bsb}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-secondary)' }}>Account No.</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.account_number}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-secondary)' }}>Opening Balance</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtAUDFull(summary.opening_balance)}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Cash Flow */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Monthly Cash Flow</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Inflows (green) vs Outflows (red)</p>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {monthly_cash_flow.map((m, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium w-16 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{m.month}</span>
                  <span className="text-[11px] font-bold" style={{ color: m.net_flow >= 0 ? '#22c55e' : '#ef4444' }}>
                    {m.net_flow >= 0 ? '+' : ''}{fmtAUD(m.net_flow)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <div className="flex-1 h-3 rounded-l overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-l" style={{ width: `${(m.inflows / cfMax) * 100}%`, background: '#22c55e' }} />
                  </div>
                  <div className="flex-1 h-3 rounded-r overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-r" style={{ width: `${(m.outflows / cfMax) * 100}%`, background: '#ef4444' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#22c55e' }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Inflows</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#ef4444' }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Outflows</span></div>
          </div>
        </Card>

        {/* Running Balance */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Running Balance</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>End-of-month bank balance over time</p>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {running_balance.map((m, i) => {
              const isNegative = m.balance < 0;
              const barWidth = Math.abs(m.balance - balMin) / balRange * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{m.month}</span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-md transition-all" style={{
                      width: `${Math.max(barWidth, 3)}%`,
                      background: isNegative ? '#ef4444' : '#6366f1',
                    }} />
                  </div>
                  <span className="text-[11px] font-semibold w-20 text-right flex-shrink-0" style={{ color: isNegative ? '#ef4444' : 'var(--text-primary)' }}>
                    {fmtAUD(m.balance)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Best / Worst months */}
      {(summary.best_month || summary.worst_month) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {summary.best_month && (
            <Card className="p-5 flex gap-3 items-center">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <ArrowUpRight className="w-5 h-5" style={{ color: '#22c55e' }} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Best Cash Flow Month</p>
                <p className="text-lg font-extrabold" style={{ color: '#22c55e' }}>{summary.best_month.month}: {fmtAUD(summary.best_month.net_flow)}</p>
              </div>
            </Card>
          )}
          {summary.worst_month && (
            <Card className="p-5 flex gap-3 items-center">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <ArrowDownRight className="w-5 h-5" style={{ color: '#ef4444' }} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Worst Cash Flow Month</p>
                <p className="text-lg font-extrabold" style={{ color: '#ef4444' }}>{summary.worst_month.month}: {fmtAUD(summary.worst_month.net_flow)}</p>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 7: BALANCE SHEET                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BalanceSheetTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data || !data.snapshot) return <EmptyState message="No balance sheet data available." />;

  const { snapshot, ratios, trend = [] } = data;
  const asAtLabel = snapshot.as_at_date ? new Date(snapshot.as_at_date).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) : '';

  const ratioColor = (status) => status === 'healthy' ? '#22c55e' : status === 'caution' ? '#f59e0b' : '#ef4444';
  const trendMax = Math.max(...trend.map(t => t.total_assets), 1);

  return (
    <div className="space-y-6">
      {/* Ratios */}
      {ratios && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Current Ratio" value={ratios.current_ratio.toFixed(2)} color={ratioColor(ratios.current_ratio_status)} icon={BarChart3}
            subtext={ratios.current_ratio_status === 'healthy' ? 'Healthy liquidity' : ratios.current_ratio_status === 'caution' ? 'Monitor closely' : 'Liquidity risk'} />
          <StatCard label="Debt to Equity" value={ratios.debt_to_equity.toFixed(2)} color={ratios.debt_to_equity > 2 ? '#ef4444' : '#6366f1'} icon={Percent} />
          <StatCard label="Working Capital" value={fmtAUD(ratios.working_capital)} color={ratios.working_capital >= 0 ? '#22c55e' : '#ef4444'} icon={DollarSign} />
        </div>
      )}

      {/* Snapshot Table */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Balance Sheet</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>As at {asAtLabel}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Account</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Type</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {/* ASSETS */}
              <tr style={{ background: 'rgba(34,197,94,0.05)' }}>
                <td colSpan={3} className="px-5 py-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: '#22c55e' }}>Assets</td>
              </tr>
              {snapshot.assets.map((a, i) => (
                <tr key={`a${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-5 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{a.account_name}</td>
                  <td className="px-5 py-2.5 text-[11px] uppercase" style={{ color: 'var(--text-secondary)' }}>{a.sub_type}</td>
                  <td className="px-5 py-2.5 text-xs font-semibold text-right" style={{ color: '#22c55e' }}>{fmtAUDFull(a.balance)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-primary)' }}>
                <td colSpan={2} className="px-5 py-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Total Assets</td>
                <td className="px-5 py-2 text-xs font-extrabold text-right" style={{ color: '#22c55e' }}>{fmtAUDFull(snapshot.total_assets)}</td>
              </tr>

              {/* LIABILITIES */}
              <tr style={{ background: 'rgba(239,68,68,0.05)' }}>
                <td colSpan={3} className="px-5 py-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: '#ef4444' }}>Liabilities</td>
              </tr>
              {snapshot.liabilities.map((l, i) => (
                <tr key={`l${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-5 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{l.account_name}</td>
                  <td className="px-5 py-2.5 text-[11px] uppercase" style={{ color: 'var(--text-secondary)' }}>{l.sub_type}</td>
                  <td className="px-5 py-2.5 text-xs font-semibold text-right" style={{ color: '#ef4444' }}>{fmtAUDFull(l.balance)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-primary)' }}>
                <td colSpan={2} className="px-5 py-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Total Liabilities</td>
                <td className="px-5 py-2 text-xs font-extrabold text-right" style={{ color: '#ef4444' }}>{fmtAUDFull(snapshot.total_liabilities)}</td>
              </tr>

              {/* EQUITY */}
              <tr style={{ background: 'rgba(99,102,241,0.05)' }}>
                <td colSpan={3} className="px-5 py-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: '#6366f1' }}>Equity</td>
              </tr>
              {snapshot.equity.map((e, i) => (
                <tr key={`e${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-5 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{e.account_name}</td>
                  <td className="px-5 py-2.5 text-[11px] uppercase" style={{ color: 'var(--text-secondary)' }}>{e.sub_type}</td>
                  <td className="px-5 py-2.5 text-xs font-semibold text-right" style={{ color: '#6366f1' }}>{fmtAUDFull(e.balance)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-primary)' }}>
                <td colSpan={2} className="px-5 py-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Total Equity</td>
                <td className="px-5 py-2 text-xs font-extrabold text-right" style={{ color: '#6366f1' }}>{fmtAUDFull(snapshot.total_equity)}</td>
              </tr>

              {/* NET ASSETS */}
              <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)' }}>
                <td colSpan={2} className="px-5 py-3 text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>Net Assets</td>
                <td className="px-5 py-3 text-sm font-extrabold text-right" style={{ color: snapshot.net_assets >= 0 ? '#22c55e' : '#ef4444' }}>{fmtAUDFull(snapshot.net_assets)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Net Equity Trend */}
      {trend.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Net Equity Trend</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Assets minus liabilities over time</p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {trend.map((t, i) => {
              const isNeg = t.net_equity < 0;
              const eqMax = Math.max(...trend.map(x => Math.abs(x.net_equity)), 1);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{t.month}</span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-md" style={{
                      width: `${Math.max((Math.abs(t.net_equity) / eqMax) * 100, 3)}%`,
                      background: isNeg ? '#ef4444' : '#6366f1',
                    }} />
                  </div>
                  <span className="text-[11px] font-semibold w-20 text-right flex-shrink-0" style={{ color: isNeg ? '#ef4444' : 'var(--text-primary)' }}>
                    {fmtAUD(t.net_equity)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 8: INVOICES                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */
function InvoicesTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data || !data.summary) return <EmptyState message="No invoice data available." />;

  const { summary, aging = [], status_breakdown = [], top_debtors = [] } = data;

  const STATUS_COLORS = {
    PAID: '#22c55e',
    AUTHORISED: '#6366f1',
    OVERDUE: '#ef4444',
    DRAFT: '#94a3b8',
  };

  const agingMax = Math.max(...aging.map(a => a.amount), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Outstanding" value={fmtAUD(summary.total_outstanding_ar)} color="#f59e0b" icon={FileText} />
        <StatCard label="Total Overdue" value={fmtAUD(summary.total_overdue_ar)} color="#ef4444" icon={AlertCircle} />
        <StatCard label="Days Sales Outstanding" value={`${summary.days_sales_outstanding} days`} color="#6366f1" icon={CalendarDays}
          subtext={summary.days_sales_outstanding <= 30 ? 'Excellent' : summary.days_sales_outstanding <= 45 ? 'Normal' : 'Needs attention'} />
        <StatCard label="Collection Rate" value={fmtPct(summary.collection_rate)} color="#22c55e" icon={CheckCircle2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Invoice Status</h3>
          <div className="space-y-3">
            {status_breakdown.map((s, i) => {
              const color = STATUS_COLORS[s.status] || '#94a3b8';
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.status}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>{s.count}</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(s.amount)}</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(s.pct, 100)}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Aging Buckets */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Receivables Aging</h3>
          <div className="space-y-3">
            {aging.map((a, i) => {
              const colors = ['#22c55e', '#6366f1', '#f59e0b', '#ef4444', '#dc2626'];
              const color = colors[i] || '#94a3b8';
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.label}</span>
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color }}>{a.count} inv</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUDFull(a.amount)}</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.max((a.amount / agingMax) * 100, a.amount > 0 ? 5 : 0)}%`,
                      background: color,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Top Debtors */}
      {top_debtors.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Outstanding Debtors</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Contacts with unpaid receivables</p>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {top_debtors.map((d, i) => {
              const debtMax = Math.max(...top_debtors.map(x => x.amount_due), 1);
              return (
                <div key={i} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{d.contact}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{d.invoice_count} invoice{d.invoice_count > 1 ? 's' : ''}</p>
                  </div>
                  <div className="w-24 hidden sm:block">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(d.amount_due / debtMax) * 100}%`, background: '#ef4444' }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0" style={{ color: '#ef4444' }}>{fmtAUDFull(d.amount_due)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 9: BAS / TAX                                                         */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BASTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data || !data.summary) return <EmptyState message="No BAS data available." />;

  const { returns = [], summary, trend = [] } = data;
  const nextDue = summary.next_due;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="YTD GST Collected" value={fmtAUD(summary.ytd_gst_collected)} color="#22c55e" icon={DollarSign} />
        <StatCard label="YTD GST Paid" value={fmtAUD(summary.ytd_gst_paid)} color="#ef4444" icon={DollarSign} />
        <StatCard label="YTD Net GST" value={fmtAUD(summary.ytd_net_gst)} color="#f59e0b" icon={Receipt} />
        <StatCard label="Effective Tax Rate" value={fmtPct(summary.effective_tax_rate)} color="#6366f1" icon={Percent} />
      </div>

      {/* Next Due Alert */}
      {nextDue && (
        <Card className="p-5 border-l-4" style={{ borderLeftColor: '#f59e0b' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
              <AlertCircle className="w-5 h-5" style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Next BAS Due: {nextDue.quarter}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Due {new Date(nextDue.due_date).toLocaleDateString('en-AU')} &middot; Estimated {fmtAUDFull(nextDue.estimated_amount)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Quarterly BAS Table */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Quarterly BAS Returns</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Quarter', 'GST Collected', 'GST Paid', 'Net GST', 'PAYG W/H', 'Total Payable', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {returns.map((r, i) => {
                const statusColor = r.status === 'LODGED' ? '#22c55e' : r.status === 'DUE' ? '#f59e0b' : '#94a3b8';
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{r.quarter}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#22c55e' }}>{fmtAUDFull(r.gst_collected)}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#ef4444' }}>{fmtAUDFull(r.gst_paid)}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: '#f59e0b' }}>{fmtAUDFull(r.net_gst)}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#6366f1' }}>{fmtAUDFull(r.payg_withheld)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUDFull(r.total_payable)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${statusColor}15`, color: statusColor }}>{r.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Annual Trend */}
      {trend.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Annual Tax Obligations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {trend.map((t, i) => (
              <div key={i} className="text-center p-4 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
                <p className="text-lg font-extrabold mb-3" style={{ color: 'var(--text-primary)' }}>{t.year}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs"><span style={{ color: 'var(--text-secondary)' }}>Net GST</span><span className="font-bold" style={{ color: '#f59e0b' }}>{fmtAUD(t.net_gst)}</span></div>
                  <div className="flex justify-between text-xs"><span style={{ color: 'var(--text-secondary)' }}>PAYG W/H</span><span className="font-bold" style={{ color: '#6366f1' }}>{fmtAUD(t.payg_withheld)}</span></div>
                  <div className="flex justify-between text-xs pt-2 border-t" style={{ borderColor: 'var(--border)' }}><span className="font-bold" style={{ color: 'var(--text-primary)' }}>Total</span><span className="font-extrabold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(t.total_payable)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 10: CONTACTS                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ContactsTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data || !data.summary) return <EmptyState message="No contacts data available." />;

  const { suppliers = [], customers = [], summary, concentration } = data;
  const supplierMax = Math.max(...suppliers.map(s => s.total_spend), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Suppliers" value={summary.total_suppliers} color="#6366f1" icon={Building2} />
        <StatCard label="Total Customers" value={summary.total_customers} color="#22c55e" icon={Users} />
        <StatCard label="Largest Supplier" value={summary.largest_supplier?.name || 'N/A'} color="#f59e0b" icon={TrendingUp}
          subtext={summary.largest_supplier ? fmtAUD(summary.largest_supplier.spend) : ''} />
        <StatCard label="Avg Transaction" value={fmtAUD(summary.avg_transaction_size)} color="#a78bfa" icon={DollarSign} />
      </div>

      {/* Concentration warning */}
      {concentration && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Supplier Concentration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Top 3 Suppliers (% of spend)</p>
              <p className="text-2xl font-extrabold" style={{ color: concentration.top_3_pct > 60 ? '#f59e0b' : '#22c55e' }}>{fmtPct(concentration.top_3_pct)}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>{concentration.top_3_names.join(', ')}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Diversity Score</p>
              <p className="text-2xl font-extrabold" style={{ color: '#6366f1' }}>{concentration.diversity_score}/100</p>
              <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                <div className="h-full rounded-full" style={{ width: `${concentration.diversity_score}%`, background: '#6366f1' }} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Risk Level</p>
              <p className="text-2xl font-extrabold" style={{ color: concentration.top_3_pct > 70 ? '#ef4444' : concentration.top_3_pct > 50 ? '#f59e0b' : '#22c55e' }}>
                {concentration.top_3_pct > 70 ? 'High' : concentration.top_3_pct > 50 ? 'Medium' : 'Low'}
              </p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                {concentration.top_3_pct > 60 ? 'Consider diversifying suppliers' : 'Good supplier diversity'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Supplier Rankings */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Supplier Spend Ranking</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{suppliers.length} active suppliers</p>
        </div>
        <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
          {suppliers.slice(0, 20).map((s, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3" style={{ borderColor: 'var(--border)' }}>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: i < 3 ? 'var(--accent)' : 'var(--bg-primary)',
                  color: i < 3 ? '#fff' : 'var(--text-secondary)',
                }}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {s.city && s.state ? `${s.city}, ${s.state}` : ''}{s.transaction_count ? ` · ${s.transaction_count} txns` : ''}
                </p>
              </div>
              <div className="w-32 hidden sm:block">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(s.total_spend / supplierMax) * 100}%`, background: 'var(--accent)' }} />
                </div>
              </div>
              <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmtAUD(s.total_spend)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Customers */}
      {customers.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Customer Revenue</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {customers.map((c, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)' }}>
                  <Users className="w-4 h-4" style={{ color: '#22c55e' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{c.transaction_count} transactions</p>
                </div>
                <span className="text-sm font-bold" style={{ color: '#22c55e' }}>{fmtAUD(c.total_revenue)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 11: TRACKING CATEGORIES                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */
function TrackingTab({ data, loading }) {
  if (loading) return <LoadingState />;
  if (!data || !data.categories || data.categories.length === 0) return <EmptyState message="No tracking data available." />;

  const { categories } = data;

  const TRACKING_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4'];

  return (
    <div className="space-y-8">
      {categories.map((cat, ci) => {
        const maxRev = Math.max(...cat.options.map(o => o.total_revenue), 1);

        // Build monthly breakdown for stacked view
        const allMonths = new Set();
        for (const opt of cat.options) {
          for (const m of opt.monthly) {
            allMonths.add(`${m.year}-${String(m.month_num).padStart(2, '0')}`);
          }
        }
        const sortedMonthKeys = [...allMonths].sort();

        // Get monthly totals for stacked bars
        const monthlyStacked = sortedMonthKeys.map(mk => {
          const [yr, mo] = mk.split('-').map(Number);
          const label = `${MONTH_LABELS[mo - 1]} ${yr}`;
          const values = cat.options.map(opt => {
            const found = opt.monthly.find(m => m.year === yr && m.month_num === mo);
            return found ? found.revenue : 0;
          });
          const total = values.reduce((s, v) => s + v, 0);
          return { label, values, total };
        });
        const stackedMax = Math.max(...monthlyStacked.map(m => m.total), 1);

        return (
          <div key={ci} className="space-y-4">
            <h2 className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>{cat.category_name}</h2>

            {/* Option summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cat.options.map((opt, oi) => {
                const color = TRACKING_COLORS[oi % TRACKING_COLORS.length];
                return (
                  <Card key={oi} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{opt.name}</span>
                    </div>
                    <p className="text-xl font-extrabold" style={{ color }}>{fmtAUD(opt.total_revenue)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{fmtPct(opt.revenue_pct)} of total</span>
                      {opt.yoy_growth !== 0 && (
                        <span className="text-[11px] font-bold" style={{ color: opt.yoy_growth > 0 ? '#22c55e' : '#ef4444' }}>
                          {opt.yoy_growth > 0 ? '+' : ''}{fmtPct(opt.yoy_growth)} YoY
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div className="h-full rounded-full" style={{ width: `${opt.revenue_pct}%`, background: color }} />
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Stacked monthly bars */}
            <Card className="p-5">
              <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Monthly Revenue by {cat.category_name}</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Stacked view showing contribution of each option</p>

              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {monthlyStacked.map((m, mi) => (
                  <div key={mi} className="flex items-center gap-3">
                    <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                    <div className="flex-1 h-5 rounded-md overflow-hidden flex" style={{ background: 'var(--bg-primary)' }}>
                      {m.values.map((v, vi) => {
                        const segWidth = (v / stackedMax) * 100;
                        if (segWidth < 0.5) return null;
                        return (
                          <div key={vi} className="h-full" style={{
                            width: `${segWidth}%`,
                            background: TRACKING_COLORS[vi % TRACKING_COLORS.length],
                            opacity: 0.85,
                          }} />
                        );
                      })}
                    </div>
                    <span className="text-[11px] font-semibold w-16 text-right flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                      {fmtAUD(m.total)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                {cat.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ background: TRACKING_COLORS[oi % TRACKING_COLORS.length] }} />
                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{opt.name}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 12: PREDICTIVE ANALYTICS                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

const PRED_SECTIONS = [
  { key: 'revenue',    label: 'Revenue Forecast',   icon: TrendingUp },
  { key: 'profit',     label: 'Profitability',      icon: Target },
  { key: 'cash',       label: 'Cash Projection',    icon: Banknote },
  { key: 'expenses',   label: 'Expense Optimisation', icon: Zap },
  { key: 'channels',   label: 'Channel Growth',     icon: BarChart3 },
  { key: 'staffing',   label: 'Staffing Guide',     icon: Users },
  { key: 'tax',        label: 'Tax Forecast',       icon: Calculator },
  { key: 'scenario',   label: 'What-If Scenarios',  icon: SlidersHorizontal },
];

const STATUS_COLORS = {
  excellent: '#22c55e',
  good: '#22c55e',
  on_target: '#22c55e',
  caution: '#f59e0b',
  critical: '#ef4444',
};

function PredictionsTab({ data, loading }) {
  const [section, setSection] = useState('revenue');
  const [scenario, setScenario] = useState(null);

  if (loading) return <LoadingState />;
  if (!data || data.error) return <EmptyState message={data?.error || 'No prediction data available.'} />;

  // Initialize scenario from defaults
  const sc = scenario || {
    revenue_growth: data.scenario_defaults?.revenue_growth || 0,
    labour_cut: 0,
    rent_change: 0,
    cogs_improvement: 0,
  };

  const updateScenario = (key, val) => {
    setScenario({ ...sc, [key]: val });
  };

  const { prediction_summary: ps } = data;

  return (
    <div className="space-y-5">
      {/* Summary Banner */}
      <Card className="p-5" style={{ borderLeft: '4px solid #6366f1' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99,102,241,0.12)' }}>
            <Brain className="w-5 h-5" style={{ color: '#6366f1' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>Predictive Analytics Engine</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Computed from {ps.data_months} months of financial data ({ps.data_range}) · Avg growth rate: {ps.avg_growth_rate}%
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div>
            <p className="text-[11px] font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Forecast Revenue</p>
            <p className="text-lg font-extrabold" style={{ color: '#6366f1' }}>{fmtAUD(ps.forecasted_annual_revenue)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Forecast Profit</p>
            <p className="text-lg font-extrabold" style={{ color: ps.forecasted_annual_profit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtAUD(ps.forecasted_annual_profit)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Potential Savings</p>
            <p className="text-lg font-extrabold" style={{ color: '#f59e0b' }}>{fmtAUD(ps.total_potential_savings)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Staffing Savings</p>
            <p className="text-lg font-extrabold" style={{ color: '#06b6d4' }}>{fmtAUD(ps.staffing_savings)}</p>
          </div>
        </div>
      </Card>

      {/* Section Nav */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 min-w-max">
          {PRED_SECTIONS.map(s => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button key={s.key} onClick={() => setSection(s.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap border"
                style={{
                  background: active ? 'var(--accent)' : 'var(--bg-card, var(--bg-secondary))',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                }}>
                <Icon className="w-3.5 h-3.5" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section Content */}
      {section === 'revenue'  && <RevenueForecastSection data={data} />}
      {section === 'profit'   && <ProfitabilitySection data={data} />}
      {section === 'cash'     && <CashProjectionSection data={data} />}
      {section === 'expenses' && <ExpenseOptSection data={data} />}
      {section === 'channels' && <ChannelGrowthSection data={data} />}
      {section === 'staffing' && <StaffingSection data={data} />}
      {section === 'tax'      && <TaxForecastSection data={data} />}
      {section === 'scenario' && <ScenarioSection data={data} sc={sc} updateScenario={updateScenario} />}
    </div>
  );
}

/* ── 1. Revenue Forecast ─────────────────────────────────────────────────── */
function RevenueForecastSection({ data }) {
  const { revenue_forecast, seasonal_indices } = data;
  const maxRev = Math.max(...revenue_forecast.map(f => f.upper_bound), 1);

  return (
    <div className="space-y-5">
      {/* Forecast chart */}
      <Card className="p-5">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>12-Month Revenue Forecast</h3>
        <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-secondary)' }}>
          Predicted revenue with confidence bands (±10–25%)
        </p>
        <div className="space-y-2.5">
          {revenue_forecast.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{f.month}</span>
              <div className="flex-1 relative h-7 rounded-md overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                {/* Confidence band */}
                <div className="absolute h-full rounded-md" style={{
                  left: `${(f.lower_bound / maxRev) * 100}%`,
                  width: `${((f.upper_bound - f.lower_bound) / maxRev) * 100}%`,
                  background: 'rgba(99,102,241,0.12)',
                }} />
                {/* Predicted value */}
                <div className="absolute h-full rounded-md" style={{
                  width: `${(f.predicted / maxRev) * 100}%`,
                  background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                  opacity: 0.8,
                }} />
              </div>
              <span className="text-[11px] font-bold w-20 text-right flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                {fmtAUD(f.predicted)}
              </span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#6366f1' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Predicted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(99,102,241,0.2)' }} />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Confidence Range</span>
          </div>
        </div>
      </Card>

      {/* Seasonal Indices */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Seasonal Index</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Index &gt; 1.0 = above-average month · &lt; 1.0 = below-average month
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
          {seasonal_indices.map((si, i) => {
            const isHigh = si.index >= 1.05;
            const isLow = si.index <= 0.95;
            const color = isHigh ? '#22c55e' : isLow ? '#ef4444' : '#6366f1';
            return (
              <div key={i} className="text-center p-2 rounded-lg" style={{ background: `${color}10` }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{si.month}</p>
                <p className="text-base font-extrabold mt-0.5" style={{ color }}>{si.index.toFixed(2)}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Forecast table */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Detailed Forecast Table</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Month</th>
                <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Predicted</th>
                <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Lower</th>
                <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Upper</th>
                <th className="text-right px-4 py-2.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Seasonal</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {revenue_forecast.map((f, i) => (
                <tr key={i} className="hover:opacity-80 transition-opacity">
                  <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text-primary)' }}>{f.month}</td>
                  <td className="text-right px-4 py-2.5 font-bold" style={{ color: '#6366f1' }}>{fmtAUDFull(f.predicted)}</td>
                  <td className="text-right px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{fmtAUDFull(f.lower_bound)}</td>
                  <td className="text-right px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{fmtAUDFull(f.upper_bound)}</td>
                  <td className="text-right px-4 py-2.5 font-semibold" style={{ color: f.seasonal_index >= 1 ? '#22c55e' : '#ef4444' }}>
                    {f.seasonal_index.toFixed(2)}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── 2. Profitability Section ────────────────────────────────────────────── */
function ProfitabilitySection({ data }) {
  const { profitability: p } = data;
  if (!p) return <EmptyState message="No profitability data." />;

  const safetyColor = p.safety_margin_pct > 20 ? '#22c55e' : p.safety_margin_pct > 0 ? '#f59e0b' : '#ef4444';
  const maxRev = Math.max(...(p.monthly_forecast || []).map(m => m.revenue), 1);

  return (
    <div className="space-y-5">
      {/* Break-Even Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Break-Even / Month" value={fmtAUD(p.break_even_monthly)} color="#f59e0b" icon={Target} subtext={`Annual: ${fmtAUD(p.break_even_annual)}`} />
        <StatCard label="Avg Monthly Revenue" value={fmtAUD(p.current_avg_monthly_revenue)} color="#6366f1" icon={DollarSign}
          subtext={p.current_avg_monthly_revenue > p.break_even_monthly ? 'Above break-even' : 'Below break-even'} />
        <StatCard label="Safety Margin" value={fmtPct(p.safety_margin_pct)} color={safetyColor} icon={ShieldCheck}
          subtext={p.safety_margin_pct > 0 ? 'Buffer above break-even' : 'Operating below break-even'} />
        <StatCard label="Current Net Margin" value={fmtPct(p.current_net_margin)} color={p.current_net_margin >= 0 ? '#22c55e' : '#ef4444'} icon={Percent}
          subtext={`Variable cost ratio: ${fmtPct(p.variable_cost_ratio)}`} />
      </div>

      {/* Break-Even Gauge */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Break-Even Analysis</h3>
        <div className="flex items-end gap-6 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-[11px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              <span>$0</span>
              <span>Break-Even: {fmtAUD(p.break_even_monthly)}</span>
              <span>Current: {fmtAUD(p.current_avg_monthly_revenue)}</span>
            </div>
            <div className="relative h-8 rounded-lg overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
              {/* Revenue bar */}
              <div className="absolute h-full rounded-lg" style={{
                width: `${Math.min((p.current_avg_monthly_revenue / Math.max(p.current_avg_monthly_revenue, p.break_even_monthly) * 1.2) * 100, 100)}%`,
                background: p.current_avg_monthly_revenue >= p.break_even_monthly
                  ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                  : 'linear-gradient(90deg, #ef4444, #f87171)',
              }} />
              {/* Break-even marker */}
              <div className="absolute top-0 h-full w-0.5" style={{
                left: `${(p.break_even_monthly / Math.max(p.current_avg_monthly_revenue, p.break_even_monthly) * 1.2) * 100}%`,
                background: '#f59e0b',
              }} />
            </div>
          </div>
          <div className="text-center px-4 py-2 rounded-lg" style={{ background: `${safetyColor}10` }}>
            <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Monthly Fixed Costs</p>
            <p className="text-lg font-extrabold" style={{ color: safetyColor }}>{fmtAUD(p.monthly_fixed_costs)}</p>
          </div>
        </div>
      </Card>

      {/* Monthly P&L Forecast */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Monthly P&L Forecast</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Projected revenue, costs, and net profit for next 12 months</p>
        <div className="space-y-2">
          {(p.monthly_forecast || []).map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{m.month}</span>
              <div className="flex-1 h-6 rounded-md overflow-hidden flex" style={{ background: 'var(--bg-primary)' }}>
                {/* Variable costs */}
                <div className="h-full" style={{ width: `${(m.variable_costs / maxRev) * 100}%`, background: '#ef4444', opacity: 0.6 }} />
                {/* Fixed costs */}
                <div className="h-full" style={{ width: `${(m.fixed_costs / maxRev) * 100}%`, background: '#f59e0b', opacity: 0.6 }} />
                {/* Profit/loss */}
                {m.net_profit > 0 && (
                  <div className="h-full" style={{ width: `${(m.net_profit / maxRev) * 100}%`, background: '#22c55e', opacity: 0.7 }} />
                )}
              </div>
              <span className="text-[11px] font-bold w-20 text-right flex-shrink-0" style={{ color: m.net_profit >= 0 ? '#22c55e' : '#ef4444' }}>
                {fmtAUD(m.net_profit)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#ef4444', opacity: 0.6 }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Variable Costs</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#f59e0b', opacity: 0.6 }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Fixed Costs</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#22c55e', opacity: 0.7 }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Net Profit</span></div>
        </div>
      </Card>
    </div>
  );
}

/* ── 3. Cash Projection ──────────────────────────────────────────────────── */
function CashProjectionSection({ data }) {
  const { cash_projection, cash_summary: cs } = data;
  if (!cs) return <EmptyState message="No cash data." />;

  const balances = cash_projection.map(c => c.projected_balance);
  const maxBal = Math.max(...balances.map(Math.abs), 1);
  const midpoint = 50; // center line

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current Balance" value={fmtAUD(cs.current_balance)} color={cs.current_balance >= 0 ? '#22c55e' : '#ef4444'} icon={Banknote} />
        <StatCard label="Projected End Balance" value={fmtAUD(cs.projected_end_balance)} color={cs.projected_end_balance >= 0 ? '#22c55e' : '#ef4444'} icon={TrendingUp}
          subtext={cs.trend === 'improving' ? 'Trend: Improving' : 'Trend: Declining'} />
        <StatCard label="Avg Monthly Net" value={fmtAUD(cs.avg_monthly_net_flow)} color={cs.avg_monthly_net_flow >= 0 ? '#22c55e' : '#f59e0b'} icon={ArrowUpRight} />
        <StatCard label="Cash Runway" value={cs.runway_months === null ? '12+ months' : `${cs.runway_months} months`}
          color={cs.runway_months === null ? '#22c55e' : cs.runway_months > 6 ? '#f59e0b' : '#ef4444'} icon={ShieldCheck}
          subtext={cs.runway_months === null ? 'Sufficient runway' : 'Action needed'} />
      </div>

      {/* Cash flow projection chart */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>12-Month Cash Balance Projection</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Projected bank balance based on historical cash flow patterns
        </p>
        <div className="space-y-2">
          {cash_projection.map((c, i) => {
            const pct = Math.abs(c.projected_balance) / maxBal * 45;
            const isNeg = c.projected_balance < 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{c.month}</span>
                <div className="flex-1 relative h-6 rounded-md overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                  {/* Zero line */}
                  <div className="absolute h-full w-px" style={{ left: '50%', background: 'var(--border)' }} />
                  {isNeg ? (
                    <div className="absolute h-full rounded-r-md" style={{
                      right: '50%',
                      width: `${pct}%`,
                      background: 'linear-gradient(270deg, #ef4444, #fca5a5)',
                      opacity: 0.7,
                    }} />
                  ) : (
                    <div className="absolute h-full rounded-l-md" style={{
                      left: '50%',
                      width: `${pct}%`,
                      background: 'linear-gradient(90deg, #22c55e, #86efac)',
                      opacity: 0.7,
                    }} />
                  )}
                </div>
                <span className="text-[11px] font-bold w-24 text-right flex-shrink-0" style={{ color: isNeg ? '#ef4444' : '#22c55e' }}>
                  {fmtAUD(c.projected_balance)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Monthly net flow */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Monthly Net Cash Flow</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {cash_projection.map((c, i) => {
            const color = c.net_flow >= 0 ? '#22c55e' : '#ef4444';
            return (
              <div key={i} className="text-center p-3 rounded-lg" style={{ background: `${color}08` }}>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{c.month}</p>
                <p className="text-sm font-extrabold mt-0.5" style={{ color }}>{fmtAUD(c.net_flow)}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ── 4. Expense Optimisation ─────────────────────────────────────────────── */
function ExpenseOptSection({ data }) {
  const { expense_optimization } = data;
  if (!expense_optimization) return <EmptyState message="No expense data." />;

  const totalSavings = expense_optimization.reduce((s, e) => s + e.potential_annual_savings, 0);

  return (
    <div className="space-y-5">
      {/* Total Savings Card */}
      {totalSavings > 0 && (
        <Card className="p-5" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
              <Lightbulb className="w-5 h-5" style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total Annual Savings Opportunity</p>
              <p className="text-2xl font-extrabold" style={{ color: '#f59e0b' }}>{fmtAUD(totalSavings)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Benchmark Cards */}
      <div className="space-y-3">
        {expense_optimization.map((e, i) => {
          const statusColor = STATUS_COLORS[e.status] || '#94a3b8';
          const isMargin = e.key === 'net_margin_pct';
          // For gauge: show position relative to benchmark range
          const rangeWidth = e.benchmark_high - e.benchmark_low;
          const gaugeMin = isMargin ? 0 : e.benchmark_low - rangeWidth;
          const gaugeMax = isMargin ? e.benchmark_high + rangeWidth : e.benchmark_high + rangeWidth;
          const currentPos = Math.min(Math.max(((e.current_pct - gaugeMin) / (gaugeMax - gaugeMin)) * 100, 2), 98);
          const targetPos = ((e.benchmark_target - gaugeMin) / (gaugeMax - gaugeMin)) * 100;

          return (
            <Card key={i} className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                  <div>
                    <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{e.category}</h4>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Benchmark: {e.benchmark_low}% – {e.benchmark_high}% (Target: {e.benchmark_target}%)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-extrabold" style={{ color: statusColor }}>{fmtPct(e.current_pct)}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: statusColor }}>{e.status}</p>
                </div>
              </div>

              {/* Gauge bar */}
              <div className="mt-3 relative">
                <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                  {/* Benchmark zone */}
                  <div className="absolute h-3 rounded-sm" style={{
                    left: `${((e.benchmark_low - gaugeMin) / (gaugeMax - gaugeMin)) * 100}%`,
                    width: `${(rangeWidth / (gaugeMax - gaugeMin)) * 100}%`,
                    background: 'rgba(34,197,94,0.2)',
                  }} />
                  {/* Current position marker */}
                  <div className="absolute h-5 w-1.5 rounded-full -top-1" style={{
                    left: `${currentPos}%`,
                    background: statusColor,
                    transform: 'translateX(-50%)',
                  }} />
                  {/* Target line */}
                  <div className="absolute h-5 w-px -top-1" style={{
                    left: `${targetPos}%`,
                    background: '#22c55e',
                    opacity: 0.6,
                  }} />
                </div>
              </div>

              {/* Recommendation & savings */}
              <div className="mt-3 flex items-start justify-between gap-4 flex-wrap">
                <p className="text-xs flex-1 min-w-[200px]" style={{ color: 'var(--text-secondary)' }}>{e.recommendation}</p>
                {e.potential_annual_savings > 0 && (
                  <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                    Save {fmtAUD(e.potential_annual_savings)}/yr
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ── 5. Channel Growth ───────────────────────────────────────────────────── */
function ChannelGrowthSection({ data }) {
  const { channel_growth } = data;
  if (!channel_growth || channel_growth.length === 0) return <EmptyState message="No channel data." />;

  const maxAnnual = Math.max(...channel_growth.map(c => Math.max(c.current_annual, c.projected_annual)), 1);
  const CH_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#06b6d4'];

  return (
    <div className="space-y-5">
      {/* Channel comparison cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {channel_growth.map((ch, i) => {
          const color = CH_COLORS[i % CH_COLORS.length];
          const growthColor = ch.growth_rate > 0 ? '#22c55e' : '#ef4444';
          return (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{ch.channel}</h4>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${growthColor}15`, color: growthColor }}>
                  {ch.growth_rate > 0 ? '+' : ''}{ch.growth_rate}% YoY
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>Current Annual</span>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(ch.current_annual)}</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(ch.current_annual / maxAnnual) * 100}%`, background: color, opacity: 0.5 }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>Projected Annual</span>
                    <span className="font-bold" style={{ color }}>{fmtAUD(ch.projected_annual)}</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(ch.projected_annual / maxAnnual) * 100}%`, background: color }} />
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t flex items-center gap-1" style={{ borderColor: 'var(--border)' }}>
                <ChevronRight className="w-3 h-3" style={{ color: growthColor }} />
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Growth of {fmtAUD(ch.projected_annual - ch.current_annual)} projected
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Channel monthly projection chart */}
      {channel_growth[0]?.monthly_projected && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Monthly Channel Projections</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Projected monthly revenue by service channel</p>
          <div className="space-y-1.5">
            {channel_growth[0].monthly_projected.map((mp, mi) => {
              const monthTotal = channel_growth.reduce((s, ch) => s + (ch.monthly_projected[mi]?.projected || 0), 0);
              const maxMonthTotal = Math.max(...channel_growth[0].monthly_projected.map((_, idx) =>
                channel_growth.reduce((s, ch) => s + (ch.monthly_projected[idx]?.projected || 0), 0)), 1);
              return (
                <div key={mi} className="flex items-center gap-3">
                  <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{mp.month}</span>
                  <div className="flex-1 h-5 rounded-md overflow-hidden flex" style={{ background: 'var(--bg-primary)' }}>
                    {channel_growth.map((ch, ci) => {
                      const val = ch.monthly_projected[mi]?.projected || 0;
                      const w = (val / maxMonthTotal) * 100;
                      return w > 0.3 ? <div key={ci} className="h-full" style={{ width: `${w}%`, background: CH_COLORS[ci], opacity: 0.8 }} /> : null;
                    })}
                  </div>
                  <span className="text-[11px] font-bold w-16 text-right flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{fmtAUD(monthTotal)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            {channel_growth.map((ch, ci) => (
              <div key={ci} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: CH_COLORS[ci] }} />
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{ch.channel}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── 6. Staffing Guide ───────────────────────────────────────────────────── */
function StaffingSection({ data }) {
  const { staffing_guide } = data;
  if (!staffing_guide) return <EmptyState message="No staffing data." />;

  const totalSavings = staffing_guide.reduce((s, g) => s + g.potential_savings, 0);
  const maxLabour = Math.max(...staffing_guide.map(g => Math.max(g.optimal_labour, g.projected_current_labour)), 1);

  return (
    <div className="space-y-5">
      {totalSavings > 0 && (
        <Card className="p-5" style={{ borderLeft: '4px solid #06b6d4' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.12)' }}>
              <Users className="w-5 h-5" style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Annual Labour Savings Potential</p>
              <p className="text-2xl font-extrabold" style={{ color: '#06b6d4' }}>{fmtAUD(totalSavings)}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>By optimising to 30% labour-to-revenue benchmark</p>
            </div>
          </div>
        </Card>
      )}

      {/* Staffing comparison bars */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Monthly Staffing Comparison</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Projected current spend vs optimal (30% benchmark)</p>
        <div className="space-y-3">
          {staffing_guide.map((g, i) => {
            const actionColor = g.action === 'reduce' ? '#ef4444' : g.action === 'hire' ? '#22c55e' : '#6366f1';
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{g.month}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${actionColor}15`, color: actionColor }}>
                      {g.action === 'reduce' ? '↓ Reduce' : g.action === 'hire' ? '↑ Hire' : '= Maintain'}
                    </span>
                    {g.potential_savings > 0 && (
                      <span className="text-[11px] font-bold" style={{ color: '#f59e0b' }}>save {fmtAUD(g.potential_savings)}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] w-14 text-right" style={{ color: 'var(--text-secondary)' }}>Current</span>
                    <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div className="h-full rounded" style={{ width: `${(g.projected_current_labour / maxLabour) * 100}%`, background: '#ef4444', opacity: 0.6 }} />
                    </div>
                    <span className="text-[10px] w-16 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtAUD(g.projected_current_labour)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] w-14 text-right" style={{ color: 'var(--text-secondary)' }}>Optimal</span>
                    <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div className="h-full rounded" style={{ width: `${(g.optimal_labour / maxLabour) * 100}%`, background: '#22c55e', opacity: 0.7 }} />
                    </div>
                    <span className="text-[10px] w-16 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtAUD(g.optimal_labour)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#ef4444', opacity: 0.6 }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Projected Current</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: '#22c55e', opacity: 0.7 }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Optimal (30%)</span></div>
        </div>
      </Card>
    </div>
  );
}

/* ── 7. Tax Forecast ─────────────────────────────────────────────────────── */
function TaxForecastSection({ data }) {
  const { tax_forecast } = data;
  if (!tax_forecast || tax_forecast.length === 0) return <EmptyState message="No tax forecast data." />;

  const totalPayable = tax_forecast.reduce((s, t) => s + t.est_total_payable, 0);

  return (
    <div className="space-y-5">
      <Card className="p-5" style={{ borderLeft: '4px solid #a78bfa' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.12)' }}>
            <Calculator className="w-5 h-5" style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Projected Annual Tax Liability</p>
            <p className="text-2xl font-extrabold" style={{ color: '#a78bfa' }}>{fmtAUD(totalPayable)}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Across {tax_forecast.length} quarterly BAS periods</p>
          </div>
        </div>
      </Card>

      {/* Quarterly cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tax_forecast.map((t, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t.quarter}</h4>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                {t.period}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>GST Collected</p>
                <p className="text-sm font-bold" style={{ color: '#22c55e' }}>{fmtAUD(t.est_gst_collected)}</p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>GST Paid</p>
                <p className="text-sm font-bold" style={{ color: '#ef4444' }}>{fmtAUD(t.est_gst_paid)}</p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Net GST</p>
                <p className="text-sm font-bold" style={{ color: '#6366f1' }}>{fmtAUD(t.est_net_gst)}</p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>PAYG</p>
                <p className="text-sm font-bold" style={{ color: '#f59e0b' }}>{fmtAUD(t.est_payg)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Total Payable</span>
                <span className="text-base font-extrabold" style={{ color: '#a78bfa' }}>{fmtAUD(t.est_total_payable)}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ── 8. Scenario (What-If) ───────────────────────────────────────────────── */
function ScenarioSection({ data, sc, updateScenario }) {
  const { scenario_defaults: sd } = data;
  if (!sd) return <EmptyState message="No scenario data." />;

  // Compute impact
  const newRevenue = sd.base_annual_revenue * (1 + sc.revenue_growth / 100);
  const newCogs = sd.base_annual_cogs * (1 - sc.cogs_improvement / 100);
  const newLabour = sd.base_annual_labour * (1 - sc.labour_cut / 100);
  const newOccupancy = sd.base_annual_occupancy * (1 + sc.rent_change / 100);
  const newTotalExp = newCogs + newLabour + newOccupancy + sd.base_annual_marketing + sd.base_annual_other;
  const newNetProfit = newRevenue - newTotalExp;
  const baseNetProfit = sd.base_net_profit;
  const profitDelta = newNetProfit - baseNetProfit;
  const newMargin = newRevenue > 0 ? (newNetProfit / newRevenue) * 100 : 0;

  const sliders = [
    { key: 'revenue_growth', label: 'Revenue Growth', min: -20, max: 30, step: 0.5, suffix: '%', color: '#6366f1', desc: 'Year-over-year revenue change' },
    { key: 'labour_cut', label: 'Labour Reduction', min: 0, max: 40, step: 1, suffix: '%', color: '#06b6d4', desc: 'Savings from roster optimisation' },
    { key: 'rent_change', label: 'Rent Change', min: -20, max: 20, step: 1, suffix: '%', color: '#f59e0b', desc: 'Lease renegotiation or relocation' },
    { key: 'cogs_improvement', label: 'COGS Improvement', min: 0, max: 20, step: 0.5, suffix: '%', color: '#22c55e', desc: 'Savings from better supplier terms' },
  ];

  return (
    <div className="space-y-5">
      <Card className="p-5" style={{ borderLeft: '4px solid #6366f1' }}>
        <div className="flex items-center gap-3 mb-1">
          <SlidersHorizontal className="w-5 h-5" style={{ color: '#6366f1' }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>What-If Scenario Modeller</h3>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Adjust the sliders to see how changes impact your bottom line. Base values from {data.prediction_summary?.data_range}.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sliders */}
        <Card className="p-5 space-y-5">
          <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Adjust Parameters</h4>
          {sliders.map(s => (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
                </div>
                <span className="text-sm font-extrabold px-2 py-0.5 rounded" style={{ background: `${s.color}12`, color: s.color }}>
                  {sc[s.key] > 0 ? '+' : ''}{sc[s.key]}{s.suffix}
                </span>
              </div>
              <input
                type="range"
                min={s.min} max={s.max} step={s.step}
                value={sc[s.key]}
                onChange={e => updateScenario(s.key, parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${s.color} 0%, ${s.color} ${((sc[s.key] - s.min) / (s.max - s.min)) * 100}%, var(--bg-primary) ${((sc[s.key] - s.min) / (s.max - s.min)) * 100}%, var(--bg-primary) 100%)`,
                  accentColor: s.color,
                }}
              />
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                <span>{s.min}{s.suffix}</span>
                <span>{s.max}{s.suffix}</span>
              </div>
            </div>
          ))}

          <button
            onClick={() => updateScenario('revenue_growth', sd.revenue_growth) || setScenario({
              revenue_growth: sd.revenue_growth, labour_cut: 0, rent_change: 0, cogs_improvement: 0,
            })}
            className="text-xs font-semibold px-4 py-2 rounded-lg border transition-colors"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            Reset to Defaults
          </button>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          {/* Impact summary */}
          <Card className="p-5">
            <h4 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Projected Impact</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Projected Revenue</p>
                <p className="text-xl font-extrabold" style={{ color: '#6366f1' }}>{fmtAUD(newRevenue)}</p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Net Profit</p>
                <p className="text-xl font-extrabold" style={{ color: newNetProfit >= 0 ? '#22c55e' : '#ef4444' }}>{fmtAUD(newNetProfit)}</p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Net Margin</p>
                <p className="text-xl font-extrabold" style={{ color: newMargin >= 0 ? '#22c55e' : '#ef4444' }}>{newMargin.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Profit Change</p>
                <p className="text-xl font-extrabold" style={{ color: profitDelta >= 0 ? '#22c55e' : '#ef4444' }}>
                  {profitDelta >= 0 ? '+' : ''}{fmtAUD(profitDelta)}
                </p>
              </div>
            </div>
          </Card>

          {/* Cost breakdown comparison */}
          <Card className="p-5">
            <h4 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Cost Breakdown Comparison</h4>
            {[
              { label: 'COGS', base: sd.base_annual_cogs, adjusted: newCogs, color: '#ef4444' },
              { label: 'Labour', base: sd.base_annual_labour, adjusted: newLabour, color: '#f59e0b' },
              { label: 'Occupancy', base: sd.base_annual_occupancy, adjusted: newOccupancy, color: '#6366f1' },
              { label: 'Marketing', base: sd.base_annual_marketing, adjusted: sd.base_annual_marketing, color: '#a78bfa' },
              { label: 'Other', base: sd.base_annual_other, adjusted: sd.base_annual_other, color: '#94a3b8' },
            ].map((item, i) => {
              const maxVal = Math.max(item.base, item.adjusted, 1);
              const delta = item.adjusted - item.base;
              return (
                <div key={i} className="mb-3">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: 'var(--text-secondary)' }}>{fmtAUD(item.base)}</span>
                      <span style={{ color: delta <= 0 ? '#22c55e' : '#ef4444' }}>→ {fmtAUD(item.adjusted)}</span>
                      {delta !== 0 && (
                        <span className="font-bold" style={{ color: delta <= 0 ? '#22c55e' : '#ef4444' }}>
                          ({delta > 0 ? '+' : ''}{fmtAUD(delta)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div className="h-full rounded" style={{ width: `${(item.base / maxVal) * 100}%`, background: item.color, opacity: 0.4 }} />
                    </div>
                    <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
                      <div className="h-full rounded" style={{ width: `${(item.adjusted / maxVal) * 100}%`, background: item.color, opacity: 0.8 }} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm opacity-40" style={{ background: '#6366f1' }} /><span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Base</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm opacity-80" style={{ background: '#6366f1' }} /><span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Adjusted</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
