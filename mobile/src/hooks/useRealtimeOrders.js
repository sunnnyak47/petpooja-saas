import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { Storage } from '../lib/storage';
import { KEYS } from './useApi';

const WS_URL = 'wss://petpooja-saas.onrender.com/ws';

export function useRealtimeOrders() {
  const qc = useQueryClient();
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const appState = useRef(AppState.currentState);

  function connect() {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const token = Storage.getString('auth_token');
    if (!token) return;

    try {
      ws.current = new WebSocket(`${WS_URL}?token=${token}`);

      ws.current.onopen = () => {
        clearTimeout(reconnectTimer.current);
      };

      ws.current.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ORDER_UPDATE' || msg.type === 'NEW_ORDER') {
            // Invalidate orders + dashboard — React Query refetches in background
            qc.invalidateQueries({ queryKey: KEYS.orders });
            qc.invalidateQueries({ queryKey: KEYS.dashboard });
          }
        } catch (_) {}
      };

      ws.current.onclose = () => {
        // Exponential backoff reconnect
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };
    } catch (_) {
      // WebSocket not supported on this backend yet — silently fail
    }
  }

  useEffect(() => {
    connect();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        connect(); // reconnect when app foregrounds
      }
      appState.current = nextState;
    });

    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
      sub.remove();
    };
  }, []);
}
