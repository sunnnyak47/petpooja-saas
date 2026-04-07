import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  ChefHat, Flame, CheckCircle2, RefreshCw,
  Volume2, VolumeX, Maximize2, Timer, Utensils, Coffee, 
  IceCream, Package, Eye, AlertCircle, X
} from 'lucide-react';

const STATIONS = [
  { id: 'ALL', label: 'All Stations', icon: <Eye className="w-4 h-4" />, color: 'brand' },
  { id: 'KITCHEN', label: 'Kitchen', icon: <Utensils className="w-4 h-4" />, color: 'orange' },
  { id: 'BAR', label: 'Bar', icon: <Coffee className="w-4 h-4" />, color: 'purple' },
  { id: 'DESSERT', label: 'Dessert', icon: <IceCream className="w-4 h-4" />, color: 'pink' },
  { id: 'PACKING', label: 'Packing', icon: <Package className="w-4 h-4" />, color: 'teal' },
];

const STATUS_CONFIG = {
  pending: { label: 'NEW', bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', glow: 'shadow-blue-500/20' },
  preparing: { label: 'COOKING', bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400', glow: 'shadow-orange-500/20' },
  ready: { label: 'READY', bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
  served: { label: 'SERVED', bg: 'bg-surface-700/20', border: 'border-surface-600', text: 'text-surface-400', glow: '' },
};

/**
 * Calculates elapsed time since a given timestamp.
 * @param {string} createdAt - ISO timestamp
 * @returns {string} Formatted elapsed time (e.g., "5:32")
 */
function useElapsedTime(createdAt) {
  const [elapsed, setElapsed] = useState('0:00');
  useEffect(() => {
    if (!createdAt) return;
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);
  return elapsed;
}

/**
 * Single KOT Card component for Kitchen Display.
 */
function KOTCard({ kot, onBump, onItemReady }) {
  const elapsed = useElapsedTime(kot.created_at);
  const mins = parseInt(elapsed.split(':')[0], 10);
  const isUrgent = mins >= 10;
  const isWarning = mins >= 5 && mins < 10;
  const statusConf = STATUS_CONFIG[kot.status] || STATUS_CONFIG.pending;

  return (
    <div className={`rounded-2xl border-2 ${statusConf.border} ${statusConf.bg} shadow-lg ${statusConf.glow} transition-all duration-300 overflow-hidden ${isUrgent ? 'animate-pulse' : ''}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${isUrgent ? 'bg-red-500/30' : isWarning ? 'bg-amber-500/20' : 'bg-surface-800/60'}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-white">KOT #{kot.kot_number || kot.id?.slice(-4)}</span>
          {kot.is_rush && <Flame className="w-5 h-5 text-red-400 animate-bounce" />}
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${isUrgent ? 'bg-red-500 text-white' : isWarning ? 'bg-amber-500 text-black' : 'bg-surface-700 text-surface-300'}`}>
          <Timer className="w-3.5 h-3.5" />
          <span className="text-sm font-mono font-bold">{elapsed}</span>
        </div>
      </div>

      {/* Order Info */}
      <div className="px-4 py-2 border-b border-surface-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-surface-400">
          <span className="font-semibold text-white">#{kot.order?.order_number || '—'}</span>
          <span>•</span>
          <span className="capitalize">{kot.order?.order_type?.replace('_', ' ') || 'Dine In'}</span>
        </div>
        {kot.order?.table && (
          <span className="px-2 py-0.5 bg-brand-500/20 text-brand-400 text-xs font-bold rounded">
            T-{kot.order.table.table_number}
          </span>
        )}
      </div>

      {/* Items */}
      <div className="px-4 py-3 space-y-2">
        {(kot.items || []).map((item, idx) => (
          <div key={idx} className="flex items-center justify-between group">
            <div className="flex items-center gap-2 flex-1">
              <button
                onClick={() => onItemReady?.(kot.id, item.id)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${item.is_ready ? 'bg-emerald-500 border-emerald-500' : 'border-surface-500 hover:border-emerald-400'}`}
              >
                {item.is_ready && <CheckCircle2 className="w-4 h-4 text-white" />}
              </button>
              <span className={`text-sm font-medium ${item.is_ready ? 'line-through text-surface-500' : 'text-white'}`}>
                {item.name}
                {item.variant_name && <span className="text-surface-400 ml-1">({item.variant_name})</span>}
              </span>
            </div>
            <span className={`text-lg font-black ${item.is_ready ? 'text-surface-500' : 'text-brand-400'}`}>
              x{item.quantity}
            </span>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 border-t border-surface-700/50 flex gap-2">
        {kot.status === 'pending' && (
          <button
            onClick={() => onBump?.(kot.id, 'preparing')}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 transition-all active:scale-95"
          >
            🔥 Start Cooking
          </button>
        )}
        {kot.status === 'preparing' && (
          <button
            onClick={() => onBump?.(kot.id, 'ready')}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-all active:scale-95"
          >
            ✅ Mark Ready
          </button>
        )}
        {kot.status === 'ready' && (
          <button
            onClick={() => onBump?.(kot.id, 'served')}
            className="flex-1 py-2.5 rounded-xl bg-surface-600 text-white font-bold text-sm hover:bg-surface-500 transition-all active:scale-95"
          >
            📤 Served / Picked Up
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Kitchen Display System (KDS) Page — M4: Kitchen Workflow
 * Full-screen real-time kitchen order management with station routing.
 */
export default function KitchenDisplayPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [activeStation, setActiveStation] = useState('ALL');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: kots, isLoading } = useQuery({
    queryKey: ['kds-kots', outletId, activeStation],
    queryFn: () => api.get(`/kitchen/kots?outlet_id=${outletId}${activeStation !== 'ALL' ? `&station=${activeStation}` : ''}`).then(r => r.data || r),
    enabled: !!outletId,
    refetchInterval: 15000,
  });

  // Real-time Socket.io
  useEffect(() => {
    if (!outletId) return;
    const socket = io(`${import.meta.env.VITE_API_URL || window.location.origin}/kitchen`, {
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.emit('join_outlet', outletId);

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] });

    socket.on('new_kot', () => {
      refresh();
      if (soundEnabled) {
        try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
      }
    });
    socket.on('kot_item_ready', refresh);
    socket.on('kot_complete', refresh);
    
    socket.on('order_cancelled', (data) => {
      refresh();
      toast((t) => (
        <div className="flex items-center gap-3 bg-red-600 text-white p-4 rounded-xl shadow-2xl border-2 border-white animate-bounce">
          <AlertCircle className="w-8 h-8" />
          <div>
            <p className="font-black text-lg uppercase tracking-tighter">ORDER CANCELLED: #{data.order_number}</p>
            <p className="text-sm font-bold opacity-90">Reason: {data.reason}</p>
          </div>
          <button onClick={() => toast.dismiss(t.id)} className="ml-4 p-1 hover:bg-white/20 rounded-full"><X className="w-5 h-5"/></button>
        </div>
      ), { duration: 10000, position: 'top-center' });

      if (soundEnabled) {
        try { new Audio('/cancel_alert.mp3').play().catch(() => {}); } catch {}
      }
    });

    return () => socket.disconnect();
  }, [outletId, queryClient, soundEnabled]);

  const bumpMutation = useMutation({
    mutationFn: ({ kotId, status }) => api.put(`/kitchen/kots/${kotId}/status`, { status, outlet_id: outletId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
      toast.success('KOT updated');
    },
    onError: (e) => toast.error(e.message),
  });

  const itemReadyMutation = useMutation({
    mutationFn: ({ kotId, itemId }) => api.put(`/kitchen/kots/${kotId}/items/${itemId}/ready`, { outlet_id: outletId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] }),
    onError: (e) => toast.error(e.message),
  });

  const handleBump = useCallback((kotId, status) => bumpMutation.mutate({ kotId, status }), [bumpMutation]);
  const handleItemReady = useCallback((kotId, itemId) => itemReadyMutation.mutate({ kotId, itemId }), [itemReadyMutation]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const filteredKots = useMemo(() => {
    if (!kots) return [];
    let list = Array.isArray(kots) ? kots : [];
    if (!showCompleted) {
      list = list.filter(k => !['served', 'completed'].includes(k.status));
    }
    return list;
  }, [kots, showCompleted]);

  const stats = useMemo(() => {
    const all = Array.isArray(kots) ? kots : [];
    return {
      pending: all.filter(k => k.status === 'pending').length,
      preparing: all.filter(k => k.status === 'preparing').length,
      ready: all.filter(k => k.status === 'ready').length,
    };
  }, [kots]);

  return (
    <div className="h-full flex flex-col bg-surface-950">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-surface-900 border-b border-surface-800 shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat className="w-7 h-7 text-brand-400" />
          <h1 className="text-xl font-black text-white tracking-tight">Kitchen Display</h1>
          <div className="flex items-center gap-2 ml-4">
            <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs font-bold">{stats.pending} New</span>
            <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-400 text-xs font-bold">{stats.preparing} Cooking</span>
            <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">{stats.ready} Ready</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowCompleted(!showCompleted)}
            className={`p-2 rounded-lg transition-all ${showCompleted ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'}`}
            title="Show completed">
            <CheckCircle2 className="w-5 h-5" />
          </button>
          <button onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg transition-all ${soundEnabled ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'}`}
            title="Sound alerts">
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-surface-800 text-surface-400 hover:text-white transition-all"
            title="Fullscreen">
            <Maximize2 className="w-5 h-5" />
          </button>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['kds-kots'] })}
            className="p-2 rounded-lg bg-surface-800 text-surface-400 hover:text-white transition-all"
            title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Station Tabs */}
      <div className="flex gap-2 px-6 py-3 bg-surface-900/50 border-b border-surface-800/50 overflow-x-auto scrollbar-none shrink-0">
        {STATIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveStation(s.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeStation === s.id ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' : 'bg-surface-800 text-surface-400 hover:text-white'}`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {/* KOT Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : filteredKots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-500">
            <ChefHat className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold">No active orders</p>
            <p className="text-sm">New orders will appear here in real-time</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredKots.map((kot) => (
              <KOTCard
                key={kot.id}
                kot={kot}
                onBump={handleBump}
                onItemReady={handleItemReady}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
