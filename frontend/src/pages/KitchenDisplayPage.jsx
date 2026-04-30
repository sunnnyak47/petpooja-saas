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
  Loader2, UtensilsCrossed, Clock, ArrowRight,
} from 'lucide-react';

/* ─── constants ─── */
const STATIONS = [
  { id: 'ALL',     label: 'All',      icon: Eye,      color: '#818cf8' },
  { id: 'KITCHEN', label: 'Kitchen',  icon: Utensils, color: '#fb923c' },
  { id: 'BAR',     label: 'Bar',      icon: Coffee,   color: '#c084fc' },
  { id: 'DESSERT', label: 'Dessert',  icon: IceCream, color: '#f472b6' },
  { id: 'PACKING', label: 'Packing',  icon: Package,  color: '#2dd4bf' },
];

const COLUMNS = [
  { status: 'pending',   label: 'NEW',     emoji: '🆕', accent: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.3)'  },
  { status: 'preparing', label: 'COOKING', emoji: '🔥', accent: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)'  },
  { status: 'ready',     label: 'READY',   emoji: '✅', accent: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.3)'   },
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

function fmtElapsed(totalSecs) {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ─── KOT card ─── */
function KOTCard({ kot, onBump, onItemReady, bumpLoading, colAccent }) {
  const totalSecs = useElapsedTime(kot.created_at);
  const mins      = Math.floor(totalSecs / 60);
  const isUrgent  = mins >= 15;
  const isWarn    = mins >= 8 && !isUrgent;

  const items    = kot.items ?? kot.kot_items ?? [];
  const allReady = items.length > 0 && items.every(i => i.is_ready);

  const tableNum  = kot.order?.table?.table_number;
  const orderType = kot.order?.order_type === 'takeaway' ? 'TAKEAWAY'
                  : kot.order?.order_type === 'delivery' ? 'DELIVERY'
                  : tableNum ? `TABLE ${tableNum}` : 'DINE IN';

  const borderColor = isUrgent ? '#ef4444' : colAccent;

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 14,
      border: `1px solid rgba(255,255,255,0.06)`,
      borderLeft: `5px solid ${borderColor}`,
      overflow: 'hidden',
      boxShadow: isUrgent
        ? `0 0 0 1px rgba(239,68,68,0.25), 0 8px 32px rgba(0,0,0,0.5)`
        : `0 4px 20px rgba(0,0,0,0.4)`,
      animation: isUrgent ? 'urgentPulse 2s ease-in-out infinite' : undefined,
      display: 'flex', flexDirection: 'column',
      marginBottom: 12,
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 16px',
        background: '#111827',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontWeight: 900, fontSize: 18, color: '#f1f5f9', letterSpacing: '-0.3px', flexShrink: 0,
          }}>
            KOT #{kot.kot_number || kot.id?.slice(-5).toUpperCase()}
          </span>
          {kot.is_rush && <Flame size={16} color="#ef4444" />}
        </div>

        {/* elapsed timer */}
        <span style={{
          fontFamily: 'monospace', fontWeight: 800, fontSize: 15,
          padding: '4px 10px', borderRadius: 8,
          background: isUrgent ? '#ef4444' : isWarn ? '#d97706' : 'rgba(255,255,255,0.06)',
          color: isUrgent ? '#fff' : isWarn ? '#fff' : '#64748b',
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        }}>
          <Clock size={12} />
          {fmtElapsed(totalSecs)}
          {isUrgent && ' ⚠'}
        </span>
      </div>

      {/* ── Order info bar ── */}
      <div style={{
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 800, letterSpacing: '0.08em',
          color: borderColor,
          background: `${borderColor}18`, padding: '3px 9px', borderRadius: 5,
        }}>
          {orderType}
        </span>
        {kot.order?.order_number && (
          <span style={{ fontSize: 12, color: '#475569' }}>
            Order <strong style={{ color: '#94a3b8' }}>#{kot.order.order_number}</strong>
          </span>
        )}
        {kot.order?.covers > 0 && (
          <span style={{ fontSize: 12, color: '#475569' }}>👥 {kot.order.covers} pax</span>
        )}
      </div>

      {/* ── Items ── */}
      <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>No items</p>
        ) : items.map((item, idx) => {
          const itemName = item.name ?? item.menu_item?.name ?? item.item_name ?? `Item ${idx + 1}`;
          const qty      = item.quantity ?? item.qty ?? 1;
          const done     = item.is_ready ?? item.status === 'ready';
          return (
            <div key={item.id ?? idx} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              background: done ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)'}`,
            }}>
              {/* check button */}
              <button
                onClick={() => onItemReady?.(kot.id, item.id)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  border: `2px solid ${done ? '#22c55e' : '#334155'}`,
                  background: done ? '#22c55e' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding: 0,
                }}
              >
                {done && <CheckCircle2 size={14} color="#fff" />}
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontSize: 15, fontWeight: 700,
                    color: done ? '#334155' : '#e2e8f0',
                    textDecoration: done ? 'line-through' : 'none',
                    lineHeight: 1.3,
                  }}>
                    {itemName}
                    {item.variant_name && (
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 500, marginLeft: 5 }}>
                        ({item.variant_name})
                      </span>
                    )}
                  </span>
                  <span style={{
                    fontSize: 20, fontWeight: 900, flexShrink: 0,
                    color: done ? '#334155' : borderColor,
                  }}>
                    ×{qty}
                  </span>
                </div>
                {item.addons?.length > 0 && (
                  <p style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>
                    + {item.addons.map(a => a.name).join(', ')}
                  </p>
                )}
                {item.special_note && (
                  <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 3 }}>
                    📝 {item.special_note}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* order notes */}
        {(kot.order?.special_instructions || kot.notes) && (
          <div style={{
            marginTop: 2, padding: '8px 12px',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 8, fontSize: 12, color: '#fbbf24', lineHeight: 1.5,
          }}>
            📝 {kot.order?.special_instructions || kot.notes}
          </div>
        )}

        {allReady && kot.status === 'preparing' && (
          <div style={{
            fontSize: 12, color: '#22c55e', fontWeight: 700,
            textAlign: 'center', padding: '6px 0',
            background: 'rgba(34,197,94,0.05)', borderRadius: 6,
          }}>
            ✅ All items ready — tap Mark Ready
          </div>
        )}
      </div>

      {/* ── Action button ── */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {kot.status === 'pending' && (
          <button
            onClick={() => onBump?.(kot.id, 'preparing')}
            disabled={bumpLoading}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #ea580c, #f97316)',
              color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(249,115,22,0.4)',
              opacity: bumpLoading ? 0.6 : 1,
              letterSpacing: '0.03em',
            }}
          >
            🔥 START COOKING
          </button>
        )}
        {kot.status === 'preparing' && (
          <button
            onClick={() => onBump?.(kot.id, 'ready')}
            disabled={bumpLoading}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #16a34a, #22c55e)',
              color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(34,197,94,0.35)',
              opacity: bumpLoading ? 0.6 : 1,
              letterSpacing: '0.03em',
            }}
          >
            ✅ MARK READY
          </button>
        )}
        {kot.status === 'ready' && (
          <button
            onClick={() => onBump?.(kot.id, 'served')}
            disabled={bumpLoading}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: '#1e293b', color: '#94a3b8', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', borderWidth: 1, borderStyle: 'solid', borderColor: '#334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: bumpLoading ? 0.6 : 1,
            }}
          >
            <ArrowRight size={16} /> SERVED / PICKED UP
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── column header ─── */
function ColumnHeader({ col, count }) {
  return (
    <div style={{
      padding: '12px 16px',
      background: col.bg,
      border: `1px solid ${col.border}`,
      borderRadius: '12px 12px 0 0',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 0, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{col.emoji}</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: col.accent, letterSpacing: '0.06em' }}>
          {col.label}
        </span>
      </div>
      <span style={{
        minWidth: 28, height: 28, borderRadius: 8,
        background: col.accent, color: '#fff',
        fontWeight: 900, fontSize: 15,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 8px',
      }}>
        {count}
      </span>
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

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#dc2626', color: '#fff', padding: '12px 16px',
          borderRadius: 12, fontWeight: 700,
        }}>
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
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] }),
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
    if (!showCompleted) return allKots.filter(k => k.status !== 'served' && k.status !== 'completed');
    return allKots;
  }, [allKots, showCompleted]);

  const stats = useMemo(() => ({
    pending:   allKots.filter(k => k.status === 'pending').length,
    preparing: allKots.filter(k => k.status === 'preparing').length,
    ready:     allKots.filter(k => k.status === 'ready').length,
    served:    allKots.filter(k => k.status === 'served' || k.status === 'completed').length,
  }), [allKots]);

  const kotsByStatus = useMemo(() => {
    const map = { pending: [], preparing: [], ready: [], served: [] };
    filteredKots.forEach(k => {
      const key = (k.status === 'completed' ? 'served' : k.status) || 'pending';
      if (map[key]) map[key].push(k);
    });
    return map;
  }, [filteredKots]);

  const timeStr = clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = clock.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const totalActive = stats.pending + stats.preparing + stats.ready;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020617', color: '#e2e8f0', overflow: 'hidden' }}>
      <style>{`
        @keyframes urgentPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3), 0 8px 32px rgba(0,0,0,0.5); }
          50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0), 0 8px 32px rgba(0,0,0,0.5); }
        }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        .kds-btn:hover { opacity: 0.8; }
        .kds-station:hover { opacity: 0.85; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* ═══ TOP BAR ═══ */}
      <div style={{
        flexShrink: 0,
        background: '#060d1a',
        borderBottom: '2px solid rgba(255,255,255,0.06)',
        padding: '0 24px',
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* left: branding + clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ChefHat size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: '#f1f5f9', lineHeight: 1.1 }}>
                Kitchen Display
              </div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>
                {totalActive > 0 ? `${totalActive} active order${totalActive > 1 ? 's' : ''}` : 'No active orders'}
              </div>
            </div>
          </div>

          {/* clock */}
          <div style={{
            fontFamily: 'monospace', textAlign: 'right',
            background: '#0f172a', borderRadius: 8,
            padding: '5px 14px', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.05em', lineHeight: 1.1 }}>
              {timeStr}
            </div>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{dateStr}</div>
          </div>
        </div>

        {/* center: stat counters */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { n: stats.pending,   label: 'NEW',     accent: '#818cf8', bg: 'rgba(99,102,241,0.12)'  },
            { n: stats.preparing, label: 'COOKING', accent: '#fb923c', bg: 'rgba(249,115,22,0.12)'  },
            { n: stats.ready,     label: 'READY',   accent: '#4ade80', bg: 'rgba(34,197,94,0.12)'   },
            { n: stats.served,    label: 'SERVED',  accent: '#64748b', bg: 'rgba(71,85,105,0.15)'   },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: 10,
              padding: '6px 16px', textAlign: 'center',
              border: `1px solid ${s.accent}25`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.accent, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 10, color: s.accent, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* right: controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="kds-btn" onClick={() => setSoundEnabled(v => !v)} style={{
            padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: soundEnabled ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
            color: soundEnabled ? '#818cf8' : '#475569',
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundEnabled ? 'Sound On' : 'Muted'}
          </button>

          <button className="kds-btn" onClick={() => setShowCompleted(v => !v)} style={{
            padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: showCompleted ? 'rgba(100,116,139,0.15)' : 'rgba(255,255,255,0.04)',
            color: showCompleted ? '#94a3b8' : '#475569',
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <CheckCircle2 size={14} />
            {showCompleted ? 'Hide Done' : 'Show Done'}
          </button>

          <button className="kds-btn" onClick={() => setConfirmClear('completed')} style={{
            padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(239,68,68,0.1)', color: '#f87171',
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Trash2 size={14} /> Clear Done
          </button>

          <button className="kds-btn" onClick={() => queryClient.invalidateQueries({ queryKey: ['kds-kots'] })} style={{
            padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', color: '#475569',
          }} title="Refresh">
            <RefreshCw size={14} />
          </button>

          <button className="kds-btn" onClick={toggleFullscreen} style={{
            padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', color: '#475569',
          }} title="Fullscreen">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* ═══ STATION TABS ═══ */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 6, padding: '10px 24px',
        background: '#040a15', borderBottom: '1px solid rgba(255,255,255,0.04)',
        overflowX: 'auto',
      }}>
        {STATIONS.map(s => {
          const Icon   = s.icon;
          const active = activeStation === s.id;
          return (
            <button
              key={s.id}
              className="kds-station"
              onClick={() => setActiveStation(s.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 16px', borderRadius: 9, cursor: 'pointer',
                border: `1.5px solid ${active ? s.color : 'rgba(255,255,255,0.07)'}`,
                background: active ? s.color + '1a' : 'transparent',
                color: active ? s.color : '#475569',
                fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ═══ KANBAN BOARD ═══ */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#475569' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 16 }}>Loading orders…</span>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 0, overflow: 'hidden',
        }}>
          {COLUMNS.map((col, colIdx) => {
            const colKots = kotsByStatus[col.status] || [];
            const isEmpty = colKots.length === 0;
            return (
              <div key={col.status} style={{
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                borderRight: colIdx < COLUMNS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                {/* column header */}
                <div style={{
                  flexShrink: 0, padding: '12px 16px',
                  background: col.bg,
                  borderBottom: `2px solid ${col.accent}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{col.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: col.accent, letterSpacing: '0.08em' }}>
                      {col.label}
                    </span>
                  </div>
                  <span style={{
                    minWidth: 30, height: 30, borderRadius: 8,
                    background: col.accent, color: '#fff',
                    fontWeight: 900, fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 8px',
                  }}>
                    {colKots.length}
                  </span>
                </div>

                {/* cards */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 20px' }}>
                  {isEmpty ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', height: '100%', gap: 10, paddingTop: 60,
                    }}>
                      <UtensilsCrossed size={36} color={col.accent + '30'} />
                      <p style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>No {col.label.toLowerCase()} orders</p>
                    </div>
                  ) : colKots.map(kot => (
                    <KOTCard
                      key={kot.id}
                      kot={kot}
                      onBump={handleBump}
                      onItemReady={handleItemReady}
                      bumpLoading={bumpMutation.isPending}
                      colAccent={col.accent}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ CONFIRM CLEAR MODAL ═══ */}
      {confirmClear && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: '32px 36px', width: 380, textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
            }}>
              <Trash2 size={24} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', marginBottom: 10 }}>
              {confirmClear === 'all' ? 'Clear All Orders?' : 'Clear Served Orders?'}
            </h3>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 26, lineHeight: 1.6 }}>
              {confirmClear === 'all'
                ? 'All cooking & ready orders will be marked as served and cleared.'
                : `${stats.served} served order${stats.served !== 1 ? 's' : ''} will be dismissed from this display.`}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmClear(null)}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #1e293b',
                  background: 'transparent', color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => clearMutation.mutate({ type: confirmClear, kots: allKots })}
                disabled={clearMutation.isPending}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  opacity: clearMutation.isPending ? 0.6 : 1,
                }}
              >
                {clearMutation.isPending ? 'Clearing…' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
