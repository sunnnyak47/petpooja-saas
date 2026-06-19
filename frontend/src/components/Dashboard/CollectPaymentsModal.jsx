/**
 * @fileoverview Collect Payments popup — lists every open (unpaid, running) order —
 * dine-in, takeaway and delivery — searchable. Tapping an order expands an inline panel
 * that shows its items (to cross-check) and one-tap quick settle (Cash / Card / UPI or
 * EFTPOS) that bills + takes full payment right here — no detour through POS. A
 * "Pay in POS" link remains for split / partial / loyalty / card-terminal cases.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Search, CreditCard, Clock, Utensils, ShoppingBag, Bike, Banknote, Smartphone, ChevronDown, Loader2, ExternalLink } from 'lucide-react';
import Modal from '../Modal';
import BillPreviewModal from '../POS/BillPreviewModal';
import { PrintService } from '../../lib/PrintService';
import api, { SOCKET_URL } from '../../lib/api';
import { useCurrency } from '../../hooks/useCurrency';
import toast from 'react-hot-toast';

const minsAgo = (iso) => {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

// Per order-type display: short tag for the avatar, icon, colour.
const TYPE_META = {
  dine_in:  { tag: 'T',   Icon: Utensils,    color: '#2563eb' },
  takeaway: { tag: 'TA',  Icon: ShoppingBag, color: '#d97706' },
  delivery: { tag: 'DL',  Icon: Bike,        color: '#8b5cf6' },
};

export default function CollectPaymentsModal({ isOpen, onClose, outletId }) {
  const navigate = useNavigate();
  const { format, symbol, isAU } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);  // order whose quick-pay panel is open
  const [receiptOrder, setReceiptOrder] = useState(null);  // paid order to show/print a receipt for

  // Quick-settle methods offered inline. These record the tender directly (full amount) —
  // for split / partial / card-terminal / loyalty the operator uses "Pay in POS".
  const QUICK_METHODS = isAU
    ? [{ id: 'cash', label: 'Cash', Icon: Banknote }, { id: 'card', label: 'Card', Icon: CreditCard }, { id: 'eftpos', label: 'EFTPOS', Icon: CreditCard }]
    : [{ id: 'cash', label: 'Cash', Icon: Banknote }, { id: 'card', label: 'Card', Icon: CreditCard }, { id: 'upi', label: 'UPI', Icon: Smartphone }];

  // Every running, unpaid order (these statuses are all pre-payment), any type.
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['collect-orders', outletId],
    queryFn: () => api.get(`/orders?outlet_id=${outletId}&status=created,confirmed,held,billed,ready&limit=200`),
    enabled: isOpen && !!outletId,
    refetchInterval: 15_000,        // poll fallback
    refetchOnMount: 'always',       // always re-fetch when the popup opens (no stale cache)
    staleTime: 0,
    select: (res) => (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])),
  });

  // Realtime: refresh the list the instant any order is created, paid, billed or
  // cancelled in this outlet — so an order drops off as soon as it's paid and new
  // ones appear without waiting for the 15s poll.
  useEffect(() => {
    if (!isOpen || !outletId) return;
    const socket = io(`${SOCKET_URL}/orders`, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket'],
      withCredentials: true,
    });
    socket.on('connect', () => socket.emit('join_outlet', outletId));
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['collect-orders', outletId] });
    socket.on('order_status_change', refresh);
    socket.on('order_complete', refresh);
    socket.on('new_order', refresh);
    return () => socket.disconnect();
  }, [isOpen, outletId, queryClient]);

  // Compose a single-line outlet address from its parts (the receipt template reads
  // outlet.address) so both the preview and the printed/thermal copy show it.
  const withComposedOutlet = (o) => {
    if (!o?.outlet || o.outlet.address) return o;
    const ot = o.outlet;
    const address = [ot.address_line1, ot.address_line2, ot.city, ot.state, ot.pincode].filter(Boolean).join(', ');
    return { ...o, outlet: { ...ot, address } };
  };

  const doPrintReceipt = (order) => {
    if (!order) return;
    try {
      PrintService.printBill(order, { ...(order.outlet || {}), region: isAU ? 'AU' : 'IN' }, { paperWidth: 80, region: isAU ? 'AU' : 'IN' });
    } catch {
      toast.error('Print failed — check the printer or allow pop-ups for this site');
    }
  };

  // Inline quick settle: bill (if not already billed) then take full payment. One tap.
  // After it settles we re-fetch the now-paid order (with the recorded tender +
  // invoice number + full outlet header) and surface a receipt preview to print.
  const quickPay = useMutation({
    mutationFn: async ({ orderId, method, status, amount }) => {
      if (status !== 'billed') {
        await api.post(`/orders/${orderId}/bill`, { outlet_id: outletId });
      }
      await api.post(`/orders/${orderId}/payment`, { method, amount });
      const res = await api.get(`/orders/${orderId}`);
      return res?.data ?? res;   // full paid order for the receipt
    },
    onSuccess: (paidOrder) => {
      toast.success('Payment collected ✓');
      setExpandedId(null);
      queryClient.invalidateQueries({ queryKey: ['collect-orders', outletId] });
      queryClient.invalidateQueries({ queryKey: ['running-orders'] });
      // Generate the bill receipt for any tender source (cash/card/eftpos/upi).
      if (paidOrder?.id) setReceiptOrder(withComposedOutlet(paidOrder));
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not collect payment'),
  });

  // Fallback: bill then open POS for split / partial / loyalty / card-terminal flows.
  const posPay = useMutation({
    mutationFn: (orderId) => api.post(`/orders/${orderId}/bill`, { outlet_id: outletId }),
    onSuccess: (_d, orderId) => { onClose(); navigate(`/pos?order_id=${orderId}&pay=true`); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Could not start payment'),
  });

  const label = (o) => {
    if (o.order_type === 'dine_in') return o.table?.table_number ? `Table ${o.table.table_number}` : 'Dine-in';
    if (o.order_type === 'takeaway') return 'Takeaway';
    if (o.order_type === 'delivery') return 'Delivery';
    return o.order_type || 'Order';
  };

  // Amount still owed = grand total minus any prior partial tenders already recorded.
  const dueOf = (o) => {
    const paid = (o.payments || []).filter((p) => p.status === 'success').reduce((s, p) => s + Number(p.amount || 0), 0);
    return Math.max(0, Number(o.grand_total || 0) - paid);
  };

  const q = search.trim().toLowerCase();
  const rows = orders
    .filter((o) => !o.is_paid)
    .filter((o) => {
      if (!q) return true;
      return [o.order_number, o.table?.table_number, o.customer?.full_name, o.order_type, String(o.grand_total), label(o)]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="Collect Payments" size="lg">
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <Search className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, table, customer, type or amount…"
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Loading open orders…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {search ? 'No orders match your search' : 'No open orders awaiting payment'}
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {rows.map((o) => {
              const meta = TYPE_META[o.order_type] || TYPE_META.dine_in;
              const avatar = o.order_type === 'dine_in' && o.table?.table_number ? `T${o.table.table_number}` : meta.tag;
              const isOpenRow = expandedId === o.id;
              const items = Array.isArray(o.order_items) ? o.order_items : [];
              const due = dueOf(o);
              const busy = quickPay.isPending && quickPay.variables?.orderId === o.id;
              return (
                <div key={o.id} className="rounded-xl border overflow-hidden" style={{ borderColor: isOpenRow ? 'var(--accent)' : 'var(--border)', background: 'var(--bg-card)' }}>
                  {/* Row header — click anywhere to expand/verify */}
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => setExpandedId(isOpenRow ? null : o.id)}
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-xs shrink-0"
                      style={{ background: meta.color + '18', color: meta.color }}>
                      {avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        #{(o.order_number || '').split('-').pop() || o.order_number}
                        <span className="ml-2 text-[11px] font-medium" style={{ color: meta.color }}>{label(o)}</span>
                        {o.customer?.full_name && <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--text-secondary)' }}>{o.customer.full_name}</span>}
                      </p>
                      <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <Clock className="w-3 h-3" /> {minsAgo(o.created_at)} · {o.status} · {items.length} item{items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="text-sm font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{format(o.grand_total)}</span>
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform" style={{ color: 'var(--text-secondary)', transform: isOpenRow ? 'rotate(180deg)' : 'none' }} />
                  </div>

                  {/* Expanded — verify items + one-tap quick settle */}
                  {isOpenRow && (
                    <div className="px-3 pb-3 pt-1 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                      {/* Items to cross-check */}
                      <div className="rounded-lg p-2 space-y-1" style={{ background: 'var(--bg-secondary)' }}>
                        {items.length === 0 ? (
                          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>No item details available</p>
                        ) : items.map((it) => (
                          <div key={it.id} className="flex items-center justify-between text-[12px]">
                            <span style={{ color: 'var(--text-primary)' }}>
                              <span className="font-mono font-semibold">{it.quantity}×</span>{' '}
                              {it.name || it.menu_item_name || 'Item'}
                            </span>
                            <span className="font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                              {format(it.item_total ?? (Number(it.unit_price || 0) * Number(it.quantity || 1)))}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-[12px] pt-1 mt-1" style={{ borderTop: '1px dashed var(--border)' }}>
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Amount due</span>
                          <span className="font-mono font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{format(due)}</span>
                        </div>
                      </div>

                      {/* One-tap settle */}
                      <div className="flex items-center gap-2">
                        {QUICK_METHODS.map(({ id, label: ml, Icon }) => {
                          const thisBusy = busy && quickPay.variables?.method === id;
                          return (
                            <button
                              key={id}
                              onClick={() => quickPay.mutate({ orderId: o.id, method: id, status: o.status, amount: due })}
                              disabled={quickPay.isPending}
                              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                              style={{ background: 'var(--accent)' }}>
                              {thisBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                              {ml}
                            </button>
                          );
                        })}
                      </div>

                      {/* Escape hatch for split / partial / loyalty / card terminal */}
                      <button
                        onClick={() => posPay.mutate(o.id)}
                        disabled={posPay.isPending}
                        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium py-1 disabled:opacity-50"
                        style={{ color: 'var(--text-secondary)' }}>
                        <ExternalLink className="w-3 h-3" /> Pay in POS (split, partial, loyalty…)
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-center" style={{ color: 'var(--text-secondary)' }}>
          {rows.length} order{rows.length === 1 ? '' : 's'} awaiting payment · tap one to verify & collect · amounts in {symbol}
        </p>
      </div>
    </Modal>

    {/* Receipt preview shown after a successful collect (any tender source). */}
    <BillPreviewModal
      isOpen={!!receiptOrder}
      order={receiptOrder}
      onClose={() => setReceiptOrder(null)}
      onPrint={() => doPrintReceipt(receiptOrder)}
    />
    </>
  );
}
