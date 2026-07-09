import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { OWNER_KEYS } from './useOwnerApi';
import { getAccessToken } from '../lib/tokenStore';

const WS_URL = 'wss://petpooja-saas.onrender.com/ws';

// Reconnect backoff config
const BASE_RECONNECT_MS = 5000;
const MAX_RECONNECT_MS = 60000;

export function useRealtimeOwner(outletId, onLiveStats) {
  const qc = useQueryClient();
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const unmounted = useRef(false);
  const appState = useRef(AppState.currentState);
  const onLiveStatsRef = useRef(onLiveStats);
  useEffect(() => { onLiveStatsRef.current = onLiveStats; }, [onLiveStats]);

  function clearReconnectTimer() {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }

  function scheduleReconnect() {
    if (unmounted.current) return;
    if (!outletId) return;
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
    if (!outletId) return;
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
      };

      ws.current.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          switch (msg.type) {
            case 'ALERT_NEW':
              qc.invalidateQueries({ queryKey: OWNER_KEYS.alerts(outletId) });
              qc.invalidateQueries({ queryKey: OWNER_KEYS.alertBadges(outletId) });
              break;

            case 'ORDER_UPDATE':
            case 'NEW_ORDER':
              qc.invalidateQueries({ queryKey: OWNER_KEYS.dashboard(outletId) });
              break;

            case 'STAFF_CLOCK':
              qc.invalidateQueries({ queryKey: OWNER_KEYS.staffWhoIsIn(outletId) });
              break;

            case 'EOD_STATUS':
              qc.invalidateQueries({ queryKey: OWNER_KEYS.eodPreview(outletId) });
              break;

            case 'APPROVAL_NEW':
              qc.invalidateQueries({ queryKey: OWNER_KEYS.approvals(outletId) });
              break;

            case 'LIVE_STATS':
              if (msg.data && typeof onLiveStatsRef.current === 'function') {
                onLiveStatsRef.current(msg.data);
              }
              // Also invalidate dashboard to keep React Query cache consistent
              qc.invalidateQueries({ queryKey: OWNER_KEYS.dashboard(outletId) });
              break;

            default:
              break;
          }
        } catch (_) {}
      };

      ws.current.onclose = () => {
        scheduleReconnect();
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };
    } catch (_) {
      // WebSocket endpoint not available — back off and retry
      scheduleReconnect();
    }
  }

  useEffect(() => {
    unmounted.current = false;
    reconnectAttempts.current = 0;
    connect();

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
  }, [outletId]);
}
