/**
 * BankReconciliation — Bank statement import & reconciliation
 * Self-contained. Base API path: /accounting
 *
 * NOTE: the axios instance (lib/api) has a response interceptor that returns
 * `response.data` (the {success,data,message} envelope). So the actual payload
 * lives at `r.data`.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  Landmark, Upload, Link2, Check, X, RefreshCw, Loader2, Plus,
} from 'lucide-react';

/* ── Currency helper ───────────────────────────────────────────────────────── */
const audFull = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const fmtAUD = (v) => (v == null ? '$0.00' : audFull.format(v));

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

function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
      <span className="ml-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{message}</span>
    </div>
  );
}

const inputStyle = {
  background: 'var(--bg-secondary)',
  borderColor: 'var(--border)',
  color: 'var(--text-primary)',
};

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function BankReconciliation({ outletId }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ name: '', bsb: '', account_number: '', opening_balance: '' });
  const [csv, setCsv] = useState('');
  const [matchOpenId, setMatchOpenId] = useState(null);

  // outlet_id query string / body helpers
  const oq = outletId ? `?outlet_id=${encodeURIComponent(outletId)}` : '';
  const oBody = outletId ? { outlet_id: outletId } : {};

  /* ── Bank accounts ───────────────────────────────────────────────────────── */
  const { data: accounts = [], isLoading: accLoading } = useQuery({
    queryKey: ['accounting-bank-accounts', outletId],
    queryFn: () => api.get(`/accounting/bank-accounts${oq}`).then(r => r.data || []),
    staleTime: 60_000,
  });

  // Auto-select first account once loaded
  const account = useMemo(
    () => accounts.find(a => a.id === activeId) || null,
    [accounts, activeId],
  );
  const effectiveId = activeId ?? accounts[0]?.id ?? null;
  const selectedAccount = account || accounts.find(a => a.id === effectiveId) || null;

  /* ── Add account ─────────────────────────────────────────────────────────── */
  const addAccount = useMutation({
    mutationFn: () => api.post('/accounting/bank-accounts', {
      ...oBody,
      name: form.name,
      bsb: form.bsb,
      account_number: form.account_number,
      opening_balance: form.opening_balance === '' ? 0 : Number(form.opening_balance),
    }).then(r => r.data),
    onSuccess: async (created) => {
      toast.success('Bank account added');
      await queryClient.invalidateQueries({ queryKey: ['accounting-bank-accounts', outletId] });
      if (created?.id) setActiveId(created.id);
      setShowAddForm(false);
      setForm({ name: '', bsb: '', account_number: '', opening_balance: '' });
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed to add account'),
  });

  /* ── Import CSV ──────────────────────────────────────────────────────────── */
  const importCsv = useMutation({
    mutationFn: () => api.post(`/accounting/bank-accounts/${effectiveId}/import`, { ...oBody, csv }).then(r => r.data),
    onSuccess: async (res) => {
      const imported = res?.imported ?? 0;
      const skipped = res?.skipped ?? 0;
      toast.success(`Imported ${imported} line(s), skipped ${skipped}`);
      setCsv('');
      await invalidateForAccount();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Import failed'),
  });

  /* ── Reconciliation summary ──────────────────────────────────────────────── */
  const { data: recon, isLoading: reconLoading } = useQuery({
    queryKey: ['accounting-reconciliation', effectiveId, outletId],
    queryFn: () => api.get(`/accounting/bank-accounts/${effectiveId}/reconciliation${oq}`).then(r => r.data || {}),
    enabled: !!effectiveId,
    staleTime: 30_000,
  });

  const autoReconcile = useMutation({
    mutationFn: () => api.post(`/accounting/bank-accounts/${effectiveId}/auto-reconcile`, oBody).then(r => r.data),
    onSuccess: async (res) => {
      toast.success(`Auto-reconciled ${res?.reconciled ?? 0} line(s)`);
      await invalidateForAccount();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Auto-reconcile failed'),
  });

  /* ── Statement lines ─────────────────────────────────────────────────────── */
  const { data: lines = [], isLoading: linesLoading } = useQuery({
    queryKey: ['accounting-statement-lines', effectiveId, outletId],
    queryFn: () => api.get(`/accounting/bank-accounts/${effectiveId}/statement-lines${oq}`).then(r => r.data || []),
    enabled: !!effectiveId,
    staleTime: 30_000,
  });

  /* ── Suggestions (lazy, cached) ──────────────────────────────────────────── */
  const { data: suggestions = [], refetch: refetchSuggestions, isFetching: suggFetching } = useQuery({
    queryKey: ['accounting-suggest-matches', effectiveId, outletId],
    queryFn: () => api.get(`/accounting/bank-accounts/${effectiveId}/suggest-matches${oq}`).then(r => r.data || []),
    enabled: false,
    staleTime: 60_000,
  });

  // Group suggestions by the statement line they apply to (defensive: support either shape).
  const suggestionsByLine = useMemo(() => {
    const map = {};
    for (const s of suggestions) {
      const lid = s.statement_line_id;
      if (lid == null) continue;
      (map[lid] = map[lid] || []).push(s);
    }
    return map;
  }, [suggestions]);

  const reconcile = useMutation({
    mutationFn: ({ statement_line_id, journal_line_id }) =>
      api.post('/accounting/reconcile', { ...oBody, statement_line_id, journal_line_id }).then(r => r.data),
    onSuccess: async () => {
      toast.success('Matched');
      setMatchOpenId(null);
      await invalidateForAccount();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Match failed'),
  });

  const unreconcile = useMutation({
    mutationFn: ({ statement_line_id }) =>
      api.post('/accounting/unreconcile', { ...oBody, statement_line_id }).then(r => r.data),
    onSuccess: async () => {
      toast.success('Unmatched');
      await invalidateForAccount();
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Unmatch failed'),
  });

  async function invalidateForAccount() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounting-statement-lines', effectiveId, outletId] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-reconciliation', effectiveId, outletId] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-suggest-matches', effectiveId, outletId] }),
    ]);
  }

  const handleMatchClick = (lineId) => {
    if (matchOpenId === lineId) {
      setMatchOpenId(null);
      return;
    }
    setMatchOpenId(lineId);
    // Fetch suggestions once / when stale.
    if (suggestions.length === 0) refetchSuggestions();
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Landmark className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Bank Reconciliation
        </h2>
      </div>

      {/* ── Account selector + add ────────────────────────────────────────── */}
      <Card className="p-5">
        {accLoading ? (
          <LoadingState message="Loading bank accounts…" />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Bank Account
                </label>
                {accounts.length === 0 ? (
                  <p className="text-sm py-2" style={{ color: 'var(--text-secondary)' }}>
                    No bank accounts yet — add one to get started.
                  </p>
                ) : (
                  <select
                    value={effectiveId ?? ''}
                    onChange={(e) => setActiveId(Number(e.target.value) || e.target.value)}
                    className="px-3 py-2 rounded-lg border text-sm"
                    style={inputStyle}
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.bsb ? ` · ${a.bsb}` : ''}{a.account_number ? ` ${a.account_number}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                className="btn-secondary btn-sm"
                onClick={() => setShowAddForm(v => !v)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add account
              </button>
            </div>

            {/* Add account inline form */}
            {showAddForm && (
              <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Name</label>
                    <input
                      type="text" value={form.name}
                      onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Everyday Account"
                      className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>BSB</label>
                    <input
                      type="text" value={form.bsb}
                      onChange={(e) => setForm(f => ({ ...f, bsb: e.target.value }))}
                      placeholder="123-456"
                      className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Account Number</label>
                    <input
                      type="text" value={form.account_number}
                      onChange={(e) => setForm(f => ({ ...f, account_number: e.target.value }))}
                      placeholder="12345678"
                      className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Opening Balance</label>
                    <input
                      type="number" step="0.01" value={form.opening_balance}
                      onChange={(e) => setForm(f => ({ ...f, opening_balance: e.target.value }))}
                      placeholder="0.00"
                      className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-primary btn-sm"
                    disabled={!form.name.trim() || addAccount.isPending}
                    onClick={() => addAccount.mutate()}
                  >
                    {addAccount.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {addAccount.isPending ? 'Saving…' : 'Save account'}
                  </button>
                  <button className="btn-secondary btn-sm" onClick={() => setShowAddForm(false)}>
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {selectedAccount && (
        <>
          {/* ── Import CSV panel ─────────────────────────────────────────── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Import Statement (CSV)</h3>
            </div>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={5}
              placeholder="Paste CSV rows here — e.g. date,description,amount"
              className="w-full px-3 py-2 rounded-lg border text-sm font-mono resize-y"
              style={inputStyle}
            />
            <div className="mt-3">
              <button
                className="btn-primary btn-sm"
                disabled={!csv.trim() || importCsv.isPending}
                onClick={() => importCsv.mutate()}
              >
                {importCsv.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {importCsv.isPending ? 'Importing…' : 'Import CSV'}
              </button>
            </div>
          </Card>

          {/* ── Reconciliation summary ───────────────────────────────────── */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Reconciliation Summary</h3>
              <button
                className="btn-primary btn-sm"
                disabled={autoReconcile.isPending || !effectiveId}
                onClick={() => autoReconcile.mutate()}
              >
                {autoReconcile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {autoReconcile.isPending ? 'Reconciling…' : 'Auto-reconcile'}
              </button>
            </div>
            {reconLoading ? (
              <LoadingState message="Loading summary…" />
            ) : (() => {
              const isReconciled = recon?.reconciled || Number(recon?.difference || 0) === 0;
              const diffColor = isReconciled ? 'var(--success)' : 'var(--danger)';
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Statement Balance</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(recon?.statement_balance)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Ledger Balance</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(recon?.ledger_balance)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Difference</p>
                    <p className="text-lg font-bold" style={{ color: diffColor }}>{fmtAUD(recon?.difference)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Matched</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>{recon?.matched_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Unmatched</p>
                    <p className="text-lg font-bold" style={{ color: (recon?.unmatched_statement_count ?? 0) > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                      {recon?.unmatched_statement_count ?? 0}
                    </p>
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* ── Statement lines table ────────────────────────────────────── */}
          <Card className="overflow-hidden">
            <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Statement Lines</h3>
            </div>
            {linesLoading ? (
              <LoadingState message="Loading statement lines…" />
            ) : lines.length === 0 ? (
              <p className="text-sm py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                No statement lines yet — import a CSV to begin.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-primary)' }}>
                      {['Date', 'Description', 'Amount', 'Status', ''].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const positive = Number(line.amount) > 0;
                      const open = matchOpenId === line.id;
                      const lineSuggestions = suggestionsByLine[line.id] || [];
                      return (
                        <tr
                          key={line.id ?? idx}
                          style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}
                        >
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                            {line.txn_date ? String(line.txn_date).split('T')[0] : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-primary)' }}>
                            {line.description || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: positive ? 'var(--success)' : 'var(--danger)' }}>
                            {fmtAUD(line.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                            {line.reconciled ? (
                              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--success)' }}>
                                <Check className="w-3.5 h-3.5" /> Reconciled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                                <X className="w-3.5 h-3.5" /> Unreconciled
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                            {line.reconciled ? (
                              <button
                                className="font-semibold hover:underline disabled:opacity-50"
                                style={{ color: 'var(--danger)' }}
                                disabled={unreconcile.isPending}
                                onClick={() => unreconcile.mutate({ statement_line_id: line.id })}
                              >
                                Unmatch
                              </button>
                            ) : (
                              <div className="relative">
                                <button
                                  className="btn-secondary btn-sm"
                                  onClick={() => handleMatchClick(line.id)}
                                >
                                  <Link2 className="w-3.5 h-3.5" /> Match
                                </button>
                                {open && (
                                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                                    {suggFetching && lineSuggestions.length === 0 ? (
                                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding matches…
                                      </span>
                                    ) : lineSuggestions.length === 0 ? (
                                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>No suggestions found.</span>
                                    ) : (
                                      lineSuggestions.map((s) => (
                                        <button
                                          key={s.journal_line_id}
                                          disabled={reconcile.isPending}
                                          onClick={() => reconcile.mutate({ statement_line_id: line.id, journal_line_id: s.journal_line_id })}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors disabled:opacity-50 hover:opacity-80"
                                          style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
                                          title={s.reference || ''}
                                        >
                                          <Link2 className="w-3 h-3" />
                                          {s.entry_date ? String(s.entry_date).split('T')[0] : ''}
                                          {' · '}{fmtAUD(s.amount)}
                                          {s.reference ? ` · ${s.reference}` : ''}
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
