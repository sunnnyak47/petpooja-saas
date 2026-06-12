/**
 * BudgetsPage — Plan & track budget vs actual
 * Route: /budgets
 */
import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { Target, Plus, Loader2, TrendingUp, TrendingDown } from 'lucide-react';

/* ── Currency helper (en-AU AUD) ───────────────────────────────────────────── */
const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const money = (v) => aud.format(Number(v) || 0);

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

function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      <span className="ml-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

export default function BudgetsPage() {
  const queryClient = useQueryClient();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;

  const currentYear = new Date().getFullYear();
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  /* ── New budget form state ──────────────────────────────────────────────── */
  const [name, setName] = useState('');
  const [fyYear, setFyYear] = useState(currentYear);
  const [lines, setLines] = useState([{ account_code: '', amount: '' }]);
  const [saving, setSaving] = useState(false);

  /* ── Queries ────────────────────────────────────────────────────────────── */
  const { data: budgets = [], isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets', outletId],
    queryFn: () => api.get('/accounting/budgets', { params: { outlet_id: outletId } })
      .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });

  const { data: chart = [], isLoading: chartLoading } = useQuery({
    queryKey: ['accounting-chart', outletId],
    queryFn: () => api.get('/accounting/chart', { params: { outlet_id: outletId } })
      .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 300_000,
  });

  const selected = useMemo(
    () => budgets.find(b => b.id === selectedId) || null,
    [budgets, selectedId],
  );

  const fyFrom = selected ? `${selected.fy_year}-01-01` : null;
  const fyTo = selected ? `${selected.fy_year}-12-31` : null;

  const { data: vsActual, isLoading: vaLoading } = useQuery({
    queryKey: ['budget-vs-actual', selectedId, outletId, fyFrom, fyTo],
    enabled: !!selectedId,
    queryFn: () => api.get(`/accounting/budgets/${selectedId}/vs-actual`, {
      params: { outlet_id: outletId, from: fyFrom, to: fyTo },
    }).then(r => r.data?.data ?? r.data ?? null),
    staleTime: 60_000,
  });

  /* ── Form handlers ──────────────────────────────────────────────────────── */
  const addLine = () => setLines(ls => [...ls, { account_code: '', amount: '' }]);
  const removeLine = (idx) => setLines(ls => ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls);
  const updateLine = (idx, field, value) =>
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  const resetForm = () => {
    setName('');
    setFyYear(currentYear);
    setLines([{ account_code: '', amount: '' }]);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Budget name is required'); return; }
    const cleanLines = lines
      .filter(l => l.account_code && l.amount !== '')
      .map(l => ({ account_code: l.account_code, amount: Number(l.amount) || 0 }));
    if (cleanLines.length === 0) { toast.error('Add at least one budget line'); return; }

    setSaving(true);
    try {
      await api.post('/accounting/budgets', {
        outlet_id: outletId,
        name: name.trim(),
        fy_year: Number(fyYear),
        lines: cleanLines,
      });
      toast.success('Budget created');
      await queryClient.invalidateQueries({ queryKey: ['budgets', outletId] });
      resetForm();
      setShowForm(false);
    } catch (e) {
      toast.error(e.message || 'Failed to create budget');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <Target className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Budgets</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Plan &amp; track budget vs actual</p>
          </div>
        </div>
        <button
          className="btn-primary btn-sm"
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
        >
          <Plus className="w-3.5 h-3.5" />
          New Budget
        </button>
      </div>

      {/* ── New budget form ─────────────────────────────────────────────────── */}
      {showForm && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Create Budget</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. FY2026 Operating Budget"
                className="px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>FY Year</label>
              <input
                type="number"
                value={fyYear}
                onChange={e => setFyYear(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Dynamic lines */}
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Budget Lines</label>
          <div className="space-y-2 mt-2 mb-4">
            {lines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={line.account_code}
                  onChange={e => updateLine(idx, 'account_code', e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  disabled={chartLoading}
                >
                  <option value="">{chartLoading ? 'Loading accounts…' : 'Select account…'}</option>
                  {chart.map(a => (
                    <option key={a.account_code || a.code || a.id} value={a.account_code || a.code}>
                      {(a.account_code || a.code)} — {(a.account_name || a.name)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={line.amount}
                  onChange={e => updateLine(idx, 'amount', e.target.value)}
                  placeholder="Amount"
                  className="w-32 px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={() => removeLine(idx)}
                  className="btn-secondary btn-sm"
                  disabled={lines.length === 1}
                  title="Remove line"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={addLine} className="btn-secondary btn-sm">
              <Plus className="w-3.5 h-3.5" />
              Add Line
            </button>
            <div className="flex-1" />
            <button onClick={handleCreate} disabled={saving} className="btn-primary btn-sm">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Budget'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
        {/* ── Budget list ───────────────────────────────────────────────────── */}
        <Card className="p-3 h-full">
          <h3 className="text-xs font-bold uppercase tracking-wide px-2 py-2" style={{ color: 'var(--text-secondary)' }}>Budgets</h3>
          {budgetsLoading ? (
            <LoadingState label="Loading budgets…" />
          ) : budgets.length === 0 ? (
            <p className="text-xs px-2 py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
              No budgets yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-1">
              {budgets.map(b => {
                const active = b.id === selectedId;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-colors"
                    style={{
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'var(--accent-text, #fff)' : 'var(--text-primary)',
                    }}
                  >
                    <p className="text-sm font-semibold truncate">{b.name}</p>
                    <p className="text-[11px]" style={{ color: active ? 'var(--accent-text, #fff)' : 'var(--text-secondary)', opacity: 0.85 }}>
                      FY {b.fy_year}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Budget vs Actual ──────────────────────────────────────────────── */}
        <div>
          {!selectedId ? (
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <Target className="w-10 h-10" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Select a budget to view budget vs actual.</p>
              </div>
            </Card>
          ) : vaLoading ? (
            <Card className="p-5"><LoadingState label="Loading budget vs actual…" /></Card>
          ) : !vsActual || (vsActual.lines || []).length === 0 ? (
            <Card className="p-12">
              <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>No budget vs actual data for this budget.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selected?.name}</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>FY {selected?.fy_year} · {fyFrom} → {fyTo}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--bg-primary)' }}>
                      {['Account', 'Budget', 'Actual', 'Variance', 'Variance %'].map((h, i) => (
                        <th
                          key={h}
                          className={`px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vsActual.lines.map((row, i) => {
                      const favourable = (row.variance ?? 0) >= 0;
                      const color = favourable ? 'var(--success)' : 'var(--danger)';
                      const Icon = favourable ? TrendingUp : TrendingDown;
                      return (
                        <tr
                          key={i}
                          style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}
                        >
                          <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{row.account_code}</span> {row.account_name}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-medium text-right" style={{ color: 'var(--text-primary)' }}>{money(row.budget)}</td>
                          <td className="px-4 py-2.5 text-xs font-medium text-right" style={{ color: 'var(--text-primary)' }}>{money(row.actual)}</td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-right" style={{ color }}>
                            <span className="inline-flex items-center gap-1 justify-end">
                              <Icon className="w-3 h-3" />
                              {money(row.variance)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-medium text-right" style={{ color }}>
                            {row.variance_pct != null ? `${Number(row.variance_pct).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    {vsActual.totals && (() => {
                      const t = vsActual.totals;
                      const favourable = (t.variance ?? 0) >= 0;
                      const color = favourable ? 'var(--success)' : 'var(--danger)';
                      return (
                        <tr style={{ background: 'var(--bg-primary)', borderTop: '2px solid var(--border)' }}>
                          <td className="px-4 py-3 text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>TOTAL</td>
                          <td className="px-4 py-3 text-xs font-bold text-right" style={{ color: 'var(--text-primary)' }}>{money(t.budget)}</td>
                          <td className="px-4 py-3 text-xs font-bold text-right" style={{ color: 'var(--text-primary)' }}>{money(t.actual)}</td>
                          <td className="px-4 py-3 text-xs font-extrabold text-right" style={{ color }}>{money(t.variance)}</td>
                          <td className="px-4 py-3" />
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
