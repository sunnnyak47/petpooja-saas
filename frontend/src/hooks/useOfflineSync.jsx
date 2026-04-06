import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw, Database, AlertTriangle } from 'lucide-react';

/**
 * M16: Offline Mode — React hook for online/offline state management.
 * Provides network status, queued action count, and sync trigger.
 */
export default function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingActions, setPendingActions] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      syncPendingActions();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Load pending actions from IndexedDB/localStorage
    const cached = localStorage.getItem('pp_offline_queue');
    if (cached) {
      try {
        const queue = JSON.parse(cached);
        setPendingActions(queue.length);
      } catch {}
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  /**
   * Queues an action for offline execution.
   * @param {object} action - { type, endpoint, method, data }
   */
  const queueAction = (action) => {
    try {
      const cached = localStorage.getItem('pp_offline_queue');
      const queue = cached ? JSON.parse(cached) : [];
      queue.push({ ...action, timestamp: new Date().toISOString(), id: crypto.randomUUID() });
      localStorage.setItem('pp_offline_queue', JSON.stringify(queue));
      setPendingActions(queue.length);
    } catch (e) {
      console.error('Failed to queue offline action:', e);
    }
  };

  /**
   * Syncs all pending actions to the server.
   */
  const syncPendingActions = async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);

    try {
      const cached = localStorage.getItem('pp_offline_queue');
      if (!cached) { setIsSyncing(false); return; }

      const queue = JSON.parse(cached);
      if (queue.length === 0) { setIsSyncing(false); return; }

      const failed = [];
      for (const action of queue) {
        try {
          const token = localStorage.getItem('accessToken');
          const response = await fetch(`/api${action.endpoint}`, {
            method: action.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(action.data),
          });

          if (!response.ok) {
            failed.push(action);
          }
        } catch {
          failed.push(action);
        }
      }

      localStorage.setItem('pp_offline_queue', JSON.stringify(failed));
      setPendingActions(failed.length);
      setLastSyncTime(new Date().toISOString());
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Clears the offline queue.
   */
  const clearQueue = () => {
    localStorage.setItem('pp_offline_queue', '[]');
    setPendingActions(0);
  };

  return {
    isOnline,
    pendingActions,
    lastSyncTime,
    isSyncing,
    queueAction,
    syncPendingActions,
    clearQueue,
  };
}

/**
 * Offline Status Banner Component
 * Shows when offline with pending action count and sync button.
 */
export function OfflineBanner() {
  const { isOnline, pendingActions, isSyncing, syncPendingActions } = useOfflineSync();

  if (isOnline && pendingActions === 0) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] px-4 py-2 flex items-center justify-center gap-3 text-sm font-bold transition-all ${isOnline ? 'bg-orange-500' : 'bg-red-500'} text-white`}>
      {isOnline ? (
        <>
          <Cloud className="w-4 h-4" />
          <span>{pendingActions} pending actions to sync</span>
          <button onClick={syncPendingActions} disabled={isSyncing}
            className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors flex items-center gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span>You're offline — Orders will sync when connection is restored</span>
          {pendingActions > 0 && (
            <span className="px-2 py-0.5 bg-white/20 rounded text-xs">{pendingActions} queued</span>
          )}
        </>
      )}
    </div>
  );
}
