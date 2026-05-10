import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getDb } from '../db/sqlite';

// Lazy import — dataPrefetch may not exist yet
function getPrefetch() {
  try {
    return require('../sync/dataPrefetch');
  } catch {
    return null;
  }
}

/**
 * Hook that provides table data from the local SQLite cache.
 * Supports offline-first usage — always reads from local DB.
 *
 * @param {string} outletId - The outlet to load tables for
 * @returns {{
 *   tables: Array,
 *   getTable: (tableId: string) => Object|null,
 *   updateStatus: (tableId: string, status: string) => void,
 *   isLoading: boolean,
 *   refresh: () => Promise<void>
 * }}
 */
export function useOfflineTables(outletId) {
  const [tables, setTables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  /**
   * Load tables from SQLite cache for the given outlet.
   */
  const loadFromCache = useCallback(() => {
    if (!outletId) {
      setTables([]);
      setIsLoading(false);
      return;
    }

    try {
      const db = getDb();
      const rows = db.getAllSync(
        `SELECT * FROM tables_cache
         WHERE outlet_id = ?
         ORDER BY section ASC, name ASC`,
        [outletId]
      );

      const parsed = rows.map((row) => ({
        id: row.id,
        outlet_id: row.outlet_id,
        name: row.name,
        section: row.section,
        capacity: row.capacity,
        status: row.status,
        data: row.data_json ? safeJsonParse(row.data_json) : null,
        updated_at: row.updated_at,
      }));

      if (mountedRef.current) {
        setTables(parsed);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[useOfflineTables] Failed to load from cache:', err);
      if (mountedRef.current) {
        setTables([]);
        setIsLoading(false);
      }
    }
  }, [outletId]);

  // Load on mount and when outletId changes
  useEffect(() => {
    setIsLoading(true);
    loadFromCache();
  }, [loadFromCache]);

  // Cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Get a single table by ID from the loaded list.
   */
  const getTable = useCallback(
    (tableId) => {
      if (!tableId) return null;
      return tables.find((t) => t.id === tableId) || null;
    },
    [tables]
  );

  /**
   * Update a table's status locally in SQLite and state.
   * Used to mark tables as occupied/available during POS operations.
   *
   * @param {string} tableId
   * @param {string} status - 'available' | 'occupied' | 'reserved'
   */
  const updateStatus = useCallback(
    (tableId, status) => {
      if (!tableId || !outletId) return;

      try {
        const db = getDb();
        const now = new Date().toISOString();

        db.runSync(
          `UPDATE tables_cache SET status = ?, updated_at = ? WHERE id = ? AND outlet_id = ?`,
          [status, now, tableId, outletId]
        );

        // Update local state immediately
        if (mountedRef.current) {
          setTables((prev) =>
            prev.map((t) =>
              t.id === tableId ? { ...t, status, updated_at: now } : t
            )
          );
        }
      } catch (err) {
        console.error('[useOfflineTables] Failed to update status:', err);
      }
    },
    [outletId]
  );

  /**
   * Refresh tables — prefetch from API if online, then reload cache.
   */
  const refresh = useCallback(async () => {
    if (!outletId) return;

    if (mountedRef.current) setIsLoading(true);

    try {
      const netState = await NetInfo.fetch();
      const online =
        netState.isConnected && netState.isInternetReachable !== false;

      if (online) {
        const prefetch = getPrefetch();
        if (prefetch && prefetch.prefetchOutletData) {
          await prefetch.prefetchOutletData(outletId);
        }
      }
    } catch (err) {
      console.warn('[useOfflineTables] Prefetch failed:', err.message);
    }

    // Reload from cache regardless
    loadFromCache();
  }, [outletId, loadFromCache]);

  return {
    tables,
    getTable,
    updateStatus,
    isLoading,
    refresh,
  };
}

// --- Helper ---

function safeJsonParse(jsonStr, fallback = null) {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}
