import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useCurrency } from '../hooks/useCurrency';
import toast from 'react-hot-toast';
import {
  ChefHat, Flame, CheckCircle2, RefreshCw,
  Volume2, VolumeX, Maximize2, Utensils, Coffee,
  IceCream, Package, Eye, AlertCircle, X, Trash2,
  Loader2, Clock, ArrowRight, Bike, ShoppingBag,
} from 'lucide-react';

/* ─── palette — uses CSS vars so light/dark theme is respected ─── */
const P = {
  bg:        'var(--bg-secondary)',
  surface:   'var(--bg-secondary)',
  card:      'var(--bg-card)',
  cardHover: 'var(--bg-hover)',
  border:    'var(--border)',
  borderMid: 'var(--border)',

  new:     '#818cf8',
  newBg:   'rgba(129,140,248,0.08)',
  newBdr:  'rgba(129,140,248,0.22)',

  cook:    '#f97316',
  cookBg:  'rgba(249,115,22,0.08)',
  cookBdr: 'rgba(249,115,22,0.22)',

  ready:   '#22c55e',
  readyBg: 'rgba(34,197,94,0.08)',
  readyBdr:'rgba(34,197,94,0.22)',

  urgent:  '#ef4444',
  warn:    '#f59e0b',
  muted:   'var(--text-secondary)',
  sub:     'var(--text-secondary)',
  text:    'var(--text-primary)',
  white:   'var(--text-primary)',
};

/* ─── stations ─── */
const STATIONS = [
  { id: 'ALL',     label: 'All',     Icon: Eye      },
  { id: 'KITCHEN', label: 'Kitchen', Icon: Utensils },
  { id: 'BAR',     label: 'Bar',     Icon: Coffee   },
  { id: 'DESSERT', label: 'Dessert', Icon: IceCream },
  { id: 'PACKING', label: 'Packing', Icon: Package  },
];

const COLUMNS = [
  { status: 'pending',   label: 'NEW',     dot: P.new,   bg: P.newBg,   bdr: P.newBdr,   btnColor: P.new,   btnLabel: 'Start Cooking' },
  { status: 'preparing', label: 'COOKING', dot: P.cook,  bg: P.cookBg,  bdr: P.cookBdr,  btnColor: P.ready, btnLabel: 'Mark Ready'    },
  { status: 'ready',     label: 'READY',   dot: P.ready, bg: P.readyBg, bdr: P.readyBdr, btnColor: P.muted, btnLabel: 'Served'        },
];

/* ─── elapsed timer hook ─── */
function useElapsed(createdAt) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!createdAt) return;
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  return secs;
}

function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

/* ─── KOT card ─── */
function KOTCard({ kot, col, onBump, onItemReady, loading }) {
  const secs    = useElapsed(kot.created_at);
  const mins    = Math.floor(secs / 60);
  const urgent  = mins >= 15;
  const warn    = mins >= 8 && !urgent;

  const items   = kot.items ?? kot.kot_items ?? [];
  // Per-item ready is tracked on KOTItem.status === 'ready' (no is_ready column).
  const allDone = items.length > 0 && items.every(i => i.is_ready ?? i.status === 'ready');

  const tableNum  = kot.order?.table?.table_number;
  const orderType = kot.order?.order_type === 'takeaway' ? 'Takeaway'
                  : kot.order?.order_type === 'delivery' ? 'Delivery'
                  : tableNum ? `Table ${tableNum}` : 'Dine In';

  const OrderIcon = kot.order?.order_type === 'delivery' ? Bike
                  : kot.order?.order_type === 'takeaway' ? ShoppingBag
                  : Utensils;

  const timerColor = urgent ? P.urgent : warn ? P.warn : P.muted;
  const timerBg    = urgent ? 'rgba(239,68,68,0.14)' : warn ? 'rgba(245,158,11,0.12)' : 'var(--bg-hover)';
  const leftBorder = urgent ? P.urgent : col.dot;

  return (
    <div style={{
      background: P.card,
      borderRadius: 12,
      border: `1px solid ${P.border}`,
      borderLeft: `4px solid ${leftBorder}`,
      display: 'flex', flexDirection: 'column',
      marginBottom: 10,
      overflow: 'hidden',
      boxShadow: urgent
        ? `0 0 0 1px rgba(239,68,68,0.18), 0 4px 24px rgba(0,0,0,0.35)`
        : '0 2px 12px rgba(0,0,0,0.28)',
      animation: urgent ? 'urgentPulse 2.2s ease-in-out infinite' : undefined,
      transition: 'box-shadow 0.2s',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '11px 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        borderBottom: `1px solid ${P.border}`,
        background: 'var(--bg-secondary)',
      }}>
        {/* KOT number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace',
            fontSize: 13, fontWeight: 700, color: P.text,
            letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {kot.kot_number || `KOT-${kot.id?.slice(-6).toUpperCase()}`}
          </span>
        </div>

        {/* Timer chip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 9px', borderRadius: 6,
          background: timerBg,
          flexShrink: 0,
        }}>
          <Clock size={11} color={timerColor} strokeWidth={2.5} />
          <span style={{
            fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace',
            fontSize: 13, fontWeight: 800, color: timerColor,
            letterSpacing: '0.04em',
            fontFeatureSettings: '"tnum"',
          }}>{fmtTime(secs)}</span>
          {urgent && <AlertCircle size={11} color={P.urgent} strokeWidth={2.5} />}
        </div>
      </div>

      {/* ── Order meta strip ── */}
      <div style={{
        padding: '7px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${P.border}`,
        background: 'var(--bg-hover)',
      }}>
        {/* Type badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 8px', borderRadius: 5,
          background: col.bg, border: `1px solid ${col.bdr}`,
          flexShrink: 0,
        }}>
          <OrderIcon size={11} color={col.dot} strokeWidth={2.5} />
          <span style={{ fontSize: 11, fontWeight: 700, color: col.dot, letterSpacing: '0.05em' }}>
            {orderType.toUpperCase()}
          </span>
        </div>

        {kot.order?.order_number && (
          <span style={{ fontSize: 11, color: P.muted, fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace' }}>
            #{kot.order.order_number}
          </span>
        )}
      </div>

      {/* ── Items ── */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 12, color: P.muted, fontStyle: 'italic', padding: '4px 2px' }}>No items</p>
        ) : items.map((item, idx) => {
          const name    = item.name ?? item.order_item?.name ?? item.item_name ?? `Item ${idx + 1}`;
          const variant = item.variant_name ?? item.order_item?.variant_name;
          const qty     = item.quantity ?? item.order_item?.quantity ?? item.qty ?? 1;
          const done    = item.is_ready ?? item.status === 'ready';
          const addons  = item.addons ?? item.order_item?.addons ?? [];
          const note    = item.special_note ?? item.order_item?.notes;

          return (
            <div key={item.id ?? idx} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 10px', borderRadius: 8,
              background: done ? 'rgba(34,197,94,0.06)' : 'var(--bg-hover)',
              border: `1px solid ${done ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
              transition: 'background 0.2s',
            }}>
              {/* Checkbox — once ready it's irreversible (no un-ready endpoint), so no-op */}
              <button
                onClick={() => { if (!done) onItemReady?.(kot.id, item.id); }}
                disabled={done}
                aria-pressed={done}
                style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                  border: `2px solid ${done ? P.ready : 'var(--border)'}`,
                  background: done ? P.ready : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: done ? 'default' : 'pointer', padding: 0, transition: 'all 0.15s',
                }}
              >
                {done && <CheckCircle2 size={13} color="#fff" strokeWidth={3} />}
              </button>

              {/* Item info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 600, lineHeight: 1.35,
                    color: done ? P.muted : P.text,
                    textDecoration: done ? 'line-through' : 'none',
                    textDecorationColor: 'var(--border)',
                  }}>
                    {name}
                    {variant && (
                      <span style={{ fontSize: 11, color: P.muted, fontWeight: 400, marginLeft: 5 }}>
                        · {variant}
                      </span>
                    )}
                  </span>
                  {/* Quantity — large, bold, right-aligned */}
                  <span style={{
                    fontSize: 18, fontWeight: 900, flexShrink: 0,
                    color: done ? P.muted : col.dot,
                    fontFeatureSettings: '"tnum"',
                    lineHeight: 1,
                  }}>×{qty}</span>
                </div>

                {addons.length > 0 && (
                  <p style={{ fontSize: 11, color: P.muted, marginTop: 3, lineHeight: 1.4 }}>
                    + {addons.map(a => a.name).join(', ')}
                  </p>
                )}
                {note && (
                  <div style={{
                    marginTop: 4, padding: '3px 7px', borderRadius: 4,
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                    fontSize: 11, color: P.warn, lineHeight: 1.4,
                  }}>
                    Note: {note}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Order-level note (Order.notes) */}
        {(kot.order?.notes || kot.notes) && (
          <div style={{
            padding: '7px 10px', borderRadius: 7, marginTop: 2,
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.18)',
            fontSize: 11.5, color: P.warn, lineHeight: 1.5,
          }}>
            <span style={{ fontWeight: 700 }}>Note: </span>
            {kot.order?.notes || kot.notes}
          </div>
        )}

        {/* All-ready nudge */}
        {allDone && kot.status === 'preparing' && (
          <div style={{
            padding: '5px 10px', borderRadius: 6, textAlign: 'center',
            background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)',
            fontSize: 11, fontWeight: 700, color: P.ready,
          }}>
            All items ready — mark as done
          </div>
        )}
      </div>

      {/* ── Action button ── */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${P.border}` }}>
        {kot.status === 'pending' && (
          <button
            onClick={() => onBump(kot.id, 'preparing')}
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
              background: 'var(--accent)',
              color: '#fff', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.04em', cursor: 'pointer', opacity: loading ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              boxShadow: 'none',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <Flame size={14} strokeWidth={2.5} /> START COOKING
          </button>
        )}
        {kot.status === 'preparing' && (
          <button
            onClick={() => onBump(kot.id, 'ready')}
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
              background: '#16a34a',
              color: '#fff', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.04em', cursor: 'pointer', opacity: loading ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              boxShadow: 'none',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <CheckCircle2 size={14} strokeWidth={2.5} /> MARK READY
          </button>
        )}
        {kot.status === 'ready' && (
          <button
            onClick={() => onBump(kot.id, 'served')}
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-hover)',
              color: P.sub, fontWeight: 600, fontSize: 13,
              letterSpacing: '0.03em', cursor: 'pointer', opacity: loading ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'opacity 0.15s, background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          >
            <ArrowRight size={14} strokeWidth={2} /> SERVED / PICKED UP
          </button>
        )}
        {(kot.status === 'served' || kot.status === 'completed') && (
          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: P.muted, padding: '2px 0' }}>
            Completed
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── empty column ─── */
function EmptyColumn({ col }) {
  const msgs = {
    pending:   { title: 'Queue clear',         sub: 'New tickets will appear here' },
    preparing: { title: 'Nothing on the line',  sub: 'Mark items as you finish cooking' },
    ready:     { title: 'Pass window empty',    sub: 'Servers pick up from here' },
  };
  const m = msgs[col.status] || { title: '', sub: '' };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 12, paddingTop: 64, textAlign: 'center',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 12,
        background: col.bg, border: `1px solid ${col.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckCircle2 size={24} color={col.dot} strokeWidth={1.8} />
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>{m.title}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', opacity: 0.6, marginTop: 5, maxWidth: 180 }}>{m.sub}</p>
      </div>
    </div>
  );
}

/* ─── main ─── */
export default function KitchenDisplayPage() {
  const { user }    = useSelector(s => s.auth);
  const { locale }  = useCurrency();
  const outletId    = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();
  const isOnline    = useOnlineStatus();

  const [activeStation, setActiveStation] = useState('ALL');
  const [soundEnabled,  setSoundEnabled]  = useState(true);
  const soundRef = useRef(soundEnabled);
  const [showCompleted, setShowCompleted] = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(null);
  const [clock,         setClock]         = useState(new Date());

  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── KOTs ── */
  const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;
  const { data: kots, isLoading } = useQuery({
    queryKey: ['kds-kots', outletId, activeStation, showCompleted, isOnline],
    queryFn: async () => {
      if (IS_ELECTRON && !isOnline) {
        try { const r = await window.electron.invoke('db-get-kots-for-order', null); return Array.isArray(r) ? r : []; }
        catch { return []; }
      }
      const r = await api.get(`/kitchen/kots?outlet_id=${outletId}${activeStation !== 'ALL' ? `&station=${activeStation}` : ''}${showCompleted ? '&show_completed=true' : ''}`);
      const raw = r.data?.data ?? r.data ?? r;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!outletId,
    refetchInterval: isOnline ? 12000 : false,
    staleTime: isOnline ? 5000 : Infinity,
  });

  /* ── socket ── */
  const [socketOk, setSocketOk] = useState(true);
  useEffect(() => {
    if (!outletId || !isOnline) { setSocketOk(false); return; }
    const socket = io(`${SOCKET_URL}/kitchen`, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
    socket.on('connect',    () => { setSocketOk(true); socket.emit('join_outlet', outletId); });
    socket.on('disconnect', ()  => { setSocketOk(false); refresh(); });
    socket.io.on('reconnect', () => { setSocketOk(true); refresh(); });
    const hb = setInterval(() => socket.connected && socket.emit('ping_keepalive'), 20000);
    socket.on('new_kot', () => {
      refresh();
      if (soundRef.current) { try { new Audio('/notification.mp3').play().catch(() => {}); } catch {} }
    });
    socket.on('kot_item_ready', refresh);
    socket.on('kot_complete',   refresh);
    socket.on('order_cancelled', (data) => {
      refresh();
      toast((t) => (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#7f1d1d', borderRadius:10, border:'1px solid #ef4444', color:'#fca5a5', fontWeight:600 }}>
          <AlertCircle size={18} style={{ flexShrink:0, color:'#ef4444' }} />
          <div>
            <p style={{ fontSize:14, fontWeight:800, color:'#fff', margin:0 }}>Order Cancelled</p>
            <p style={{ fontSize:12, margin:'2px 0 0', opacity:0.8 }}>#{data.order_number}{data.reason ? ` — ${data.reason}` : ''}</p>
          </div>
          <button onClick={() => toast.dismiss(t.id)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', marginLeft:4, padding:2 }}><X size={14}/></button>
        </div>
      ), { duration: 10000, position: 'top-center', style: { padding: 0, background: 'transparent', boxShadow: 'none' } });
      if (soundRef.current) { try { new Audio('/cancel_alert.mp3').play().catch(() => {}); } catch {} }
    });
    return () => { clearInterval(hb); socket.disconnect(); };
  }, [outletId, queryClient, isOnline]);

  /* ── mutations ── */
  const apiStatus = s => s === 'served' ? 'completed' : s;
  // Optimistic bump: the ticket jumps to its new column INSTANTLY (column placement is a
  // pure function of kot.status), then we reconcile with the server in the background — no
  // waiting on the PUT round-trip + a full refetch. Roll back to the snapshot on error.
  // Write the UI value ('preparing'|'ready'|'served') into the cache; the board buckets
  // 'served' and coalesces server 'completed'->'served', so this lands in the right column.
  const bumpMut = useMutation({
    mutationFn: ({ kotId, status }) => api.put(`/kitchen/kots/${kotId}/status`, { status: apiStatus(status), outlet_id: outletId }),
    onMutate: async ({ kotId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['kds-kots'] });
      const prev = queryClient.getQueriesData({ queryKey: ['kds-kots'] });   // snapshot every station/filter variant
      queryClient.setQueriesData({ queryKey: ['kds-kots'] }, (old) =>
        Array.isArray(old) ? old.map(k => (k.id === kotId ? { ...k, status } : k)) : old
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(e.message || 'Failed');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] }),
  });
  const itemReadyMut = useMutation({
    mutationFn: ({ kotId, itemId }) => api.put(`/kitchen/kots/${kotId}/items/${itemId}/ready`, { outlet_id: outletId }),
    onMutate: async ({ kotId, itemId }) => {
      await queryClient.cancelQueries({ queryKey: ['kds-kots'] });
      const prev = queryClient.getQueriesData({ queryKey: ['kds-kots'] });
      const markReady = (arr) => (Array.isArray(arr) ? arr.map(i => (i.id === itemId ? { ...i, status: 'ready', is_ready: true } : i)) : arr);
      queryClient.setQueriesData({ queryKey: ['kds-kots'] }, (old) =>
        Array.isArray(old) ? old.map(k => (k.id === kotId ? { ...k, items: markReady(k.items), kot_items: markReady(k.kot_items) } : k)) : old
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(e.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['kds-kots'] }),
  });
  const clearMut = useMutation({
    mutationFn: async ({ type, kots }) => {
      if (type === 'all') {
        const toMark = kots.filter(k => ['preparing','ready','served'].includes(k.status));
        await Promise.all(toMark.map(k => api.put(`/kitchen/kots/${k.id}/status`, { status: 'completed', outlet_id: outletId })));
        return toMark.length;
      }
      // Served/completed tickets aren't in the default board query (it only
      // returns pending/preparing/ready), so fetch today's completed KOTs
      // directly to mark them — otherwise the clear silently no-ops while
      // still reporting success.
      const r = await api.get(`/kitchen/kots?outlet_id=${outletId}&show_completed=true`);
      const raw = r.data?.data ?? r.data ?? r;
      const loaded = Array.isArray(raw) ? raw : [];
      const toMark = loaded.filter(k => k.status === 'served' || k.status === 'completed');
      await Promise.all(toMark.map(k => api.put(`/kitchen/kots/${k.id}/status`, { status: 'completed', outlet_id: outletId })));
      return toMark.length;
    },
    onSuccess: (count, { type }) => {
      queryClient.invalidateQueries({ queryKey: ['kds-kots'] });
      if (type === 'all') {
        toast.success(count > 0 ? 'All orders cleared' : 'No active orders to clear');
      } else {
        toast.success(count > 0
          ? `${count} served order${count !== 1 ? 's' : ''} cleared`
          : 'No served orders to clear');
      }
      setConfirmClear(null);
    },
    onError: () => { toast.error('Clear failed'); setConfirmClear(null); },
  });

  const handleBump      = useCallback((kotId, status) => bumpMut.mutate({ kotId, status }), [bumpMut]);
  const handleItemReady = useCallback((kotId, itemId) => itemReadyMut.mutate({ kotId, itemId }), [itemReadyMut]);

  const allKots = kots ?? [];
  const filteredKots = useMemo(() =>
    showCompleted ? allKots : allKots.filter(k => k.status !== 'served' && k.status !== 'completed'),
    [allKots, showCompleted]);

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

  const totalActive = stats.pending + stats.preparing + stats.ready;
  const timeStr = clock.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = clock.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  /* ── icon button style helper ── */
  const iconBtn = (active, activeColor) => ({
    width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
    background: active ? `rgba(${activeColor},0.15)` : 'var(--bg-hover)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: P.bg, color: P.text, overflow: 'hidden' }}>
      <style>{`
        @keyframes urgentPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.25), 0 2px 12px rgba(0,0,0,0.28); }
          50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0), 0 2px 12px rgba(0,0,0,0.28); }
        }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      `}</style>

      {/* ══════════════════════ TOP BAR ══════════════════════ */}
      <div style={{
        flexShrink: 0,
        background: 'var(--bg-card)',
        borderBottom: `1px solid ${P.border}`,
        padding: '0 24px',
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
      }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'none',
          }}>
            <ChefHat size={18} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: P.white, letterSpacing: '-0.01em', lineHeight: 1 }}>
              Kitchen Display
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: socketOk ? '#10b981' : P.warn,
                boxShadow: socketOk ? '0 0 6px rgba(16,185,129,0.7)' : 'none',
              }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: P.muted, letterSpacing: '0.06em' }}>
                {totalActive > 0 ? `${totalActive} ACTIVE · LIVE` : 'ALL CAUGHT UP'}
              </span>
            </div>
          </div>
        </div>

        {/* Stat counters */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: 'var(--bg-secondary)',
          border: `1px solid var(--border)`,
          borderRadius: 10, overflow: 'hidden',
        }}>
          {[
            { label: 'NEW',     n: stats.pending,   color: P.new  },
            { label: 'COOKING', n: stats.preparing, color: P.cook },
            { label: 'READY',   n: stats.ready,     color: P.ready },
            { label: 'SERVED',  n: stats.served,    color: 'var(--text-secondary)' },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              padding: '10px 20px', textAlign: 'center', minWidth: 70,
              borderRight: i < arr.length - 1 ? `1px solid ${P.border}` : 'none',
            }}>
              <div style={{
                fontSize: 24, fontWeight: 900, lineHeight: 1,
                color: s.color, fontFeatureSettings: '"tnum"',
                letterSpacing: '-0.02em',
              }}>{s.n}</div>
              <div style={{
                fontSize: 9, fontWeight: 700, marginTop: 4,
                color: 'var(--text-secondary)', opacity: 0.7, letterSpacing: '0.12em',
              }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Clock + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: 'right', paddingRight: 12, borderRight: `1px solid ${P.border}` }}>
            <div style={{
              fontFamily: 'ui-monospace,"SF Mono",Menlo,monospace',
              fontSize: 20, fontWeight: 800, color: P.white,
              lineHeight: 1, fontFeatureSettings: '"tnum"',
              letterSpacing: '0.02em',
            }}>{timeStr}</div>
            <div style={{ fontSize: 10, color: P.muted, fontWeight: 600, marginTop: 3, letterSpacing: '0.04em' }}>{dateStr}</div>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button
              title={soundEnabled ? 'Mute' : 'Unmute'}
              onClick={() => setSoundEnabled(v => !v)}
              style={iconBtn(soundEnabled, '99,102,241')}
              onMouseEnter={e => e.currentTarget.style.background = soundEnabled ? 'rgba(99,102,241,0.25)' : 'var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background = soundEnabled ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)'}>
              {soundEnabled
                ? <Volume2 size={15} color="#a5b4fc" />
                : <VolumeX size={15} color="var(--text-secondary)" />}
            </button>

            <button
              title={showCompleted ? 'Hide completed' : 'Show completed'}
              onClick={() => setShowCompleted(v => !v)}
              style={iconBtn(showCompleted, '34,197,94')}
              onMouseEnter={e => e.currentTarget.style.background = showCompleted ? 'rgba(34,197,94,0.25)' : 'var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background = showCompleted ? 'rgba(34,197,94,0.15)' : 'var(--bg-hover)'}>
              <CheckCircle2 size={15} color={showCompleted ? '#4ade80' : 'var(--text-secondary)'} />
            </button>

            <button
              title="Refresh"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['kds-kots'] })}
              style={iconBtn(false, '255,255,255')}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}>
              <RefreshCw size={15} color="var(--text-secondary)" />
            </button>

            <button
              title="Clear served orders"
              onClick={() => setConfirmClear('completed')}
              style={iconBtn(false, '255,255,255')}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}>
              <Trash2 size={15} color="var(--text-secondary)" />
            </button>

            <button
              title="Fullscreen"
              onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}
              style={iconBtn(false, '255,255,255')}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}>
              <Maximize2 size={15} color="var(--text-secondary)" />
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════ RECONNECTING BANNER ══════════════════════ */}
      {!socketOk && isOnline && (
        <div style={{
          flexShrink: 0, padding: '7px 24px',
          background: 'rgba(245,158,11,0.1)', borderBottom: `1px solid rgba(245,158,11,0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 12, fontWeight: 600, color: P.warn,
        }}>
          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          Reconnecting to kitchen server — orders still updating via polling
        </div>
      )}

      {/* ══════════════════════ STATION BAR ══════════════════════ */}
      <div style={{
        flexShrink: 0, height: 48,
        background: P.surface,
        borderBottom: `1px solid ${P.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-secondary)', padding: '3px', borderRadius: 8, border: `1px solid var(--border)` }}>
          {STATIONS.map(({ id, label, Icon }) => {
            const active = activeStation === id;
            return (
              <button key={id} onClick={() => setActiveStation(id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? P.white : 'var(--text-secondary)',
                fontWeight: active ? 700 : 500, fontSize: 12, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                boxShadow: active ? `0 0 0 1px ${P.borderMid}` : 'none',
              }}>
                <Icon size={12} strokeWidth={2.2} /> {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: P.ready,
            boxShadow: '0 0 6px rgba(34,197,94,0.6)',
          }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
            Auto-refresh every 12s
          </span>
        </div>
      </div>

      {/* ══════════════════════ KANBAN BOARD ══════════════════════ */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, color: P.muted }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Loading orders…</span>
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          overflow: 'hidden',
        }}>
          {COLUMNS.map((col, colIdx) => {
            const colKots = kotsByStatus[col.status] || [];
            return (
              <div key={col.status} style={{
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                borderRight: colIdx < COLUMNS.length - 1 ? `1px solid ${P.border}` : 'none',
                background: colIdx === 1 ? P.surface : P.bg,
              }}>
                {/* Column header */}
                <div style={{
                  flexShrink: 0,
                  height: 52,
                  padding: '0 18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: colIdx === 1 ? P.surface : P.bg,
                  borderBottom: `1px solid ${P.border}`,
                  position: 'relative',
                }}>
                  {/* top accent line */}
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: col.dot, borderRadius: '0 0 2px 2px',
                  }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: col.dot,
                      boxShadow: `0 0 0 3px ${col.bdr}`,
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: P.text,
                    }}>{col.label}</span>
                  </div>

                  <div style={{
                    display: 'inline-flex', alignItems: 'baseline', gap: 4,
                    padding: '3px 10px', borderRadius: 6,
                    background: col.bg, border: `1px solid ${col.bdr}`,
                  }}>
                    <span style={{
                      fontSize: 15, fontWeight: 900, color: col.dot, lineHeight: 1,
                      fontFeatureSettings: '"tnum"',
                    }}>{colKots.length}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: col.dot, opacity: 0.7, letterSpacing: '0.08em' }}>
                      {colKots.length === 1 ? 'TICKET' : 'TICKETS'}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 28px' }}>
                  {colKots.length === 0
                    ? <EmptyColumn col={col} />
                    : colKots.map(kot => (
                      <KOTCard
                        key={kot.id}
                        kot={kot}
                        col={col}
                        onBump={handleBump}
                        onItemReady={handleItemReady}
                        loading={bumpMut.isPending}
                      />
                    ))
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════ CONFIRM CLEAR ══════════════════════ */}
      {confirmClear && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)', border: `1px solid var(--border)`,
            borderRadius: 14, padding: '32px 32px', width: 360, textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
            }}>
              <Trash2 size={22} color={P.urgent} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: P.white, margin: '0 0 10px' }}>
              {confirmClear === 'all' ? 'Clear All Orders?' : 'Clear Served Orders?'}
            </h3>
            <p style={{ fontSize: 13.5, color: P.muted, margin: '0 0 24px', lineHeight: 1.65 }}>
              {confirmClear === 'all'
                ? 'All active orders will be marked complete and cleared from the display.'
                : showCompleted
                  ? `${stats.served} served order${stats.served !== 1 ? 's' : ''} will be dismissed.`
                  : "Today's served orders will be cleared from the display."}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmClear(null)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 8,
                  border: `1px solid var(--border)`, background: 'var(--bg-hover)',
                  color: P.sub, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>
                Cancel
              </button>
              <button
                onClick={() => clearMut.mutate({ type: confirmClear, kots: allKots })}
                disabled={clearMut.isPending}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                  background: P.urgent, color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: clearMut.isPending ? 0.6 : 1,
                }}>
                {clearMut.isPending ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
