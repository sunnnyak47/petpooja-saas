/**
 * Close-of-Day (EOD) Report — Structured end-of-day cash reconciliation workflow.
 * 5-step wizard: Day Summary → Payment Breakdown → Cash Count → Reconciliation → Lock
 * Route: /eod-report
 */

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  ClipboardList, DollarSign, Banknote, Scale, Lock,
  CheckCircle2, AlertTriangle, XCircle, ChevronRight,
  ChevronLeft, RefreshCw, Download, History, Calendar,
  ShoppingBag, Utensils, Package, Globe, CreditCard,
  Smartphone, Coins, TrendingUp, TrendingDown, Printer,
  ArrowRight, Clock, User, Shield,
} from 'lucide-react';

/* ─── Currency denominations (₹) ───────────────────────────────── */
const DENOMS = [
  { value: 2000, label: '₹2000', color: '#16a34a' },
  { value:  500, label: '₹500',  color: '#2563eb' },
  { value:  200, label: '₹200',  color: '#7c3aed' },
  { value:  100, label: '₹100',  color: '#db2777' },
  { value:   50, label: '₹50',   color: '#d97706' },
  { value:   20, label: '₹20',   color: '#0891b2' },
  { value:   10, label: '₹10',   color: '#059669' },
  { value:    5, label: '₹5',    color: '#9333ea' },
  { value:    2, label: '₹2',    color: '#64748b' },
  { value:    1, label: '₹1',    color: '#475569' },
];

/* ─── Helpers ───────────────────────────────────────────────────── */
const fmt = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part, total) => total > 0 ? ((part / total) * 100).toFixed(1) : '0.0';

function computeCashActual(counts) {
  return DENOMS.reduce((s, d) => s + d.value * (Number(counts[d.value] || 0)), 0);
}

/* ─── Step indicator ────────────────────────────────────────────── */
const STEPS = [
  { id: 1, label: 'Day Summary',       icon: ClipboardList },
  { id: 2, label: 'Payment Breakdown', icon: CreditCard    },
  { id: 3, label: 'Cash Count',        icon: Banknote      },
  { id: 4, label: 'Reconciliation',    icon: Scale         },
  { id: 5, label: 'Lock & Finalise',   icon: Lock          },
];

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done    = current > s.id;
        const active  = current === s.id;
        return (
          <div key={s.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                ${done   ? 'bg-green-500 border-green-500 text-white'
                : active ? 'bg-accent border-accent text-white shadow-lg scale-110'
                :          'bg-surface border-border text-secondary'}`}>
                {done ? <CheckCircle2 size={18}/> : <Icon size={16}/>}
              </div>
              <span className={`text-xs mt-1 font-medium text-center whitespace-nowrap ${active ? 'text-accent' : done ? 'text-green-600' : 'text-secondary'}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 transition-all ${current > s.id ? 'bg-green-400' : 'bg-border'}`}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Stat row ──────────────────────────────────────────────────── */
function StatRow({ label, value, sub, highlight }) {
  return (
    <div className={`flex justify-between items-center py-2.5 border-b border-border last:border-0 ${highlight ? 'font-bold' : ''}`}>
      <span className={`text-sm ${highlight ? '' : 'text-secondary'}`}>{label}</span>
      <div className="text-right">
        <div className={`font-semibold ${highlight ? 'text-lg' : 'text-sm'}`}>{value}</div>
        {sub && <div className="text-xs text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Payment method card ────────────────────────────────────────── */
function PayCard({ label, icon: Icon, amount, pctVal, color }) {
  return (
    <div className="card p-4" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold">{fmt(amount)}</div>
      <div className="text-xs text-secondary mt-0.5">{pctVal}% of total</div>
      <div className="w-full bg-surface rounded-full h-1.5 mt-2">
        <div style={{ width: `${Math.min(100, Number(pctVal))}%`, background: color }} className="h-1.5 rounded-full"/>
      </div>
    </div>
  );
}

/* ─── Denomination row ───────────────────────────────────────────── */
function DenomRow({ denom, count, onChange }) {
  const subtotal = denom.value * (Number(count) || 0);
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <div className="w-16 text-center">
        <span className="font-bold text-sm px-2 py-1 rounded" style={{ background: denom.color + '20', color: denom.color }}>
          {denom.label}
        </span>
      </div>
      <span className="text-secondary text-sm flex-1">× </span>
      <input
        type="number" min="0" value={count}
        onChange={e => onChange(denom.value, e.target.value)}
        className="input w-24 text-center text-sm py-1.5"
        placeholder="0"
      />
      <div className="w-28 text-right font-semibold text-sm">
        {subtotal > 0 ? fmt(subtotal) : <span className="text-secondary">—</span>}
      </div>
    </div>
  );
}

/* ─── Print preview ──────────────────────────────────────────────── */
function PrintPreview({ report, snap, outletName, user }) {
  const printRef = useRef();
  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>EOD Report</title>
    <style>
      body { font-family: monospace; padding: 20px; font-size: 12px; }
      h2 { text-align:center; } h3 { border-bottom: 1px solid #ccc; }
      table { width:100%; border-collapse:collapse; }
      td { padding: 3px 6px; } .r { text-align:right; }
      .bold { font-weight:bold; } .hr { border-top: 1px dashed #ccc; margin: 6px 0; }
    </style></head><body>
    ${printRef.current?.innerHTML}
    </body></html>`);
    win.document.close();
    win.print();
  };

  const d = report || snap || {};
  return (
    <div>
      <div ref={printRef} className="text-sm">
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold">{outletName || 'Restaurant'}</h2>
          <p className="text-secondary">Close-of-Day Report</p>
          <p className="text-secondary">{d.report_date || new Date().toISOString().slice(0, 10)}</p>
        </div>

        <div className="border-t border-dashed border-border my-3"/>

        <div className="space-y-1">
          <div className="flex justify-between"><span>Total Orders</span><strong>{d.total_orders}</strong></div>
          <div className="flex justify-between"><span>Gross Revenue</span><strong>{fmt(d.total_revenue)}</strong></div>
          <div className="flex justify-between"><span>Total Tax</span><strong>{fmt(d.total_tax)}</strong></div>
          <div className="flex justify-between"><span>Discounts</span><strong>-{fmt(d.total_discount)}</strong></div>
          <div className="flex justify-between"><span>Voids ({d.void_count})</span><strong>-{fmt(d.void_amount)}</strong></div>
          <div className="flex justify-between"><span>Refunds ({d.refund_count})</span><strong>-{fmt(d.refund_amount)}</strong></div>
        </div>

        <div className="border-t border-dashed border-border my-3"/>

        <p className="font-bold text-sm mb-1">Payment Breakdown</p>
        <div className="space-y-1">
          <div className="flex justify-between"><span>Cash</span><strong>{fmt(d.cash_system)}</strong></div>
          <div className="flex justify-between"><span>Card</span><strong>{fmt(d.card_system)}</strong></div>
          <div className="flex justify-between"><span>UPI</span><strong>{fmt(d.upi_system)}</strong></div>
          <div className="flex justify-between"><span>Other</span><strong>{fmt(d.other_system)}</strong></div>
        </div>

        <div className="border-t border-dashed border-border my-3"/>

        <p className="font-bold text-sm mb-1">Cash Reconciliation</p>
        <div className="space-y-1">
          <div className="flex justify-between"><span>Opening Float</span><strong>{fmt(d.opening_cash)}</strong></div>
          <div className="flex justify-between"><span>Cash Sales</span><strong>{fmt(d.cash_system)}</strong></div>
          <div className="flex justify-between"><span>Expected</span><strong>{fmt((Number(d.opening_cash)||0)+(Number(d.cash_system)||0))}</strong></div>
          <div className="flex justify-between"><span>Counted</span><strong>{fmt(d.cash_actual)}</strong></div>
          <div className="flex justify-between font-bold"><span>Difference</span>
            <strong className={Number(d.cash_difference) === 0 ? 'text-green-600' : 'text-red-500'}>
              {Number(d.cash_difference) >= 0 ? '+' : ''}{fmt(d.cash_difference)}
            </strong>
          </div>
        </div>

        <div className="border-t border-dashed border-border my-3"/>

        <div className="text-xs text-secondary">
          <p>Status: {d.status === 'locked' ? '✓ LOCKED' : 'DRAFT'}</p>
          {d.closer?.name && <p>Closed by: {d.closer.name}</p>}
          {d.closed_at && <p>Closed at: {new Date(d.closed_at).toLocaleString()}</p>}
          {d.notes && <p>Notes: {d.notes}</p>}
          {Number(d.cash_difference) !== 0 && d.discrepancy_reason && <p>Reason: {d.discrepancy_reason}</p>}
        </div>
      </div>

      <button onClick={handlePrint} className="btn-secondary w-full mt-4 flex items-center justify-center gap-2">
        <Printer size={16}/> Print EOD Report
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */

export default function EODReportPage() {
  const { user } = useSelector(s => s.auth);
  const outletId  = user?.outlet_id;
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  const [step,        setStep]        = useState(1);
  const [activeView,  setActiveView]  = useState('wizard'); // wizard | history
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  // Wizard state
  const [openingCash,  setOpeningCash]  = useState('');
  const [denomCounts,  setDenomCounts]  = useState({});
  const [notes,        setNotes]        = useState('');
  const [discReason,   setDiscReason]   = useState('');

  /* ── Live snapshot ── */
  const { data: snap, isLoading: snapLoading, refetch: refetchSnap } = useQuery({
    queryKey: ['eod-snapshot', outletId, selectedDate],
    queryFn:  () => api.get(`/reports/eod/preview?outlet_id=${outletId}&date=${selectedDate}`).then(r => r.data?.data || r.data),
    enabled:  !!outletId,
    staleTime: 30_000,
  });

  /* ── Saved report for selected date ── */
  const { data: savedReport, refetch: refetchSaved } = useQuery({
    queryKey: ['eod-report', outletId, selectedDate],
    queryFn:  () => api.get(`/reports/eod/${selectedDate}?outlet_id=${outletId}`).then(r => r.data?.data || r.data),
    enabled:  !!outletId,
    onSuccess: (d) => {
      if (d?.id && d.status !== 'not_started') {
        // Prefill wizard with saved data
        setOpeningCash(String(d.opening_cash ?? ''));
        const saved = d.denomination_count || {};
        const c = {};
        DENOMS.forEach(dn => { c[dn.value] = String(saved[dn.value] || ''); });
        setDenomCounts(c);
        setNotes(d.notes || '');
        setDiscReason(d.discrepancy_reason || '');
      }
    },
  });

  /* ── EOD History ── */
  const { data: history = [] } = useQuery({
    queryKey: ['eod-history', outletId],
    queryFn:  () => api.get(`/reports/eod/history?outlet_id=${outletId}&limit=20`).then(r => r.data?.data || r.data || []),
    enabled:  !!outletId && activeView === 'history',
  });

  /* ── Save draft mutation ── */
  const saveMutation = useMutation({
    mutationFn: (payload) => api.post('/reports/eod/save', payload),
    onSuccess: (res) => {
      toast.success('Draft saved successfully');
      qc.invalidateQueries(['eod-report', outletId, selectedDate]);
      qc.invalidateQueries(['eod-history', outletId]);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Save failed'),
  });

  /* ── Lock mutation ── */
  const lockMutation = useMutation({
    mutationFn: (reportId) => api.post('/reports/eod/lock', { outlet_id: outletId, report_id: reportId }),
    onSuccess: () => {
      toast.success('EOD Report locked & finalised!');
      qc.invalidateQueries(['eod-report', outletId, selectedDate]);
      qc.invalidateQueries(['eod-history', outletId]);
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Lock failed'),
  });

  /* ── Derived values ── */
  const cashActual   = useMemo(() => computeCashActual(denomCounts), [denomCounts]);
  const openingFloat = Number(openingCash) || 0;
  const cashSystem   = Number(snap?.cash_system || 0);
  const expectedCash = openingFloat + cashSystem;
  const difference   = cashActual - expectedCash;
  const hasDiscrepancy = Math.abs(difference) > 0.01;

  const totalRevenue = Number(snap?.total_revenue || 0);

  function updateDenom(val, count) {
    setDenomCounts(prev => ({ ...prev, [val]: count }));
  }

  function handleSaveDraft() {
    const denomApi = {};
    DENOMS.forEach(d => { if (Number(denomCounts[d.value])) denomApi[d.value] = Number(denomCounts[d.value]); });
    saveMutation.mutate({
      outlet_id:          outletId,
      date:               selectedDate,
      opening_cash:       openingFloat,
      denomination_count: denomApi,
      notes,
      discrepancy_reason: discReason,
    });
  }

  function handleLock() {
    if (!savedReport?.id) {
      toast.error('Save the report first before locking');
      return;
    }
    if (hasDiscrepancy && !discReason.trim()) {
      toast.error('Please enter a reason for the cash discrepancy');
      setStep(4);
      return;
    }
    lockMutation.mutate(savedReport.id);
  }

  const isLocked = savedReport?.status === 'locked';

  /* ── Step navigation ── */
  function goNext() { if (step < 5) setStep(s => s + 1); }
  function goPrev() { if (step > 1) setStep(s => s - 1); }

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList size={24} className="text-accent"/> Close-of-Day Report
          </h1>
          <p className="text-secondary text-sm mt-1">End-of-day cash reconciliation &amp; business summary</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setStep(1); }}
            className="input text-sm py-2" max={new Date().toISOString().slice(0,10)}/>
          <button onClick={() => setActiveView(v => v === 'wizard' ? 'history' : 'wizard')}
            className="btn-secondary flex items-center gap-2 text-sm">
            {activeView === 'wizard' ? <><History size={14}/> History</> : <><ClipboardList size={14}/> Today's EOD</>}
          </button>
        </div>
      </div>

      {/* ════ HISTORY VIEW ════ */}
      {activeView === 'history' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-border font-semibold">Past EOD Reports</div>
          {history.length === 0 ? (
            <div className="p-12 text-center text-secondary">No EOD reports found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['Date','Orders','Revenue','Cash System','Actual Cash','Difference','Status','Closed By'].map(h => (
                    <th key={h} className="text-left p-3 text-xs font-semibold text-secondary uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(r => {
                  const diff = Number(r.cash_difference);
                  return (
                    <tr key={r.id} className="border-b border-border hover:bg-surface/50 cursor-pointer"
                      onClick={() => { setSelectedDate(r.report_date.slice(0,10)); setActiveView('wizard'); setStep(5); }}>
                      <td className="p-3 text-sm font-medium">{new Date(r.report_date).toLocaleDateString('en-IN')}</td>
                      <td className="p-3 text-sm">{r.total_orders}</td>
                      <td className="p-3 text-sm font-semibold">{fmt(r.total_revenue)}</td>
                      <td className="p-3 text-sm">{fmt(r.cash_system)}</td>
                      <td className="p-3 text-sm">{fmt(r.cash_actual)}</td>
                      <td className="p-3 text-sm font-bold" style={{ color: diff === 0 ? '#22c55e' : Math.abs(diff) < 100 ? '#f59e0b' : '#ef4444' }}>
                        {diff >= 0 ? '+' : ''}{fmt(diff)}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'locked' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {r.status === 'locked' ? '✓ Locked' : 'Draft'}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-secondary">{r.closer?.name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ════ WIZARD VIEW ════ */}
      {activeView === 'wizard' && (
        <>
          {isLocked && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
              <Shield size={20}/> <strong>This report is locked and finalised.</strong>
              <span className="text-sm">Closed by {savedReport?.closer?.name || 'staff'} at {savedReport?.closed_at ? new Date(savedReport.closed_at).toLocaleString() : '—'}</span>
            </div>
          )}

          <StepBar current={step} />

          {/* ─── STEP 1: Day Summary ─── */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold flex items-center gap-2"><ClipboardList size={16}/> Sales Summary</h2>
                  <button onClick={() => refetchSnap()} className="p-1.5 rounded hover:bg-surface transition-colors" title="Refresh">
                    <RefreshCw size={14} className={snapLoading ? 'animate-spin' : ''}/>
                  </button>
                </div>
                {snapLoading ? (
                  <div className="text-center py-8"><RefreshCw size={24} className="animate-spin mx-auto text-accent"/></div>
                ) : (
                  <>
                    <StatRow label="Total Orders"   value={snap?.total_orders ?? 0}    highlight/>
                    <StatRow label="Gross Revenue"  value={fmt(snap?.total_revenue)}   highlight/>
                    <StatRow label="Total Tax"      value={fmt(snap?.total_tax)}/>
                    <StatRow label="Total Discounts"value={`-${fmt(snap?.total_discount)}`}/>
                    <StatRow label="Voids"          value={`${snap?.void_count ?? 0} orders · -${fmt(snap?.void_amount)}`}/>
                    <StatRow label="Refunds"        value={`${snap?.refund_count ?? 0} · -${fmt(snap?.refund_amount)}`}/>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div className="card p-5">
                  <h2 className="font-semibold mb-3 flex items-center gap-2"><ShoppingBag size={16}/> By Order Type</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Dine In',   icon: Utensils, orders: snap?.dine_in_orders,   rev: snap?.dine_in_revenue,   color:'#f97316' },
                      { label: 'Takeaway',  icon: Package,  orders: snap?.takeaway_orders,   rev: snap?.takeaway_revenue,  color:'#6366f1' },
                      { label: 'Delivery',  icon: ArrowRight,orders: snap?.delivery_orders,  rev: snap?.delivery_revenue,  color:'#14b8a6' },
                      { label: 'Online',    icon: Globe,    orders: snap?.online_orders,     rev: snap?.online_revenue,    color:'#ec4899' },
                    ].map(t => (
                      <div key={t.label} className="bg-surface rounded-xl p-3" style={{ borderLeft: `3px solid ${t.color}` }}>
                        <div className="text-xs text-secondary mb-1">{t.label}</div>
                        <div className="font-bold">{t.orders ?? 0} orders</div>
                        <div className="text-sm text-secondary">{fmt(t.rev)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {(snap?.top_items || []).length > 0 && (
                  <div className="card p-5">
                    <h2 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp size={16}/> Top Items</h2>
                    <div className="space-y-2">
                      {(snap.top_items || []).slice(0, 5).map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-secondary truncate max-w-[180px]">{i+1}. {item.name}</span>
                          <div className="text-right flex-shrink-0 ml-3">
                            <span className="font-semibold">{fmt(item.revenue)}</span>
                            <span className="text-secondary ml-1">×{item.qty}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── STEP 2: Payment Breakdown ─── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <PayCard label="Cash"  icon={Coins}       amount={snap?.cash_system}  pctVal={pct(snap?.cash_system,  totalRevenue)} color="#22c55e"/>
                <PayCard label="Card"  icon={CreditCard}  amount={snap?.card_system}  pctVal={pct(snap?.card_system,  totalRevenue)} color="#3b82f6"/>
                <PayCard label="UPI"   icon={Smartphone}  amount={snap?.upi_system}   pctVal={pct(snap?.upi_system,   totalRevenue)} color="#a855f7"/>
                <PayCard label="Other" icon={DollarSign}  amount={snap?.other_system} pctVal={pct(snap?.other_system, totalRevenue)} color="#f59e0b"/>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2"><CreditCard size={16}/> Payment Method Totals</h2>
                <div className="space-y-0">
                  {[
                    { label: 'Cash',  value: snap?.cash_system  },
                    { label: 'Card',  value: snap?.card_system  },
                    { label: 'UPI',   value: snap?.upi_system   },
                    { label: 'Other', value: snap?.other_system },
                  ].map(p => (
                    <StatRow key={p.label} label={p.label} value={fmt(p.value)}/>
                  ))}
                  <StatRow label="TOTAL COLLECTED" value={fmt(totalRevenue)} highlight/>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold mb-3">Opening Float</h2>
                <p className="text-sm text-secondary mb-3">Enter the cash amount in the drawer at the start of the day (petty cash float).</p>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-secondary">₹</span>
                  <input type="number" min="0" step="0.01" value={openingCash}
                    onChange={e => setOpeningCash(e.target.value)}
                    placeholder="e.g. 1000"
                    className="input text-lg font-semibold w-48"
                    disabled={isLocked}/>
                  <span className="text-secondary text-sm">opening cash float</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Cash Count ─── */}
          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="card p-5">
                <h2 className="font-semibold mb-1 flex items-center gap-2"><Banknote size={16}/> Count Cash Drawer</h2>
                <p className="text-xs text-secondary mb-4">Enter the number of each note/coin you have physically counted.</p>
                <div>
                  {DENOMS.map(d => (
                    <DenomRow key={d.value} denom={d}
                      count={denomCounts[d.value] || ''}
                      onChange={updateDenom}
                      disabled={isLocked}/>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="card p-5">
                  <h2 className="font-semibold mb-3 flex items-center gap-2"><Coins size={16}/> Denomination Summary</h2>
                  {DENOMS.filter(d => Number(denomCounts[d.value]) > 0).map(d => (
                    <div key={d.value} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                      <span style={{ color: d.color }} className="font-medium">{d.label} × {denomCounts[d.value]}</span>
                      <span className="font-semibold">{fmt(d.value * Number(denomCounts[d.value]))}</span>
                    </div>
                  ))}
                  {!DENOMS.some(d => Number(denomCounts[d.value]) > 0) && (
                    <p className="text-secondary text-sm text-center py-4">Enter counts on the left to see totals here</p>
                  )}
                  <div className="border-t-2 border-border mt-3 pt-3 flex justify-between font-bold text-lg">
                    <span>Total Counted</span>
                    <span className="text-accent">{fmt(cashActual)}</span>
                  </div>
                </div>

                <div className="card p-4 bg-surface">
                  <h3 className="text-sm font-semibold mb-2">Quick Reference</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-secondary">Opening Float</span><span>{fmt(openingFloat)}</span></div>
                    <div className="flex justify-between"><span className="text-secondary">Cash Sales</span><span>{fmt(cashSystem)}</span></div>
                    <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                      <span>Expected in Drawer</span><span>{fmt(expectedCash)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 4: Reconciliation ─── */}
          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="card p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2"><Scale size={16}/> Cash Reconciliation</h2>
                <div className="space-y-0">
                  <StatRow label="Opening Float"   value={fmt(openingFloat)}/>
                  <StatRow label="Cash Sales"      value={fmt(cashSystem)}/>
                  <StatRow label="Expected in Drawer" value={fmt(expectedCash)} highlight/>
                  <StatRow label="Actual Counted"  value={fmt(cashActual)} highlight/>
                  <div className="flex justify-between items-center py-3 border-t-2 border-border">
                    <span className="font-bold text-lg">Difference</span>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${difference === 0 ? 'text-green-600' : Math.abs(difference) < 100 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {difference >= 0 ? '+' : ''}{fmt(difference)}
                      </div>
                      <div className="text-xs text-secondary">
                        {difference === 0 ? '✓ Perfect match' : difference > 0 ? '▲ Surplus (extra cash found)' : '▼ Shortage (cash missing)'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discrepancy indicator */}
                {difference === 0 ? (
                  <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2 text-green-800 text-sm">
                    <CheckCircle2 size={16}/> Cash drawer balanced perfectly!
                  </div>
                ) : Math.abs(difference) <= 100 ? (
                  <div className="mt-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 flex items-center gap-2 text-yellow-800 text-sm">
                    <AlertTriangle size={16}/> Minor discrepancy of {fmt(Math.abs(difference))} — within acceptable range
                  </div>
                ) : (
                  <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-red-800 text-sm">
                    <XCircle size={16}/> Significant discrepancy of {fmt(Math.abs(difference))} — reason required
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="card p-5">
                  <h2 className="font-semibold mb-3">Full Payment Summary</h2>
                  <StatRow label="Cash Collected"   value={fmt(cashSystem)}/>
                  <StatRow label="Card Collected"   value={fmt(snap?.card_system)}/>
                  <StatRow label="UPI Collected"    value={fmt(snap?.upi_system)}/>
                  <StatRow label="Other"            value={fmt(snap?.other_system)}/>
                  <StatRow label="TOTAL"            value={fmt(totalRevenue)} highlight/>
                </div>

                <div className="card p-5">
                  <h2 className="font-semibold mb-3">Discrepancy Notes</h2>
                  {hasDiscrepancy && (
                    <div className="mb-3">
                      <label className="text-sm text-secondary block mb-1">Reason for difference <span className="text-red-500">*</span></label>
                      <select value={discReason} onChange={e => setDiscReason(e.target.value)}
                        className="input mb-2 text-sm" disabled={isLocked}>
                        <option value="">Select reason…</option>
                        <option value="Counting error">Counting error</option>
                        <option value="Change given incorrectly">Change given incorrectly</option>
                        <option value="Petty cash used">Petty cash used</option>
                        <option value="Till theft">Till theft</option>
                        <option value="System error">System error</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  )}
                  <label className="text-sm text-secondary block mb-1">Additional notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    rows={4} placeholder="Any additional notes for this EOD…"
                    className="input resize-none text-sm" disabled={isLocked}/>
                </div>

                {!isLocked && (
                  <button onClick={handleSaveDraft} disabled={saveMutation.isPending}
                    className="btn-primary w-full flex items-center justify-center gap-2">
                    {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin"/> : <Download size={14}/>}
                    Save Draft Report
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── STEP 5: Lock & Finalise ─── */}
          {step === 5 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Print Preview */}
              <div className="card p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2"><Printer size={16}/> Report Preview</h2>
                <PrintPreview
                  report={savedReport?.id ? savedReport : null}
                  snap={snap}
                  outletName={user?.outlet_name || user?.name}
                  user={user}/>
              </div>

              {/* Final actions */}
              <div className="space-y-4">
                <div className="card p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2"><Lock size={16}/> Finalise EOD</h2>

                  {/* Quick summary */}
                  <div className="bg-surface rounded-xl p-4 space-y-2 mb-4">
                    <div className="flex justify-between text-sm"><span className="text-secondary">Date</span><strong>{selectedDate}</strong></div>
                    <div className="flex justify-between text-sm"><span className="text-secondary">Orders</span><strong>{snap?.total_orders ?? 0}</strong></div>
                    <div className="flex justify-between text-sm"><span className="text-secondary">Revenue</span><strong>{fmt(snap?.total_revenue)}</strong></div>
                    <div className="flex justify-between text-sm"><span className="text-secondary">Cash Difference</span>
                      <strong className={difference === 0 ? 'text-green-600' : 'text-red-500'}>
                        {difference >= 0 ? '+' : ''}{fmt(difference)}
                      </strong>
                    </div>
                  </div>

                  {hasDiscrepancy && !discReason && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4 flex items-start gap-2">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/>
                      Cash discrepancy detected. Go to Step 4 and enter a reason before locking.
                    </div>
                  )}

                  {isLocked ? (
                    <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-center">
                      <CheckCircle2 size={32} className="text-green-600 mx-auto mb-2"/>
                      <p className="font-bold text-green-800">Report is Locked</p>
                      <p className="text-sm text-green-700 mt-1">
                        Closed by {savedReport?.closer?.name || '—'}<br/>
                        {savedReport?.closed_at ? new Date(savedReport.closed_at).toLocaleString() : ''}
                      </p>
                    </div>
                  ) : (
                    <>
                      {!savedReport?.id && (
                        <button onClick={handleSaveDraft} disabled={saveMutation.isPending}
                          className="btn-secondary w-full flex items-center justify-center gap-2 mb-3">
                          {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin"/> : <Download size={14}/>}
                          Save Draft First
                        </button>
                      )}
                      <button onClick={handleLock}
                        disabled={lockMutation.isPending || !savedReport?.id || (hasDiscrepancy && !discReason)}
                        className="w-full py-3 px-6 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all
                          disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                        {lockMutation.isPending
                          ? <RefreshCw size={16} className="animate-spin"/>
                          : <Lock size={16}/>}
                        Lock &amp; Finalise EOD Report
                      </button>
                      <p className="text-xs text-secondary text-center mt-2">
                        ⚠ Once locked, this report cannot be edited
                      </p>
                    </>
                  )}
                </div>

                {/* Status trail */}
                <div className="card p-5">
                  <h3 className="font-semibold mb-3 text-sm flex items-center gap-2"><Clock size={14}/> Status</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-secondary">
                      <div className={`w-2 h-2 rounded-full ${snap ? 'bg-green-500' : 'bg-gray-300'}`}/>
                      Live data loaded
                    </div>
                    <div className="flex items-center gap-2 text-secondary">
                      <div className={`w-2 h-2 rounded-full ${savedReport?.id ? 'bg-green-500' : 'bg-gray-300'}`}/>
                      Draft saved
                    </div>
                    <div className="flex items-center gap-2 text-secondary">
                      <div className={`w-2 h-2 rounded-full ${isLocked ? 'bg-green-500' : 'bg-gray-300'}`}/>
                      Report locked
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Navigation buttons ── */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button onClick={goPrev} disabled={step === 1}
              className="btn-secondary flex items-center gap-2 disabled:opacity-40">
              <ChevronLeft size={16}/> Previous
            </button>

            <div className="flex items-center gap-3">
              {step < 5 && !isLocked && (
                <button onClick={handleSaveDraft} disabled={saveMutation.isPending}
                  className="btn-secondary flex items-center gap-2 text-sm">
                  {saveMutation.isPending ? <RefreshCw size={12} className="animate-spin"/> : <Download size={12}/>}
                  Save Draft
                </button>
              )}
              {step < 5 ? (
                <button onClick={goNext}
                  className="btn-primary flex items-center gap-2">
                  Next <ChevronRight size={16}/>
                </button>
              ) : (
                <button onClick={() => navigate('/reports')} className="btn-secondary flex items-center gap-2">
                  <TrendingUp size={14}/> Go to Reports
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
