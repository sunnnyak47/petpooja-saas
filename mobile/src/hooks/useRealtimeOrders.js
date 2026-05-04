import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEYS } from './useApi';

const WS_URL = 'wss://petpooja-saas.onrender.com/ws';

export function useRealtimeOrders() {
  const qc = useQueryClient();
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const appState = useRef(AppState.currentState);

  async function connect() {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) return;

      ws.current = new WebSocket(`${WS_URL}?token=${token}`);

      ws.current.onopen = () => clearTimeout(reconnectTimer.current);

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
  }, []);
}
