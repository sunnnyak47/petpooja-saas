import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import toast from 'react-hot-toast';
import {
  ChefHat, Flame, CheckCircle2, RefreshCw,
  Volume2, VolumeX, Maximize2, Timer, Utensils, Coffee,
  IceCream, Package, Eye, AlertCircle, X, Trash2,
  Clock, Tag, User, MapPin, ArrowRight, Loader2,
} from 'lucide-react';

const STATIONS = [
  { id: 'ALL',     label: 'All',      icon: Eye,      color: '#6366f1' },
  { id: 'KITCHEN', label: 'Kitchen',  icon: Utensils, color: '#f97316' },
  { id: 'BAR',     label: 'Bar',      icon: Coffee,   color: '#a855f7' },
  { id: 'DESSERT', label: 'Dessert',  icon: IceCream, color: '#ec4899' },
  { id: 'PACKING', label: 'Packing',  icon: Package,  color: '#14b8a6' },
];

const STATUS = {
  pending:   { label: 'NEW',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: '#3b82f6' },
  preparing: { label: 'COOKING', color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: '#f97316' },
  ready:     { label: 'READY',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: '#22c55e' },
  served:    { label: 'DONE',    color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: '#334155' },
};

const ORDER_TYPE_LABELS = {
  dine_in: 'Dine In', takeaway: 'Takeaway', delivery: 'Delivery',
};

function useElapsedTime(createdAt) {
  const [elapsed, setElapsed] = useState({ mins: 0, secs: 0, total: 0 });
  useEffect(() => {
    if (!createdAt) return;
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      setElapsed({ mins: Math.floor(diff / 60), secs: diff % 60, total: diff });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  return elapsed;
}

function ElapsedBadge({ createdAt }) {
  const { mins, secs, total } = useElapsedTime(createdAt);
  const isUrgent = mins >= 15;
  const isWarn   = mins >= 8 && mins < 15;
  const bg    = isUrgent ? '#ef4444' : isWarn ? '#f59e0b' : '#1e293b';
  const color = isUrgent ? '#fff'    : isWarn ? '#000'    : '#94a3b8';
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Timer size={11} />
      {`${mins}:${String(secs).padStart(2,'0')}`}
      {isUrgent && ' ⚠️'}
    </span>
  );
}

function KOTCard({ kot, onBump, onItemReady, bumpLoading }) {
  const { mins } = useElapsedTime(kot.created_at);
  const isUrgent = mins >= 15;
  const cfg = STATUS[kot.status] || STATUS.pending;
  const orderType = ORDER_TYPE_LABELS[kot.order?.order_type] || kot.order?.order_type || 'Dine In';
  const tableNum  = kot.order?.table?.table_number;
  const customer  = kot.order?.customer?.name || kot.order?.customer_name;
  const allReady  = (kot.items || []).every(i => i.is_ready);
  const notes     = kot.order?.special_instructions || kot.notes;

  return (
    <div style={{
      border: `2px solid ${cfg.border}`,
      borderRadius: 16,
      background: '#0f172a',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: `0 0 0 1px ${cfg.border}22, 0 4px 24px rgba(0,0,0,0.4)`,
      animation: isUrgent ? 'urgentPulse 2s infinite' : undefined,
    }}>
      {/* ─── Header strip ─── */}
      <div style={{ background: cfg.border, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 18, letterSpacing: -0.5 }}>
            KOT #{kot.kot_number || kot.id?.slice(-4).toUpperCase()}
          </span>
          {kot.is_rush && <Flame size={16} color="#fff" style={{ animation: 'bounce 1s infinite' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
            {cfg.label}
          </span>
          <ElapsedBadge createdAt={kot.created_at} />
        </div>
      </div>

      {/* ─── Order meta ─── */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* Order number */}
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          Order <strong style={{ color: '#e2e8f0' }}>#{String(kot.order?.order_number || '').padStart(4,'0')}</strong>
        </span>
        {/* Table */}
        {tableNum && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1e3a5f', color: '#60a5fa', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
            <MapPin size={10} /> T-{tableNum}
          </span>
        )}
        {/* Type */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1e293b', color: '#94a3b8', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
          <Tag size={10} /> {orderType}
        </span>
        {/* Customer */}
        {customer && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1e293b', color: '#94a3b8', fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
            <User size={10} /> {customer}
          </span>
        )}
        {/* Covers */}
        {kot.order?.covers > 0 && (
          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 11, padding: '2px 8px', borderRadius: 20 }}>
            👥 {kot.order.covers} pax
          </span>
        )}
      </div>

      {/* ─── Items ─── */}
      <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(kot.items || []).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {/* Checkbox */}
            <button
              onClick={() => onItemReady?.(kot.id, item.id)}
              style={{
                width: 22, height: 22, borderRadius: '50%', border: `2px solid ${item.is_ready ? '#22c55e' : '#334155'}`,
                background: item.is_ready ? '#22c55e' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, marginTop: 1,
              }}
            >
              {item.is_ready && <CheckCircle2 size={14} color="#fff" />}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{
                  fontSize: 14, fontWeight: 600,
                  color: item.is_ready ? '#475569' : '#f1f5f9',
                  textDecoration: item.is_ready ? 'line-through' : 'none',
                }}>
                  {item.name}
                  {item.variant_name && <span style={{ color: '#64748b', fontSize: 12, marginLeft: 4 }}>({item.variant_name})</span>}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: item.is_ready ? '#334155' : cfg.color, marginLeft: 8 }}>
                  ×{item.quantity}
                </span>
              </div>
              {item.addons?.length > 0 && (
                <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  + {item.addons.map(a => a.name).join(', ')}
                </p>
              )}
              {item.special_note && (
                <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>📝 {item.special_note}</p>
              )}
            </div>
          </div>
        ))}

        {/* Order-level notes */}
        {notes && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#1c1a07', border: '1px solid #78350f', borderRadius: 8, fontSize: 12, color: '#fbbf24' }}>
            📝 {notes}
          </div>
        )}

        {/* All-items-ready indicator */}
        {allReady && kot.status === 'preparing' && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#22c55e', fontWeight: 700, marginTop: 4 }}>
            ✅ All items ready — bump to READY
          </div>
        )}
      </div>

      {/* ─── Action footer ─── */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #1e293b' }}>
        {kot.status === 'pending' && (
          <button
            onClick={() => onBump?.(kot.id, 'preparing')}
            disabled={bumpLoading}
            style={{ width: '100%', padding: '10px 0', background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            🔥 Start Cooking
          </button>
        )}
        {kot.status === 'preparing' && (
          <button
            onClick={() => onBump?.(kot.id, 'ready')}
            disabled={bumpLoading}
            style={{ width: '100%', padding: '10px 0', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            ✅ Mark Ready
          </button>
        )}
        {kot.status === 'ready' && (
          <button
            onClick={() => onBump?.(kot.id, 'served')}
            disabled={bumpLoading}
            style={{ width: '100%', padding: '10px 0', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            📤 Served / Picked Up
          </button>
        )}
        {kot.status === 'served' && (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, fontWeight: 600 }}>
            ✓ Completed
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
export default function KitchenDisplayPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [activeStation, setActiveStation] = useState('ALL');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [confirmClear, setConfirmClear] = useState(null); // 'completed' | 'all'
  const [fullscreen, setFullscreen] = useState(false);

  const { data: kots, isLoading } = useQuery({
    queryKey: ['kds-kots', outletId, activeStation],
    queryFn: () =>
      api.get(`/kitchen/kots?outlet_id=${outletId}${activeStation !== 'ALL' ? `&station=${activeStation}` : ''}`)
         .then(r => r.data || r),
    enabled: !!outletId,
    refetchInterval: 12000,
  });

  // Socket.io
  useEffect(() => {
    if (!outletId) return;
    const socket = io(`${SOCKET_URL}/kitchen`, {
      transports: ['websocket'], withCredentials: true,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#dc2626', color: '#fff', padding: '12px 16px', borderRadius: 12, fontWeight: 700 }}>
          <AlertCircle size={24} />
          <div>
            <p style={{ fontSize: 16 }}>ORDER CANCELLED: #{data.order_number}</p>
            <p style={{ fontSize: 12, opacity: 0.85 }}>Reason: {data.reason}</p>
          </div>
          <button onClick={() => toast.dismiss(t.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
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
      toast.success('Updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update KOT'),
  });

  const itemReadyMutation = useMutation({
    mutationFn: ({ kotId, itemId }) => api.put(`/kitchen/kots/${kotId}/items/${itemId}/ready`, { outlet_id: outletId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] }),
    onError: (e) => toast.error(e.message),
  });

  // Mass clear: mark all 'served'/'completed' as archived, or just refetch (soft clear via local filter)
  const clearMutation = useMutation({
    mutationFn: (type) => {
      // type = 'completed' → clear served, 'all' → clear everything non-pending
      const list = Array.isArray(kots) ? kots : [];
      const toMark = list.filter(k =>
        type === 'all'
          ? ['preparing', 'ready', 'served'].includes(k.status)
          : k.status === 'served'
      );
      return Promise.all(toMark.map(k => api.put(`/kitchen/kots/${k.id}/status`, { status: 'served', outlet_id: outletId })));
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
      toast.success(type === 'all' ? 'All orders cleared' : 'Completed orders cleared');
      setConfirmClear(null);
    },
    onError: () => { toast.error('Clear failed'); setConfirmClear(null); },
  });

  const handleBump      = useCallback((kotId, status) => bumpMutation.mutate({ kotId, status }), [bumpMutation]);
  const handleItemReady = useCallback((kotId, itemId) => itemReadyMutation.mutate({ kotId, itemId }), [itemReadyMutation]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const allKots = Array.isArray(kots) ? kots : [];

  const filteredKots = useMemo(() => {
    let list = allKots;
    if (!showCompleted) list = list.filter(k => k.status !== 'served' && k.status !== 'completed');
    return list;
  }, [allKots, showCompleted]);

  const stats = useMemo(() => ({
    pending:   allKots.filter(k => k.status === 'pending').length,
    preparing: allKots.filter(k => k.status === 'preparing').length,
    ready:     allKots.filter(k => k.status === 'ready').length,
    served:    allKots.filter(k => k.status === 'served').length,
  }), [allKots]);

  /* ── Styles ── */
  const topBar = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b', flexShrink: 0,
  };
  const iconBtn = (active) => ({
    padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: active ? '#6366f1' : '#1e293b', color: active ? '#fff' : '#64748b',
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
    transition: 'all 0.15s',
  });
  const stationBtn = (active, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 16px', borderRadius: 10, border: `1.5px solid ${active ? color : '#1e293b'}`,
    background: active ? color + '22' : 'transparent', color: active ? color : '#64748b',
    fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020617', color: '#e2e8f0' }}>
      {/* ── Top Bar ── */}
      <div style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ChefHat size={24} color="#6366f1" />
            <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: -0.5, color: '#f1f5f9' }}>Kitchen Display</span>
            <span style={{ fontSize: 11, color: '#64748b', background: '#1e293b', padding: '2px 8px', borderRadius: 6, marginLeft: 4 }}>
              {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {/* Stat pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: `${stats.pending} New`,      bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
              { label: `${stats.preparing} Cooking`, bg: 'rgba(249,115,22,0.15)', color: '#fb923c' },
              { label: `${stats.ready} Ready`,       bg: 'rgba(34,197,94,0.15)',  color: '#4ade80' },
              { label: `${stats.served} Served`,     bg: 'rgba(100,116,139,0.15)', color: '#94a3b8' },
            ].map(s => (
              <span key={s.label} style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button style={iconBtn(showCompleted)} onClick={() => setShowCompleted(!showCompleted)} title="Show completed">
            <CheckCircle2 size={15} /> {showCompleted ? 'Hide Done' : 'Show Done'}
          </button>
          <button style={iconBtn(false)} onClick={() => setSoundEnabled(!soundEnabled)} title="Sound">
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {/* Mass clear dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              style={{ ...iconBtn(false), color: '#f87171', borderColor: '#450a0a', background: '#1c0a0a' }}
              onClick={() => setConfirmClear('completed')}
              title="Clear completed orders"
            >
              <Trash2 size={15} /> Clear Served
            </button>
          </div>

          <button style={iconBtn(false)} onClick={() => queryClient.invalidateQueries({ queryKey: ['kds-kots'] })} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button style={iconBtn(false)} onClick={toggleFullscreen} title="Fullscreen">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/* ── Station Tabs ── */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', background: '#0a0f1e', borderBottom: '1px solid #1e293b', overflowX: 'auto', flexShrink: 0 }}>
        {STATIONS.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.id} style={stationBtn(activeStation === s.id, s.color)} onClick={() => setActiveStation(s.id)}>
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ── KOT Grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#64748b' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 16 }}>Loading orders…</span>
          </div>
        ) : filteredKots.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#334155', gap: 12 }}>
            <ChefHat size={64} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: 18, fontWeight: 600, color: '#475569' }}>No active orders</p>
            <p style={{ fontSize: 14, color: '#334155' }}>New orders will appear here in real-time</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
            {filteredKots.map(kot => (
              <KOTCard
                key={kot.id}
                kot={kot}
                onBump={handleBump}
                onItemReady={handleItemReady}
                bumpLoading={bumpMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Confirm Clear Modal ── */}
      {confirmClear && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: 28, width: 360, textAlign: 'center' }}>
            <Trash2 size={40} color="#ef4444" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
              {confirmClear === 'all' ? 'Clear All Orders?' : 'Clear Served Orders?'}
            </h3>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
              {confirmClear === 'all'
                ? 'This will mark all cooking & ready orders as served.'
                : `This will dismiss all ${stats.served} served/completed orders from the display.`}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClear(null)} style={{ flex: 1, padding: '10px 0', background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Cancel
              </button>
              <button
                onClick={() => clearMutation.mutate(confirmClear)}
                disabled={clearMutation.isPending}
                style={{ flex: 1, padding: '10px 0', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
              >
                {clearMutation.isPending ? 'Clearing…' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes urgentPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4), 0 4px 24px rgba(0,0,0,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0), 0 4px 24px rgba(0,0,0,0.4); }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
