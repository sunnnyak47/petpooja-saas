/**
 * FixedAssetsPage — Asset register & depreciation
 * Route: /fixed-assets
 */
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { Package, Plus, TrendingDown, Loader2, Play } from 'lucide-react';

/* ── Currency ──────────────────────────────────────────────────────────────── */
const audFull = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
function fmtAUD(v) {
  if (v == null) return '$0.00';
  return audFull.format(v);
}

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

function StatCard({ label, value, color, icon: Icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          <p className="text-2xl font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      <span className="ml-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Loading asset register…</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Package className="w-10 h-10" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message || 'No fixed assets recorded yet.'}</p>
    </div>
  );
}

const emptyForm = {
  name: '',
  category: '',
  purchase_date: new Date().toISOString().split('T')[0],
  cost: '',
  salvage_value: '',
  useful_life_months: 60,
};

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function FixedAssetsPage() {
  const queryClient = useQueryClient();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [showDep, setShowDep] = useState(false);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [running, setRunning] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['fixed-assets', outletId],
    queryFn: () =>
      api.get('/assets/register', { params: { outlet_id: outletId } }).then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
  });

  // Handle both { assets, totals } and a bare array
  const assets = Array.isArray(data) ? data : (data?.assets || []);
  const totals = (!Array.isArray(data) && data?.totals) || assets.reduce(
    (acc, a) => ({
      cost: acc.cost + (Number(a.cost) || 0),
      accumulated_depreciation: acc.accumulated_depreciation + (Number(a.accumulated_depreciation) || 0),
      book_value: acc.book_value + (Number(a.book_value) || 0),
    }),
    { cost: 0, accumulated_depreciation: 0, book_value: 0 },
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fixed-assets'] });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.cost) {
      toast.error('Name and cost are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/assets', {
        outlet_id: outletId,
        name: form.name.trim(),
        category: form.category.trim() || null,
        purchase_date: form.purchase_date,
        cost: Number(form.cost),
        salvage_value: Number(form.salvage_value) || 0,
        useful_life_months: Number(form.useful_life_months) || 60,
      });
      toast.success('Asset added');
      setForm(emptyForm);
      setShowAdd(false);
      invalidate();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to add asset');
    } finally {
      setSaving(false);
    }
  };

  const handleRunDepreciation = async () => {
    if (!period) {
      toast.error('Pick a period');
      return;
    }
    if (!window.confirm(`Run and post depreciation for ${period}?`)) return;
    setRunning(true);
    try {
      const res = await api
        .post('/assets/run-depreciation', { outlet_id: outletId, period })
        .then(r => r.data?.data ?? r.data);
      const count = res?.assets ?? res?.count ?? res?.posted ?? 0;
      const amount = res?.amount ?? res?.total ?? res?.total_depreciation ?? 0;
      toast.success(`Depreciation posted: ${count} assets, ${fmtAUD(amount)}`);
      setShowDep(false);
      invalidate();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to run depreciation');
    } finally {
      setRunning(false);
    }
  };

  const inputStyle = {
    background: 'var(--bg-secondary)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  };
  const labelCls = 'text-xs font-semibold uppercase tracking-wide';
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Fixed Assets</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Asset register &amp; depreciation</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => { setShowAdd(v => !v); setShowDep(false); }} className="btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> Add Asset
          </button>
          <button onClick={() => { setShowDep(v => !v); setShowAdd(false); }} className="btn-secondary btn-sm">
            <Play className="w-3.5 h-3.5" /> Run Depreciation
          </button>
        </div>
      </div>

      {/* ── Add Asset form ────────────────────────────────────────────────── */}
      {showAdd && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Add Asset</h3>
          <form onSubmit={handleAdd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={labelStyle}>Name</label>
                <input
                  type="text" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={labelStyle}>Category</label>
                <input
                  type="text" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={labelStyle}>Purchase Date</label>
                <input
                  type="date" value={form.purchase_date}
                  onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={labelStyle}>Cost (AUD)</label>
                <input
                  type="number" min="0" step="0.01" required value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={labelStyle}>Salvage Value (AUD)</label>
                <input
                  type="number" min="0" step="0.01" value={form.salvage_value}
                  onChange={e => setForm(f => ({ ...f, salvage_value: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls} style={labelStyle}>Useful Life (months)</label>
                <input
                  type="number" min="1" step="1" value={form.useful_life_months}
                  onChange={e => setForm(f => ({ ...f, useful_life_months: e.target.value }))}
                  className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving} className="btn-primary btn-sm">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {saving ? 'Saving…' : 'Save Asset'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">Cancel</button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Run Depreciation panel ────────────────────────────────────────── */}
      {showDep && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Run Depreciation</h3>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className={labelCls} style={labelStyle}>Period</label>
              <input
                type="month" value={period}
                onChange={e => setPeriod(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm" style={inputStyle}
              />
            </div>
            <button onClick={handleRunDepreciation} disabled={running} className="btn-primary btn-sm">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? 'Posting…' : 'Post Depreciation'}
            </button>
            <button onClick={() => setShowDep(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </Card>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {!isLoading && assets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Cost" value={fmtAUD(totals.cost)} color="#6366f1" icon={Package} />
          <StatCard label="Accumulated Depreciation" value={fmtAUD(totals.accumulated_depreciation)} color="#ef4444" icon={TrendingDown} />
          <StatCard label="Net Book Value" value={fmtAUD(totals.book_value)} color="#22c55e" icon={Package} />
        </div>
      )}

      {/* ── Asset register table ──────────────────────────────────────────── */}
      {isLoading ? (
        <LoadingState />
      ) : assets.length === 0 ? (
        <Card><EmptyState message="No fixed assets recorded yet. Add one to get started." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Asset Register</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{assets.length} asset(s)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Name', 'Category', 'Cost', 'Accum. Depreciation', 'Book Value'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => (
                  <tr key={a.id ?? i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-primary)', opacity: a.is_disposed ? 0.5 : 1 }}>
                      {a.name}{a.is_disposed ? ' (disposed)' : ''}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{a.category || '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fmtAUD(Number(a.cost))}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#ef4444' }}>{fmtAUD(Number(a.accumulated_depreciation))}</td>
                    <td className="px-4 py-2.5 text-xs font-bold" style={{ color: '#22c55e' }}>{fmtAUD(Number(a.book_value))}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ background: 'var(--bg-primary)', borderTop: '2px solid var(--border)' }}>
                  <td className="px-4 py-3 text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>TOTAL</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totals.cost)}</td>
                  <td className="px-4 py-3 text-xs font-bold" style={{ color: '#ef4444' }}>{fmtAUD(totals.accumulated_depreciation)}</td>
                  <td className="px-4 py-3 text-xs font-extrabold" style={{ color: '#22c55e' }}>{fmtAUD(totals.book_value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
