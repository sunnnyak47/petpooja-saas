/**
 * AutoFreeTableManager — global predictive auto-free popup.
 *
 * Mounted once in DashboardLayout so it works across POS, Kitchen, Tables and
 * Running Orders. The backend stamps a table's `auto_free_at` once an order is
 * billed AND kitchen-served, then emits `table:auto_free_scheduled`. When that
 * time arrives this shows a grace-countdown popup letting staff free the table
 * now, snooze it (customer still seated), or cancel. If no one responds the
 * table frees itself when the countdown hits zero.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import api, { SOCKET_URL } from '../lib/api';
import { Clock, Users, UtensilsCrossed, X, Pause, Play, Check } from 'lucide-react';

// Snooze presets — must mirror backend PRESET_MINUTES.
const PRESETS = [
  { m: 10, label: '10 min' }, { m: 15, label: '15 min' }, { m: 20, label: '20 min' },
  { m: 25, label: '25 min' }, { m: 30, label: '30 min' }, { m: 45, label: '45 min' },
  { m: 60, label: '1 hr' }, { m: 120, label: '2 hr' }, { m: 240, label: '4 hr' },
];

export default function AutoFreeTableManager() {
  const { user, token } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;

  const [enabled, setEnabled] = useState(false);
  const schedulesRef = useRef(new Map());        // table_id -> { ...data, activated }
  const [popup, setPopup] = useState(null);       // currently shown { table_id, table_number, ... }
  const [graceLeft, setGraceLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showModify, setShowModify] = useState(false);

  // ── Load the enabled flag (cheap; refreshed on mount) ──────────────────────
  useEffect(() => {
    if (!outletId) return;
    api.get(`/ho/settings?outlet_id=${outletId}`)
      .then((r) => setEnabled((r.data?.data || r.data || {}).auto_free_enabled === true))
      .catch(() => {});
  }, [outletId]);

  // ── Socket: receive schedule / update / freed events ───────────────────────
  useEffect(() => {
    if (!outletId || !token || !enabled) return;
    const socket = io(`${SOCKET_URL}/orders`, { auth: { token }, transports: ['websocket'] });
    socket.on('connect', () => socket.emit('join_outlet', outletId));

    socket.on('table:auto_free_scheduled', (d) => {
      if (!d?.table_id) return;
      schedulesRef.current.set(d.table_id, { ...d, activated: false });
    });
    socket.on('table:auto_free_updated', (d) => {
      if (!d?.table_id) return;
      if (d.cancelled || !d.auto_free_at) { schedulesRef.current.delete(d.table_id); return; }
      const prev = schedulesRef.current.get(d.table_id) || {};
      schedulesRef.current.set(d.table_id, { ...prev, ...d, activated: false });
    });
    socket.on('table_status_change', (d) => {
      if (d?.status === 'available' && d?.table_id) schedulesRef.current.delete(d.table_id);
    });

    return () => socket.disconnect();
  }, [outletId, token, enabled]);

  // ── 1s ticker: promote a due schedule into the popup (one at a time) ───────
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setPopup((cur) => {
        if (cur) return cur;                       // already showing one
        const now = Date.now();
        for (const [tid, s] of schedulesRef.current) {
          if (!s.activated && new Date(s.auto_free_at).getTime() <= now) {
            schedulesRef.current.set(tid, { ...s, activated: true });
            setGraceLeft(Math.max(10, Number(s.grace_seconds) || 30));
            setPaused(false);
            setShowModify(false);
            return s;
          }
        }
        return null;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [enabled]);

  // ── Grace countdown for the active popup ───────────────────────────────────
  useEffect(() => {
    if (!popup || paused) return;
    if (graceLeft <= 0) { doAction('free'); return; }
    const id = setTimeout(() => setGraceLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [popup, paused, graceLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const closePopup = useCallback(() => {
    setPopup(null);
    setShowModify(false);
    setPaused(false);
  }, []);

  const doAction = useCallback(async (action, minutes) => {
    const table = popup;
    if (!table) return;
    closePopup();
    try {
      await api.patch(`/orders/tables/${table.table_id}/auto-free`, { action, ...(minutes ? { minutes } : {}) });
      if (action === 'free' || action === 'cancel') schedulesRef.current.delete(table.table_id);
      // reschedule updates arrive back over the socket and re-arm the ticker
    } catch (_) { /* socket state will self-correct; avoid noisy errors */ }
  }, [popup, closePopup]);

  if (!enabled || !popup) return null;

  const grace = Math.max(10, Number(popup.grace_seconds) || 30);
  const pct = Math.max(0, Math.min(100, (graceLeft / grace) * 100));

  return (
    <div className="fixed bottom-5 right-5 z-[120] w-[340px] animate-slide-up">
      <div
        className="rounded-2xl overflow-hidden shadow-2xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}
      >
        {/* Countdown progress bar */}
        <div className="h-1 w-full" style={{ background: 'var(--bg-hover)' }}>
          <div className="h-full transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%`, background: paused ? 'var(--warning)' : 'var(--accent)' }} />
        </div>

        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-lg"
              style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
              {popup.table_number}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm" style={{ color: 'var(--text-primary)' }}>
                Free Table {popup.table_number}?
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Billed &amp; served — clearing in <span style={{ color: paused ? 'var(--warning)' : 'var(--accent)' }} className="font-bold">{paused ? 'paused' : `${graceLeft}s`}</span>
              </p>
              <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                <span className="flex items-center gap-1"><UtensilsCrossed className="w-3 h-3" />{popup.dishes} dishes</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{popup.seats} seats</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />~{popup.predicted_minutes}m est.</span>
              </div>
            </div>
          </div>

          {/* Modify (snooze) presets */}
          {showModify ? (
            <div className="mt-3">
              <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Re-remind in…</p>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.m}
                    onClick={() => doAction('reschedule', p.m)}
                    className="py-1.5 rounded-lg text-xs font-bold transition-colors"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowModify(false)}
                className="w-full mt-2 py-1.5 rounded-lg text-xs font-bold"
                style={{ color: 'var(--text-secondary)' }}>
                Back
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => doAction('free')}
                className="py-2.5 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent)' }}>
                <Check className="w-3.5 h-3.5" /> Free now
              </button>
              <button onClick={() => setPaused((p) => !p)}
                className="py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                {paused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
              </button>
              <button onClick={() => setShowModify(true)}
                className="py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                <Clock className="w-3.5 h-3.5" /> Modify time
              </button>
              <button onClick={() => doAction('cancel')}
                className="py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                style={{ background: 'var(--bg-hover)', color: 'var(--danger)' }}>
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
