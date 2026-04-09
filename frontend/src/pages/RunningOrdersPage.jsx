/**
 * @fileoverview RunningOrdersPage — Live view of all active restaurant orders.
 * Supports full KOT/Bill/Cancel/Payment lifecycle management inline.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import CancelOrderModal from '../components/POS/CancelOrderModal';
import BillPreviewModal from '../components/POS/BillPreviewModal';
import {
  Clock, Receipt, Ban, CreditCard, Plus, Utensils, ShoppingBag,
  Globe, Timer, ChefHat, CheckCircle2, AlertTriangle, Send, X,
  RefreshCw, Wifi, WifiOff, Printer, Eye
} from 'lucide-react';

const TYPE_ICONS = { dine_in: Utensils, takeaway: ShoppingBag, delivery: Globe, online: Globe };

const STATUS_MAP = {
  created:    { label: 'PENDING', bar: 'from-blue-500 to-blue-600',   badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  confirmed:  { label: 'CONFIRMED', bar: 'from-orange-500 to-amber-500', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  held:       { label: 'ON HOLD',  bar: 'from-slate-500 to-slate-600',  badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  billed:     { label: 'BILLED',   bar: 'from-purple-500 to-purple-600', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

function ElapsedTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState('0:00');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
      setIsUrgent(mins >= 20);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <span className={`flex items-center gap-1 font-mono text-xs font-bold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-brand-400'}`}>
      <Timer className="w-3 h-3" /> {elapsed}
    </span>
  );
}

/** Payment modal (inline settle) */
function PaymentModal({ isOpen, onClose, order, onSuccess }) {
  const [method, setMethod] = useState('cash');
  const [loading, setLoading] = useState(false);

  const total = Number(order?.grand_total || 0);

  const handlePay = async () => {
    setLoading(true);
    try {
      await api.post(`/orders/${order.id}/payment`, { method, amount: total });
      toast.success('Payment completed! ✅');
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settle Payment" size="sm">
      <div className="space-y-4">
        <div className="text-center bg-surface-900 rounded-xl p-5 border border-surface-800">
          <p className="text-xs text-surface-400 uppercase tracking-widest mb-1">Grand Total</p>
          <p className="text-4xl font-black text-brand-400">₹{total.toLocaleString('en-IN')}</p>
          {order?.invoice_number && (
            <p className="text-xs text-surface-500 mt-2">Invoice: {order.invoice_number}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-surface-500 uppercase font-bold mb-2">Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {['cash', 'card', 'upi'].map(m => (
              <button key={m} onClick={() => setMethod(m)}
                className={`py-2.5 rounded-xl border-2 font-bold text-xs uppercase tracking-wide transition-all ${method === m ? 'border-brand-500 bg-brand-500 text-white' : 'border-surface-700 bg-surface-800 text-surface-400'}`}
              >{m}</button>
            ))}
          </div>
        </div>
        <button onClick={handlePay} disabled={loading}
          className="btn-success w-full py-4 rounded-xl text-lg font-bold tracking-wide disabled:opacity-50">
          {loading ? 'Processing...' : `Confirm ${method.toUpperCase()} — ₹${total.toLocaleString('en-IN')}`}
        </button>
      </div>
    </Modal>
  );
}

/** Order card component */
function OrderCard({ order, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const StatusConf = STATUS_MAP[order.status] || STATUS_MAP.created;
  const Icon = TYPE_ICONS[order.order_type] || ShoppingBag;
  const hasKOTs = (order._count?.kots || 0) > 0;

  return (
    <div className={`relative bg-surface-800/40 border border-surface-700/50 rounded-2xl overflow-hidden transition-all duration-300 hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5 ${order.status === 'billed' ? 'ring-1 ring-purple-500/20' : ''}`}>
      {/* Color top bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${StatusConf.bar}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-700/60 flex items-center justify-center">
              <Icon className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h3 className="text-white font-bold font-mono text-sm">
                #{order.order_number?.split('-').pop() || order.id?.slice(-6)}
              </h3>
              <p className="text-xs text-surface-400">
                {order.table ? `Table ${order.table.table_number}` : order.customer?.full_name || 'Walk-in'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${StatusConf.badge}`}>
              {StatusConf.label}
            </span>
            <ElapsedTimer createdAt={order.created_at} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="bg-surface-700/30 rounded-lg py-1.5">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">Items</p>
            <p className="text-sm font-bold text-white">{order._count?.order_items || 0}</p>
          </div>
          <div className="bg-surface-700/30 rounded-lg py-1.5">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">KOTs</p>
            <p className={`text-sm font-bold ${hasKOTs ? 'text-orange-400' : 'text-surface-500'}`}>
              {order._count?.kots || 0}
            </p>
          </div>
          <div className="bg-surface-700/30 rounded-lg py-1.5">
            <p className="text-[10px] text-surface-500 uppercase tracking-wider">Amount</p>
            <p className="text-sm font-bold text-brand-400">₹{Number(order.grand_total || 0).toLocaleString('en-IN')}</p>
          </div>
        </div>

        {/* KOT warning badge */}
        {hasKOTs && order.status !== 'billed' && (
          <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-1.5 mb-3">
            <ChefHat className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-orange-400 text-xs font-medium">{order._count.kots} KOT(s) sent to kitchen</span>
          </div>
        )}

        {/* Billed indicator */}
        {order.status === 'billed' && (
          <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-1.5 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-purple-400 text-xs font-medium">Bill generated — {order.invoice_number}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {/* Row 1: Add KOT + Generate Bill */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onAction('add_kot', order)}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-surface-700/80 text-white hover:bg-orange-500 hover:text-white transition-all border border-surface-600/50"
            >
              <Plus className="w-3.5 h-3.5" /> KOT
            </button>

            {order.status !== 'billed' ? (
              <button
                onClick={() => onAction('generate_bill', order)}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-brand-400 hover:text-white transition-all"
              >
                <Receipt className="w-3.5 h-3.5" /> Bill
              </button>
            ) : (
              <button
                onClick={() => onAction('view_bill', order)}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-purple-500 text-white hover:bg-purple-600 transition-all"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            )}
          </div>

          {/* Row 2: Pay (full width if billed) or Cancel */}
          {order.status === 'billed' && (
            <button
              onClick={() => onAction('pay', order)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-green-700 transition-all"
            >
              <CreditCard className="w-4 h-4" /> Settle — ₹{Number(order.grand_total).toLocaleString('en-IN')}
            </button>
          )}

          <button
            onClick={() => onAction('cancel', order)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
          >
            <Ban className="w-3.5 h-3.5" /> Cancel Order
          </button>
        </div>
      </div>
    </div>
  );
}

/** Add More Items modal — loads menu and allows adding to existing order */
function AddKOTModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [punching, setPunching] = useState(false);

  const { data: menuData } = useQuery({
    queryKey: ['menu-items-quick', outletId],
    queryFn: () => api.get(`/menu/items?outlet_id=${outletId}&limit=100`).then(r => r.data),
    enabled: isOpen && !!outletId,
  });

  const items = menuData?.items || menuData || [];

  const addItem = (item) => {
    const exists = pendingItems.find(p => p.menu_item_id === item.id);
    if (exists) {
      setPendingItems(prev => prev.map(p => p.menu_item_id === item.id ? { ...p, quantity: p.quantity + 1 } : p));
    } else {
      setPendingItems(prev => [...prev, { menu_item_id: item.id, name: item.name, price: Number(item.base_price), quantity: 1, addons: [] }]);
    }
  };

  const removeItem = (id) => setPendingItems(prev => prev.filter(p => p.menu_item_id !== id));

  const handlePunch = async () => {
    if (pendingItems.length === 0) return toast.error('Add at least one item');
    setPunching(true);
    try {
      // Add items to order then punch KOT
      await api.post(`/orders/${order.id}/items`, {
        items: pendingItems.map(p => ({ menu_item_id: p.menu_item_id, quantity: p.quantity, addons: [] }))
      });
      await api.post(`/orders/${order.id}/kot`);
      toast.success('KOT sent to kitchen! 🍳');
      setPendingItems([]);
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to punch KOT');
    } finally {
      setPunching(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add Items — ${order?.table ? 'Table ' + order.table.table_number : 'Order'}`} size="md">
      <div className="flex gap-4 h-[60vh]">
        {/* Menu items */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          <p className="text-xs text-surface-500 uppercase tracking-widest mb-3 font-bold">Menu Items</p>
          <div className="grid grid-cols-2 gap-2">
            {items.map(item => (
              <button key={item.id} onClick={() => addItem(item)}
                className="text-left p-3 bg-surface-800/60 border border-surface-700 rounded-xl hover:border-brand-500 hover:bg-surface-800 transition-all group"
              >
                <p className="text-xs font-semibold text-white group-hover:text-brand-400 truncate">{item.name}</p>
                <p className="text-brand-400 font-bold text-sm mt-1">₹{Number(item.base_price).toFixed(0)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Pending list */}
        <div className="w-52 flex flex-col border-l border-surface-700 pl-4">
          <p className="text-xs text-surface-500 uppercase tracking-widest mb-3 font-bold">To Send</p>
          <div className="flex-1 overflow-y-auto space-y-2">
            {pendingItems.length === 0 ? (
              <p className="text-surface-600 text-xs text-center pt-8">No items added</p>
            ) : pendingItems.map(p => (
              <div key={p.menu_item_id} className="flex items-center justify-between bg-surface-800 rounded-lg px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white truncate font-medium">{p.name}</p>
                  <p className="text-[10px] text-brand-400">x{p.quantity} · ₹{(p.price * p.quantity).toFixed(0)}</p>
                </div>
                <button onClick={() => removeItem(p.menu_item_id)} className="ml-2 text-surface-500 hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button onClick={handlePunch} disabled={pendingItems.length === 0 || punching}
            className="mt-3 w-full py-3 rounded-xl font-bold text-sm bg-orange-500 text-white hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {punching ? 'Punching...' : `Punch KOT (${pendingItems.length})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function RunningOrdersPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState('all');
  const [isLive, setIsLive] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // 'cancel'|'bill'|'pay'|'kot'

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['running-orders', outletId],
    queryFn: () => api.get(`/orders?outlet_id=${outletId}&status=created,confirmed,held,billed&limit=200`).then(r => r.data),
    enabled: !!outletId,
    refetchInterval: isLive ? 8000 : false,
  });

  const activeOrders = Array.isArray(orders) ? orders : (orders?.items || []);
  const filtered = activeOrders.filter(o => filter === 'all' || o.order_type === filter);

  // Real-time socket
  useEffect(() => {
    if (!outletId) return;
    const socket = io(`${import.meta.env.VITE_API_URL || window.location.origin}/orders`, {
      transports: ['websocket'], withCredentials: true
    });
    socket.emit('join_outlet', outletId);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['running-orders'] });
    socket.on('new_order', refresh);
    socket.on('order_status_change', refresh);
    socket.on('table_status_change', refresh);
    socket.on('order_cancelled', refresh);
    return () => socket.disconnect();
  }, [outletId, queryClient]);

  const billMutation = useMutation({
    mutationFn: (id) => api.post(`/orders/${id}/bill`),
    onSuccess: (res) => {
      toast.success('Bill Generated! 🧾');
      queryClient.invalidateQueries({ queryKey: ['running-orders'] });
      const billData = res.data?.data || res.data;
      setSelectedOrder(billData);
      setActiveModal('bill');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to generate bill'),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Order Cancelled');
      queryClient.invalidateQueries({ queryKey: ['running-orders'] });
      closeModal();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to cancel'),
  });

  const openModal = (type, order) => {
    setSelectedOrder(order);
    setActiveModal(type);
  };
  const closeModal = () => { setActiveModal(null); setSelectedOrder(null); };

  const handleAction = useCallback((type, order) => {
    if (type === 'generate_bill') {
      billMutation.mutate(order.id);
    } else if (type === 'view_bill') {
      openModal('bill', order);
    } else {
      openModal(type, order);
    }
  }, [billMutation]);

  const counts = {
    all: activeOrders.length,
    dine_in: activeOrders.filter(o => o.order_type === 'dine_in').length,
    takeaway: activeOrders.filter(o => o.order_type === 'takeaway').length,
    delivery: activeOrders.filter(o => o.order_type === 'delivery').length,
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ─── Header bar with blinking live dot ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Clock className="w-7 h-7 text-brand-400" />
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-surface-900 animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              Running Orders
              {activeOrders.length > 0 && (
                <span className="text-sm bg-brand-500 text-white px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                  {activeOrders.length}
                </span>
              )}
            </h1>
            <p className="text-surface-400 text-xs mt-0.5">Live kitchen & table session management</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="p-2 rounded-lg bg-surface-800 text-surface-400 hover:text-white transition-all" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${isLive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-surface-800 text-surface-400 border border-surface-700'}`}
          >
            {isLive ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isLive ? 'LIVE' : 'PAUSED'}
          </button>
        </div>
      </div>

      {/* ─── Filter tabs ─── */}
      <div className="flex gap-1 bg-surface-800/50 p-1 rounded-xl border border-surface-700/50 w-fit">
        {['all', 'dine_in', 'takeaway', 'delivery'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${filter === f ? 'bg-brand-500 text-white shadow-lg' : 'text-surface-400 hover:text-white'}`}
          >
            {f.replace('_', ' ').toUpperCase()}
            {counts[f] > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filter === f ? 'bg-white/20' : 'bg-surface-700'}`}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Order grid ─── */}
      {isLoading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="h-[50vh] flex flex-col items-center justify-center bg-surface-800/20 rounded-3xl border border-dashed border-surface-700">
          <ChefHat className="w-16 h-16 text-surface-600 mb-4" />
          <h3 className="text-white font-semibold text-lg">No Running Orders</h3>
          <p className="text-surface-500 text-sm mt-1">New orders from POS will appear here in real-time</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(order => (
            <OrderCard key={order.id} order={order} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* ─── Modals ─── */}
      {selectedOrder && (
        <>
          <CancelOrderModal
            isOpen={activeModal === 'cancel'}
            onClose={closeModal}
            onConfirm={(reason) => cancelMutation.mutate({ id: selectedOrder.id, reason })}
          />

          <BillPreviewModal
            isOpen={activeModal === 'bill'}
            onClose={closeModal}
            order={selectedOrder}
            onPrint={() => toast('Print sent to thermal printer')}
          />

          {activeModal === 'pay' && (
            <PaymentModal
              isOpen={true}
              onClose={closeModal}
              order={selectedOrder}
              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['running-orders'] })}
            />
          )}

          <AddKOTModal
            isOpen={activeModal === 'add_kot'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={() => queryClient.invalidateQueries({ queryKey: ['running-orders'] })}
          />
        </>
      )}
    </div>
  );
}
