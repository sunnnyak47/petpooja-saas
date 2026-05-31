/**
 * AccountingPage — Native double-entry accounting
 * Route: /accounting
 * Tabs: Chart of Accounts | Ledger | Trial Balance | Profit & Loss | Balance Sheet
 *
 * Backend base path: /accounting (via shared axios instance `api`).
 * The axios response interceptor already returns `response.data`, so the API
 * envelope { success, data, message } lands at `r.data`, and the real payload
 * is `r.data.data`.
 */
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import {
  BookOpen, Scale, TrendingUp, Landmark, FileText,
  RefreshCw, Loader2,
} from 'lucide-react';

/* ── Currency helper ───────────────────────────────────────────────────────── */
const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
function fmtAUD(v) {
  if (v == null || Number.isNaN(Number(v))) return aud.format(0);
  return aud.format(Number(v));
}

/* ── Date helpers ──────────────────────────────────────────────────────────── */
const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];

/* ── Account-type colour map ───────────────────────────────────────────────── */
const TYPE_COLORS = {
  asset: '#22c55e',
  liability: '#f59e0b',
  equity: '#a78bfa',
  revenue: '#06b6d4',
  income: '#06b6d4',
  expense: '#ef4444',
};
function typeColor(type) {
  return TYPE_COLORS[String(type || '').toLowerCase()] || '#94a3b8';
}

/* ── Tabs ──────────────────────────────────────────────────────────────────── */
const TABS = [
  { key: 'chart',   label: 'Chart of Accounts', icon: BookOpen },
  { key: 'ledger',  label: 'Ledger',            icon: FileText },
  { key: 'trial',   label: 'Trial Balance',     icon: Scale },
  { key: 'pnl',     label: 'Profit & Loss',     icon: TrendingUp },
  { key: 'balance', label: 'Balance Sheet',     icon: Landmark },
];

/* ── Reusable bits ─────────────────────────────────────────────────────────── */
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

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      <span className="ml-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Loading…</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <FileText className="w-10 h-10" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message || 'No data available.'}</p>
    </div>
  );
}

function TypeBadge({ type }) {
  const color = typeColor(type);
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: `${color}18`, color }}
    >
      {type || '—'}
    </span>
  );
}

function BalancedBadge({ balanced }) {
  const color = balanced ? 'var(--success)' : 'var(--danger)';
  const bg = balanced ? 'rgba(22,163,74,0.10)' : 'rgba(239,68,68,0.10)';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg border"
      style={{ color, background: bg, borderColor: color }}
    >
      <Scale className="w-3.5 h-3.5" />
      {balanced ? 'Balanced' : 'Out of balance'}
    </span>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border text-sm"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function AccountingPage() {
  const [tab, setTab] = useState('chart');
  const queryClient = useQueryClient();

  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;

  // Date filters
  const [pnlFrom, setPnlFrom] = useState(daysAgo(30));
  const [pnlTo, setPnlTo] = useState(today());
  const [tbAsOf, setTbAsOf] = useState(today());
  const [bsAsOf, setBsAsOf] = useState(today());
  const [ledgerFrom, setLedgerFrom] = useState(daysAgo(30));
  const [ledgerTo, setLedgerTo] = useState(today());

  const outletQ = outletId ? `&outlet_id=${outletId}` : '';

  /* ── Queries ──────────────────────────────────────────────────────────── */
  const chartQ = useQuery({
    queryKey: ['acct-chart', outletId],
    queryFn: () => api.get(`/accounting/chart?_=1${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'chart',
    staleTime: 120_000,
  });

  const ledgerQ = useQuery({
    queryKey: ['acct-ledger', outletId, ledgerFrom, ledgerTo],
    queryFn: () => api.get(`/accounting/ledger?from=${ledgerFrom}&to=${ledgerTo}&limit=100${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'ledger',
    staleTime: 60_000,
  });

  const trialQ = useQuery({
    queryKey: ['acct-trial', outletId, tbAsOf],
    queryFn: () => api.get(`/accounting/trial-balance?as_of=${tbAsOf}${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'trial',
    staleTime: 60_000,
  });

  const pnlQ = useQuery({
    queryKey: ['acct-pnl', outletId, pnlFrom, pnlTo],
    queryFn: () => api.get(`/accounting/profit-loss?from=${pnlFrom}&to=${pnlTo}${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'pnl',
    staleTime: 60_000,
  });

  const balanceQ = useQuery({
    queryKey: ['acct-balance', outletId, bsAsOf],
    queryFn: () => api.get(`/accounting/balance-sheet?as_of=${bsAsOf}${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'balance',
    staleTime: 60_000,
  });

  /* ── Mutations ────────────────────────────────────────────────────────── */
  const invalidateAll = () =>
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('acct-') });

  const seedM = useMutation({
    mutationFn: () => api.post('/accounting/seed', outletId ? { outlet_id: outletId } : {}),
    onSuccess: () => { toast.success('Chart of accounts seeded'); invalidateAll(); },
    onError: (e) => toast.error(e?.message || 'Seed failed'),
  });

  const backfillM = useMutation({
    mutationFn: () => api.post('/accounting/backfill', outletId ? { outlet_id: outletId } : {}),
    onSuccess: () => { toast.success('Backfilled journal entries from history'); invalidateAll(); },
    onError: (e) => toast.error(e?.message || 'Backfill failed'),
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Accounting
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Native double-entry ledger &middot; chart of accounts, trial balance & statements
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={() => seedM.mutate()}
            disabled={seedM.isPending}
            className="btn-secondary btn-sm"
          >
            {seedM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
            {seedM.isPending ? 'Seeding…' : 'Seed Chart'}
          </button>
          <button
            onClick={() => backfillM.mutate()}
            disabled={backfillM.isPending}
            className="btn-primary btn-sm"
          >
            {backfillM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {backfillM.isPending ? 'Backfilling…' : 'Backfill from history'}
          </button>
        </div>
      </div>

      {/* ── Tab selector ────────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-1 p-1 rounded-xl border min-w-max" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 whitespace-nowrap"
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-text, #fff)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      {tab === 'chart' && <ChartTab query={chartQ} />}
      {tab === 'ledger' && (
        <LedgerTab
          query={ledgerQ}
          from={ledgerFrom} to={ledgerTo}
          setFrom={setLedgerFrom} setTo={setLedgerTo}
        />
      )}
      {tab === 'trial' && (
        <TrialBalanceTab query={trialQ} asOf={tbAsOf} setAsOf={setTbAsOf} />
      )}
      {tab === 'pnl' && (
        <PnlTab query={pnlQ} from={pnlFrom} to={pnlTo} setFrom={setPnlFrom} setTo={setPnlTo} />
      )}
      {tab === 'balance' && (
        <BalanceSheetTab query={balanceQ} asOf={bsAsOf} setAsOf={setBsAsOf} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1: CHART OF ACCOUNTS                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ChartTab({ query }) {
  if (query.isLoading) return <LoadingState />;
  const accounts = Array.isArray(query.data) ? query.data : (query.data?.accounts ?? []);
  if (!accounts.length) return <EmptyState message="No accounts yet — seed the chart of accounts to get started." />;

  // Group by type, preserving a sensible order.
  const order = ['asset', 'liability', 'equity', 'revenue', 'income', 'expense'];
  const groups = {};
  accounts.forEach((a) => {
    const key = String(a.type || 'other').toLowerCase();
    (groups[key] ||= []).push(a);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="space-y-6">
      {groupKeys.map((g) => (
        <Card key={g} className="overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <TypeBadge type={g} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {groups[g].length} account{groups[g].length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Code', 'Name', 'Subtype', 'GST', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups[g].map((a, i) => (
                  <tr key={a.code ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{a.code}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{a.name}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{a.subtype || '—'}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{a.gst || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: a.is_active ? 'rgba(22,163,74,0.12)' : 'var(--bg-primary)',
                          color: a.is_active ? 'var(--success)' : 'var(--text-secondary)',
                        }}
                      >
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 2: LEDGER                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */
function LedgerTab({ query, from, to, setFrom, setTo }) {
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
        </div>
      </Card>

      {query.isLoading ? (
        <LoadingState />
      ) : !(query.data || []).length ? (
        <EmptyState message="No journal entries in this range." />
      ) : (
        <div className="space-y-4">
          {query.data.map((entry, idx) => {
            const lines = entry.lines || [];
            const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
            const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
            return (
              <Card key={entry.id ?? idx} className="overflow-hidden">
                <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {entry.entry_date ? new Date(entry.entry_date).toLocaleDateString('en-AU') : '—'}
                    </span>
                    {entry.source && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: 'var(--accent)18', color: 'var(--accent)' }}>
                        {entry.source}
                      </span>
                    )}
                    {entry.reference && (
                      <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{entry.reference}</span>
                    )}
                  </div>
                  {entry.memo && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.memo}</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--bg-primary)' }}>
                        {['Account', 'Description', 'Debit', 'Credit'].map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                            <span className="font-mono font-semibold">{l.account_code}</span>
                            {l.account_name ? <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>{l.account_name}</span> : null}
                          </td>
                          <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{l.description || '—'}</td>
                          <td className="px-4 py-2 text-xs font-medium" style={{ color: Number(l.debit) ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {Number(l.debit) ? fmtAUD(l.debit) : '—'}
                          </td>
                          <td className="px-4 py-2 text-xs font-medium" style={{ color: Number(l.credit) ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {Number(l.credit) ? fmtAUD(l.credit) : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--bg-primary)', borderTop: '2px solid var(--border)' }}>
                        <td className="px-4 py-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }} colSpan={2}>Totals</td>
                        <td className="px-4 py-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totalDebit)}</td>
                        <td className="px-4 py-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totalCredit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 3: TRIAL BALANCE                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
function TrialBalanceTab({ query, asOf, setAsOf }) {
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="As of" value={asOf} onChange={setAsOf} />
        </div>
      </Card>

      {query.isLoading ? (
        <LoadingState />
      ) : !query.data?.accounts?.length ? (
        <EmptyState message="No trial-balance data. Try seeding & backfilling first." />
      ) : (() => {
        const { accounts = [], totals = {} } = query.data;
        const balanced = Number(totals.debit) === Number(totals.credit);
        return (
          <Card className="overflow-hidden">
            <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Trial Balance</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  As of {query.data.as_of ? new Date(query.data.as_of).toLocaleDateString('en-AU') : asOf}
                </p>
              </div>
              <BalancedBadge balanced={balanced} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-primary)' }}>
                    {['Code', 'Name', 'Type', 'Debit', 'Credit', 'Balance'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a, i) => (
                    <tr key={a.code ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-2.5 text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{a.code}</td>
                      <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{a.name}</td>
                      <td className="px-4 py-2.5"><TypeBadge type={a.type} /></td>
                      <td className="px-4 py-2.5 text-xs font-medium" style={{ color: Number(a.debit) ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{Number(a.debit) ? fmtAUD(a.debit) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs font-medium" style={{ color: Number(a.credit) ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{Number(a.credit) ? fmtAUD(a.credit) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(a.balance)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--bg-primary)', borderTop: '2px solid var(--border)' }}>
                    <td className="px-4 py-3 text-xs font-extrabold" style={{ color: 'var(--text-primary)' }} colSpan={3}>TOTALS</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totals.debit)}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totals.credit)}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: balanced ? 'var(--success)' : 'var(--danger)' }}>
                      {balanced ? 'OK' : fmtAUD(Number(totals.debit) - Number(totals.credit))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 4: PROFIT & LOSS                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AmountRow({ name, code, amount, color }) {
  return (
    <div className="flex items-center justify-between py-2 px-1" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
        {code ? <span className="font-mono font-semibold mr-2" style={{ color: 'var(--text-secondary)' }}>{code}</span> : null}
        {name}
      </span>
      <span className="text-xs font-semibold" style={{ color: color || 'var(--text-primary)' }}>{fmtAUD(amount)}</span>
    </div>
  );
}

function PnlTab({ query, from, to, setFrom, setTo }) {
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="From" value={from} onChange={setFrom} />
          <DateField label="To" value={to} onChange={setTo} />
        </div>
      </Card>

      {query.isLoading ? (
        <LoadingState />
      ) : !query.data ? (
        <EmptyState message="No P&L data for this period." />
      ) : (() => {
        const d = query.data;
        const revenue = d.revenue || {};
        const expenses = d.expenses || {};
        const netProfit = d.net_profit ?? 0;
        const netColor = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';
        return (
          <div className="space-y-6">
            {/* Net profit hero */}
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Net Profit</p>
              <p className="text-4xl font-extrabold tracking-tight" style={{ color: netColor }}>{fmtAUD(netProfit)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {d.from ? new Date(d.from).toLocaleDateString('en-AU') : from} → {d.to ? new Date(d.to).toLocaleDateString('en-AU') : to}
              </p>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue */}
              <Card className="p-5">
                <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Revenue</h3>
                {(revenue.accounts || []).length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No revenue accounts</p>
                ) : (
                  revenue.accounts.map((a, i) => (
                    <AmountRow key={a.code ?? i} code={a.code} name={a.name} amount={a.amount} color="#06b6d4" />
                  ))
                )}
                <div className="flex items-center justify-between pt-3 mt-1">
                  <span className="text-xs font-extrabold uppercase" style={{ color: 'var(--text-secondary)' }}>Total Revenue</span>
                  <span className="text-sm font-extrabold" style={{ color: '#06b6d4' }}>{fmtAUD(revenue.total)}</span>
                </div>
              </Card>

              {/* Expenses */}
              <Card className="p-5">
                <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Expenses</h3>
                {(expenses.accounts || []).length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No expense accounts</p>
                ) : (
                  expenses.accounts.map((a, i) => (
                    <AmountRow key={a.code ?? i} code={a.code} name={a.name} amount={a.amount} color="#ef4444" />
                  ))
                )}
                <div className="flex items-center justify-between pt-3 mt-1">
                  <span className="text-xs font-extrabold uppercase" style={{ color: 'var(--text-secondary)' }}>Total Expenses</span>
                  <span className="text-sm font-extrabold" style={{ color: '#ef4444' }}>{fmtAUD(expenses.total)}</span>
                </div>
              </Card>
            </div>

            {/* Summary line items */}
            <Card className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>COGS</p>
                  <p className="text-xl font-extrabold" style={{ color: '#f59e0b' }}>{fmtAUD(d.cogs_total)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Gross Profit</p>
                  <p className="text-xl font-extrabold" style={{ color: (d.gross_profit ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtAUD(d.gross_profit)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Net Profit</p>
                  <p className="text-xl font-extrabold" style={{ color: netColor }}>{fmtAUD(netProfit)}</p>
                </div>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 5: BALANCE SHEET                                                      */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BalanceSection({ title, section, color }) {
  const accounts = section?.accounts || [];
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {accounts.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No {title.toLowerCase()}</p>
      ) : (
        accounts.map((a, i) => (
          <AmountRow key={a.code ?? i} code={a.code} name={a.name} amount={a.amount} color={color} />
        ))
      )}
      <div className="flex items-center justify-between pt-3 mt-1">
        <span className="text-xs font-extrabold uppercase" style={{ color: 'var(--text-secondary)' }}>Total {title}</span>
        <span className="text-sm font-extrabold" style={{ color }}>{fmtAUD(section?.total)}</span>
      </div>
    </Card>
  );
}

function BalanceSheetTab({ query, asOf, setAsOf }) {
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="As of" value={asOf} onChange={setAsOf} />
        </div>
      </Card>

      {query.isLoading ? (
        <LoadingState />
      ) : !query.data ? (
        <EmptyState message="No balance-sheet data. Try seeding & backfilling first." />
      ) : (() => {
        const d = query.data;
        return (
          <div className="space-y-6">
            <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Balance Sheet</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  As of {d.as_of ? new Date(d.as_of).toLocaleDateString('en-AU') : asOf}
                </p>
              </div>
              <BalancedBadge balanced={!!d.balanced} />
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <BalanceSection title="Assets" section={d.assets} color="#22c55e" />
              <BalanceSection title="Liabilities" section={d.liabilities} color="#f59e0b" />
              <BalanceSection title="Equity" section={d.equity} color="#a78bfa" />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
