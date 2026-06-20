/**
 * @fileoverview Order Pipeline drill-down popup. Opened from any of the four
 * dashboard pipeline stages (Confirmed / Ready / Served / Paid). Two views:
 *   1. List  — the orders sitting in the clicked stage.
 *   2. Detail — click an order to see its status history and a per-station
 *               (KOT) breakdown of which items are ready/served vs still pending.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, CheckCircle2, Loader2, Utensils, ShoppingBag, Bike, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import api from '../../lib/api';

const TYPE_LABEL = { dine_in: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' };

// KOT status → human badge. served/completed both mean "handed over".
const KOT_BADGE = {
  pending:   { label: 'Pending', color: '#64748b', bg: '#64748b18' },
  preparing: { label: 'Cooking', color: '#d97706', bg: '#d9770618' },
  ready:     { label: 'Ready',   color: '#2563eb', bg: '#2563eb18' },
  served:    { label: 'Served',  color: '#16a34a', bg: '#16a34a18' },
  completed: { label: 'Served',  color: '#16a34a', bg: '#16a34a18' },
};

const STATUS_LABEL = (s) => ({
  created: 'Created', confirmed: 'Confirmed', ready: 'Ready', billed: 'Billed',
  paid: 'Paid', held: 'Held', cancelled: 'Cancelled', voided: 'Voided', refunded: 'Refunded',
}[s] || s);

const typeIcon = (t) => (t === 'takeaway' ? ShoppingBag : t === 'delivery' ? Bike : Utensils);
const shortNo = (n) => `#${(n || '').split('-').pop() || n || ''}`;
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

export default function OrderPipelineModal({ isOpen, onClose, stageKey, stageLabel, color, orders = [], format }) {
  const [selectedId, setSelectedId] = useState(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['pipeline-order-detail', selectedId],
    queryFn: () => api.get(`/orders/${selectedId}`).then((r) => r?.data ?? r),
    enabled: !!selectedId && isOpen,
  });

  const close = () => { setSelectedId(null); onClose(); };

  /* ── Detail view: history + per-station served/pending breakdown ── */
  const renderDetail = () => {
    if (isLoading || !detail) {
      return (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading order…
        </div>
      );
    }
    const items = detail.order_items || [];
    const kots = detail.kots || [];
    const noKot = items.filter((it) => !it.kot_id);
    const doneCount = items.filter((it) => it.status === 'ready').length;
    const pending = Math.max(0, items.length - doneCount);
    const history = detail.status_history || [];
    const TypeIcon = typeIcon(detail.order_type);

    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to {stageLabel} list
        </button>

        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TypeIcon className="w-4 h-4" style={{ color }} />
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {shortNo(detail.order_number)}
                <span className="ml-2 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {detail.table?.table_number ? `Table ${detail.table.table_number}` : (TYPE_LABEL[detail.order_type] || '')}
                </span>
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{fmtTime(detail.created_at)} · {STATUS_LABEL(detail.status)}{detail.is_paid ? ' · Paid' : ''}</p>
            </div>
          </div>
          <span className="text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{format(detail.grand_total)}</span>
        </div>

        {/* ready vs pending summary */}
        <div className="flex items-center gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1" style={{ color: '#16a34a' }}><CheckCircle2 className="w-3.5 h-3.5" /> {doneCount} ready/served</span>
          <span className="inline-flex items-center gap-1" style={{ color: '#d97706' }}><Clock className="w-3.5 h-3.5" /> {pending} pending</span>
        </div>

        {/* per-station (KOT) item breakdown */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Items by station</p>
          {kots.length === 0 && noKot.length === 0 && (
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>No items.</p>
          )}
          {kots.map((kot) => {
            const badge = KOT_BADGE[kot.status] || KOT_BADGE.pending;
            const list = items.filter((it) => it.kot_id === kot.id);
            const kotServed = kot.status === 'served' || kot.status === 'completed';
            return (
              <div key={kot.id} className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{kot.station || 'Kitchen'}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                </div>
                {list.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>—</p>
                ) : list.map((it) => {
                  const done = it.status === 'ready' || kotServed;
                  return (
                    <div key={it.id} className="flex items-center gap-1.5 text-[12px] py-0.5">
                      {done
                        ? <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: '#16a34a' }} />
                        : <Clock className="w-3 h-3 shrink-0" style={{ color: '#d97706' }} />}
                      <span style={{ color: 'var(--text-primary)' }}><span className="font-mono font-semibold">{it.quantity}×</span> {it.name}</span>
                      {it.variant_name && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>· {it.variant_name}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {noKot.length > 0 && (
            <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Not sent to kitchen</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#64748b18', color: '#64748b' }}>Draft</span>
              </div>
              {noKot.map((it) => (
                <div key={it.id} className="flex items-center gap-1.5 text-[12px] py-0.5">
                  <Clock className="w-3 h-3 shrink-0" style={{ color: '#d97706' }} />
                  <span style={{ color: 'var(--text-primary)' }}><span className="font-mono font-semibold">{it.quantity}×</span> {it.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* status history */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>History</p>
          {history.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>No history recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <div key={h.id || i} className="flex items-center gap-2 text-[12px]">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{STATUS_LABEL(h.to_status)}</span>
                  {h.from_status && <span style={{ color: 'var(--text-secondary)' }}>from {STATUS_LABEL(h.from_status)}</span>}
                  <span className="ml-auto text-[11px]" style={{ color: 'var(--text-secondary)' }}>{fmtTime(h.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ── List view: orders in this stage ── */
  const renderList = () => {
    if (orders.length === 0) {
      return <div className="py-12 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>No orders in {stageLabel}.</div>;
    }
    return (
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {orders.map((o) => {
          const TypeIcon = typeIcon(o.order_type);
          return (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:shadow-sm"
              style={{ borderColor: o.alert ? '#ef444455' : 'var(--border)', background: o.alert ? '#ef44440d' : 'var(--bg-card)' }}>
              <TypeIcon className="w-4 h-4 shrink-0" style={{ color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {shortNo(o.order_number)}
                  <span className="ml-2 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {o.table_number ? `Table ${o.table_number}` : (TYPE_LABEL[o.order_type] || '')}
                  </span>
                </p>
                {stageKey !== 'paid' && (
                  <p className="text-[11px] flex items-center gap-1" style={{ color: o.alert ? '#ef4444' : 'var(--text-secondary)' }}>
                    {o.alert && <AlertTriangle className="w-3 h-3" />}<Clock className="w-3 h-3" /> {o.stuck_mins}m in stage
                  </p>
                )}
              </div>
              <span className="text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{format(o.grand_total)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={selectedId ? `${stageLabel} · Order detail` : `${stageLabel} orders`} size="lg">
      {selectedId ? renderDetail() : renderList()}
    </Modal>
  );
}
