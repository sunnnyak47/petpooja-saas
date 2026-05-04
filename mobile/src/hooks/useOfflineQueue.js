import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';

const QUEUE_KEY = 'offline_queue';

let NetInfo = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  NetInfo = null;
}

async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // silently fail — next load will recover
  }
}

async function processItem(item) {
  const { type, payload } = item;
  switch (type) {
    case 'CREATE_ORDER':
      return api.post('/orders', payload);
    case 'UPDATE_ORDER':
      return api.patch(`/orders/${payload.id}`, payload);
    case 'UPDATE_INVENTORY':
      return api.patch(`/inventory/${payload.id}`, payload);
    default:
      throw new Error(`Unknown queue item type: ${type}`);
  }
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState([]);
  const isFlushing = useRef(false);

  useEffect(() => {
    loadQueue().then(setQueue);
  }, []);

  const flushQueue = useCallback(async (currentQueue) => {
    if (isFlushing.current || currentQueue.length === 0) return;
    isFlushing.current = true;

    let remaining = [...currentQueue];

    for (const item of currentQueue) {
      try {
        await processItem(item);
        remaining = remaining.filter((q) => q.id !== item.id);
        await saveQueue(remaining);
        setQueue([...remaining]);
      } catch {
        break;
      }
    }

    isFlushing.current = false;
  }, []);

  useEffect(() => {
    if (!NetInfo) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
      if (online) {
        loadQueue().then((q) => flushQueue(q));
      }
    });

    NetInfo.fetch().then((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
    });

    return unsubscribe;
  }, [flushQueue]);

  const addToQueue = useCallback(async (type, payload) => {
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      timestamp: Date.now(),
    };

    const current = await loadQueue();
    const updated = [...current, item];
    await saveQueue(updated);
    setQueue(updated);

    if (isOnline) {
      flushQueue(updated);
    }

    return item.id;
  }, [isOnline, flushQueue]);

  return {
    isOnline,
    addToQueue,
    queueLength: queue.length,
  };
}
