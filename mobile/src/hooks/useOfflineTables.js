import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getDb } from '../db/sqlite';
import api from '../lib/api';

// ── Status vocabulary mapping ────────────────────────────────────────────────
// The UI speaks empty/occupied/reserved/bill_pending/cleaning; the backend
// Table.status enum is available/occupied/dirty/reserved/blocked
// (see backend updateTableStatusSchema). We translate at the data boundary so
// the SQLite cache stays a faithful mirror of the server enum, while the
// component keeps working in its own vocabulary.
const SERVER_ENUM = ['available', 'occupied', 'dirty', 'reserved', 'blocked'];

const UI_TO_SERVER_STATUS = {
  empty: 'available',
  occupied: 'occupied',
  reserved: 'reserved',
  bill_pending: 'occupied', // backend has no bill_pending; a table awaiting its bill is still occupied
  cleaning: 'dirty',
};

const SERVER_TO_UI_STATUS = {
  available: 'empty',
  occupied: 'occupied',
  reserved: 'reserved',
  dirty: 'cleaning',
  blocked: 'cleaning',
};

function toServerStatus(status) {
  if (UI_TO_SERVER_STATUS[status]) return UI_TO_SERVER_STATUS[status];
  if (SERVER_ENUM.includes(status)) return status; // already a server enum
  return 'available';
}

function toUiStatus(status) {
  return SERVER_TO_UI_STATUS[status] || status || 'empty';
}

/**
 * PATCH the real table-status endpoint. Uses the validated route first
 * (/orders/tables/:id/status → table.routes, requires MANAGE_POS); if that is
 * rejected — e.g. the signed-in user lacks the permission — it falls back to
 * the auth-only kitchen route (/kitchen/tables/:id/status → kot.routes), which
 * calls the identical tableService.updateTableStatus. `status` must already be
 * a backend enum value.
 */
async function patchTableStatus(tableId, serverStatus) {
  try {
    return await api.patch(`/orders/tables/${tableId}/status`, { status: serverStatus });
  } catch (primaryErr) {
    return await api.patch(`/kitchen/tables/${tableId}/status`, { status: serverStatus });
  }
}

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

      const parsed = rows.map((row) => {
        const data = row.data_json ? safeJsonParse(row.data_json) : null;
        // The REAL table number lives in the raw data blob (backend Table.table_number).
        const tableNumber = data?.table_number ?? data?.number ?? null;
        // Real seating capacity is `seating_capacity`; the cache's `capacity` column
        // was populated from the wrong field name and is usually null.
        const cap = Number(row.capacity ?? data?.seating_capacity ?? data?.capacity);
        // The cache stores "Table <uuid>" for nameless tables — NEVER show that.
        const hasNum = tableNumber != null && String(tableNumber).trim() !== '';
        const isUuidName = row.name && String(row.name).includes(String(row.id).slice(0, 8));
        const name = hasNum ? `Table ${tableNumber}` : (row.name && !isUuidName ? row.name : `Table ${String(row.id).slice(0, 4)}`);
        return {
          id: row.id,
          outlet_id: row.outlet_id,
          name,
          table_number: tableNumber,
          section: row.section,
          capacity: Number.isFinite(cap) && cap > 0 ? cap : 4,
          // Cache holds the backend enum; expose the UI vocabulary to the screen.
          status: toUiStatus(row.status),
          data,
          updated_at: row.updated_at,
        };
      });

      // Stable human sequence: by section, then table_number numerically (falls
      // back to a natural name sort), so tables always read 1, 2, 3, … not by UUID.
      parsed.sort((a, b) => {
        const sa = String(a.section || ''); const sb = String(b.section || '');
        if (sa !== sb) return sa.localeCompare(sb);
        const na = Number(a.table_number); const nb = Number(b.table_number);
        const aNum = Number.isFinite(na); const bNum = Number.isFinite(nb);
        if (aNum && bNum) return na - nb;
        if (aNum !== bNum) return aNum ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
      });

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
   * Update a table's status: optimistic local write (SQLite mirror + state),
   * then push to the real backend table-status endpoint and reconcile.
   *
   * Flow:
   *   1. Write the mapped backend status to the SQLite cache + in-memory state
   *      immediately (optimistic — the UI never waits on the network).
   *   2. If offline, keep the optimistic local change and skip the server call
   *      gracefully (returns { synced: false, offline: true }).
   *   3. If online, PATCH the server; on failure roll the cache + state back to
   *      the previous status so mobile never drifts from the server.
   *
   * @param {string} tableId
   * @param {string} status - UI status: 'empty' | 'occupied' | 'reserved' |
   *                          'bill_pending' | 'cleaning' (backend enums also accepted)
   * @returns {Promise<{ ok: boolean, synced: boolean, offline?: boolean, error?: string }>}
   */
  const updateStatus = useCallback(
    async (tableId, status) => {
      if (!tableId || !outletId) return { ok: false, synced: false, error: 'missing-args' };

      const db = getDb();
      const now = new Date().toISOString();
      const uiStatus = toUiStatus(toServerStatus(status)); // normalize UI value
      const serverStatus = toServerStatus(status);

      // Capture the previous cached status (backend enum) for rollback.
      let prevServerStatus = null;
      try {
        const rows = db.getAllSync(
          `SELECT status FROM tables_cache WHERE id = ? AND outlet_id = ?`,
          [tableId, outletId]
        );
        prevServerStatus = rows?.[0]?.status ?? null;
      } catch (_) {
        // best-effort — if we can't read the previous value we simply won't roll back
      }

      const applyLocal = (serverVal, uiVal) => {
        try {
          db.runSync(
            `UPDATE tables_cache SET status = ?, updated_at = ? WHERE id = ? AND outlet_id = ?`,
            [serverVal, now, tableId, outletId]
          );
        } catch (err) {
          console.error('[useOfflineTables] Failed to write status to cache:', err);
        }
        if (mountedRef.current) {
          setTables((prev) =>
            prev.map((t) =>
              t.id === tableId ? { ...t, status: uiVal, updated_at: now } : t
            )
          );
        }
      };

      // 1. Optimistic local write.
      applyLocal(serverStatus, uiStatus);

      // 2. Offline → keep the optimistic change, skip the server gracefully.
      let online = true;
      try {
        const net = await NetInfo.fetch();
        online = net.isConnected && net.isInternetReachable !== false;
      } catch (_) {
        online = true; // if NetInfo fails, attempt the request anyway
      }
      if (!online) {
        return { ok: true, synced: false, offline: true };
      }

      // 3. Push to the server; roll back on failure.
      try {
        await patchTableStatus(tableId, serverStatus);
        return { ok: true, synced: true };
      } catch (err) {
        console.warn(
          '[useOfflineTables] Server status update failed, rolling back:',
          err?.message
        );
        if (prevServerStatus != null && prevServerStatus !== serverStatus) {
          applyLocal(prevServerStatus, toUiStatus(prevServerStatus));
        }
        return { ok: false, synced: false, error: err?.message || 'update failed' };
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
