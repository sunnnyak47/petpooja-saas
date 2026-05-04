import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import { useTheme } from '../themes/ThemeContext';
import toast from 'react-hot-toast';
import {
  ChefHat, Flame, CheckCircle2, RefreshCw,
  Volume2, VolumeX, Maximize2, Timer, Utensils, Coffee,
  IceCream, Package, Eye, AlertCircle, X, Trash2,
  Loader2, UtensilsCrossed, Clock, ArrowRight,
} from 'lucide-react';

/* ─── stations ─── */
const STATIONS = [
  { id: 'ALL',     label: 'All',     icon: Eye      },
  { id: 'KITCHEN', label: 'Kitchen', icon: Utensils },
  { id: 'BAR',     label: 'Bar',     icon: Coffee   },
  { id: 'DESSERT', label: 'Dessert', icon: IceCream },
  { id: 'PACKING', label: 'Packing', icon: Package  },
];

const COLUMNS = [
  { status: 'pending',   label: 'NEW',     emoji: '🆕', accent: 'var(--accent)',   accentHex: '#6366f1', darkBg: 'rgba(99,102,241,0.10)',   lightBg: 'rgba(99,102,241,0.05)',  border: 'rgba(99,102,241,0.2)' },
  { status: 'preparing', label: 'COOKING', emoji: '🔥', accent: 'var(--warning)',  accentHex: '#f97316', darkBg: 'rgba(249,115,22,0.10)',   lightBg: 'rgba(249,115,22,0.05)', border: 'rgba(249,115,22,0.2)'  },
  { status: 'ready',     label: 'READY',   emoji: '✅', accent: 'var(--success)',  accentHex: '#22c55e', darkBg: 'rgba(34,197,94,0.10)',    lightBg: 'rgba(34,197,94,0.05)',  border: 'rgba(34,197,94,0.2)'   },
];

/* ─── elapsed time ─── */
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
function KOTCard({ kot, onBump, onItemReady, bumpLoading, colAccent, colAccentHex, isDark }) {
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

  const borderColor = isUrgent ? 'var(--danger)' : colAccent;
  const borderHex   = isUrgent ? '#ef4444' : colAccentHex;

  const timerBg    = isUrgent ? 'var(--danger)' : isWarn ? 'var(--warning)' : 'var(--bg-hover)';
  const timerColor = (isUrgent || isWarn) ? '#fff' : 'var(--text-secondary)';

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 14,
      border: `1px solid var(--border)`,
      borderLeft: `5px solid ${borderHex}`,
      overflow: 'hidden',
      boxShadow: isUrgent
        ? `0 0 0 2px rgba(239,68,68,0.2), 0 4px 20px rgba(0,0,0,0.12)`
        : `0 2px 8px rgba(0,0,0,0.06)`,
      animation: isUrgent ? 'urgentPulse 2s ease-in-out infinite' : undefined,
      display: 'flex', flexDirection: 'column',
      marginBottom: 12,
    }}>

      {/* header */}
      <div style={{
        padding: '11px 15px', background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        borderBottom: `1px solid var(--border)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: 17, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
            KOT #{kot.kot_number || kot.id?.slice(-5).toUpperCase()}
          </span>
          {kot.is_rush && <Flame size={15} color="var(--danger)" />}
        </div>
        <span style={{
          fontFamily: 'monospace', fontWeight: 800, fontSize: 14,
          padding: '4px 10px', borderRadius: 8,
          background: timerBg, color: timerColor,
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        }}>
          <Clock size={11} />
          {fmtElapsed(totalSecs)}{isUrgent && ' ⚠'}
        </span>
      </div>

      {/* order meta */}
      <div style={{
        padding: '7px 15px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        borderBottom: `1px solid var(--border)`,
        background: 'var(--bg-hover)',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', color: borderHex,
          background: `${borderHex}18`, padding: '3px 9px', borderRadius: 5,
        }}>{orderType}</span>
        {kot.order?.order_number && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Order <strong style={{ color: 'var(--text-primary)' }}>#{kot.order.order_number}</strong>
          </span>
        )}
        {kot.order?.covers > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>👥 {kot.order.covers} pax</span>
        )}
      </div>

      {/* items */}
      <div style={{ flex: 1, padding: '11px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No items</p>
        ) : items.map((item, idx) => {
          const itemName = item.name ?? item.order_item?.name ?? item.menu_item?.name ?? item.item_name ?? `Item ${idx + 1}`;
          const variantName = item.variant_name ?? item.order_item?.variant_name;
          const qty      = item.quantity ?? item.order_item?.quantity ?? item.qty ?? 1;
          const done     = item.is_ready ?? item.status === 'ready';
          const addons   = item.addons ?? item.order_item?.addons ?? [];
          const note     = item.special_note ?? item.order_item?.notes;
          return (
            <div key={item.id ?? idx} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              background: done ? 'rgba(34,197,94,0.05)' : 'var(--bg-hover)',
              border: `1px solid ${done ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
            }}>
              <button
                onClick={() => onItemReady?.(kot.id, item.id)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  border: `2px solid ${done ? '#22c55e' : 'var(--border)'}`,
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
                    fontSize: 15, fontWeight: 700, lineHeight: 1.3,
                    color: done ? 'var(--text-secondary)' : 'var(--text-primary)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {itemName}
                    {variantName && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, marginLeft: 5 }}>
                        ({variantName})
                      </span>
                    )}
                  </span>
                  <span style={{
                    fontSize: 20, fontWeight: 900, flexShrink: 0,
                    color: done ? 'var(--text-secondary)' : borderHex,
                  }}>×{qty}</span>
                </div>
                {addons.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                    + {addons.map(a => a.name).join(', ')}
                  </p>
                )}
                {note && (
                  <p style={{ fontSize: 11, color: 'var(--warning)', marginTop: 3 }}>📝 {note}</p>
                )}
              </div>
            </div>
          );
        })}

        {(kot.order?.special_instructions || kot.notes) && (
          <div style={{
            marginTop: 2, padding: '8px 12px', borderRadius: 8, fontSize: 12,
            color: 'var(--warning)', lineHeight: 1.5,
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.18)',
          }}>
            📝 {kot.order?.special_instructions || kot.notes}
          </div>
        )}

        {allReady && kot.status === 'preparing' && (
          <div style={{
            fontSize: 12, color: 'var(--success)', fontWeight: 700, textAlign: 'center', padding: '6px 0',
            background: 'rgba(34,197,94,0.06)', borderRadius: 6,
          }}>✅ All items ready — tap Mark Ready</div>
        )}
      </div>

      {/* action */}
      <div style={{ padding: '11px 15px', borderTop: `1px solid var(--border)` }}>
        {kot.status === 'pending' && (
          <button onClick={() => onBump?.(kot.id, 'preparing')} disabled={bumpLoading} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: 'var(--accent)',
            color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: bumpLoading ? 0.6 : 1, letterSpacing: '0.03em',
          }}>🔥 START COOKING</button>
        )}
        {kot.status === 'preparing' && (
          <button onClick={() => onBump?.(kot.id, 'ready')} disabled={bumpLoading} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
            background: 'var(--success)',
            color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: bumpLoading ? 0.6 : 1, letterSpacing: '0.03em',
          }}>✅ MARK READY</button>
        )}
        {kot.status === 'ready' && (
          <button onClick={() => onBump?.(kot.id, 'served')} disabled={bumpLoading} style={{
            width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            fontWeight: 700, fontSize: 14,
            border: `1px solid var(--border)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: bumpLoading ? 0.6 : 1,
          }}>
            <ArrowRight size={16} /> SERVED / PICKED UP
          </button>
        )}
        {kot.status === 'served' && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, padding: '4px 0' }}>
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
  const { isDark }  = useTheme();

  const [activeStation, setActiveStation] = useState('ALL');
  const [soundEnabled,  setSoundEnabled]  = useState(true);
  const soundEnabledRef = useRef(soundEnabled);
  const [showCompleted, setShowCompleted] = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(null);
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
         .then(r => { const raw = r.data?.data ?? r.data ?? r; return Array.isArray(raw) ? raw : []; }),
    enabled:  !!outletId,
    refetchInterval: 12000,
  });

  /* ── socket ── */
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
    socket.on('kot_complete', refresh);
    socket.on('order_cancelled', (data) => {
      refresh();
      toast((t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#dc2626', color: '#fff', padding: '12px 16px', borderRadius: 12, fontWeight: 700 }}>
          <AlertCircle size={20} />
          <div>
            <p style={{ fontSize: 15 }}>ORDER CANCELLED: #{data.order_number}</p>
            {data.reason && <p style={{ fontSize: 11, opacity: 0.8 }}>Reason: {data.reason}</p>}
          </div>
          <button onClick={() => toast.dismiss(t.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 8 }}><X size={16} /></button>
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
        ? ['preparing', 'ready', 'served'].includes(k.status) : k.status === 'served');
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
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); }
    else { document.exitFullscreen(); }
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

  // all colors via CSS variables — no hardcoded hex

  const timeStr = clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = clock.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const totalActive = stats.pending + stats.preparing + stats.ready;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', color: 'var(--text-primary)', overflow: 'hidden' }}>
      <style>{`
        @keyframes urgentPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
          50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        .kds-btn { transition: opacity 0.15s; }
        .kds-btn:hover { opacity: 0.7 !important; }
        .kds-station { transition: all 0.15s; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.2); border-radius: 2px; }
      `}</style>

      {/* ═══ TOP BAR ═══ */}
      <div style={{
        flexShrink: 0, background: 'var(--bg-card)',
        borderBottom: `1px solid var(--border)`,
        padding: '0 24px', height: 62,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
      }}>
        {/* left: branding + clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ChefHat size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.1 }}>Kitchen Display</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {totalActive > 0 ? `${totalActive} active order${totalActive > 1 ? 's' : ''}` : 'No active orders'}
              </div>
            </div>
          </div>

          {/* clock */}
          <div style={{
            fontFamily: 'monospace', textAlign: 'right',
            background: 'var(--bg-secondary)', borderRadius: 8, padding: '5px 14px',
            border: `1px solid var(--border)`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.04em', lineHeight: 1.1 }}>{timeStr}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>{dateStr}</div>
          </div>
        </div>

        {/* center: stat counters — semantic colors (pending/cooking/ready/served) */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { n: stats.pending,   label: 'NEW',     css: 'var(--accent)',   alphaBg: 'color-mix(in srgb, var(--accent) 10%, transparent)' },
            { n: stats.preparing, label: 'COOKING', css: 'var(--warning)',  alphaBg: 'color-mix(in srgb, var(--warning) 10%, transparent)' },
            { n: stats.ready,     label: 'READY',   css: 'var(--success)',  alphaBg: 'color-mix(in srgb, var(--success) 10%, transparent)' },
            { n: stats.served,    label: 'SERVED',  css: 'var(--text-secondary)', alphaBg: 'var(--bg-hover)' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.alphaBg, borderRadius: 10, padding: '6px 16px', textAlign: 'center',
              border: `1px solid var(--border)`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.css, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 10, color: s.css, fontWeight: 700, letterSpacing: '0.07em', opacity: 0.8 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* right: controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="kds-btn" onClick={() => setSoundEnabled(v => !v)} style={{
            padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: soundEnabled ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-hover)',
            color: soundEnabled ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundEnabled ? 'Sound On' : 'Muted'}
          </button>

          <button className="kds-btn" onClick={() => setShowCompleted(v => !v)} style={{
            padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: showCompleted ? 'var(--bg-secondary)' : 'var(--bg-hover)',
            color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <CheckCircle2 size={14} />
            {showCompleted ? 'Hide Done' : 'Show Done'}
          </button>

          <button className="kds-btn" onClick={() => setConfirmClear('completed')} style={{
            padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--bg-hover)',
            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <Trash2 size={14} /> Clear Done
          </button>

          <button className="kds-btn" onClick={() => queryClient.invalidateQueries({ queryKey: ['kds-kots'] })} style={{
            padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--bg-hover)', color: 'var(--text-secondary)',
          }} title="Refresh">
            <RefreshCw size={14} />
          </button>

          <button className="kds-btn" onClick={toggleFullscreen} style={{
            padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--bg-hover)', color: 'var(--text-secondary)',
          }} title="Fullscreen">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* ═══ STATION TABS ═══ */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 6, padding: '10px 24px',
        background: 'var(--bg-secondary)', borderBottom: `1px solid var(--border)`, overflowX: 'auto',
      }}>
        {STATIONS.map(s => {
          const Icon   = s.icon;
          const active = activeStation === s.id;
          return (
            <button key={s.id} className="kds-station" onClick={() => setActiveStation(s.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '7px 16px', borderRadius: 9, cursor: 'pointer',
              border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
            }}>
              <Icon size={14} /> {s.label}
            </button>
          );
        })}
      </div>

      {/* ═══ KANBAN BOARD ═══ */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-secondary)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>Loading orders…</span>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 0, overflow: 'hidden',
        }}>
          {COLUMNS.map((col, colIdx) => {
            const colKots = kotsByStatus[col.status] || [];
            return (
              <div key={col.status} style={{
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                borderRight: colIdx < COLUMNS.length - 1 ? `1px solid var(--border)` : 'none',
                background: 'var(--bg-secondary)',
              }}>
                {/* column header */}
                <div style={{
                  flexShrink: 0, padding: '12px 16px',
                  background: 'var(--bg-card)',
                  borderBottom: `2px solid ${col.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{col.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: col.accent, letterSpacing: '0.07em' }}>
                      {col.label}
                    </span>
                  </div>
                  <span style={{
                    minWidth: 28, height: 28, borderRadius: 8,
                    background: col.accent, color: '#fff',
                    fontWeight: 900, fontSize: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px',
                  }}>
                    {colKots.length}
                  </span>
                </div>

                {/* cards */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 20px' }}>
                  {colKots.length === 0 ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', height: '100%', gap: 10, paddingTop: 60,
                    }}>
                      <UtensilsCrossed size={36} color="var(--border)" />
                      <p style={{ fontSize: 13, color: 'var(--border)', fontWeight: 600 }}>
                        No {col.label.toLowerCase()} orders
                      </p>
                    </div>
                  ) : colKots.map(kot => (
                    <KOTCard
                      key={kot.id}
                      kot={kot}
                      onBump={handleBump}
                      onItemReady={handleItemReady}
                      bumpLoading={bumpMutation.isPending}
                      colAccent={col.accent}
                      colAccentHex={col.accentHex}
                      isDark={isDark}
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
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)', border: `1px solid var(--border)`,
            borderRadius: 16, padding: '32px 36px', width: 380, textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
            }}>
              <Trash2 size={24} color="var(--danger)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
              {confirmClear === 'all' ? 'Clear All Orders?' : 'Clear Served Orders?'}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 26, lineHeight: 1.6 }}>
              {confirmClear === 'all'
                ? 'All cooking & ready orders will be marked as served and cleared.'
                : `${stats.served} served order${stats.served !== 1 ? 's' : ''} will be dismissed from this display.`}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClear(null)} style={{
                flex: 1, padding: '12px 0', borderRadius: 10,
                border: `1px solid var(--border)`,
                background: 'transparent', color: 'var(--text-secondary)',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={() => clearMutation.mutate({ type: confirmClear, kots: allKots })}
                disabled={clearMutation.isPending}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                  background: 'var(--danger)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
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
