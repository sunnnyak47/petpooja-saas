/**
 * CustomerInvoicesPage — Accounts Receivable invoicing
 * Route: /customer-invoices (registered separately)
 * Issue and track AR invoices: create draft → issue (post AR journal) → mark paid / void.
 */
import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { FileText, Plus, Send, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

/* ── Currency helpers ──────────────────────────────────────────────────────── */
const audFull = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
function fmtAUD(v) {
  if (v == null || isNaN(v)) return '$0.00';
  return audFull.format(v);
}

const GST_RATE = 0.10;

/* ── Status badge config ───────────────────────────────────────────────────── */
const STATUS_STYLES = {
  draft: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: 'Draft' },
  sent:  { bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6', label: 'Sent'  },
  paid:  { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', label: 'Paid'  },
  void:  { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444', label: 'Void'  },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
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

function LoadingState({ message }) {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      <span className="ml-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{message || 'Loading…'}</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <FileText className="w-10 h-10" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message || 'No invoices yet.'}</p>
    </div>
  );
}

const inputStyle = { background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
const labelClass = 'text-xs font-semibold uppercase tracking-wide';

const todayISO = () => new Date().toISOString().split('T')[0];
const plus30ISO = () => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-AU');
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CustomerInvoicesPage() {
  const queryClient = useQueryClient();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;

  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);          // row action in-flight
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState(null);  // row clicked → show lines

  /* New-invoice form state */
  const blankLine = () => ({ description: '', quantity: 1, unit_price: 0 });
  const [form, setForm] = useState({
    customer_name: '',
    issue_date: todayISO(),
    due_date: plus30ISO(),
    notes: '',
    lines: [blankLine()],
  });

  /* ── List query ───────────────────────────────────────────────────────── */
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['ar-invoices', outletId],
    queryFn: () => api.get('/accounting/invoices', { params: { outlet_id: outletId } }).then(r => r.data),
    staleTime: 60_000,
  });

  /* ── Detail query (expanded row) ──────────────────────────────────────── */
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['ar-invoice', expandedId],
    queryFn: () => api.get(`/accounting/invoices/${expandedId}`, { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!expandedId,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ar-invoices'] });
    if (expandedId) queryClient.invalidateQueries({ queryKey: ['ar-invoice', expandedId] });
  };

  /* ── Live totals for the form ─────────────────────────────────────────── */
  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((acc, l) => {
      const q = Number(l.quantity) || 0;
      const p = Number(l.unit_price) || 0;
      return acc + q * p;
    }, 0);
    const gst = subtotal * GST_RATE;
    return { subtotal, gst, total: subtotal + gst };
  }, [form.lines]);

  /* ── Form helpers ─────────────────────────────────────────────────────── */
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setLine = (idx, k, v) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, i) => (i === idx ? { ...l, [k]: v } : l)) }));
  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, blankLine()] }));
  const removeLine = (idx) =>
    setForm(f => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines }));
  const resetForm = () =>
    setForm({ customer_name: '', issue_date: todayISO(), due_date: plus30ISO(), notes: '', lines: [blankLine()] });

  const handleCreate = async () => {
    if (!form.customer_name.trim()) return toast.error('Customer name is required');
    const cleanLines = form.lines
      .filter(l => l.description.trim() && Number(l.quantity) > 0)
      .map(l => ({ description: l.description.trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price) }));
    if (cleanLines.length === 0) return toast.error('Add at least one line item');

    setCreating(true);
    try {
      await api.post('/accounting/invoices', {
        outlet_id: outletId,
        customer_name: form.customer_name.trim(),
        issue_date: form.issue_date,
        due_date: form.due_date,
        notes: form.notes,
        lines: cleanLines,
      });
      toast.success('Invoice created');
      resetForm();
      setShowForm(false);
      invalidate();
    } catch (e) {
      toast.error(e.message || 'Failed to create invoice');
    } finally {
      setCreating(false);
    }
  };

  /* ── Row actions ──────────────────────────────────────────────────────── */
  const doAction = async (id, path, body, okMsg) => {
    setBusyId(id);
    try {
      await api.post(`/accounting/invoices/${id}/${path}`, { outlet_id: outletId, ...body });
      toast.success(okMsg);
      invalidate();
    } catch (e) {
      toast.error(e.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleIssue   = (id) => doAction(id, 'issue', {}, 'Invoice issued — AR journal posted');
  const handleMarkPaid = (id) => doAction(id, 'mark-paid', { method: 'bank' }, 'Invoice marked paid');
  const handleVoid    = (id) => doAction(id, 'void', {}, 'Invoice voided');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Customer Invoices
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Issue and track AR invoices
          </p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-3.5 h-3.5" />
          New Invoice
        </button>
      </div>

      {/* ── New Invoice form ────────────────────────────────────────────── */}
      {showForm && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>New Invoice</h3>

          {/* Top fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <div className="flex flex-col gap-1">
              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Customer Name</label>
              <input
                type="text"
                value={form.customer_name}
                onChange={e => setField('customer_name', e.target.value)}
                placeholder="Acme Pty Ltd"
                className="px-3 py-2 rounded-lg border text-sm"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Issue Date</label>
              <input
                type="date"
                value={form.issue_date}
                onChange={e => setField('issue_date', e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={inputStyle}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setField('due_date', e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Line Items</label>
              <button className="btn-secondary btn-sm" onClick={addLine}>
                <Plus className="w-3.5 h-3.5" />
                Add Line
              </button>
            </div>
            <div className="space-y-2">
              {form.lines.map((line, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    type="text"
                    value={line.description}
                    onChange={e => setLine(i, 'description', e.target.value)}
                    placeholder="Description"
                    className="px-3 py-2 rounded-lg border text-sm flex-1"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={line.quantity}
                    onChange={e => setLine(i, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="px-3 py-2 rounded-lg border text-sm w-full sm:w-24"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={e => setLine(i, 'unit_price', e.target.value)}
                    placeholder="Unit price"
                    className="px-3 py-2 rounded-lg border text-sm w-full sm:w-32"
                    style={inputStyle}
                  />
                  <span className="text-sm font-semibold w-full sm:w-28 text-right flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {fmtAUD((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}
                  </span>
                  <button
                    onClick={() => removeLine(i)}
                    disabled={form.lines.length === 1}
                    className="p-1.5 rounded-lg transition-colors flex-shrink-0 disabled:opacity-30"
                    style={{ color: '#ef4444' }}
                    aria-label="Remove line"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1 mb-5">
            <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              rows={2}
              placeholder="Optional notes…"
              className="px-3 py-2 rounded-lg border text-sm resize-y"
              style={inputStyle}
            />
          </div>

          {/* Totals preview */}
          <div className="flex flex-col items-end gap-1 mb-5 text-sm">
            <div className="flex justify-between w-full sm:w-64">
              <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between w-full sm:w-64">
              <span style={{ color: 'var(--text-secondary)' }}>GST (10%)</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtAUD(totals.gst)}</span>
            </div>
            <div className="flex justify-between w-full sm:w-64 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
              <span className="font-extrabold" style={{ color: '#22c55e' }}>{fmtAUD(totals.total)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} disabled={creating} className="btn-primary btn-sm">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {creating ? 'Creating…' : 'Create Invoice'}
            </button>
            <button onClick={() => { resetForm(); setShowForm(false); }} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </Card>
      )}

      {/* ── Invoice list ────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>All Invoices</h3>
        </div>

        {isLoading ? (
          <LoadingState message="Loading invoices…" />
        ) : invoices.length === 0 ? (
          <EmptyState message="No invoices yet. Create your first one above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['Invoice #', 'Customer', 'Issued', 'Due', 'Status', 'Total', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const isBusy = busyId === inv.id;
                  const isOpen = expandedId === inv.id;
                  return (
                    <>
                      <tr
                        key={inv.id}
                        onClick={() => setExpandedId(isOpen ? null : inv.id)}
                        className="cursor-pointer transition-colors"
                        style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}
                      >
                        <td className="px-4 py-3 text-xs font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{inv.invoice_number || '—'}</td>
                        <td className="px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{inv.customer_name || '—'}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtDate(inv.issue_date)}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtDate(inv.due_date)}</td>
                        <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                        <td className="px-4 py-3 text-xs font-bold whitespace-nowrap" style={{ color: '#22c55e' }}>{fmtAUD(inv.total)}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {inv.status === 'draft' && (
                              <button onClick={() => handleIssue(inv.id)} disabled={isBusy} className="btn-secondary btn-sm">
                                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Issue
                              </button>
                            )}
                            {inv.status === 'sent' && (
                              <button onClick={() => handleMarkPaid(inv.id)} disabled={isBusy} className="btn-secondary btn-sm">
                                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                Mark Paid
                              </button>
                            )}
                            {inv.status !== 'void' && (
                              <button
                                onClick={() => handleVoid(inv.id)}
                                disabled={isBusy}
                                className="btn-secondary btn-sm"
                                style={{ color: '#ef4444' }}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Void
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${inv.id}-detail`} style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={7} className="px-4 py-4">
                            {detailLoading ? (
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading details…
                              </div>
                            ) : !detail ? (
                              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No details available.</p>
                            ) : (
                              <div className="space-y-3">
                                {detail.notes && (
                                  <p className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>{detail.notes}</p>
                                )}
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr>
                                      {['Description', 'Qty', 'Unit Price', 'Amount'].map(h => (
                                        <th key={h} className="px-2 py-1.5 text-left font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(detail.lines || []).map((l, li) => (
                                      <tr key={li} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td className="px-2 py-1.5" style={{ color: 'var(--text-primary)' }}>{l.description}</td>
                                        <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{l.quantity}</td>
                                        <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{fmtAUD(l.unit_price)}</td>
                                        <td className="px-2 py-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                                          {fmtAUD((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))}
                                        </td>
                                      </tr>
                                    ))}
                                    {(!detail.lines || detail.lines.length === 0) && (
                                      <tr><td colSpan={4} className="px-2 py-2" style={{ color: 'var(--text-secondary)' }}>No line items.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
