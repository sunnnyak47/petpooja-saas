import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useCurrency } from '../hooks/useCurrency';
import { useRegion } from '../hooks/useRegion';
import {
  FileMinus, Search, Plus, Eye, XCircle, Trash2,
  Receipt, TrendingDown, FileText, Hash,
} from 'lucide-react';

const STATUS_BADGE = {
  issued: 'bg-emerald-500/20 text-emerald-400',
  cancelled: 'bg-red-500/20 text-red-400',
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const emptyLine = () => ({ description: '', quantity: 1, unit_price: '', gst_rate: 0 });

/**
 * Credit Notes — the GST document layer recording refunds / returns / adjustments.
 * Region-aware: India shows CGST+SGST, Australia shows a single GST figure.
 */
export default function CreditNotesPage() {
  const { user } = useSelector((s) => s.auth);
  const { format } = useCurrency();
  const region = useRegion();
  const isAU = region === 'AU';
  const gstLabel = isAU ? 'GST' : 'GST';
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [viewNote, setViewNote] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  // Create-form state
  const [form, setForm] = useState({
    order_id: '',
    reason: '',
    customer_name: '',
    customer_phone: '',
  });
  const [lines, setLines] = useState([emptyLine()]);

  const listQuery = useQuery({
    queryKey: ['credit-notes', outletId, statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '200' });
      if (outletId) params.set('outlet_id', outletId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('q', search);
      return api.get(`/credit-notes?${params.toString()}`);
    },
    enabled: !!outletId,
  });

  const statsQuery = useQuery({
    queryKey: ['credit-notes-stats', outletId],
    queryFn: () => api.get(`/credit-notes/stats${outletId ? `?outlet_id=${outletId}` : ''}`),
    enabled: !!outletId,
  });

  const rows = useMemo(() => listQuery.data?.data || [], [listQuery.data]);
  const stats = statsQuery.data?.data || { count: 0, total_amount: 0, tax_amount: 0 };

  const resetForm = () => {
    setForm({ order_id: '', reason: '', customer_name: '', customer_phone: '' });
    setLines([emptyLine()]);
  };

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/credit-notes', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      queryClient.invalidateQueries({ queryKey: ['credit-notes-stats'] });
      toast.success('Credit note issued');
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/credit-notes/${id}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      queryClient.invalidateQueries({ queryKey: ['credit-notes-stats'] });
      toast.success('Credit note cancelled');
      setCancelTarget(null);
      setCancelReason('');
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Live total preview (mirrors backend region rules) ───────────────────────
  const preview = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    let total = 0;
    for (const l of lines) {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unit_price) || 0;
      const rate = Number(l.gst_rate) || 0;
      const lineTotal = round2(qty * price);
      if (isAU) {
        const lineTax = round2(lineTotal - lineTotal / (1 + rate / 100));
        tax += lineTax;
        subtotal += round2(lineTotal - lineTax);
        total += lineTotal;
      } else {
        const lineTax = round2(lineTotal * (rate / 100));
        subtotal += lineTotal;
        tax += lineTax;
        total += round2(lineTotal + lineTax);
      }
    }
    return { subtotal: round2(subtotal), tax: round2(tax), total: round2(total) };
  }, [lines, isAU]);

  const updateLine = (idx, field, value) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const validLines = lines.filter(
    (l) => l.description.trim() && Number(l.unit_price) >= 0 && Number(l.quantity) > 0
  );
  const canSubmit = validLines.length > 0 && preview.total > 0 && !createMutation.isPending;

  const submitCreate = () => {
    if (!canSubmit) return;
    const payload = {
      ...(outletId ? { outlet_id: outletId } : {}),
      ...(form.order_id.trim() ? { order_id: form.order_id.trim() } : {}),
      reason: form.reason || undefined,
      customer_name: form.customer_name || undefined,
      customer_phone: form.customer_phone || undefined,
      lines: validLines.map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        gst_rate: Number(l.gst_rate) || 0,
      })),
    };
    createMutation.mutate(payload);
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <FileMinus className="w-7 h-7 text-brand-400" />
            Credit Notes
          </h1>
          <p className="text-sm text-surface-400 mt-1">
            GST documents for refunds, returns and adjustments ({isAU ? 'Australia' : 'India'} GST)
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Credit Note
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Issued Notes', value: stats.count, icon: <Receipt className="w-5 h-5" /> },
          { label: 'Total Credited', value: format(stats.total_amount), icon: <TrendingDown className="w-5 h-5" /> },
          { label: `${gstLabel} Credited`, value: format(stats.tax_amount), icon: <FileText className="w-5 h-5" /> },
        ].map((s, i) => (
          <div key={i} className="bg-surface-900 rounded-2xl p-4 border border-surface-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-surface-400 uppercase font-bold tracking-wider">{s.label}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{s.icon}</span>
            </div>
            <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-72"
            placeholder="Search note no. or customer..."
          />
        </div>
        <div className="flex bg-surface-800 rounded-xl p-1 gap-1">
          {['all', 'issued', 'cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                statusFilter === s ? 'tab-btn-active' : 'text-surface-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto bg-surface-900 rounded-2xl border border-surface-800">
        <table className="w-full">
          <thead className="sticky top-0 bg-surface-900 z-10">
            <tr className="text-left text-xs text-surface-400 uppercase tracking-wider border-b border-surface-800">
              <th className="px-4 py-3">Note No.</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">{gstLabel}</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800/50">
            {listQuery.isLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-surface-500">Loading credit notes...</td></tr>
            ) : listQuery.isError ? (
              <tr><td colSpan={7} className="text-center py-12 text-red-400">{listQuery.error?.message || 'Failed to load'}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-surface-500">No credit notes yet</td></tr>
            ) : rows.map((n) => (
              <tr key={n.id} className="hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{n.credit_note_no}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-surface-300">{n.customer_name || 'Walk-in'}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-brand-400">{format(n.total_amount)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs text-surface-400">{format(n.tax_amount)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-bold uppercase ${STATUS_BADGE[n.status] || 'bg-surface-700 text-surface-300'}`}>
                    {n.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-surface-400">{n.issued_at ? new Date(n.issued_at).toLocaleDateString() : '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setViewNote(n)}
                      className="p-1.5 rounded-lg bg-surface-700/40 text-surface-300 hover:bg-surface-700 transition-all"
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {n.status === 'issued' && (
                      <button
                        onClick={() => { setCancelTarget(n); setCancelReason(''); }}
                        className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                        title="Cancel"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Credit Note" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-surface-400 font-bold uppercase">Linked Order ID (optional)</label>
              <div className="relative mt-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  value={form.order_id}
                  onChange={(e) => setForm({ ...form, order_id: e.target.value })}
                  className="input pl-9 w-full"
                  placeholder="Order UUID"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-surface-400 font-bold uppercase">Reason</label>
              <input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="input w-full mt-1"
                placeholder="Return / damaged / adjustment..."
                maxLength={500}
              />
            </div>
            <div>
              <label className="text-xs text-surface-400 font-bold uppercase">Customer Name</label>
              <input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="input w-full mt-1"
                placeholder="Optional"
                maxLength={150}
              />
            </div>
            <div>
              <label className="text-xs text-surface-400 font-bold uppercase">Customer Phone</label>
              <input
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                className="input w-full mt-1"
                placeholder="Optional"
                maxLength={15}
              />
            </div>
          </div>

          {/* Line items editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-surface-400 font-bold uppercase">Line Items</label>
              <button onClick={addLine} className="text-xs font-bold text-brand-400 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Line
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] text-surface-500 uppercase font-bold px-1">
                <span className="col-span-5">Description</span>
                <span className="col-span-2 text-right">Qty</span>
                <span className="col-span-2 text-right">Unit Price</span>
                <span className="col-span-2 text-right">{gstLabel} %</span>
                <span className="col-span-1" />
              </div>
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={l.description}
                    onChange={(e) => updateLine(idx, 'description', e.target.value)}
                    className="input col-span-5 text-sm"
                    placeholder="Item description"
                    maxLength={200}
                  />
                  <input
                    type="number" min="0" step="any"
                    value={l.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                    className="input col-span-2 text-sm text-right"
                  />
                  <input
                    type="number" min="0" step="any"
                    value={l.unit_price}
                    onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                    className="input col-span-2 text-sm text-right"
                    placeholder="0.00"
                  />
                  <input
                    type="number" min="0" max="100" step="any"
                    value={l.gst_rate}
                    onChange={(e) => updateLine(idx, 'gst_rate', e.target.value)}
                    className="input col-span-2 text-sm text-right"
                  />
                  <button
                    onClick={() => removeLine(idx)}
                    className="col-span-1 p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-30 justify-self-center"
                    disabled={lines.length === 1}
                    title="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Live totals */}
          <div className="bg-surface-900 rounded-xl p-4 border border-surface-800 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Subtotal {isAU ? '(ex GST)' : ''}</span>
              <span style={{ color: 'var(--text-primary)' }}>{format(preview.subtotal)}</span>
            </div>
            {isAU ? (
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">GST</span>
                <span style={{ color: 'var(--text-primary)' }}>{format(preview.tax)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-400">CGST</span>
                  <span style={{ color: 'var(--text-primary)' }}>{format(round2(preview.tax / 2))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-400">SGST</span>
                  <span style={{ color: 'var(--text-primary)' }}>{format(round2(preview.tax - round2(preview.tax / 2)))}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-base font-black pt-2 border-t border-surface-800">
              <span style={{ color: 'var(--text-primary)' }}>Total Credit</span>
              <span className="text-brand-400">{format(preview.total)}</span>
            </div>
          </div>

          <button
            onClick={submitCreate}
            disabled={!canSubmit}
            className="btn-primary w-full py-3 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Issuing...' : 'Issue Credit Note'}
          </button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!viewNote} onClose={() => setViewNote(null)} title="Credit Note" size="lg">
        {viewNote && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-surface-400 uppercase font-bold">Note No.</p>
                <p className="text-lg font-black font-mono" style={{ color: 'var(--text-primary)' }}>{viewNote.credit_note_no}</p>
              </div>
              <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${STATUS_BADGE[viewNote.status] || 'bg-surface-700 text-surface-300'}`}>
                {viewNote.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-surface-400 uppercase font-bold">Customer</p>
                <p style={{ color: 'var(--text-primary)' }}>{viewNote.customer_name || 'Walk-in'}</p>
              </div>
              <div>
                <p className="text-xs text-surface-400 uppercase font-bold">Phone</p>
                <p style={{ color: 'var(--text-primary)' }}>{viewNote.customer_phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-surface-400 uppercase font-bold">Issued</p>
                <p style={{ color: 'var(--text-primary)' }}>{viewNote.issued_at ? new Date(viewNote.issued_at).toLocaleString() : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-surface-400 uppercase font-bold">Order</p>
                <p className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{viewNote.order_id || '—'}</p>
              </div>
            </div>

            {viewNote.reason && (
              <div>
                <p className="text-xs text-surface-400 uppercase font-bold">Reason</p>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{viewNote.reason}</p>
              </div>
            )}

            {Array.isArray(viewNote.lines) && viewNote.lines.length > 0 && (
              <div className="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] text-surface-500 uppercase border-b border-surface-800">
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">{gstLabel}%</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/50">
                    {viewNote.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{l.description}</td>
                        <td className="px-3 py-2 text-right text-surface-300">{Number(l.quantity)}</td>
                        <td className="px-3 py-2 text-right text-surface-300">{format(l.unit_price)}</td>
                        <td className="px-3 py-2 text-right text-surface-300">{Number(l.gst_rate)}%</td>
                        <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--text-primary)' }}>{format(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-surface-900 rounded-xl p-4 border border-surface-800 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Subtotal</span>
                <span style={{ color: 'var(--text-primary)' }}>{format(viewNote.subtotal)}</span>
              </div>
              {isAU ? (
                <div className="flex justify-between text-sm">
                  <span className="text-surface-400">GST</span>
                  <span style={{ color: 'var(--text-primary)' }}>{format(viewNote.tax_amount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">CGST</span>
                    <span style={{ color: 'var(--text-primary)' }}>{format(viewNote.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-400">SGST</span>
                    <span style={{ color: 'var(--text-primary)' }}>{format(viewNote.sgst)}</span>
                  </div>
                  {Number(viewNote.igst) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-400">IGST</span>
                      <span style={{ color: 'var(--text-primary)' }}>{format(viewNote.igst)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-base font-black pt-2 border-t border-surface-800">
                <span style={{ color: 'var(--text-primary)' }}>Total Credit</span>
                <span className="text-brand-400">{format(viewNote.total_amount)}</span>
              </div>
            </div>

            {viewNote.status === 'issued' && (
              <button
                onClick={() => { setCancelTarget(viewNote); setCancelReason(''); setViewNote(null); }}
                className="btn-primary w-full py-2.5 bg-red-500 hover:bg-red-600"
              >
                Cancel This Credit Note
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* Cancel Modal */}
      <Modal isOpen={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Credit Note" size="sm">
        {cancelTarget && (
          <div className="space-y-4">
            <div className="bg-surface-900 rounded-xl p-4 border border-surface-800">
              <p className="text-xs text-surface-400 mb-1">Credit Note</p>
              <p className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{cancelTarget.credit_note_no}</p>
              <p className="text-2xl font-black text-red-400 mt-1">{format(cancelTarget.total_amount)}</p>
            </div>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="input w-full resize-none"
              rows={3}
              placeholder="Reason for cancellation (min 3 chars)..."
            />
            <button
              onClick={() => cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason.trim() })}
              disabled={cancelReason.trim().length < 3 || cancelMutation.isPending}
              className="btn-primary w-full py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
