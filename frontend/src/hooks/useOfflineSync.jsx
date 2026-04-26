import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Cloud, RefreshCw } from 'lucide-react';
import hybridAPI from '../api/offlineAPI';

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electron;

/**
 * M16: Offline Mode — React hook for online/offline state management.
 * In Electron: delegates to syncEngine via IPC.
 * In browser: uses localStorage queue + direct fetch.
 */
export default function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingActions, setPendingActions] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Count pending from localStorage queue
  const countPending = useCallback(() => {
    try {
      const cached = localStorage.getItem('pp_offline_queue');
      const queue = cached ? JSON.parse(cached) : [];
      setPendingActions(queue.length);
    } catch {}
  }, []);

  useEffect(() => {
    countPending();

    const onOnline = () => {
      setIsOnline(true);
      // Trigger Electron sync engine if available
      if (IS_ELECTRON) {
        window.electron.syncNow().catch(() => {});
      }
      syncPendingActions();
    };
    const onOffline = () => {
      setIsOnline(false);
      setSyncMessage('');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Listen to Electron sync-status events
    let unsub;
    if (IS_ELECTRON && window.electron.onSyncStatus) {
      unsub = window.electron.onSyncStatus((data) => {
        setSyncMessage(data.message || '');
        setIsSyncing(data.status === 'uploading' || data.status === 'downloading');
        if (data.status === 'done' || data.status === 'success') {
          setLastSyncTime(new Date().toISOString());
          setIsSyncing(false);
        }
      });
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (unsub) unsub();
    };
  }, []);

  const queueAction = useCallback((action) => {
    try {
      const cached = localStorage.getItem('pp_offline_queue');
      const queue = cached ? JSON.parse(cached) : [];
      queue.push({ ...action, timestamp: new Date().toISOString(), id: crypto.randomUUID() });
      localStorage.setItem('pp_offline_queue', JSON.stringify(queue));
      setPendingActions(queue.length);
    } catch (e) {
      console.error('Failed to queue offline action:', e);
    }
  }, []);

  const syncPendingActions = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    setSyncMessage('Syncing pending actions…');

    try {
      // Electron: flush SQLite unsynced orders to cloud
      if (IS_ELECTRON) {
        await hybridAPI.flushOrdersToCloud().catch(() => {});
      }

      // Browser queue flush
      const cached = localStorage.getItem('pp_offline_queue');
      if (!cached) return;
      const queue = JSON.parse(cached);
      if (queue.length === 0) return;

      const failed = [];
      for (const action of queue) {
        try {
          const token = localStorage.getItem('accessToken');
          const BASE = import.meta.env.VITE_API_URL || '';
          const response = await fetch(`${BASE}/api${action.endpoint}`, {
            method: action.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(action.data),
          });
          if (!response.ok) failed.push(action);
        } catch {
          failed.push(action);
        }
      }

      localStorage.setItem('pp_offline_queue', JSON.stringify(failed));
      setPendingActions(failed.length);
      setLastSyncTime(new Date().toISOString());
      setSyncMessage(failed.length === 0 ? 'All synced ✓' : `${failed.length} failed`);
    } catch (e) {
      console.error('Sync failed:', e);
      setSyncMessage('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  const clearQueue = useCallback(() => {
    localStorage.setItem('pp_offline_queue', '[]');
    setPendingActions(0);
  }, []);

  return {
    isOnline,
    pendingActions,
    lastSyncTime,
    isSyncing,
    syncMessage,
    queueAction,
    syncPendingActions,
    clearQueue,
  };
}

/**
 * Offline Status Banner — shown when offline or pending sync items exist.
 */
export function OfflineBanner() {
  const { isOnline, pendingActions, isSyncing, syncMessage, syncPendingActions } = useOfflineSync();

  // Fully online + nothing pending → hide
  if (isOnline && pendingActions === 0 && !syncMessage) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] px-4 py-2 flex items-center justify-center gap-3 text-sm font-bold transition-all
      ${isOnline ? (pendingActions > 0 ? 'bg-orange-500' : 'bg-emerald-600') : 'bg-red-600'} text-white`}>
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span>Offline — KOT & billing work normally. Orders sync when back online.</span>
          {pendingActions > 0 && (
            <span className="px-2 py-0.5 bg-white/20 rounded text-xs">{pendingActions} queued</span>
          )}
        </>
      ) : pendingActions > 0 ? (
        <>
          <Cloud className="w-4 h-4" />
          <span>{pendingActions} order{pendingActions !== 1 ? 's' : ''} pending sync</span>
          <button onClick={syncPendingActions} disabled={isSyncing}
            className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors flex items-center gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4" />
          <span>{syncMessage}</span>
        </>
      )}
    </div>
  );
}
