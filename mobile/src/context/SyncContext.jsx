import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { initDatabase } from '../db/sqlite';
import { useAuth } from './AuthContext';
import { useOutlet } from './OutletContext';

// Lazy imports — these modules are being built in parallel
function getSyncEngine() {
  try {
    return require('../sync/syncEngine').SyncEngine;
  } catch {
    return null;
  }
}

function getDataPrefetch() {
  try {
    return require('../sync/dataPrefetch');
  } catch {
    return null;
  }
}

const SyncContext = createContext(null);

/**
 * SyncProvider — initializes the offline-first infrastructure:
 *   1. Creates SQLite tables (initDatabase)
 *   2. Initializes SyncEngine when outletId is available
 *   3. Prefetches outlet data (menu, tables) if online
 *   4. Starts auto-sync loop
 *
 * Provides sync status and manual sync trigger to the entire app.
 */
export function SyncProvider({ children }) {
  const { user } = useAuth();
  const { outletId } = useOutlet();

  const [isReady, setIsReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    isSyncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    lastError: null,
  });

  // Stores the outletId the SyncEngine is currently initialized for (or null).
  // Tracking the id — not a boolean — lets us detect an outlet switch and
  // re-scope the engine + prefetch to the new outlet.
  const engineInitRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const mountedRef = useRef(true);

  // Step 1: Initialize the SQLite database on mount
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await initDatabase();
        if (active && mountedRef.current) {
          // DB is ready; engine init will follow when outletId is available
        }
      } catch (err) {
        console.error('[SyncProvider] Failed to init database:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Step 2 & 3 & 4: Initialize SyncEngine and prefetch when outlet + user are
  // available. Re-runs whenever outletId changes so the engine + prefetch are
  // re-scoped to the newly selected outlet (owner switching outlets).
  useEffect(() => {
    // Composite identity: re-scope (and re-init) whenever EITHER the outlet or
    // the signed-in user changes. null when logged out or no outlet selected.
    const initKey = outletId && user?.id ? `${outletId}::${user.id}` : null;

    // Logged out / no outlet → tear down any live engine so auto-sync (interval,
    // NetInfo/AppState listeners, retry timers) stops firing against a cleared
    // token. SyncProvider sits above the router so it never unmounts on logout.
    if (!initKey) {
      if (engineInitRef.current) {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
        const eng = getSyncEngine();
        if (eng) {
          try { eng.destroy(); } catch { /* silent */ }
        }
        engineInitRef.current = null;
        setIsReady(false);
      }
      return;
    }
    // Already initialized for THIS outlet+user — nothing to do (prevents double
    // initialization for the same identity, e.g. StrictMode / user churn).
    if (engineInitRef.current === initKey) return;

    let active = true;
    const targetOutletId = outletId;
    const targetUserId = user.id;

    (async () => {
      try {
        const SyncEngine = getSyncEngine();

        // If the engine was initialized for a DIFFERENT outlet, tear it down
        // before re-scoping. destroy() stops auto-sync (interval, NetInfo and
        // AppState listeners, retry timers) and clears engine state.
        if (
          engineInitRef.current &&
          engineInitRef.current !== initKey
        ) {
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
          }
          if (SyncEngine) {
            try {
              SyncEngine.destroy();
            } catch {
              // Silent — proceed to re-init regardless
            }
          }
          engineInitRef.current = null;
        }

        // Initialize the sync engine for the target outlet
        if (SyncEngine) {
          await SyncEngine.init({ outletId: targetOutletId, userId: targetUserId });
          // Bail if the outlet switched again while init was in flight — a newer
          // effect run owns the engine now.
          if (!active) return;
          engineInitRef.current = initKey;

          // Subscribe to status changes
          unsubscribeRef.current = SyncEngine.onStatusChange((status) => {
            if (active && mountedRef.current) {
              setSyncStatus(status);
            }
          });

          // Get initial status
          try {
            const initial = SyncEngine.getStatus();
            if (initial && active) setSyncStatus(initial);
          } catch {
            // Not critical
          }
        }

        // Prefetch outlet data if online
        const netState = await NetInfo.fetch();
        if (!active) return;
        const online =
          netState.isConnected && netState.isInternetReachable !== false;

        if (online) {
          const prefetch = getDataPrefetch();
          if (prefetch && prefetch.prefetchOutletData) {
            try {
              await prefetch.prefetchOutletData(targetOutletId);
            } catch (err) {
              console.warn('[SyncProvider] Prefetch failed:', err.message);
            }
          }
        }
        if (!active) return;

        // Start auto-sync
        if (SyncEngine) {
          SyncEngine.startAutoSync();
        }

        if (active && mountedRef.current) {
          setIsReady(true);
        }
      } catch (err) {
        console.error('[SyncProvider] Initialization error:', err);
        // Still mark as ready so app doesn't block — offline mode will work
        if (active && mountedRef.current) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [outletId, user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;

      // Unsubscribe from status changes
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Destroy the sync engine
      const SyncEngine = getSyncEngine();
      if (SyncEngine && engineInitRef.current) {
        try {
          SyncEngine.destroy();
        } catch {
          // Silent cleanup
        }
        engineInitRef.current = null;
      }
    };
  }, []);

  /**
   * Manual sync trigger — exposed to the app.
   */
  const syncNow = useCallback(async () => {
    const SyncEngine = getSyncEngine();
    if (!SyncEngine) return;

    try {
      await SyncEngine.syncNow();
    } catch (err) {
      console.warn('[SyncProvider] syncNow failed:', err.message);
    }
  }, []);

  const value = {
    syncStatus,
    syncNow,
    isReady,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Hook to access sync context from any component.
 *
 * @returns {{
 *   syncStatus: { isSyncing: boolean, lastSyncAt: string|null, pendingCount: number, lastError: string|null },
 *   syncNow: () => Promise<void>,
 *   isReady: boolean
 * }}
 */
export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used within SyncProvider');
  }
  return ctx;
}
