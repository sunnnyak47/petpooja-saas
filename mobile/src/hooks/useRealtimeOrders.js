import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { KEYS } from './useApi';
import { getAccessToken } from '../lib/tokenStore';

const WS_URL = 'wss://petpooja-saas.onrender.com/ws';

// Reconnect backoff config
const BASE_RECONNECT_MS = 5000;
const MAX_RECONNECT_MS = 60000;
// Polling fallback: while the socket is down, keep orders fresh on an interval
const POLL_INTERVAL_MS = 20000;

export function useRealtimeOrders() {
  const qc = useQueryClient();
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const pollTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const isConnected = useRef(false);
  const unmounted = useRef(false);
  const appState = useRef(AppState.currentState);

  function clearReconnectTimer() {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }

  function startPolling() {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(() => {
      // Only poll while the socket is not delivering live updates
      if (!isConnected.current) {
        qc.invalidateQueries({ queryKey: KEYS.orders });
        qc.invalidateQueries({ queryKey: KEYS.dashboard });
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function scheduleReconnect() {
    if (unmounted.current) return;
    clearReconnectTimer();
    // Exponential backoff with jitter, capped
    const exp = Math.min(
      MAX_RECONNECT_MS,
      BASE_RECONNECT_MS * Math.pow(2, reconnectAttempts.current),
    );
    const jitter = Math.random() * BASE_RECONNECT_MS;
    const delay = Math.min(MAX_RECONNECT_MS, exp + jitter);
    reconnectAttempts.current += 1;
    reconnectTimer.current = setTimeout(connect, delay);
  }

  async function connect() {
    if (unmounted.current) return;
    // Treat CONNECTING as busy too — otherwise a foreground AppState event during
    // the CONNECTING window spawns a second socket and orphans the first.
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;

    try {
      const token = await getAccessToken();
      if (!token) {
        // No auth yet — retry later with backoff so we don't hammer
        scheduleReconnect();
        return;
      }

      ws.current = new WebSocket(`${WS_URL}?token=${token}`);

      ws.current.onopen = () => {
        clearReconnectTimer();
        reconnectAttempts.current = 0;
        isConnected.current = true;
      };

      ws.current.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ORDER_UPDATE' || msg.type === 'NEW_ORDER') {
            qc.invalidateQueries({ queryKey: KEYS.orders });
            qc.invalidateQueries({ queryKey: KEYS.dashboard });
          }
        } catch (_) {}
      };

      ws.current.onclose = () => {
        isConnected.current = false;
        scheduleReconnect();
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };
    } catch (_) {
      // WebSocket endpoint not available — back off and retry
      isConnected.current = false;
      scheduleReconnect();
    }
  }

  useEffect(() => {
    unmounted.current = false;
    connect();
    startPolling();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        // Fresh foreground: reset backoff so reconnect is immediate
        reconnectAttempts.current = 0;
        clearReconnectTimer();
        connect();
      }
      appState.current = nextState;
    });

    return () => {
      unmounted.current = true;
      clearReconnectTimer();
      stopPolling();
      if (ws.current) {
        // Detach handlers so a teardown close doesn't schedule a reconnect
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onclose = null;
        ws.current.onerror = null;
        ws.current.close();
        ws.current = null;
      }
      sub.remove();
    };
  }, []);
}
