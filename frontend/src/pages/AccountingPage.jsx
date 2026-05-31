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
import BankReconciliation from '../components/accounting/BankReconciliation';
import {
  BookOpen, Scale, TrendingUp, Landmark, FileText,
  RefreshCw, Loader2, Receipt, Banknote, Clock, Plus, BookText,
  Lock, Unlock, CalendarDays, FileCheck,
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
const iso = (d) => d.toISOString().split('T')[0];
const quarterStart = () => {
  const n = new Date();
  const q = Math.floor(n.getMonth() / 3) * 3;
  return iso(new Date(n.getFullYear(), q, 1));
};
const quarterEnd = () => {
  const n = new Date();
  const q = Math.floor(n.getMonth() / 3) * 3;
  return iso(new Date(n.getFullYear(), q + 3, 0));
};

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
  { key: 'bas',     label: 'BAS / Tax',         icon: Receipt },
  { key: 'baslodge', label: 'BAS Lodge',        icon: FileCheck },
  { key: 'cashflow', label: 'Cash Flow',        icon: Banknote },
  { key: 'aging',   label: 'Aging',             icon: Clock },
  { key: 'journal', label: 'Manual Journal',    icon: BookText },
  { key: 'lock',    label: 'Period Lock',       icon: Lock },
  { key: 'bankrec', label: 'Bank Rec',          icon: Landmark },
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

function StatCard({ label, value, color }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-xl font-extrabold tracking-tight" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
    </Card>
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
  const [basFrom, setBasFrom] = useState(quarterStart());
  const [basTo, setBasTo] = useState(quarterEnd());
  const [cfFrom, setCfFrom] = useState(daysAgo(30));
  const [cfTo, setCfTo] = useState(today());
  const [agingAsOf, setAgingAsOf] = useState(today());

  const outletQ = outletId ? `&outlet_id=${outletId}` : '';

  /* ── Queries ──────────────────────────────────────────────────────────── */
  const chartQ = useQuery({
    queryKey: ['acct-chart', outletId],
    queryFn: () => api.get(`/accounting/chart?_=1${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'chart' || tab === 'journal',
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

  const basQ = useQuery({
    queryKey: ['acct-bas', outletId, basFrom, basTo],
    queryFn: () => api.get(`/accounting/bas?from=${basFrom}&to=${basTo}${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'bas',
    staleTime: 60_000,
  });

  const cashflowQ = useQuery({
    queryKey: ['acct-cashflow', outletId, cfFrom, cfTo],
    queryFn: () => api.get(`/accounting/cash-flow?from=${cfFrom}&to=${cfTo}${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'cashflow',
    staleTime: 60_000,
  });

  const receivablesQ = useQuery({
    queryKey: ['acct-receivables', outletId, agingAsOf],
    queryFn: () => api.get(`/accounting/receivables-aging?as_of=${agingAsOf}${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'aging',
    staleTime: 60_000,
  });

  const payablesQ = useQuery({
    queryKey: ['acct-payables', outletId, agingAsOf],
    queryFn: () => api.get(`/accounting/payables-aging?as_of=${agingAsOf}${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'aging',
    staleTime: 60_000,
  });

  const basLodgeQ = useQuery({
    queryKey: ['acct-baslodge', outletId],
    queryFn: () => api.get(`/accounting/bas-lodgements?_=1${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'baslodge',
    staleTime: 60_000,
  });

  const periodsQ = useQuery({
    queryKey: ['acct-periods', outletId],
    queryFn: () => api.get(`/accounting/periods?_=1${outletQ}`).then((r) => r.data?.data ?? r.data),
    enabled: tab === 'lock',
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

  const payBillM = useMutation({
    mutationFn: ({ po_id, amount }) => api.post('/accounting/pay-bill', { po_id, amount, method: 'bank' }),
    onSuccess: (_r, vars) => {
      toast.success(`Paid ${fmtAUD(vars?.amount)}`);
      queryClient.invalidateQueries({ queryKey: ['acct-payables'] });
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('acct-') });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Payment failed'),
  });

  const lockPeriodM = useMutation({
    mutationFn: ({ period, note }) => api.post('/accounting/periods/lock', outletId ? { period, note, outlet_id: outletId } : { period, note }),
    onSuccess: () => {
      toast.success('Period locked');
      queryClient.invalidateQueries({ queryKey: ['acct-periods'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Lock failed'),
  });

  const unlockPeriodM = useMutation({
    mutationFn: ({ period }) => api.post('/accounting/periods/unlock', outletId ? { period, outlet_id: outletId } : { period }),
    onSuccess: () => {
      toast.success('Period unlocked');
      queryClient.invalidateQueries({ queryKey: ['acct-periods'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Unlock failed'),
  });

  const addAccountM = useMutation({
    mutationFn: (payload) => api.post('/accounting/accounts', outletId ? { ...payload, outlet_id: outletId } : payload),
    onSuccess: () => { toast.success('Account added'); queryClient.invalidateQueries({ queryKey: ['acct-chart'] }); },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Add account failed'),
  });

  const deactivateAccountM = useMutation({
    mutationFn: (id) => api.delete(`/accounting/accounts/${id}`),
    onSuccess: () => { toast.success('Account deactivated'); queryClient.invalidateQueries({ queryKey: ['acct-chart'] }); },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Deactivate failed'),
  });

  const prepareBasM = useMutation({
    mutationFn: ({ period_start, period_end }) =>
      api.post('/accounting/bas-lodgements', outletId
        ? { period_start, period_end, outlet_id: outletId }
        : { period_start, period_end }),
    onSuccess: () => {
      toast.success('BAS prepared');
      queryClient.invalidateQueries({ queryKey: ['acct-baslodge'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Prepare BAS failed'),
  });

  const lodgeBasM = useMutation({
    mutationFn: (id) =>
      api.post(`/accounting/bas-lodgements/${id}/lodge`, outletId ? { outlet_id: outletId } : {}),
    onSuccess: () => {
      toast.success('BAS marked lodged');
      queryClient.invalidateQueries({ queryKey: ['acct-baslodge'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Lodge failed'),
  });

  const journalM = useMutation({
    mutationFn: (payload) => api.post('/accounting/manual-journal', outletId ? { ...payload, outlet_id: outletId } : payload),
    onSuccess: () => {
      toast.success('Journal entry posted');
      queryClient.invalidateQueries({ queryKey: ['acct-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['acct-trial'] });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e?.message || 'Journal post failed'),
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
      {tab === 'chart' && <ChartTab query={chartQ} addM={addAccountM} deactivateM={deactivateAccountM} />}
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
      {tab === 'bas' && (
        <BasTab query={basQ} from={basFrom} to={basTo} setFrom={setBasFrom} setTo={setBasTo} />
      )}
      {tab === 'baslodge' && (
        <BasLodgeTab query={basLodgeQ} prepareM={prepareBasM} lodgeM={lodgeBasM} />
      )}
      {tab === 'cashflow' && (
        <CashFlowTab query={cashflowQ} from={cfFrom} to={cfTo} setFrom={setCfFrom} setTo={setCfTo} />
      )}
      {tab === 'aging' && (
        <AgingTab
          receivablesQ={receivablesQ} payablesQ={payablesQ}
          asOf={agingAsOf} setAsOf={setAgingAsOf} payBillM={payBillM}
        />
      )}
      {tab === 'journal' && (
        <ManualJournalTab chartQuery={chartQ} journalM={journalM} />
      )}
      {tab === 'lock' && (
        <PeriodLockTab query={periodsQ} lockM={lockPeriodM} unlockM={unlockPeriodM} />
      )}
      {tab === 'bankrec' && (
        <BankReconciliation outletId={outletId} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 1: CHART OF ACCOUNTS                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AddAccountForm({ addM, onDone }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('ASSET');
  const [subtype, setSubtype] = useState('');
  const [gst, setGst] = useState(false);

  const submit = () => {
    if (!code.trim() || !name.trim()) { toast.error('Code and name are required'); return; }
    addM.mutate(
      { code: code.trim(), name: name.trim(), type, subtype: subtype.trim() || undefined, gst },
      { onSuccess: () => { setCode(''); setName(''); setSubtype(''); setGst(false); onDone?.(); } },
    );
  };

  const inputCls = 'px-3 py-2 rounded-lg border text-sm';
  const inputStyle = { background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Code</label>
          <input className={inputCls} style={{ ...inputStyle, width: 110 }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="1000" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Name</label>
          <input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cash on hand" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Type</label>
          <select className={inputCls} style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
            {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Subtype</label>
          <input className={inputCls} style={{ ...inputStyle, width: 140 }} value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="optional" />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium pb-2.5" style={{ color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={gst} onChange={(e) => setGst(e.target.checked)} />
          GST
        </label>
        <button onClick={submit} disabled={addM.isPending} className="btn-primary btn-sm">
          {addM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>
    </Card>
  );
}

function ChartTab({ query, addM, deactivateM }) {
  const [showForm, setShowForm] = useState(false);
  if (query.isLoading) return <LoadingState />;
  const accounts = Array.isArray(query.data) ? query.data : (query.data?.accounts ?? []);

  const header = (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Chart of Accounts</h3>
      <button onClick={() => setShowForm((v) => !v)} className="btn-secondary btn-sm">
        <Plus className="w-3.5 h-3.5" />{showForm ? 'Close' : 'Add Account'}
      </button>
    </div>
  );

  if (!accounts.length) {
    return (
      <div className="space-y-6">
        {header}
        {showForm && <AddAccountForm addM={addM} onDone={() => setShowForm(false)} />}
        <EmptyState message="No accounts yet — seed the chart of accounts to get started." />
      </div>
    );
  }

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
      {header}
      {showForm && <AddAccountForm addM={addM} onDone={() => setShowForm(false)} />}
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
                  {['Code', 'Name', 'Subtype', 'GST', 'Status', ''].map((h) => (
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
                    <td className="px-4 py-2.5 text-right">
                      {a.id && a.is_active ? (
                        <button
                          onClick={() => deactivateM.mutate(a.id)}
                          disabled={deactivateM.isPending}
                          className="text-xs font-semibold hover:underline"
                          style={{ color: 'var(--danger)' }}
                        >
                          Deactivate
                        </button>
                      ) : null}
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

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 6: BAS / TAX                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BasTab({ query, from, to, setFrom, setTo }) {
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
        <EmptyState message="No BAS data for this period." />
      ) : (() => {
        const d = query.data;
        const payable = !!d.payable;
        const net = Number(d.net_gst) || 0;
        const netColor = payable ? 'var(--danger)' : 'var(--success)';
        return (
          <div className="space-y-6">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>
                Net GST {d.period_label ? `· ${d.period_label}` : ''}
              </p>
              <p className="text-4xl font-extrabold tracking-tight" style={{ color: netColor }}>{fmtAUD(Math.abs(net))}</p>
              <p className="text-sm font-semibold mt-1" style={{ color: netColor }}>
                {payable ? 'Payable to ATO' : 'Refund from ATO'}
              </p>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="G1 Total sales" value={fmtAUD(d.G1_total_sales)} />
              <StatCard label="1A GST on sales" value={fmtAUD(d.gst_on_sales_1A)} color="#06b6d4" />
              <StatCard label="G11 Purchases" value={fmtAUD(d.G11_purchases)} />
              <StatCard label="1B GST on purchases" value={fmtAUD(d.gst_on_purchases_1B)} color="#f59e0b" />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 7: CASH FLOW                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */
function CashFlowTab({ query, from, to, setFrom, setTo }) {
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
        <EmptyState message="No cash-flow data for this period." />
      ) : (() => {
        const d = query.data;
        const inflows = d.inflows || [];
        const outflows = d.outflows || [];
        const net = Number(d.net_change) || 0;
        const netColor = net >= 0 ? 'var(--success)' : 'var(--danger)';
        return (
          <div className="space-y-6">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>Net Change</p>
              <p className="text-4xl font-extrabold tracking-tight" style={{ color: netColor }}>{fmtAUD(net)}</p>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-5">
                <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Inflows</h3>
                {inflows.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No inflows</p>
                ) : (
                  inflows.map((r, i) => <AmountRow key={i} name={r.label} amount={r.amount} color="#22c55e" />)
                )}
                <div className="flex items-center justify-between pt-3 mt-1">
                  <span className="text-xs font-extrabold uppercase" style={{ color: 'var(--text-secondary)' }}>Total In</span>
                  <span className="text-sm font-extrabold" style={{ color: '#22c55e' }}>{fmtAUD(d.total_in)}</span>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Outflows</h3>
                {outflows.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No outflows</p>
                ) : (
                  outflows.map((r, i) => <AmountRow key={i} name={r.label} amount={r.amount} color="#ef4444" />)
                )}
                <div className="flex items-center justify-between pt-3 mt-1">
                  <span className="text-xs font-extrabold uppercase" style={{ color: 'var(--text-secondary)' }}>Total Out</span>
                  <span className="text-sm font-extrabold" style={{ color: '#ef4444' }}>{fmtAUD(d.total_out)}</span>
                </div>
              </Card>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 8: AGING (Receivables + Payables)                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
const BUCKET_KEYS = ['0-30', '31-60', '61-90', '90+'];

function BucketCards({ buckets = {} }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {BUCKET_KEYS.map((k) => (
        <StatCard
          key={k}
          label={`${k} days`}
          value={fmtAUD(buckets[k])}
          color={k === '90+' ? 'var(--danger)' : k === '61-90' ? '#f59e0b' : undefined}
        />
      ))}
    </div>
  );
}

function AgingSection({ title, query, partyKey, payBillM }) {
  if (query.isLoading) return <LoadingState />;
  const d = query.data || {};
  const items = d.items || [];
  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <span className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>Total {fmtAUD(d.total)}</span>
      </div>
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <BucketCards buckets={d.buckets} />
      </div>
      {items.length === 0 ? (
        <EmptyState message={`No ${title.toLowerCase()} outstanding.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Ref', partyKey === 'supplier' ? 'Supplier' : 'Customer', 'Date', 'Days', 'Amount', payBillM ? '' : null]
                  .filter((h) => h !== null)
                  .map((h, i) => (
                    <th key={`${h}-${i}`} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const poId = it.po_id ?? it.id ?? null;
                return (
                  <tr key={it.ref ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{it.ref || '—'}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-primary)' }}>{it[partyKey] || '—'}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{it.date ? new Date(it.date).toLocaleDateString('en-AU') : '—'}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: Number(it.days) > 90 ? 'var(--danger)' : 'var(--text-secondary)' }}>{it.days ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(it.amount)}</td>
                    {payBillM && (
                      <td className="px-4 py-2.5 text-right">
                        {poId ? (
                          <button
                            onClick={() => {
                              const out = Number(it.amount) || 0;
                              const raw = window.prompt(
                                `Amount to pay (outstanding ${fmtAUD(out)}):`,
                                String(out.toFixed(2)),
                              );
                              if (raw == null) return;
                              const amount = Number(raw);
                              if (!Number.isFinite(amount) || amount <= 0) {
                                toast.error('Enter a valid amount'); return;
                              }
                              payBillM.mutate({ po_id: poId, amount });
                            }}
                            disabled={payBillM.isPending}
                            className="btn-primary btn-sm"
                          >
                            <Banknote className="w-3.5 h-3.5" />Pay
                          </button>
                        ) : (
                          <button
                            disabled
                            title="PO id unavailable"
                            className="btn-secondary btn-sm opacity-50 cursor-not-allowed"
                          >
                            <Banknote className="w-3.5 h-3.5" />Pay
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AgingTab({ receivablesQ, payablesQ, asOf, setAsOf, payBillM }) {
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="As of" value={asOf} onChange={setAsOf} />
        </div>
      </Card>
      <AgingSection title="Receivables" query={receivablesQ} partyKey="customer" />
      <AgingSection title="Payables" query={payablesQ} partyKey="supplier" payBillM={payBillM} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 9: MANUAL JOURNAL                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */
function ManualJournalTab({ chartQuery, journalM }) {
  const accounts = Array.isArray(chartQuery.data) ? chartQuery.data : (chartQuery.data?.accounts ?? []);
  const [entryDate, setEntryDate] = useState(today());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([
    { account_code: '', debit: '', credit: '', description: '' },
    { account_code: '', debit: '', credit: '', description: '' },
  ]);

  const updateLine = (idx, field, value) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  const addLine = () => setLines((ls) => [...ls, { account_code: '', debit: '', credit: '', description: '' }]);
  const removeLine = (idx) => setLines((ls) => (ls.length > 2 ? ls.filter((_, i) => i !== idx) : ls));

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;
  const allCoded = lines.every((l) => l.account_code);
  const canSubmit = balanced && allCoded && !journalM.isPending;

  const submit = () => {
    if (!canSubmit) { toast.error('Entry must be coded and balanced'); return; }
    const payload = {
      entry_date: entryDate,
      memo: memo.trim() || undefined,
      lines: lines.map((l) => ({
        account_code: l.account_code,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description.trim() || undefined,
      })),
    };
    journalM.mutate(payload, {
      onSuccess: () => {
        setMemo('');
        setEntryDate(today());
        setLines([
          { account_code: '', debit: '', credit: '', description: '' },
          { account_code: '', debit: '', credit: '', description: '' },
        ]);
      },
    });
  };

  const inputCls = 'px-2 py-1.5 rounded-lg border text-xs w-full';
  const inputStyle = { background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="Entry date" value={entryDate} onChange={setEntryDate} />
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Memo</label>
            <input className="px-3 py-2 rounded-lg border text-sm" style={inputStyle} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Description of this entry" />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Account', 'Description', 'Debit', 'Credit', ''].map((h, i) => (
                  <th key={`${h}-${i}`} className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2" style={{ minWidth: 180 }}>
                    <select className={inputCls} style={inputStyle} value={l.account_code} onChange={(e) => updateLine(i, 'account_code', e.target.value)}>
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2" style={{ minWidth: 160 }}>
                    <input className={inputCls} style={inputStyle} value={l.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="optional" />
                  </td>
                  <td className="px-3 py-2" style={{ width: 120 }}>
                    <input type="number" step="0.01" min="0" className={inputCls} style={inputStyle} value={l.debit} onChange={(e) => updateLine(i, 'debit', e.target.value)} placeholder="0.00" />
                  </td>
                  <td className="px-3 py-2" style={{ width: 120 }}>
                    <input type="number" step="0.01" min="0" className={inputCls} style={inputStyle} value={l.credit} onChange={(e) => updateLine(i, 'credit', e.target.value)} placeholder="0.00" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {lines.length > 2 && (
                      <button onClick={() => removeLine(i)} className="text-xs font-semibold hover:underline" style={{ color: 'var(--danger)' }}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-primary)', borderTop: '2px solid var(--border)' }}>
                <td className="px-3 py-2.5 text-xs font-bold" style={{ color: 'var(--text-secondary)' }} colSpan={2}>Totals</td>
                <td className="px-3 py-2.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totalDebit)}</td>
                <td className="px-3 py-2.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totalCredit)}</td>
                <td className="px-3 py-2.5" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={addLine} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" />Add line</button>
          <BalancedBadge balanced={balanced} />
        </div>
        <button onClick={submit} disabled={!canSubmit} className="btn-primary btn-sm" style={{ opacity: canSubmit ? 1 : 0.5 }}>
          {journalM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookText className="w-3.5 h-3.5" />}
          Post Journal
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB: BAS LODGE                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
function BasLodgeTab({ query, prepareM, lodgeM }) {
  const [periodStart, setPeriodStart] = useState(quarterStart());
  const [periodEnd, setPeriodEnd] = useState(quarterEnd());

  const rows = Array.isArray(query.data) ? query.data : (query.data?.lodgements ?? []);

  const submit = () => {
    if (!periodStart || !periodEnd) { toast.error('Pick a start and end date'); return; }
    prepareM.mutate({ period_start: periodStart, period_end: periodEnd });
  };

  return (
    <div className="space-y-6">
      {/* Prepare form */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <DateField label="Period start" value={periodStart} onChange={setPeriodStart} />
          <DateField label="Period end" value={periodEnd} onChange={setPeriodEnd} />
          <button onClick={submit} disabled={prepareM.isPending} className="btn-primary btn-sm">
            {prepareM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
            Prepare BAS
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
          Computes G1/1A/G11/1B/Net GST from the ledger for the period.
        </p>
      </Card>

      {/* Lodgements list */}
      {query.isLoading ? (
        <LoadingState />
      ) : !rows.length ? (
        <EmptyState message="No BAS lodgements yet — prepare one to get started." />
      ) : (
        <Card className="overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <FileCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>BAS Lodgements</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Period', 'G1', 'Net GST', 'Status', ''].map((h, i) => (
                    <th key={`${h}-${i}`} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const lodged = String(r.status || '').toLowerCase() === 'lodged';
                  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-AU') : '—');
                  return (
                    <tr key={r.id ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-primary)' }}>
                        {fmtDate(r.period_start)} → {fmtDate(r.period_end)}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fmtAUD(r.g1)}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(r.net_gst)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                          style={{
                            background: lodged ? 'rgba(22,163,74,0.12)' : 'var(--bg-primary)',
                            color: lodged ? 'var(--success)' : 'var(--text-secondary)',
                          }}
                        >
                          {lodged ? 'Lodged' : 'Draft'}
                          {lodged && r.reference ? <span className="font-mono normal-case">· {r.reference}</span> : null}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {!lodged && r.id ? (
                          <button
                            onClick={() => lodgeM.mutate(r.id)}
                            disabled={lodgeM.isPending}
                            className="btn-secondary btn-sm"
                          >
                            <FileCheck className="w-3.5 h-3.5" />Mark Lodged
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Recording lodgement only — not transmitted to the ATO.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  TAB 10: PERIOD LOCK                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */
function PeriodLockTab({ query, lockM, unlockM }) {
  const [period, setPeriod] = useState('');
  const [note, setNote] = useState('');

  const inputCls = 'px-3 py-2 rounded-lg border text-sm';
  const inputStyle = { background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

  const submit = () => {
    if (!period) { toast.error('Pick a month to lock'); return; }
    lockM.mutate(
      { period, note: note.trim() || undefined },
      { onSuccess: () => { setPeriod(''); setNote(''); } },
    );
  };

  const periods = Array.isArray(query.data) ? query.data : (query.data?.periods ?? []);

  return (
    <div className="space-y-6">
      {/* Lock form */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Month</label>
            <input
              type="month"
              className={inputCls}
              style={inputStyle}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Note</label>
            <input className={inputCls} style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </div>
          <button onClick={submit} disabled={lockM.isPending} className="btn-primary btn-sm">
            {lockM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            Lock period
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
          Locking a month prevents any further journal entries (sales, bills, manual) from posting into it.
        </p>
      </Card>

      {/* Locked periods list */}
      {query.isLoading ? (
        <LoadingState />
      ) : !periods.length ? (
        <EmptyState message="No locked periods yet." />
      ) : (
        <Card className="overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <CalendarDays className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Locked Periods</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Period', 'Locked', 'Note', ''].map((h, i) => (
                    <th key={`${h}-${i}`} className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p, i) => (
                  <tr key={p.period ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 text-xs font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{p.period}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {p.locked_at ? new Date(p.locked_at).toLocaleDateString('en-AU') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{p.note || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => unlockM.mutate({ period: p.period })}
                        disabled={unlockM.isPending}
                        className="btn-secondary btn-sm"
                      >
                        <Unlock className="w-3.5 h-3.5" />Unlock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
