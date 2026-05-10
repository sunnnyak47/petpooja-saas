import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

// Lazy import to avoid circular deps — SyncEngine may not be initialized yet
let SyncEngine = null;
function getSyncEngine() {
  if (!SyncEngine) {
    try {
      SyncEngine = require('../sync/syncEngine').SyncEngine;
    } catch {
      SyncEngine = null;
    }
  }
  return SyncEngine;
}

/**
 * Hook that provides real-time sync engine status and network connectivity.
 *
 * Subscribes to:
 *   - SyncEngine.onStatusChange for sync status updates
 *   - NetInfo for online/offline state
 *
 * @returns {{
 *   isSyncing: boolean,
 *   lastSyncAt: string|null,
 *   pendingCount: number,
 *   lastError: string|null,
 *   syncNow: () => Promise<void>,
 *   isOnline: boolean
 * }}
 */
export function useSyncStatus() {
  const [status, setStatus] = useState({
    isSyncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    lastError: null,
  });
  const [isOnline, setIsOnline] = useState(true);
  const mountedRef = useRef(true);

  // Subscribe to SyncEngine status changes
  useEffect(() => {
    const engine = getSyncEngine();
    if (!engine) return;

    // Get initial status
    try {
      const initial = engine.getStatus();
      if (initial && mountedRef.current) {
        setStatus(initial);
      }
    } catch {
      // Engine may not be initialized yet
    }

    // Subscribe to ongoing changes
    let unsubscribe;
    try {
      unsubscribe = engine.onStatusChange((newStatus) => {
        if (mountedRef.current) {
          setStatus(newStatus);
        }
      });
    } catch {
      // Engine may not be initialized yet
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Subscribe to NetInfo for connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      if (mountedRef.current) {
        setIsOnline(online);
      }
    });

    // Get initial state
    NetInfo.fetch().then((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      if (mountedRef.current) {
        setIsOnline(online);
      }
    });

    return unsubscribe;
  }, []);

  // Cleanup ref on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Manual sync trigger
  const syncNow = useCallback(async () => {
    const engine = getSyncEngine();
    if (!engine) return;

    try {
      await engine.syncNow();
    } catch (err) {
      console.warn('[useSyncStatus] syncNow failed:', err.message);
    }
  }, []);

  return {
    isSyncing: status.isSyncing,
    lastSyncAt: status.lastSyncAt,
    pendingCount: status.pendingCount,
    lastError: status.lastError,
    syncNow,
    isOnline,
  };
}
