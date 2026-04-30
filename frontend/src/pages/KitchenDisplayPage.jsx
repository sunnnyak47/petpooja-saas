import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import toast from 'react-hot-toast';
import {
  ChefHat, Flame, CheckCircle2, RefreshCw,
  Volume2, VolumeX, Maximize2, Timer, Utensils, Coffee,
  IceCream, Package, Eye, AlertCircle, X, Trash2,
  Loader2, BarChart2, UtensilsCrossed, Clock,
} from 'lucide-react';

/* ─── constants ─── */
const STATIONS = [
  { id: 'ALL',     label: 'All',      icon: Eye,          color: '#818cf8' },
  { id: 'KITCHEN', label: 'Kitchen',  icon: Utensils,     color: '#fb923c' },
  { id: 'BAR',     label: 'Bar',      icon: Coffee,       color: '#c084fc' },
  { id: 'DESSERT', label: 'Dessert',  icon: IceCream,     color: '#f472b6' },
  { id: 'PACKING', label: 'Packing',  icon: Package,      color: '#2dd4bf' },
];

/* ─── elapsed time hook ─── */
function useElapsedTime(createdAt) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!createdAt) return;
    const update = () => setSecs(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  return secs;
}

/* ─── format elapsed ─── */
function fmtElapsed(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ─── elapsed badge ─── */
function ElapsedBadge({ createdAt }) {
  const totalSecs = useElapsedTime(createdAt);
  const mins      = Math.floor(totalSecs / 60);
  const isUrgent  = mins >= 15;
  const isWarn    = mins >= 8;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6, fontSize: 11,
      fontFamily: 'monospace', fontWeight: 700,
      background: isUrgent ? '#ef4444' : isWarn ? '#f59e0b' : 'rgba(255,255,255,0.1)',
      color:      isUrgent ? '#fff'    : isWarn ? '#000'    : '#94a3b8',
    }}>
      <Timer size={10} />
      {fmtElapsed(totalSecs)}
      {isUrgent && ' !'  }
    </span>
  );
}

/* ─── KOT card ─── */
function KOTCard({ kot, onBump, onItemReady, bumpLoading }) {
  const totalSecs = useElapsedTime(kot.created_at);
  const mins      = Math.floor(totalSecs / 60);
  const isUrgent  = mins >= 15;
  const isWarn    = mins >= 8 && !isUrgent;

  // Normalise items — backend may nest under kot.items or kot.kot_items
  const items = kot.items ?? kot.kot_items ?? [];
  const allReady = items.length > 0 && items.every(i => i.is_ready);

  // status config
  const STATUS_CFG = {
    pending:   { label: 'NEW',     accent: '#6366f1', pill: '#312e81' },
    preparing: { label: 'COOKING', accent: '#f97316', pill: '#431407' },
    ready:     { label: 'READY',   accent: '#22c55e', pill: '#052e16' },
    served:    { label: 'DONE',    accent: '#475569', pill: '#0f172a' },
  };
  const cfg = STATUS_CFG[kot.status] || STATUS_CFG.pending;

  const orderType = kot.order?.order_type === 'takeaway' ? 'Takeaway'
                  : kot.order?.order_type === 'delivery' ? 'Delivery'
                  : 'Dine In';
  const tableNum  = kot.order?.table?.table_number;

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 12,
      border: `1.5px solid ${isUrgent ? '#ef4444' : cfg.accent}44`,
      borderLeft: `4px solid ${isUrgent ? '#ef4444' : cfg.accent}`,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: isUrgent
        ? '0 0 0 1px rgba(239,68,68,0.3), 0 4px 20px rgba(0,0,0,0.5)'
        : '0 4px 20px rgba(0,0,0,0.4)',
      animation: isUrgent ? 'urgentPulse 2s ease-in-out infinite' : undefined,
      transition: 'box-shadow 0.3s',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 14px',
        background: '#111827',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
            KOT #{kot.kot_number || kot.id?.slice(-6).toUpperCase()}
          </span>
          {kot.is_rush && <Flame size={14} color="#ef4444" />}
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5,
            background: cfg.pill, color: cfg.accent, letterSpacing: '0.06em',
          }}>
            {cfg.label}
          </span>
        </div>
        <ElapsedBadge createdAt={kot.created_at} />
      </div>

      {/* ── Meta row ── */}
      <div style={{
        padding: '7px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          Order <strong style={{ color: '#94a3b8' }}>#{kot.order?.order_number || '—'}</strong>
        </span>
        {tableNum && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: '#1e3a5f', color: '#60a5fa',
            padding: '1px 7px', borderRadius: 4,
          }}>
            Table {tableNum}
          </span>
        )}
        <span style={{
          fontSize: 10, fontWeight: 600,
          background: '#1e293b', color: '#64748b',
          padding: '1px 7px', borderRadius: 4,
        }}>
          {orderType}
        </span>
        {kot.order?.covers > 0 && (
          <span style={{ fontSize: 10, color: '#64748b' }}>
            👥 {kot.order.covers} pax
          </span>
        )}
      </div>

      {/* ── Items ── */}
      <div style={{ flex: 1, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>No items</p>
        ) : items.map((item, idx) => {
          const itemName = item.name ?? item.menu_item?.name ?? item.item_name ?? `Item ${idx + 1}`;
          const qty      = item.quantity ?? item.qty ?? 1;
          const done     = item.is_ready ?? item.status === 'ready';
          return (
            <div key={item.id ?? idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              {/* check bubble */}
              <button
                onClick={() => onItemReady?.(kot.id, item.id)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  border: `2px solid ${done ? '#22c55e' : '#334155'}`,
                  background: done ? '#22c55e' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                {done && <CheckCircle2 size={12} color="#fff" />}
              </button>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: done ? '#334155' : '#e2e8f0',
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {itemName}
                    {item.variant_name && (
                      <span style={{ fontSize: 11, color: '#475569', marginLeft: 4 }}>({item.variant_name})</span>
                    )}
                  </span>
                  <span style={{
                    fontSize: 17, fontWeight: 900, marginLeft: 8,
                    color: done ? '#334155' : cfg.accent,
                  }}>
                    ×{qty}
                  </span>
                </div>
                {item.addons?.length > 0 && (
                  <p style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                    + {item.addons.map(a => a.name).join(', ')}
                  </p>
                )}
                {item.special_note && (
                  <p style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>📝 {item.special_note}</p>
                )}
              </div>
            </div>
          );
        })}

        {/* order-level notes */}
        {(kot.order?.special_instructions || kot.notes) && (
          <div style={{
            marginTop: 4, padding: '6px 10px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 6, fontSize: 11, color: '#fbbf24',
          }}>
            📝 {kot.order?.special_instructions || kot.notes}
          </div>
        )}

        {allReady && kot.status === 'preparing' && (
          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, textAlign: 'center', marginTop: 4 }}>
            ✅ All items ready — mark as Ready
          </div>
        )}
      </div>

      {/* ── Action button ── */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {kot.status === 'pending' && (
          <button
            onClick={() => onBump?.(kot.id, 'preparing')}
            disabled={bumpLoading}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #ea580c, #f97316)',
              color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(249,115,22,0.35)',
              opacity: bumpLoading ? 0.6 : 1,
            }}
          >
            🔥 Start Cooking
          </button>
        )}
        {kot.status === 'preparing' && (
          <button
            onClick={() => onBump?.(kot.id, 'ready')}
            disabled={bumpLoading}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #16a34a, #22c55e)',
              color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(34,197,94,0.3)',
              opacity: bumpLoading ? 0.6 : 1,
            }}
          >
            ✅ Mark Ready
          </button>
        )}
        {kot.status === 'ready' && (
          <button
            onClick={() => onBump?.(kot.id, 'served')}
            disabled={bumpLoading}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
              background: '#1e293b', color: '#94a3b8', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: bumpLoading ? 0.6 : 1,
            }}
          >
            📤 Served / Picked Up
          </button>
        )}
        {kot.status === 'served' && (
          <div style={{ textAlign: 'center', color: '#334155', fontSize: 12, fontWeight: 600, padding: '4px 0' }}>
            ✓ Completed
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── main page ─── */
export default function KitchenDisplayPage() {
  const { user }    = useSelector((s) => s.auth);
  const outletId    = user?.outlet_id || user?.outlets?.[0]?.id;
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const [activeStation, setActiveStation] = useState('ALL');
  const [soundEnabled,  setSoundEnabled]  = useState(true);
  const soundEnabledRef = useRef(soundEnabled);
  const [showCompleted, setShowCompleted] = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(null);
  const [fullscreen,    setFullscreen]    = useState(false);
  const [clock,         setClock]         = useState(new Date());

  // keep soundEnabledRef in sync with state
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // live clock
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── fetch KOTs ── */
  const { data: kots, isLoading } = useQuery({
    queryKey: ['kds-kots', outletId, activeStation],
    queryFn:  () =>
      api.get(`/kitchen/kots?outlet_id=${outletId}${activeStation !== 'ALL' ? `&station=${activeStation}` : ''}`)
         .then(r => {
           const raw = r.data?.data ?? r.data ?? r;
           return Array.isArray(raw) ? raw : [];
         }),
    enabled:  !!outletId,
    refetchInterval: 12000,
  });

  /* ── socket.io ── */
  useEffect(() => {
    if (!outletId) return;
    const socket = io(`${SOCKET_URL}/kitchen`, { transports: ['websocket'], withCredentials: true });
    socket.emit('join_outlet', outletId);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] });

    socket.on('new_kot', () => {
      refresh();
      if (soundEnabledRef.current) { try { new Audio('/notification.mp3').play().catch(() => {}); } catch {} }
    });
    socket.on('kot_item_ready', refresh);
    socket.on('kot_complete',   refresh);
    socket.on('order_cancelled', (data) => {
      refresh();
      toast((t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#dc2626', color: '#fff', padding: '12px 16px', borderRadius: 12, fontWeight: 700 }}>
          <AlertCircle size={22} />
          <div>
            <p style={{ fontSize: 15 }}>ORDER CANCELLED: #{data.order_number}</p>
            {data.reason && <p style={{ fontSize: 11, opacity: 0.8 }}>Reason: {data.reason}</p>}
          </div>
          <button onClick={() => toast.dismiss(t.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 8 }}>
            <X size={16} />
          </button>
        </div>
      ), { duration: 10000, position: 'top-center' });
      if (soundEnabledRef.current) { try { new Audio('/cancel_alert.mp3').play().catch(() => {}); } catch {} }
    });
    return () => socket.disconnect();
  }, [outletId, queryClient]);

  /* ── mutations ── */
  const bumpMutation = useMutation({
    mutationFn: ({ kotId, status }) => api.put(`/kitchen/kots/${kotId}/status`, { status, outlet_id: outletId }),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['kds-kots'] }); toast.success('Updated'); },
    onError:    (e) => toast.error(e.message || 'Failed'),
  });
  const itemReadyMutation = useMutation({
    mutationFn: ({ kotId, itemId }) => api.put(`/kitchen/kots/${kotId}/items/${itemId}/ready`, { outlet_id: outletId }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] }),
    onError:    (e) => toast.error(e.message),
  });
  const clearMutation = useMutation({
    mutationFn: ({ type, kots }) => {
      const toMark = kots.filter(k => type === 'all'
        ? ['preparing', 'ready', 'served'].includes(k.status)
        : k.status === 'served');
      return Promise.all(toMark.map(k => api.put(`/kitchen/kots/${k.id}/status`, { status: 'served', outlet_id: outletId })));
    },
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
      toast.success(type === 'all' ? 'All orders cleared' : 'Completed orders cleared');
      setConfirmClear(null);
    },
    onError: () => { toast.error('Clear failed'); setConfirmClear(null); },
  });

  const handleBump      = useCallback((kotId, status) => bumpMutation.mutate({ kotId, status }), [bumpMutation]);
  const handleItemReady = useCallback((kotId, itemId) => itemReadyMutation.mutate({ kotId, itemId }), [itemReadyMutation]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); setFullscreen(true); }
    else { document.exitFullscreen(); setFullscreen(false); }
  };

  const allKots = kots ?? [];

  const filteredKots = useMemo(() => {
    let list = allKots;
    if (!showCompleted) list = list.filter(k => k.status !== 'served' && k.status !== 'completed');
    return list;
  }, [allKots, showCompleted]);

  const stats = useMemo(() => ({
    pending:   allKots.filter(k => k.status === 'pending').length,
    preparing: allKots.filter(k => k.status === 'preparing').length,
    ready:     allKots.filter(k => k.status === 'ready').length,
    served:    allKots.filter(k => k.status === 'served' || k.status === 'completed').length,
  }), [allKots]);

  const timeStr = clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020617', color: '#e2e8f0' }}>
      <style>{`
        @keyframes urgentPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3), 0 4px 20px rgba(0,0,0,0.5); }
          50%      { box-shadow: 0 0 0 5px rgba(239,68,68,0), 0 4px 20px rgba(0,0,0,0.5); }
        }
        .kds-icon-btn { transition: background 0.15s, color 0.15s; }
        .kds-icon-btn:hover { background: #1e293b !important; color: #e2e8f0 !important; }
        .kds-station-btn:hover { opacity: 0.85; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 52,
        background: '#0b1120', borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {/* left: logo + clock + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ChefHat size={20} color="#818cf8" />
            <span style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
              Kitchen Display
            </span>
          </div>

          {/* clock */}
          <span style={{
            fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
            color: '#475569', background: '#0f172a',
            padding: '3px 10px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {timeStr}
          </span>

          {/* stat pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { n: stats.pending,   label: 'New',     bg: 'rgba(99,102,241,0.15)',  color: '#818cf8' },
              { n: stats.preparing, label: 'Cooking', bg: 'rgba(249,115,22,0.15)', color: '#fb923c' },
              { n: stats.ready,     label: 'Ready',   bg: 'rgba(34,197,94,0.15)',  color: '#4ade80' },
              { n: stats.served,    label: 'Served',  bg: 'rgba(71,85,105,0.2)',   color: '#64748b' },
            ].map(s => (
              <span key={s.label} style={{
                background: s.bg, color: s.color,
                fontSize: 11, fontWeight: 700,
                padding: '3px 10px', borderRadius: 20,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: 13, fontWeight: 900 }}>{s.n}</span> {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* right: controls */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[
            {
              label: showCompleted ? 'Hide Done' : 'Show Done',
              icon: <CheckCircle2 size={14} />,
              active: showCompleted,
              onClick: () => setShowCompleted(v => !v),
            },
            {
              label: soundEnabled ? 'Sound On' : 'Sound Off',
              icon: soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />,
              active: false,
              onClick: () => setSoundEnabled(v => !v),
            },
            {
              label: 'Analytics',
              icon: <BarChart2 size={14} />,
              active: false,
              onClick: () => navigate('/prep-analytics'),
            },
          ].map(btn => (
            <button
              key={btn.label}
              className="kds-icon-btn"
              onClick={btn.onClick}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: btn.active ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: btn.active ? '#818cf8' : '#64748b',
                fontSize: 12, fontWeight: 600,
              }}
            >
              {btn.icon} {btn.label}
            </button>
          ))}

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

          {/* clear served */}
          <button
            className="kds-icon-btn"
            onClick={() => setConfirmClear('completed')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)', color: '#f87171',
              fontSize: 12, fontWeight: 600,
            }}
          >
            <Trash2 size={14} /> Clear Served
          </button>

          {/* refresh */}
          <button
            className="kds-icon-btn"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['kds-kots'] })}
            style={{
              padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: 'transparent', color: '#64748b',
            }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>

          {/* fullscreen */}
          <button
            className="kds-icon-btn"
            onClick={toggleFullscreen}
            style={{
              padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: 'transparent', color: '#64748b',
            }}
            title="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Station tabs ── */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 20px',
        background: '#0a0f1e', borderBottom: '1px solid rgba(255,255,255,0.05)',
        overflowX: 'auto', flexShrink: 0,
      }}>
        {STATIONS.map(s => {
          const Icon   = s.icon;
          const active = activeStation === s.id;
          return (
            <button
              key={s.id}
              className="kds-station-btn"
              onClick={() => setActiveStation(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${active ? s.color : 'rgba(255,255,255,0.07)'}`,
                background: active ? s.color + '18' : 'transparent',
                color: active ? s.color : '#475569',
                fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={13} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ── KOT grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#475569' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 15 }}>Loading orders…</span>
          </div>
        ) : filteredKots.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <UtensilsCrossed size={56} color="#1e293b" />
            <p style={{ fontSize: 17, fontWeight: 600, color: '#334155' }}>No active orders</p>
            <p style={{ fontSize: 13, color: '#1e293b' }}>New orders will appear here automatically</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
            gap: 14, alignItems: 'start',
          }}>
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

      {/* ── Confirm clear modal ── */}
      {confirmClear && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: '28px 32px', width: 360, textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Trash2 size={22} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
              {confirmClear === 'all' ? 'Clear All Orders?' : 'Clear Served Orders?'}
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24, lineHeight: 1.5 }}>
              {confirmClear === 'all'
                ? 'All cooking & ready orders will be marked as served.'
                : `${stats.served} served order${stats.served !== 1 ? 's' : ''} will be dismissed from this display.`}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmClear(null)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #1e293b',
                  background: 'transparent', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => clearMutation.mutate({ type: confirmClear, kots: allKots })}
                disabled={clearMutation.isPending}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  opacity: clearMutation.isPending ? 0.6 : 1,
                }}
              >
                {clearMutation.isPending ? 'Clearing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
