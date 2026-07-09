import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { OWNER_KEYS } from './useOwnerApi';
import { getAccessToken } from '../lib/tokenStore';

const WS_URL = 'wss://petpooja-saas.onrender.com/ws';

export function useRealtimeOwner(outletId, onLiveStats) {
  const qc = useQueryClient();
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const appState = useRef(AppState.currentState);
  const onLiveStatsRef = useRef(onLiveStats);
  useEffect(() => { onLiveStatsRef.current = onLiveStats; }, [onLiveStats]);

  async function connect() {
    if (!outletId) return;
    if (ws.current?.readyState === WebSocket.OPEN) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      ws.current = new WebSocket(`${WS_URL}?token=${token}`);

      ws.current.onopen = () => clearTimeout(reconnectTimer.current);

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
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };
    } catch (_) {
      // WebSocket endpoint not available — silently skip
    }
  }

  useEffect(() => {
    connect();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        connect();
      }
      appState.current = nextState;
    });

    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
      sub.remove();
    };
  }, [outletId]);
}
