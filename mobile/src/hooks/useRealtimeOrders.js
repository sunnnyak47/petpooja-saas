/**
 * useRealtimeOrders — live push updates over Socket.IO.
 *
 * The backend runs a Socket.IO server (NOT a raw ws endpoint): staff events are
 * broadcast to the `outlet:<id>` room on the `/orders` namespace. This hook
 * mirrors the web client exactly (AutoFreeTableManager.jsx):
 *
 *   io(`${API_ORIGIN}/orders`, { auth: { token }, transports: ['websocket'] })
 *   socket.on('connect', () => socket.emit('join_outlet', outletId))
 *
 * On each server event it invalidates the mapped React-Query keys (see
 * realtimeEvents.js), so Orders / KOT / Dashboard / Menu / Inventory refresh the
 * instant something changes — instead of waiting on the poll. A 20s polling
 * fallback keeps data fresh while the socket is down (offline, cold-start, etc).
 *
 * Mounted once, app-wide, from app/(tabs)/_layout.jsx.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { API_ORIGIN } from '../lib/api';
import { getAccessToken } from '../lib/tokenStore';
import { useOutlet } from '../context/OutletContext';
import { REALTIME_EVENTS, keysForEvent } from '../lib/realtimeEvents';

// While the socket is down, keep orders/dashboard fresh on an interval.
const POLL_INTERVAL_MS = 20000;

export function useRealtimeOrders() {
  const qc = useQueryClient();
  const { outletId } = useOutlet();
  const socketRef = useRef(null);
  const pollTimer = useRef(null);
  // Live flag drives the polling fallback (poll only while NOT connected).
  const connected = useRef(false);

  useEffect(() => {
    // Nothing to subscribe to until an outlet is selected — the events are
    // room-scoped (`outlet:<id>`), so joining requires an id.
    if (!outletId) return undefined;

    let cancelled = false;
    let socket = null;

    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(() => {
        if (!connected.current) {
          qc.invalidateQueries({ queryKey: ['orders'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }
      }, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    }

    function invalidateFor(event) {
      // Each server event maps to a set of React-Query key prefixes to refetch.
      keysForEvent(event).forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    }

    (async () => {
      const token = await getAccessToken();
      if (cancelled) return;

      socket = io(`${API_ORIGIN}/orders`, {
        // The socket auth middleware is backward-compatible: a token authenticates
        // the connection; without one it still joins the (public) outlet room.
        auth: token ? { token } : undefined,
        // Start on HTTP long-polling then upgrade to websocket. VERIFIED against
        // prod: a direct websocket handshake to the Render-hosted /orders
        // namespace times out, but the polling→upgrade path connects reliably —
        // and it's the RN-recommended default. (The web app uses websocket-only
        // only because a browser's native WebSocket negotiates differently.)
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 30000,
        timeout: 15000,
      });
      socketRef.current = socket;

      // 'connect' fires on the initial connection AND every reconnection, so
      // re-joining the room here covers reconnects automatically.
      socket.on('connect', () => {
        connected.current = true;
        socket.emit('join_outlet', outletId);
      });
      socket.on('disconnect', () => { connected.current = false; });
      socket.on('connect_error', () => { connected.current = false; });

      REALTIME_EVENTS.forEach((event) => {
        socket.on(event, () => invalidateFor(event));
      });
    })();

    // Fallback polling runs alongside; it no-ops whenever the socket is live.
    startPolling();

    // On foreground, nudge a reconnect if the socket dropped while backgrounded.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
    });

    return () => {
      cancelled = true;
      stopPolling();
      sub.remove();
      connected.current = false;
      if (socket) {
        try { socket.emit('leave_outlet', outletId); } catch (_) {}
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [outletId, qc]);
}
