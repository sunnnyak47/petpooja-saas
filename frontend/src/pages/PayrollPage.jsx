/**
 * PayrollPage — Pay runs, PAYG & superannuation
 * Route: /payroll
 */
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { Users, Calculator, Plus, Loader2, FileDown, CheckCircle2 } from 'lucide-react';

/* ── Currency helper ───────────────────────────────────────────────────────── */
const audFull = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
function fmtAUD(v) {
  if (v == null || isNaN(v)) return '$0.00';
  return audFull.format(v);
}
function fmtDate(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-AU'); } catch { return v; }
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

const STATUS_COLORS = {
  draft: 'var(--text-secondary)',
  finalised: 'var(--success)',
  finalized: 'var(--success)',
  paid: 'var(--success)',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--text-secondary)';
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}40` }}
    >
      {status || 'draft'}
    </span>
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

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Users className="w-10 h-10" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
    </div>
  );
}

const inputStyle = { background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function PayrollPage() {
  const queryClient = useQueryClient();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;

  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  /* ── Pay runs list ─────────────────────────────────────────────────────── */
  const { data: payRuns = [], isLoading: runsLoading } = useQuery({
    queryKey: ['pay-runs', outletId],
    queryFn: () => api.get('/payroll/pay-runs', { params: { outlet_id: outletId } }).then(r => r.data),
    staleTime: 60_000,
  });

  /* ── Selected pay run detail ───────────────────────────────────────────── */
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['pay-run', selectedId, outletId],
    queryFn: () => api.get(`/payroll/pay-runs/${selectedId}`, { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!selectedId,
  });

  /* ── New pay-run form state ────────────────────────────────────────────── */
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ period_start: today, period_end: today, pay_date: today });
  const [lines, setLines] = useState([{ staff_name: '', gross: '', hours: '' }]);

  const resetForm = () => {
    setForm({ period_start: today, period_end: today, pay_date: today });
    setLines([{ staff_name: '', gross: '', hours: '' }]);
  };

  const updateLine = (idx, field, value) =>
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  const addLine = () => setLines(ls => [...ls, { staff_name: '', gross: '', hours: '' }]);
  const removeLine = (idx) => setLines(ls => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));

  const grossPreview = lines.reduce((sum, l) => sum + (parseFloat(l.gross) || 0), 0);

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/payroll/pay-runs', payload).then(r => r.data),
    onSuccess: () => {
      toast.success('Pay run created');
      setShowForm(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['pay-runs'] });
    },
    onError: (e) => toast.error(e?.message || 'Failed to create pay run'),
  });

  const finaliseMutation = useMutation({
    mutationFn: (id) => api.post(`/payroll/pay-runs/${id}/finalise`, { outlet_id: outletId }).then(r => r.data),
    onSuccess: () => {
      toast.success('Pay run finalised — journal posted');
      queryClient.invalidateQueries({ queryKey: ['pay-runs'] });
      queryClient.invalidateQueries({ queryKey: ['pay-run'] });
    },
    onError: (e) => toast.error(e?.message || 'Failed to finalise pay run'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanLines = lines
      .filter(l => l.staff_name.trim())
      .map(l => ({
        staff_name: l.staff_name.trim(),
        gross: parseFloat(l.gross) || 0,
        hours: parseFloat(l.hours) || 0,
      }));
    if (cleanLines.length === 0) {
      toast.error('Add at least one employee line');
      return;
    }
    createMutation.mutate({
      outlet_id: outletId,
      period_start: form.period_start,
      period_end: form.period_end,
      pay_date: form.pay_date,
      lines: cleanLines,
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Users className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            Payroll
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Pay runs, PAYG &amp; superannuation
          </p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-3.5 h-3.5" />
          New Pay Run
        </button>
      </div>

      {/* ── New Pay Run form ────────────────────────────────────────────────── */}
      {showForm && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>New Pay Run</h3>
          </div>
          <form onSubmit={handleSubmit}>
            {/* Period dates */}
            <div className="flex flex-wrap gap-4 mb-5">
              {[
                { key: 'period_start', label: 'Period Start' },
                { key: 'period_end', label: 'Period End' },
                { key: 'pay_date', label: 'Pay Date' },
              ].map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                  <input
                    type="date"
                    required
                    value={form[f.key]}
                    onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                    className="px-3 py-2 rounded-lg border text-sm"
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>

            {/* Employee lines */}
            <div className="mb-3">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Employees</label>
            </div>
            <div className="space-y-2 mb-3">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <input
                    type="text"
                    placeholder="Staff name"
                    value={line.staff_name}
                    onChange={e => updateLine(i, 'staff_name', e.target.value)}
                    className="px-3 py-2 rounded-lg border text-sm flex-1 min-w-[160px]"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Gross $"
                    value={line.gross}
                    onChange={e => updateLine(i, 'gross', e.target.value)}
                    className="px-3 py-2 rounded-lg border text-sm w-28"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Hours"
                    value={line.hours}
                    onChange={e => updateLine(i, 'hours', e.target.value)}
                    className="px-3 py-2 rounded-lg border text-sm w-24"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    className="btn-secondary btn-sm"
                    style={{ opacity: lines.length === 1 ? 0.4 : 1 }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button type="button" onClick={addLine} className="btn-secondary btn-sm mb-5">
              <Plus className="w-3.5 h-3.5" />
              Add Employee
            </button>

            {/* Preview + actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Gross total preview:{' '}
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(grossPreview)}</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary btn-sm">
                  {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {createMutation.isPending ? 'Creating…' : 'Create Pay Run'}
                </button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* ── Pay runs table ──────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Pay Runs</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Click a row to view payslips</p>
        </div>
        {runsLoading ? (
          <LoadingState label="Loading pay runs…" />
        ) : payRuns.length === 0 ? (
          <EmptyState message="No pay runs yet. Create one to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Period', 'Pay Date', 'Status', 'Gross', 'PAYG', 'Super', 'Net'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payRuns.map((run, i) => (
                  <tr
                    key={run.id}
                    onClick={() => setSelectedId(run.id)}
                    className="cursor-pointer transition-colors"
                    style={{
                      background: selectedId === run.id ? 'var(--accent)18' : i % 2 === 0 ? 'transparent' : 'var(--bg-primary)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <td className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                      {fmtDate(run.period_start)} – {fmtDate(run.period_end)}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDate(run.pay_date)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={run.status} /></td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fmtAUD(run.gross_total)}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--danger, #ef4444)' }}>{fmtAUD(run.paye_total)}</td>
                    <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>{fmtAUD(run.super_total)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold" style={{ color: 'var(--success)' }}>{fmtAUD(run.net_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Pay run detail / payslips ───────────────────────────────────────── */}
      {selectedId && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <FileDown className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Payslips</h3>
                {detail && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {fmtDate(detail.period_start)} – {fmtDate(detail.period_end)} &middot;{' '}
                    <StatusBadge status={detail.status} />
                  </p>
                )}
              </div>
            </div>
            {detail && detail.status === 'draft' && (
              <button
                onClick={() => finaliseMutation.mutate(detail.id)}
                disabled={finaliseMutation.isPending}
                className="btn-primary btn-sm"
              >
                {finaliseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {finaliseMutation.isPending ? 'Finalising…' : 'Finalise'}
              </button>
            )}
          </div>

          {detailLoading ? (
            <LoadingState label="Loading payslips…" />
          ) : !detail ? (
            <EmptyState message="Could not load this pay run." />
          ) : (
            <PayslipTable detail={detail} />
          )}

          <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              PAYG is a simplified estimate; not ATO-lodged.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Payslip table sub-component ───────────────────────────────────────────── */
function PayslipTable({ detail }) {
  const payslips = detail.payslips || [];
  if (payslips.length === 0) return <EmptyState message="No payslips on this pay run." />;

  const totals = payslips.reduce((acc, p) => ({
    gross: acc.gross + (Number(p.gross) || 0),
    paye: acc.paye + (Number(p.paye) || 0),
    super_amt: acc.super_amt + (Number(p.super_amt) || 0),
    net: acc.net + (Number(p.net) || 0),
  }), { gross: 0, paye: 0, super_amt: 0, net: 0 });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-primary)' }}>
            {['Staff', 'Gross', 'PAYG', 'Super', 'Net'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payslips.map((p, i) => (
            <tr key={p.id || i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
              <td className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{p.staff_name}</td>
              <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{fmtAUD(p.gross)}</td>
              <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--danger, #ef4444)' }}>{fmtAUD(p.paye)}</td>
              <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>{fmtAUD(p.super_amt)}</td>
              <td className="px-4 py-2.5 text-xs font-bold" style={{ color: 'var(--success)' }}>{fmtAUD(p.net)}</td>
            </tr>
          ))}
          <tr style={{ background: 'var(--bg-primary)', borderTop: '2px solid var(--border)' }}>
            <td className="px-4 py-3 text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>TOTAL</td>
            <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totals.gross)}</td>
            <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--danger, #ef4444)' }}>{fmtAUD(totals.paye)}</td>
            <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--accent)' }}>{fmtAUD(totals.super_amt)}</td>
            <td className="px-4 py-3 text-xs font-extrabold" style={{ color: 'var(--success)' }}>{fmtAUD(totals.net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
