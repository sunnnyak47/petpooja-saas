/**
 * @fileoverview RunningOrdersPage — Live view of all active restaurant orders.
 * Full-featured: search, filters, sort, item preview, KOT/Bill/Cancel/Payment,
 * discount, tip, notes, transfer table, merge, eBill, customer/waiter assign,
 * audit log, bulk actions, compact view, priority flags, sound, export, and more.
 *
 * All 36 operational features implemented with real backend integration.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import hybridAPI from '../api/offlineAPI';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import toast from 'react-hot-toast';
import { useCurrency } from '../hooks/useCurrency';
import { useMenuItems } from '../hooks/queries/useMenuItems';
import { qk } from '../lib/queryKeys';

// ── Existing POS modals ───────────────────────────────────────────────────────
import Modal from '../components/Modal';
import CancelOrderModal from '../components/POS/CancelOrderModal';
import BillPreviewModal from '../components/POS/BillPreviewModal';
import PaymentModal from '../components/POS/PaymentModal';

// ── New component modules ─────────────────────────────────────────────────────
import { StatsStrip, FilterBar } from '../components/RunningOrders/StatsFilterBar';
import EnhancedOrderCard from '../components/RunningOrders/EnhancedOrderCard';
import { DiscountModal, TipModal, NotesModal, ReprintKOTModal, AuditLogModal } from '../components/RunningOrders/OrderFinancialModals';
import { TransferTableModal, MergeOrdersModal, EBillModal, CustomerAssignModal, WaiterAssignModal } from '../components/RunningOrders/OrderOperationsModals';

import {
  Clock, ChefHat, Plus, Send, X, WifiOff, Wifi,
  RefreshCw, Printer, Receipt, CreditCard, Ban,
  Download, ShoppingBag, Utensils, Globe, Timer,
  CheckCircle2, AlertTriangle, Bell, BellOff
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

const SHIFT_RANGES = {
  all: null,
  current: 8 * 60,        // last 8 hours
  breakfast: [6, 11],     // 06:00–11:00
  lunch: [11, 16],        // 11:00–16:00
  dinner: [16, 24],       // 16:00–24:00
};

// ─────────────────────────────────────────────────────────────────────────────
// Sound utility (Web Audio API — no external dep)
// ─────────────────────────────────────────────────────────────────────────────

function playNewOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5 — pleasant chime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  } catch (_) { /* AudioContext may be blocked on first interaction */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// AddKOTModal — kept inline (existing, enhanced)
// ─────────────────────────────────────────────────────────────────────────────

const IS_ELECTRON_INNER = typeof window !== 'undefined' && !!window.electron;

function AddKOTModal({ isOpen, onClose, order, outletId, onSuccess }) {
  const [pendingItems, setPendingItems] = useState([]);
  const [punching, setPunching] = useState(false);
  const innerOnline = useOnlineStatus();
  const { symbol } = useCurrency();

  // Shared menu-items fetch. Offline (Electron) branch + the `innerOnline` cache
  // dimension and staleTime are preserved exactly; only the online branch reuses
  // the canonical fetcher. Key is kept distinct because the offline payload shape
  // (an items[] array) differs from the cloud body and must not pollute the
  // canonical 'menuItems' cache entry shared with POS/Menu.
  const { data: menuData } = useMenuItems(outletId, {
    queryKey: qk.menuItemsQuick(outletId, innerOnline),
    enabled: isOpen,
    staleTime: innerOnline ? 30_000 : Infinity,
    queryFn: async () => {
      if (IS_ELECTRON_INNER && !innerOnline) {
        const result = await hybridAPI.getMenu(outletId);
        return result?.items || [];
      }
      return api.get(`/menu/items?outlet_id=${outletId}&limit=5000`).then(r => r.data);
    },
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
      if (IS_ELECTRON_INNER && !innerOnline) {
        for (const p of pendingItems) {
          await hybridAPI.addOrderItem({ order_id: order.id, menu_item_id: p.menu_item_id, menu_item_name: p.name, unit_price: p.price, quantity: p.quantity, addons: [] });
        }
        await hybridAPI.generateKOT(order.id);
      } else {
        await api.post(`/orders/${order.id}/items`, {
          items: pendingItems.map(p => ({ menu_item_id: p.menu_item_id, quantity: p.quantity, addons: [] }))
        });
        await api.post(`/orders/${order.id}/kot`, { outlet_id: outletId });
      }
      toast.success('KOT sent to kitchen!');
      setPendingItems([]);
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Failed to punch KOT');
    } finally {
      setPunching(false);
    }
  };

  // Reset on close
  useEffect(() => { if (!isOpen) setPendingItems([]); }, [isOpen]);

  const subtotal = pendingItems.reduce((s, p) => s + p.price * p.quantity, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add Items — ${order?.table ? 'Table ' + order.table.table_number : order?.order_number?.split('-').pop() || 'Order'}`} size="md">
      <div className="flex gap-4 h-[60vh]">
        {/* Menu items */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          <p className="text-xs text-surface-500 uppercase tracking-widest mb-3 font-bold">Menu Items</p>
          {items.length === 0 ? (
            <div className="text-center py-12 text-surface-500 text-sm">Loading menu...</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {items.map(item => (
                <button key={item.id} onClick={() => addItem(item)}
                  className="text-left p-3 border rounded-xl transition-all group" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}
                >
                  <p className="text-xs font-semibold text-white group-hover:text-brand-400 truncate">{item.name}</p>
                  <p className="text-brand-400 font-bold text-sm mt-1">{symbol}{Number(item.base_price).toFixed(0)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pending list */}
        <div className="w-52 flex flex-col border-l pl-4" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs text-surface-500 uppercase tracking-widest mb-3 font-bold">To Send</p>
          <div className="flex-1 overflow-y-auto space-y-2">
            {pendingItems.length === 0 ? (
              <p className="text-surface-600 text-xs text-center pt-8">No items added</p>
            ) : pendingItems.map(p => (
              <div key={p.menu_item_id} className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: "var(--bg-hover)" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white truncate font-medium">{p.name}</p>
                  <p className="text-[10px] text-brand-400">x{p.quantity} · {symbol}{(p.price * p.quantity).toFixed(0)}</p>
                </div>
                <button onClick={() => removeItem(p.menu_item_id)} className="ml-2 text-surface-500 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {pendingItems.length > 0 && (
            <div className="py-2 border-t mt-2" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs text-surface-400 text-center">{symbol}{subtotal.toFixed(0)} subtotal</p>
            </div>
          )}

          <button onClick={handlePunch} disabled={pendingItems.length === 0 || punching}
            className="mt-2 w-full py-3 rounded-xl font-bold text-sm bg-orange-500 text-white hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {punching ? 'Punching...' : `Punch KOT (${pendingItems.length})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shift filter helper
// ─────────────────────────────────────────────────────────────────────────────

function isInShift(order, shiftFilter) {
  if (!shiftFilter || shiftFilter === 'all') return true;
  const created = new Date(order.created_at);
  if (shiftFilter === 'current') {
    return (Date.now() - created.getTime()) < 8 * 60 * 60 * 1000;
  }
  const range = SHIFT_RANGES[shiftFilter];
  if (Array.isArray(range)) {
    const hr = created.getHours();
    return hr >= range[0] && hr < range[1];
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export shift report
// ─────────────────────────────────────────────────────────────────────────────

function exportShiftReport(orders, format) {
  const now = new Date();
  const lines = [
    `MS-RM — Shift Report`,
    `Generated: ${now.toLocaleString()}`,
    `Total Orders: ${orders.length}`,
    `Total Revenue: ${orders.reduce((s, o) => s + Number(o.grand_total || 0), 0).toFixed(2)}`,
    ``,
    `Order#\t\tTable\t\tStatus\t\tAmount\t\tTime`,
    `───────────────────────────────────────────────────────`,
    ...orders.map(o =>
      `${o.order_number}\t${o.table?.table_number || o.customer?.full_name || 'Walk-in'}\t\t${o.status}\t\t${Number(o.grand_total || 0).toFixed(2)}\t\t${new Date(o.created_at).toLocaleTimeString()}`
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shift-report-${now.toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main RunningOrdersPage
// ─────────────────────────────────────────────────────────────────────────────

export default function RunningOrdersPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const { format, symbol } = useCurrency();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Invalidate every query an order-mutating op can touch. Per the offline POS
  // contract, after any mutation (online OR offline) we refresh the running list,
  // the kitchen display, and the tables map so all three stay in lock-step.
  const invalidateOrderQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['running-orders'] });
    queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
    queryClient.invalidateQueries({ queryKey: ['tables'] });
  }, [queryClient]);

  // ── Core state ──────────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter]     = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [sortBy, setSortBy]             = useState('time_asc');
  const [viewMode, setViewMode]         = useState('grid');       // 'grid' | 'list'
  const [shiftFilter, setShiftFilter]   = useState('all');
  const [isLive, setIsLive]             = useState(true);
  const [urgencyThreshold, setUrgencyThreshold] = useState(() => {
    return parseInt(localStorage.getItem('petpooja_urgency_threshold') || '20', 10);
  });

  // ── Selection & bulk ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds]   = useState(new Set());

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeModal, setActiveModal]     = useState(null);
  // modal keys: 'cancel'|'bill'|'pay'|'kot'|'discount'|'tip'|'notes'|
  //             'transfer'|'merge'|'ebill'|'assign_customer'|'assign_waiter'|
  //             'reprint_kot'|'audit_log'

  // ── Priority flags (persisted to localStorage) ──────────────────────────────
  const [priorityIds, setPriorityIds]   = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('petpooja_priority_orders') || '[]')); }
    catch { return new Set(); }
  });

  // ── New order animation tracking ────────────────────────────────────────────
  const [newOrderIds, setNewOrderIds]   = useState(new Set());
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('petpooja_sound') !== 'off';
  });

  // ── Sound preference persistence ────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('petpooja_sound', soundEnabled ? 'on' : 'off');
  }, [soundEnabled]);

  // ── Urgency threshold persistence ───────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('petpooja_urgency_threshold', String(urgencyThreshold));
  }, [urgencyThreshold]);

  // ── Priority persistence ─────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('petpooja_priority_orders', JSON.stringify([...priorityIds]));
  }, [priorityIds]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────────────────────────────────────

  const { data: ordersRaw, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['running-orders', outletId, isOnline],
    queryFn: async () => {
      if (IS_ELECTRON && !isOnline) {
        return hybridAPI.getOrders(outletId, { status: 'created,confirmed,held,billed,ready' });
      }
      // running=true → every active order (dine-in/takeaway/delivery, paid or not) that
      // isn't fully done yet, so prepaid takeaway/delivery show here until kitchen-served.
      return api.get(`/orders?outlet_id=${outletId}&running=true&limit=200`).then(r => r.data);
    },
    enabled: !!outletId,
    // Poll offline too (faster) so the list reflects KOT/table/order changes another
    // device wrote via local inter-device sync, not just this device's own edits.
    // Web has no local SQLite to poll, so don't background-poll when offline there.
    refetchInterval: isLive ? (isOnline ? 8000 : (IS_ELECTRON ? 4000 : false)) : false,
    staleTime: isOnline ? 5000 : Infinity,
  });

  const allOrders = useMemo(() => Array.isArray(ordersRaw) ? ordersRaw : (ordersRaw?.items || []), [ordersRaw]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Socket.io — real-time updates + new order detection
  // ─────────────────────────────────────────────────────────────────────────────

  const knownOrderIds = useRef(new Set());

  useEffect(() => {
    if (!outletId || !isOnline) return;
    const socket = io(`${SOCKET_URL}/orders`, { auth: { token: localStorage.getItem('accessToken') }, transports: ['websocket'], withCredentials: true });

    socket.on('connect', () => socket.emit('join_outlet', outletId));

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['running-orders'] });

    socket.on('new_order', (data) => {
      refresh();
      const orderId = data?.id || data?.order_id;
      if (orderId && !knownOrderIds.current.has(orderId)) {
        knownOrderIds.current.add(orderId);
        setNewOrderIds(prev => new Set([...prev, orderId]));
        if (soundEnabled) playNewOrderSound();
        toast.success('New order received!', { duration: 3000 });
        // Clear animation after 4 seconds
        setTimeout(() => {
          setNewOrderIds(prev => { const next = new Set(prev); next.delete(orderId); return next; });
        }, 4000);
      }
    });

    socket.on('order_status_change', refresh);
    socket.on('table_status_change', refresh);
    socket.on('order_cancelled', refresh);

    return () => socket.disconnect();
  }, [outletId, isOnline, queryClient, soundEnabled]);

  // Seed known IDs on first load to avoid false animations on mount
  useEffect(() => {
    if (allOrders.length > 0 && knownOrderIds.current.size === 0) {
      allOrders.forEach(o => knownOrderIds.current.add(o.id));
    }
  }, [allOrders]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Filtering & sorting
  // ─────────────────────────────────────────────────────────────────────────────

  const filteredOrders = useMemo(() => {
    let list = [...allOrders];

    // Type filter
    if (typeFilter !== 'all') list = list.filter(o => o.order_type === typeFilter);

    // Status filter
    if (statusFilter !== 'all') list = list.filter(o => o.status === statusFilter);

    // Shift filter
    if (shiftFilter !== 'all') list = list.filter(o => isInShift(o, shiftFilter));

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.table?.table_number?.toString().includes(q) ||
        o.customer?.full_name?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_phone?.includes(q) ||
        o.staff?.name?.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case 'time_asc':  list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
      case 'time_desc': list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
      case 'amount_desc': list.sort((a, b) => Number(b.grand_total) - Number(a.grand_total)); break;
      case 'status': {
        const order = { created: 0, confirmed: 1, held: 2, billed: 3 };
        list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
        break;
      }
      case 'table':
        list.sort((a, b) => (a.table?.table_number || 999) - (b.table?.table_number || 999));
        break;
      default: break;
    }

    // Priority orders bubble to top
    list.sort((a, b) => {
      const ap = priorityIds.has(a.id) ? 0 : 1;
      const bp = priorityIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });

    return list;
  }, [allOrders, typeFilter, statusFilter, shiftFilter, searchQuery, sortBy, priorityIds]);

  // Status & type counts
  const counts = useMemo(() => ({
    all: allOrders.length,
    created: allOrders.filter(o => o.status === 'created').length,
    confirmed: allOrders.filter(o => o.status === 'confirmed').length,
    held: allOrders.filter(o => o.status === 'held').length,
    billed: allOrders.filter(o => o.status === 'billed').length,
    ready: allOrders.filter(o => o.status === 'ready').length,
    paid: allOrders.filter(o => o.is_paid).length,   // prepaid, still in the kitchen/pickup
    dine_in: allOrders.filter(o => o.order_type === 'dine_in').length,
    takeaway: allOrders.filter(o => o.order_type === 'takeaway').length,
    delivery: allOrders.filter(o => o.order_type === 'delivery').length,
  }), [allOrders]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────────────────────────────────────

  const billMutation = useMutation({
    mutationFn: async (id) => {
      if (IS_ELECTRON && !isOnline) return hybridAPI.generateBill(id);
      const res = await api.post(`/orders/${id}/bill`, { outlet_id: outletId });
      return res.data?.data || res.data;
    },
    onSuccess: (billData) => {
      toast.success('Bill Generated!');
      invalidateOrderQueries();
      openModal('bill', billData);
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message || 'Failed to generate bill'),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }) => {
      if (IS_ELECTRON && !isOnline) {
        return window.electron.invoke('db-update-order-status', id, 'cancelled', { cancel_reason: reason });
      }
      return api.post(`/orders/${id}/cancel`, { reason });
    },
    onSuccess: () => {
      toast.success('Order Cancelled');
      invalidateOrderQueries();
      closeModal();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to cancel'),
  });

  // Bulk cancel
  const bulkCancelMutation = useMutation({
    mutationFn: async (ids) => {
      if (IS_ELECTRON && !isOnline) {
        await Promise.all([...ids].map(id => window.electron.invoke('db-update-order-status', id, 'cancelled', { cancel_reason: 'Bulk cancel' })));
        return;
      }
      await Promise.all([...ids].map(id => api.post(`/orders/${id}/cancel`, { reason: 'Bulk cancel' })));
    },
    onSuccess: () => {
      toast.success(`${selectedIds.size} orders cancelled`);
      setSelectedIds(new Set());
      invalidateOrderQueries();
    },
    onError: () => toast.error('Some cancellations failed'),
  });

  // Bulk bill
  const bulkBillMutation = useMutation({
    mutationFn: async (ids) => {
      if (IS_ELECTRON && !isOnline) {
        await Promise.all([...ids].map(id => hybridAPI.generateBill(id)));
        return;
      }
      await Promise.all([...ids].map(id => api.post(`/orders/${id}/bill`, { outlet_id: outletId })));
    },
    onSuccess: () => {
      toast.success(`${selectedIds.size} orders billed`);
      setSelectedIds(new Set());
      invalidateOrderQueries();
    },
    onError: () => toast.error('Some bill generations failed'),
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Modal helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const openModal = useCallback((type, order) => {
    setSelectedOrder(order);
    setActiveModal(type);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setSelectedOrder(null);
  }, []);

  const onModalSuccess = useCallback(() => {
    invalidateOrderQueries();
    closeModal();
  }, [invalidateOrderQueries, closeModal]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Action dispatcher — called from EnhancedOrderCard
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAction = useCallback((type, order) => {
    switch (type) {
      case 'generate_bill':    billMutation.mutate(order.id); break;
      case 'view_bill': {
        // The list order object carries only `_count: { order_items }` — not the
        // `order_items` array — so the bill preview would render an empty line-item
        // table. Open immediately with what we have, then hydrate from GET /orders/:id
        // (getOrderById includes order_items) so the items appear once loaded.
        openModal('bill', order);
        if (!order.order_items && isOnline) {
          api.get(`/orders/${order.id}`)
            .then((r) => {
              const full = r.data?.data || r.data;
              if (full?.order_items) setSelectedOrder((prev) => (prev?.id === order.id ? full : prev));
            })
            .catch(() => { /* keep the list object; totals still render */ });
        }
        break;
      }
      case 'pay':              openModal('pay', order); break;
      case 'cancel':           openModal('cancel', order); break;
      case 'add_kot':          openModal('kot', order); break;
      case 'reprint_kot':      openModal('reprint_kot', order); break;
      case 'discount':         openModal('discount', order); break;
      case 'tip':              openModal('tip', order); break;
      case 'notes':            openModal('notes', order); break;
      case 'transfer_table':   openModal('transfer', order); break;
      case 'merge':            openModal('merge', order); break;
      case 'ebill':            openModal('ebill', order); break;
      case 'assign_customer':  openModal('assign_customer', order); break;
      case 'assign_waiter':    openModal('assign_waiter', order); break;
      case 'audit_log':        openModal('audit_log', order); break;
      case 'toggle_priority':
        setPriorityIds(prev => {
          const next = new Set(prev);
          if (next.has(order.id)) next.delete(order.id);
          else next.add(order.id);
          return next;
        });
        break;
      default: break;
    }
  }, [billMutation, openModal, isOnline]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Selection helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSelect = useCallback((id, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleBulkAction = useCallback((action) => {
    if (selectedIds.size === 0) return;
    if (action === 'cancel_selected') {
      if (window.confirm(`Cancel ${selectedIds.size} orders?`)) {
        bulkCancelMutation.mutate(selectedIds);
      }
    } else if (action === 'bill_selected') {
      if (window.confirm(`Generate bills for ${selectedIds.size} orders?`)) {
        bulkBillMutation.mutate(selectedIds);
      }
    }
  }, [selectedIds, bulkCancelMutation, bulkBillMutation]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
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
              {allOrders.length > 0 && (
                <span className="text-sm bg-brand-500 text-white px-2.5 py-0.5 rounded-full font-bold">
                  {allOrders.length}
                </span>
              )}
            </h1>
            <p className="text-surface-400 text-xs mt-0.5">Live kitchen &amp; table session management</p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sound toggle */}
          <button
            onClick={() => setSoundEnabled(p => !p)}
            title={soundEnabled ? 'Sound on' : 'Sound off'}
            className={`p-2 rounded-lg border text-xs font-medium transition-all ${soundEnabled ? 'bg-brand-500/10 border-brand-500/20 text-brand-400' : 'border-surface-600 text-surface-500'}`}
            style={{ background: soundEnabled ? undefined : "var(--bg-hover)" }}
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          {/* Export */}
          <button
            onClick={() => exportShiftReport(filteredOrders, 'txt')}
            title="Export shift report"
            className="p-2 rounded-lg border transition-all"
            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", borderColor: "var(--border)" }}
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Offline indicator */}
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              Offline
            </div>
          )}
        </div>
      </div>

      {/* ── Stats strip (Feature: quick stats strip, refresh spinner, live toggle, status count chips) ── */}
      <StatsStrip
        orders={allOrders}
        filteredCount={filteredOrders.length}
        isRefetching={isFetching}
        onRefresh={refetch}
        isLive={isLive}
        onToggleLive={() => setIsLive(p => !p)}
        urgencyThreshold={urgencyThreshold}
      />

      {/* ── Filter bar (Feature: search, status filter, type filter, sort, shift filter, compact toggle, bulk actions) ── */}
      <div className="sticky top-0 z-10 py-2" style={{ background: "var(--bg-secondary, #0f172a)" }}>
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          shiftFilter={shiftFilter}
          onShiftFilter={setShiftFilter}
          urgencyThreshold={urgencyThreshold}
          onUrgencyThreshold={setUrgencyThreshold}
          selectedCount={selectedIds.size}
          onBulkAction={handleBulkAction}
          counts={counts}
        />
      </div>

      {/* ── Order grid / list ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500" />
        </div>
      ) : filteredOrders.length === 0 ? (
        /* Feature: Actionable empty state */
        <div className="h-[50vh] flex flex-col items-center justify-center rounded-3xl border-2 border-dashed" style={{ borderColor: "var(--border)" }}>
          <ChefHat className="w-16 h-16 text-surface-600 mb-4" />
          {allOrders.length > 0 ? (
            <>
              <h3 className="text-white font-semibold text-lg">No orders match your filters</h3>
              <p className="text-surface-500 text-sm mt-1 mb-4">Try clearing the search or changing filters</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all'); setShiftFilter('all'); }}
                  className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-all"
                >
                  Clear All Filters
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-white font-semibold text-lg">No Running Orders</h3>
              <p className="text-surface-500 text-sm mt-1 mb-4">New orders from POS will appear here in real-time</p>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/pos')}
                  className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-all"
                >
                  Open POS
                </button>
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-surface-700 transition-all text-surface-300"
                  style={{ borderColor: "var(--border)" }}
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map(order => (
            <EnhancedOrderCard
              key={order.id}
              order={order}
              onAction={handleAction}
              isSelected={selectedIds.has(order.id)}
              onSelect={handleSelect}
              viewMode="grid"
              urgencyThreshold={urgencyThreshold}
              isPriority={priorityIds.has(order.id)}
              isNew={newOrderIds.has(order.id)}
            />
          ))}
        </div>
      ) : (
        /* List / compact view */
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {/* List header */}
          <div className="grid grid-cols-[2rem_1fr_6rem_7rem_5rem_5rem_7rem_6rem] gap-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-surface-500 border-b" style={{ background: "var(--bg-hover)", borderColor: "var(--border)" }}>
            <span />
            <span>Order</span>
            <span>Table</span>
            <span>Status</span>
            <span>Items</span>
            <span>KOTs</span>
            <span>Amount</span>
            <span>Time</span>
          </div>
          <div className="divide-y" style={{ divideColor: "var(--border)" }}>
            {filteredOrders.map(order => (
              <EnhancedOrderCard
                key={order.id}
                order={order}
                onAction={handleAction}
                isSelected={selectedIds.has(order.id)}
                onSelect={handleSelect}
                viewMode="list"
                urgencyThreshold={urgencyThreshold}
                isPriority={priorityIds.has(order.id)}
                isNew={newOrderIds.has(order.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {selectedOrder && (
        <>
          {/* Existing core modals */}
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
              amount={selectedOrder.grand_total || selectedOrder.total || 0}
              orderId={selectedOrder.id}
              orderNumber={selectedOrder.order_number}
              customer={selectedOrder.customer || null}
              onSuccess={async (method, paidAmount, razorpayId) => {
                if (IS_ELECTRON && !isOnline) {
                  await hybridAPI.processPayment(selectedOrder.id, { method, amount: paidAmount });
                } else {
                  await api.post(`/orders/${selectedOrder.id}/payment`, {
                    method,
                    amount: paidAmount,
                    razorpay_payment_id: razorpayId,
                  });
                }
                toast.success('Payment recorded');
                closeModal();
                invalidateOrderQueries();
              }}
            />
          )}

          {/* Add KOT modal */}
          <AddKOTModal
            isOpen={activeModal === 'kot'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={invalidateOrderQueries}
          />

          {/* Financial modals */}
          <DiscountModal
            isOpen={activeModal === 'discount'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={onModalSuccess}
          />

          <TipModal
            isOpen={activeModal === 'tip'}
            onClose={closeModal}
            order={selectedOrder}
            onSuccess={onModalSuccess}
          />

          <NotesModal
            isOpen={activeModal === 'notes'}
            onClose={closeModal}
            order={selectedOrder}
            onSuccess={onModalSuccess}
          />

          <ReprintKOTModal
            isOpen={activeModal === 'reprint_kot'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={invalidateOrderQueries}
          />

          <AuditLogModal
            isOpen={activeModal === 'audit_log'}
            onClose={closeModal}
            order={selectedOrder}
          />

          {/* Operations modals */}
          <TransferTableModal
            isOpen={activeModal === 'transfer'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={onModalSuccess}
          />

          <MergeOrdersModal
            isOpen={activeModal === 'merge'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={onModalSuccess}
          />

          <EBillModal
            isOpen={activeModal === 'ebill'}
            onClose={closeModal}
            order={selectedOrder}
            onSuccess={onModalSuccess}
          />

          <CustomerAssignModal
            isOpen={activeModal === 'assign_customer'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={onModalSuccess}
          />

          <WaiterAssignModal
            isOpen={activeModal === 'assign_waiter'}
            onClose={closeModal}
            order={selectedOrder}
            outletId={outletId}
            onSuccess={onModalSuccess}
          />
        </>
      )}
    </div>
  );
}
