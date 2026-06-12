import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { useCurrency } from '../hooks/useCurrency';
import {
  Scale, Landmark, Banknote, Plus, RefreshCw, CheckCircle2,
  Trash2, ArrowLeft, AlertTriangle, FileText,
} from 'lucide-react';

const PROVIDERS = [
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'card_acquirer', label: 'Card Acquirer' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'manual', label: 'Manual' },
];

const STATUS_STYLES = {
  open: 'bg-blue-500/20 text-blue-400',
  matched: 'bg-emerald-500/20 text-emerald-400',
  variance: 'bg-amber-500/20 text-amber-400',
  closed: 'bg-surface-600/40 text-surface-300',
};

const MATCH_STYLES = {
  matched: 'bg-emerald-500/20 text-emerald-400',
  mismatch: 'bg-amber-500/20 text-amber-400',
  unmatched: 'bg-red-500/20 text-red-400',
};

const todayISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/**
 * Parse a pasted CSV string into settlement line objects.
 * Expected columns: transaction_id, amount, fee, net, type, order_ref.
 * Tolerates an optional header row and blank lines.
 */
function parseCSV(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  // Detect & skip a header row (first cell non-numeric AND looks like a label).
  const firstCells = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const hasHeader =
    firstCells.includes('transaction_id') ||
    firstCells.includes('amount') ||
    Number.isNaN(Number(firstCells[1]));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const out = [];
  for (const raw of dataLines) {
    const cols = raw.split(',').map((c) => c.trim());
    const amount = Number(cols[1]);
    if (Number.isNaN(amount)) continue;
    const fee = Number(cols[2]);
    const net = cols[3] !== undefined && cols[3] !== '' ? Number(cols[3]) : undefined;
    const type = cols[4] || 'payment';
    out.push({
      transaction_id: cols[0] || undefined,
      amount,
      fee: Number.isNaN(fee) ? 0 : fee,
      ...(net !== undefined && !Number.isNaN(net) ? { net } : {}),
      type: ['payment', 'refund', 'chargeback', 'adjustment'].includes(type) ? type : 'payment',
      order_ref: cols[5] || undefined,
    });
  }
  return out;
}

export default function SettlementsPage() {
  const { user } = useSelector((s) => s.auth);
  const { format } = useCurrency();
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const [form, setForm] = useState({
    provider: 'razorpay',
    reference: '',
    settlement_date: todayISO(),
    currency: 'INR',
    csv: '',
  });

  const { data: listData, isLoading, error } = useQuery({
    queryKey: ['settlements', outletId],
    queryFn: () => api.get(`/settlements?outlet_id=${outletId}&limit=100`),
    enabled: !!outletId,
  });

  const settlements = listData?.data || [];

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['settlement', selectedId],
    queryFn: () => api.get(`/settlements/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const importMutation = useMutation({
    mutationFn: (payload) => api.post('/settlements', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('Settlement imported');
      setShowImport(false);
      setForm({ provider: 'razorpay', reference: '', settlement_date: todayISO(), currency: 'INR', csv: '' });
    },
    onError: (e) => toast.error(e.message),
  });

  const reconcileMutation = useMutation({
    mutationFn: (id) => api.post(`/settlements/${id}/reconcile`).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      queryClient.invalidateQueries({ queryKey: ['settlement', selectedId] });
      const s = res?.summary;
      if (s) {
        toast.success(
          `Reconciled — ${s.matched_count} matched, ${s.unmatched_count} unresolved, variance ${format(s.variance_amount)}`
        );
      } else {
        toast.success('Reconciled');
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const closeMutation = useMutation({
    mutationFn: (id) => api.post(`/settlements/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      queryClient.invalidateQueries({ queryKey: ['settlement', selectedId] });
      toast.success('Settlement closed');
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/settlements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('Settlement deleted');
      setSelectedId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const parsedPreview = useMemo(() => parseCSV(form.csv), [form.csv]);

  const submitImport = () => {
    const lines = parseCSV(form.csv);
    if (!lines.length) {
      toast.error('No valid lines found in the pasted CSV');
      return;
    }
    importMutation.mutate({
      outlet_id: outletId,
      provider: form.provider,
      reference: form.reference || undefined,
      settlement_date: form.settlement_date,
      currency: form.currency || 'INR',
      lines,
    });
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedId) {
    const s = detail;
    return (
      <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
        <button
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-2 text-sm font-bold w-fit"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="w-4 h-4" /> Back to settlements
        </button>

        {detailLoading || !s ? (
          <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
            Loading settlement…
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-black flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                  <Landmark className="w-7 h-7" style={{ color: 'var(--accent)' }} />
                  {PROVIDERS.find((p) => p.value === s.provider)?.label || s.provider}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {s.reference || 'No reference'} · {new Date(s.settlement_date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${STATUS_STYLES[s.status] || ''}`}>
                  {s.status}
                </span>
                {s.status !== 'closed' && (
                  <button
                    onClick={() => reconcileMutation.mutate(s.id)}
                    disabled={reconcileMutation.isPending}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} /> Reconcile
                  </button>
                )}
                {(s.status === 'matched' || s.status === 'variance') && (
                  <button
                    onClick={() => closeMutation.mutate(s.id)}
                    disabled={closeMutation.isPending}
                    className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Close
                  </button>
                )}
              </div>
            </div>

            {/* Header figures */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Gross', value: format(s.gross_amount) },
                { label: 'Fees', value: format(s.fees) },
                { label: 'Net (bank)', value: format(s.net_amount) },
                { label: 'Matched', value: format(s.matched_amount) },
                { label: 'Variance', value: format(s.variance_amount), warn: Math.abs(Number(s.variance_amount)) > 0.01 },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-secondary)' }}>{c.label}</p>
                  <p className="text-xl font-black mt-1" style={{ color: c.warn ? 'var(--accent)' : 'var(--text-primary)' }}>{c.value}</p>
                </div>
              ))}
            </div>

            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {s.matched_count}/{s.line_count} lines matched · {s.unmatched_count} unresolved
            </div>

            {/* Lines */}
            <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider border-b" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                    <th className="px-4 py-3">Transaction</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Fee</th>
                    <th className="px-4 py-3 text-right">Net</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                    <th className="px-4 py-3 text-center">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.lines || []).length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>No lines</td></tr>
                  ) : s.lines.map((l) => (
                    <tr key={l.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{l.transaction_id || '—'}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{l.order_ref || '—'}</td>
                      <td className="px-4 py-3 text-xs uppercase" style={{ color: 'var(--text-secondary)' }}>{l.type}</td>
                      <td className="px-4 py-3 text-right text-sm" style={{ color: 'var(--text-primary)' }}>{format(l.amount)}</td>
                      <td className="px-4 py-3 text-right text-sm" style={{ color: 'var(--text-secondary)' }}>{format(l.fee)}</td>
                      <td className="px-4 py-3 text-right text-sm" style={{ color: 'var(--text-secondary)' }}>{format(l.net)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: Math.abs(Number(l.variance)) > 0.01 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {format(l.variance)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${MATCH_STYLES[l.match_status] || ''}`}>
                          {l.match_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <Scale className="w-7 h-7" style={{ color: 'var(--accent)' }} />
            Settlement Reconciliation
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Match provider settlement batches against recorded payments
          </p>
        </div>
        <button onClick={() => setShowImport(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Import Settlement
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <table className="w-full">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-card)' }}>
            <tr className="text-left text-xs uppercase tracking-wider border-b" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Net Amount</th>
              <th className="px-4 py-3 text-center">Lines</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>Loading settlements…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="text-center py-12 text-red-400 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {error.message}
              </td></tr>
            ) : settlements.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No settlements yet — import your first batch
              </td></tr>
            ) : settlements.map((s) => (
              <tr
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="border-b cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {PROVIDERS.find((p) => p.value === s.provider)?.label || s.provider}
                </td>
                <td className="px-4 py-3 text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>{s.reference || '—'}</td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{new Date(s.settlement_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{format(s.net_amount)}</td>
                <td className="px-4 py-3 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{s.matched_count}/{s.line_count}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold uppercase ${STATUS_STYLES[s.status] || ''}`}>{s.status}</span>
                </td>
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  {s.status !== 'closed' && (
                    <button
                      onClick={() => deleteMutation.mutate(s.id)}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import Settlement" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                className="input w-full mt-1"
              >
                {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Currency</label>
              <input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                maxLength={5}
                className="input w-full mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Reference</label>
              <input
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Batch / payout id"
                className="input w-full mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Settlement Date</label>
              <input
                type="date"
                value={form.settlement_date}
                onChange={(e) => setForm((f) => ({ ...f, settlement_date: e.target.value }))}
                className="input w-full mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Lines CSV
            </label>
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              Columns: transaction_id, amount, fee, net, type, order_ref (header row optional)
            </p>
            <textarea
              value={form.csv}
              onChange={(e) => setForm((f) => ({ ...f, csv: e.target.value }))}
              rows={8}
              placeholder={'pay_ABC123,500.00,11.80,488.20,payment,ORD-1001\npay_DEF456,250.00,5.90,244.10,payment,ORD-1002'}
              className="input w-full font-mono text-sm resize-none"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {parsedPreview.length} valid line(s) detected
            </p>
          </div>

          <button
            onClick={submitImport}
            disabled={importMutation.isPending || parsedPreview.length === 0}
            className="btn-primary w-full py-3 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Banknote className="w-4 h-4" />
            {importMutation.isPending ? 'Importing…' : `Import ${parsedPreview.length} line(s)`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
