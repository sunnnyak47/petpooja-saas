/**
 * @fileoverview Table QR Orders — Dedicated page for managing incoming QR table orders.
 * Shows all pending QR orders with Accept/Reject actions and audible alerts.
 * @module pages/TableQROrdersPage
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  QrCode, Check, X, Clock, UtensilsCrossed, User, ShoppingBag,
  BellRing, Volume2, VolumeX, RefreshCw, AlertTriangle, Timer
} from 'lucide-react';

/**
 * Elapsed timer component shown per order card.
 */
function ElapsedTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState('0:00');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
      setIsUrgent(mins >= 5);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <span className={`flex items-center gap-1 font-mono text-sm font-bold ${isUrgent ? 'text-red-400 animate-pulse' : 'text-brand-400'}`}>
      <Timer className="w-4 h-4" /> {elapsed}
    </span>
  );
}

export default function TableQROrdersPage() {
  const { user, token } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);

  /**
   * Fetches all pending QR orders for the outlet.
   */
  const { data: pendingOrders, isLoading, refetch } = useQuery({
    queryKey: ['qr-pending-orders', outletId],
    queryFn: async () => {
      const res = await api.get(`/orders?outlet_id=${outletId}&status=pending&sort=created_at&order=asc&limit=50`);
      const orders = res.data || [];
      return orders.filter(o => o.order_type === 'qr_order' || o.source === 'qr');
    },
    enabled: !!outletId,
    refetchInterval: 5000,
  });

  /**
   * Initializes Web Audio API for alert beeps.
   */
  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtxRef.current = new AudioContext();

    const unlock = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  /**
   * Plays alert beep on loop when there are pending orders.
   */
  const playBeep = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'suspended' || !soundEnabled) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (err) {
      /* Swallow audio errors gracefully */
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (pendingOrders && pendingOrders.length > 0 && soundEnabled) {
      playBeep();
      intervalRef.current = setInterval(playBeep, 3000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [pendingOrders, soundEnabled, playBeep]);

  /**
   * Socket.io listener for real-time new QR order events.
   */
  useEffect(() => {
    if (!outletId || !token) return;
    const socket = io(`${import.meta.env.VITE_API_URL || window.location.origin}/orders`, {
      auth: { token },
      transports: ['websocket'],
    });
    socket.on('connect', () => socket.emit('join_outlet', outletId));
    socket.on('new_online_order', () => {
      queryClient.invalidateQueries({ queryKey: ['qr-pending-orders'] });
    });
    socket.on('order_accepted', () => {
      queryClient.invalidateQueries({ queryKey: ['qr-pending-orders'] });
    });
    socket.on('new_online_order_cleared', () => {
      queryClient.invalidateQueries({ queryKey: ['qr-pending-orders'] });
    });
    return () => socket.disconnect();
  }, [outletId, token, queryClient]);

  /**
   * Accept mutation — transitions order from pending to created + generates KOT.
   */
  const acceptMutation = useMutation({
    mutationFn: (orderId) => api.put(`/online-orders/${orderId}/accept`),
    onSuccess: (_, orderId) => {
      toast.success('Order Accepted & Sent to Kitchen! ✅');
      queryClient.invalidateQueries({ queryKey: ['qr-pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['running-orders'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to accept order');
    },
  });

  /**
   * Reject mutation — deletes the pending order and releases the table.
   */
  const rejectMutation = useMutation({
    mutationFn: (orderId) => api.put(`/online-orders/${orderId}/reject`),
    onSuccess: () => {
      toast.error('Order Rejected & Table Released');
      queryClient.invalidateQueries({ queryKey: ['qr-pending-orders'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to reject order');
    },
  });

  /**
   * Handles accept with confirmation.
   * @param {object} order - The order object to accept
   */
  const handleAccept = (order) => {
    acceptMutation.mutate(order.id);
  };

  /**
   * Handles reject with confirmation dialog.
   * @param {object} order - The order object to reject
   */
  const handleReject = (order) => {
    if (!window.confirm(`Reject order #${order.order_number}? This will delete the order and free the table.`)) return;
    rejectMutation.mutate(order.id);
  };

  const orders = pendingOrders || [];

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="bg-surface-900 border border-surface-800 p-5 rounded-3xl mb-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${orders.length > 0 ? 'bg-brand-500 animate-pulse' : 'bg-surface-800'}`}>
            <QrCode className={`w-7 h-7 ${orders.length > 0 ? 'text-white' : 'text-surface-400'}`} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-3">
              Table QR Orders
              {orders.length > 0 && (
                <span className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-bounce">
                  {orders.length} PENDING
                </span>
              )}
            </h1>
            <p className="text-xs text-surface-500 mt-0.5">Accept or reject orders placed by customers via QR code scan</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-3 rounded-xl border transition-all ${soundEnabled ? 'bg-brand-500/10 border-brand-500/30 text-brand-400' : 'bg-surface-800 border-surface-700 text-surface-500'}`}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button
            onClick={() => refetch()}
            className="p-3 rounded-xl bg-surface-800 border border-surface-700 text-surface-400 hover:text-white transition-all"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Order Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-24 h-24 rounded-3xl bg-surface-800/50 flex items-center justify-center mb-6">
            <QrCode className="w-12 h-12 text-surface-600" />
          </div>
          <h3 className="text-lg font-bold text-surface-400 mb-2">No Pending QR Orders</h3>
          <p className="text-sm text-surface-600 max-w-sm">When customers place orders by scanning table QR codes, they will appear here for your approval.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-surface-900 border-2 border-brand-500/30 rounded-3xl p-6 shadow-lg shadow-brand-500/5 hover:border-brand-500/50 transition-all relative overflow-hidden group"
            >
              {/* Pulsing glow */}
              <div className="absolute top-0 right-0 -mr-10 -mt-10 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl animate-pulse" />

              {/* Top bar */}
              <div className="flex items-center justify-between mb-5 relative">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-500/10 px-3 py-1 rounded-lg">
                    <span className="text-xs font-black text-brand-400 uppercase tracking-widest">QR Order</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-surface-400">#{order.order_number}</span>
                </div>
                <ElapsedTimer createdAt={order.created_at} />
              </div>

              {/* Order info grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-surface-800/50 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 text-surface-500 mb-1">
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Table</span>
                  </div>
                  <p className="text-lg font-black text-white">{order.table?.table_number || '—'}</p>
                </div>
                <div className="bg-surface-800/50 p-4 rounded-2xl">
                  <div className="flex items-center gap-2 text-surface-500 mb-1">
                    <User className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Customer</span>
                  </div>
                  <p className="text-lg font-black text-white truncate">{order.customer_name || 'Walk-in'}</p>
                </div>
              </div>

              {/* Items list */}
              <div className="space-y-2 mb-5 max-h-32 overflow-y-auto">
                {order.order_items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{item.quantity} ×</span>
                      <span className="text-surface-300">{item.name}</span>
                    </div>
                    <span className="text-surface-500 font-mono text-xs">₹{Number(item.item_total || 0).toFixed(0)}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between py-3 border-t border-surface-800 mb-5">
                <span className="text-xs font-black text-surface-500 uppercase tracking-widest">Grand Total</span>
                <span className="text-xl font-black text-brand-400">₹{Number(order.grand_total || 0).toFixed(0)}</span>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-5 gap-3">
                <button
                  onClick={() => handleReject(order)}
                  disabled={rejectMutation.isPending}
                  className="col-span-2 py-4 rounded-2xl bg-surface-800 hover:bg-red-500/20 border border-surface-700 hover:border-red-500/40 text-surface-400 hover:text-red-400 font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                  REJECT
                </button>
                <button
                  onClick={() => handleAccept(order)}
                  disabled={acceptMutation.isPending}
                  className="col-span-3 py-4 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {acceptMutation.isPending ? (
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      ACCEPT & KOT
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sound status indicator */}
      {orders.length > 0 && !soundEnabled && (
        <div className="fixed bottom-6 right-6 bg-orange-500 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce cursor-pointer z-50"
             onClick={() => setSoundEnabled(true)}>
          <VolumeX className="w-5 h-5" />
          <span className="text-sm font-bold">Sound alerts disabled — Click to enable</span>
        </div>
      )}
    </div>
  );
}
