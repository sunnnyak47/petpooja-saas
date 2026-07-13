import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import {
  TrendingUp, TrendingDown, ReceiptText, ArrowDownLeft, ArrowUpRight, PieChart,
  Loader2, Sparkles, FileText, Landmark, ChevronRight, AlertTriangle, CalendarClock,
  BookOpen, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * OwnerDashboard — the plain-language "Owner Mode" front door to Accounting.
 * Reframes the double-entry books into the five questions an owner actually
 * asks. Data comes from GET /accounting/owner-dashboard (an aggregator over the
 * existing P&L / BAS / aging reports). Read-only; the pro tabs sit above it.
 */
export default function OwnerDashboard({ outletId, setTab }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const outletQ = outletId ? `?outlet_id=${outletId}` : '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['owner-dashboard', outletId],
    queryFn: () => api.get(`/accounting/owner-dashboard${outletQ}`).then((r) => r.data),
    refetchInterval: 5 * 60_000,
  });

  const seedM = useMutation({
    mutationFn: () => api.post('/accounting/seed', outletId ? { outlet_id: outletId } : {}),
    onSuccess: () => toast.success('Chart of accounts ready'),
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not seed the chart'),
  });
  const backfillM = useMutation({
    mutationFn: () => api.post('/accounting/backfill', outletId ? { outlet_id: outletId } : {}),
    onSuccess: () => { toast.success('Books built from your history'); qc.invalidateQueries({ queryKey: ['owner-dashboard'] }); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not build the books'),
  });

  const cur = data?.currency || 'AUD';
  const fmt = useMemo(() => {
    const locale = cur === 'INR' ? 'en-IN' : 'en-AU';
    return (n) => new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
  }, [cur]);
  const taxWord = (data?.region === 'IN') ? 'GST' : 'BAS';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-56">
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="card text-center py-12">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--warning)' }} />
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Couldn&apos;t load your money summary.</p>
        <button onClick={() => refetch()} className="btn-primary btn-sm">Retry</button>
      </div>
    );
  }

  // First-run: no ledger yet → guide the owner to seed + backfill in two taps.
  if (data && !data.has_data) {
    return (
      <div className="card text-center py-14 max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
          <Sparkles className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Let&apos;s set up your books</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          Two taps and your sales, purchases, expenses and tax turn into a live money dashboard — no accounting knowledge needed.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => seedM.mutate()} disabled={seedM.isPending} className="btn-secondary btn-sm">
            {seedM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />} 1. Set up accounts
          </button>
          <button onClick={() => backfillM.mutate()} disabled={backfillM.isPending} className="btn-primary btn-sm">
            {backfillM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} 2. Build from history
          </button>
        </div>
      </div>
    );
  }

  const p = data.profit || {};
  const up = p.is_up;
  const Delta = up ? TrendingUp : TrendingDown;
  const deltaColor = p.delta_pct === null ? 'var(--text-secondary)' : (up ? 'var(--success)' : 'var(--danger)');
  const tax = data.tax;
  const recv = data.receivables || {};
  const pay = data.payables || {};
  const expenses = data.expenses?.top || [];
  const maxExp = expenses.reduce((m, e) => Math.max(m, e.amount), 0) || 1;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Here&apos;s how {data.outlet_name || 'your business'} is doing this month · <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{data.period?.month_label}</span>
        </p>
        <button onClick={() => refetch()} className="text-xs inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* ── Hero: how am I doing? ── */}
      <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--border))' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent)' }} /> How am I doing?
            </div>
            <div className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmt(p.this_month)}</div>
            <div className="flex items-center gap-2 mt-1.5 text-sm" style={{ color: deltaColor }}>
              <Delta className="w-4 h-4" />
              {p.delta_pct === null ? <span>Profit so far — not enough history to compare</span>
                : <span>{up ? 'Up' : 'Down'} {Math.abs(p.delta_pct)}% vs last month · profit</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sales this month</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(p.revenue)}</div>
            <button onClick={() => setTab && setTab('pnl')} className="text-xs mt-1 inline-flex items-center gap-0.5" style={{ color: 'var(--accent)' }}>
              Full profit &amp; loss <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Three money questions ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Tax to pay */}
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            <ReceiptText className="w-4 h-4" style={{ color: 'var(--warning)' }} /> Tax to pay
          </div>
          {tax ? (
            <>
              <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(tax.amount)}</div>
              <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: tax.payable ? 'var(--warning)' : 'var(--success)' }}>
                <CalendarClock className="w-3.5 h-3.5" /> {taxWord} {tax.quarter_label} · {tax.payable ? 'due' : 'refund'} {new Date(tax.due_date).toLocaleDateString([], { day: '2-digit', month: 'short' })}
              </div>
              <button onClick={() => setTab && setTab(data.region === 'IN' ? 'bas' : 'bas')} className="btn-secondary btn-sm mt-auto self-start" style={{ marginTop: 12 }}>
                Prepare {taxWord}
              </button>
            </>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No tax data yet.</div>
          )}
        </div>

        {/* Who owes me */}
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            <ArrowDownLeft className="w-4 h-4" style={{ color: 'var(--success)' }} /> Who owes me?
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(recv.total)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {recv.count} unpaid invoice{recv.count === 1 ? '' : 's'}
            {recv.overdue > 0 && <span style={{ color: 'var(--danger)' }}> · {fmt(recv.overdue)} overdue</span>}
          </div>
          <button onClick={() => navigate('/customer-invoices')} className="btn-secondary btn-sm mt-auto self-start" style={{ marginTop: 12 }}>
            View invoices
          </button>
        </div>

        {/* What I owe */}
        <div className="card flex flex-col">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--danger)' }} /> What do I owe?
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(pay.total)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{pay.count} supplier bill{pay.count === 1 ? '' : 's'} to pay</div>
          <button onClick={() => setTab && setTab('aging')} className="btn-secondary btn-sm mt-auto self-start" style={{ marginTop: 12 }}>
            Review bills
          </button>
        </div>
      </div>

      {/* ── Where money goes ── */}
      <div className="card">
        <div className="flex items-center gap-2 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          <PieChart className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Where my money goes this month
        </div>
        {expenses.length === 0 ? (
          <div className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>No expenses recorded yet this month.</div>
        ) : (
          <div className="space-y-3">
            {expenses.map((e) => (
              <div key={e.code}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{fmt(e.amount)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.round((e.amount / maxExp) * 100)}%`, background: 'var(--accent)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => navigate('/customer-invoices')} className="card text-left flex items-center gap-3 hover:shadow-sm transition-shadow">
          <FileText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New invoice</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Bill a customer</div>
          </div>
        </button>
        <button onClick={() => setTab && setTab('bankrec')} className="card text-left flex items-center gap-3 hover:shadow-sm transition-shadow">
          <Landmark className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Reconcile bank</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Match your statement</div>
          </div>
        </button>
        <button onClick={() => setTab && setTab('bas')} className="card text-left flex items-center gap-3 hover:shadow-sm transition-shadow">
          <ReceiptText className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Prepare {taxWord}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Review and export</div>
          </div>
        </button>
      </div>
    </div>
  );
}
