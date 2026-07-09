/**
 * PetPooja Sync Engine
 *
 * Orchestrates offline-first data synchronization between the mobile app
 * and the cloud backend. Handles pull (menu/tables download) and push
 * (offline orders upload) with automatic triggers on connectivity restore,
 * app foreground, and periodic intervals.
 *
 * Usage:
 *   import { SyncEngine } from '../sync/syncEngine';
 *   SyncEngine.init({ outletId: '...', userId: '...' });
 *   SyncEngine.startAutoSync();
 */

import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import api from '../lib/api';
import { cacheMenu } from '../db/menuCache';
import { cacheTables } from '../db/tablesCache';
import {
  getPendingOrders,
  markOrderSynced,
  markOrderSyncFailed,
  getOrderCount,
} from '../db/offlineOrders';
import { getDb } from '../db/sqlite';

// ─── Constants ────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FOREGROUND_STALE_MS = 2 * 60 * 1000; // 2 minutes before re-sync on foreground
const MAX_BATCH_SIZE = 10;
const MAX_RETRY_ATTEMPTS = 5;
const BACKOFF_SCHEDULE_MS = [5000, 15000, 45000, 120000, 300000]; // 5s, 15s, 45s, 2min, 5min
const ABANDON_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

const STORAGE_KEYS = {
  LAST_SYNC: 'sync_last_sync_at',
};

// ─── Internal State ───────────────────────────────────────────────────────────

let _initialized = false;
let _outletId = null;
let _userId = null;
let _isSyncing = false;
// Dedicated re-entrancy mutex for pushOrders(). The connectivity handler, retry
// timer, periodic interval, and per-order create trigger can all fire pushOrders
// at once; without this guard two overlapping pushes could send the SAME queued
// order to POST /orders/sync concurrently and the server (which cannot dedup our
// non-uuid local ids) would create a DUPLICATE order.
let _isPushing = false;
let _lastSyncAt = null;
let _lastError = null;
let _pendingCount = 0;

// Auto-sync handles
let _syncInterval = null;
let _netInfoUnsubscribe = null;
let _appStateSubscription = null;
let _lastAppState = AppState.currentState;
let _isOnline = true;

// Retry state for push failures
let _retryTimeout = null;

// Listener registry (simple event emitter pattern)
let _listeners = new Set();
let _listenerIdCounter = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _notifyListeners() {
  const status = SyncEngine.getStatus();
  _listeners.forEach(({ cb }) => {
    try {
      cb(status);
    } catch (e) {
      console.warn('[SyncEngine] Listener error:', e.message);
    }
  });
}

async function _loadPersistedState() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    if (stored) {
      _lastSyncAt = stored;
    }
  } catch (e) {
    console.warn('[SyncEngine] Failed to load persisted state:', e.message);
  }
}

async function _persistLastSync() {
  try {
    const now = new Date().toISOString();
    _lastSyncAt = now;
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);
  } catch (e) {
    console.warn('[SyncEngine] Failed to persist last sync:', e.message);
  }
}

function _getBackoffDelay(attemptCount) {
  const index = Math.min(attemptCount, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[index];
}

/**
 * Update sync_attempts and next_retry_at for an order directly in SQLite.
 * The offlineOrders module doesn't expose this, so we use getDb() directly.
 */
function _setOrderRetry(orderId, attemptCount, nextRetryAt) {
  try {
    const db = getDb();
    const retryIso = new Date(nextRetryAt).toISOString();
    db.runSync(
      `UPDATE offline_orders SET sync_attempts = ?, sync_error = 'pending_retry' WHERE id = ?`,
      [attemptCount, orderId]
    );
    // Store next retry time in sync_meta as a lightweight approach
    db.runSync(
      `INSERT OR REPLACE INTO sync_meta (key, value, updated_at) VALUES (?, ?, ?)`,
      [`order_retry_${orderId}`, retryIso, new Date().toISOString()]
    );
  } catch (e) {
    console.warn('[SyncEngine] Failed to set retry for order:', orderId, e.message);
  }
}

/**
 * Mark an order as permanently abandoned (won't be retried).
 */
function _markOrderAbandoned(orderId, reason) {
  try {
    const db = getDb();
    db.runSync(
      `UPDATE offline_orders SET synced = -1, sync_error = ? WHERE id = ?`,
      [`ABANDONED: ${reason}`, orderId]
    );
  } catch (e) {
    console.warn('[SyncEngine] Failed to abandon order:', orderId, e.message);
  }
}

/**
 * Check if an order's next retry time has passed.
 */
function _isOrderReadyForRetry(orderId) {
  try {
    const db = getDb();
    const rows = db.getAllSync(
      `SELECT value FROM sync_meta WHERE key = ?`,
      [`order_retry_${orderId}`]
    );
    if (rows.length === 0) return true; // No retry scheduled, ready immediately
    const nextRetry = new Date(rows[0].value).getTime();
    return Date.now() >= nextRetry;
  } catch (e) {
    return true; // If we can't check, allow retry
  }
}

// ─── Pull Operations ──────────────────────────────────────────────────────────

async function _pullMenu() {
  // Backend serves menu as TWO endpoints (categories + items), not a single
  // `/menu`. API interceptor unwraps axios response.data → we get the envelope.
  // limit=500 — backend defaults to 20 (parsePagination), which truncated large menus.
  const [catRes, itemRes] = await Promise.all([
    api.get(`/menu/categories?outlet_id=${_outletId}&limit=500`),
    api.get(`/menu/items?outlet_id=${_outletId}&limit=500`),
  ]);

  if (!catRes?.success || !itemRes?.success) {
    throw new Error(catRes?.message || itemRes?.message || 'Failed to fetch menu');
  }

  const cData = catRes.data;
  const iData = itemRes.data;

  // Each endpoint may return a bare array or a wrapped object — stay tolerant.
  const categories = Array.isArray(cData)
    ? cData
    : (cData?.categories || cData?.items || cData?.rows || []);
  const items = Array.isArray(iData)
    ? iData
    : (iData?.items || iData?.rows || []);

  cacheMenu(_outletId, categories, items);
}

async function _pullTables() {
  // Tables live under /orders/tables (not a top-level /tables).
  const response = await api.get(`/orders/tables?outlet_id=${_outletId}`);

  if (!response || !response.success) {
    throw new Error(response?.message || 'Failed to fetch tables');
  }

  const tablesData = response.data;

  // Tables API might return an array or { tables: [...] }
  const tables = Array.isArray(tablesData) ? tablesData : (tablesData?.tables || []);

  cacheTables(_outletId, tables);
}

// ─── Push Operations ──────────────────────────────────────────────────────────

async function _pushBatch(orders) {
  // Transform local orders to the shape POST /orders/sync (syncOfflineOrdersSchema)
  // actually accepts. Fields not on that schema (subtotal/tax/total/status/…) are
  // stripped by the server validator, but we keep the payload lean and only emit
  // keys that validate — notably `notes` (allow('') but NOT null) and `created_by`
  // (must be a uuid) are omitted when empty so they never trip validation.
  //
  // `id` carries our STABLE local id. The server dedups on it via
  // findUnique({ where: { id } }); combined with the positional response mapping
  // in _handleSyncResponse this is what keeps a re-push from duplicating.
  const payload = orders.map((order) => {
    const entry = {
      id: order.id,
      outlet_id: order.outlet_id,
      order_type: order.order_type,
      table_id: order.table_id || null,
      customer_id: order.customer_id || null,
      source: order.source || 'pos',
      created_at: order.created_at,
      items: (order.items || []).map((item) => ({
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        variant_id: item.variant_id || null,
        variant_name: item.variant_name || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        notes: item.notes || null,
        addons: item.addons || [],
      })),
    };
    if (order.notes) entry.notes = order.notes;
    if (order.created_by) entry.created_by = order.created_by;
    return entry;
  });

  const response = await api.post('/orders/sync', { orders: payload });

  if (!response || !response.success) {
    throw new Error(response?.message || 'Sync request failed');
  }

  // Backend returns the results array directly as `data` (order.controller
  // syncOfflineOrders → sendSuccess(res, results)). Each element mirrors the
  // request order at the SAME index:
  //   { id, status: 'synced' }               // id = NEW server order id
  //   { id: <localId>, status: 'exists' }    // already created on a prior push
  //   { id: <localId>, status: 'failed', error }
  return Array.isArray(response.data) ? response.data : (response.data?.results || []);
}

/**
 * Reconcile the POST /orders/sync response with the batch we sent.
 *
 * The prod response is a flat ARRAY whose entries line up POSITIONALLY with the
 * orders we submitted (the service iterates the input array and pushes one result
 * per order, in order). We therefore correlate by INDEX rather than by id — this
 * is essential because a 'synced' result returns the NEW server order id (which
 * bears no relation to our local id), while 'exists'/'failed' echo our local id.
 *
 * Idempotency guarantee: a queued order is only ever marked synced once the server
 * confirms it ('synced' or 'exists'). It is never removed from the queue optimistically,
 * so a dropped response simply leaves it pending for a later push (never a phantom).
 *
 * @param {Array<{id?:string,status?:string,error?:string}>} syncResult
 * @param {Array<Object>} batch  The exact orders passed to _pushBatch, same order.
 */
async function _handleSyncResponse(syncResult, batch) {
  const results = Array.isArray(syncResult) ? syncResult : [];

  results.forEach((result, index) => {
    const localOrder = batch[index];
    if (!localOrder) return;

    const status = result?.status;

    // 'synced' → server created it now (result.id is the new server order id).
    // 'exists' → server already had an order with our id from a prior push; treat
    //            as success so we stop re-pushing (this is the dedup path).
    if (status === 'synced' || status === 'exists') {
      const cloudId = result.id || localOrder.cloud_id || localOrder.id;
      try {
        markOrderSynced(localOrder.id, cloudId);
      } catch (e) {
        console.warn('[SyncEngine] Failed to mark order synced:', localOrder.id, e.message);
      }
      return;
    }

    // 'failed' (or anything unexpected) → back off and retry, or abandon after
    // exhausting attempts. Never mark synced.
    const newAttemptCount = (localOrder.sync_attempts || 0) + 1;
    const reason = result?.error || `Unexpected sync status: ${status}`;
    if (newAttemptCount >= MAX_RETRY_ATTEMPTS) {
      markOrderSyncFailed(localOrder.id, `Max retries exceeded: ${reason}`);
      _markOrderAbandoned(localOrder.id, `Failed after ${MAX_RETRY_ATTEMPTS} attempts`);
    } else {
      _setOrderRetry(
        localOrder.id,
        newAttemptCount,
        Date.now() + _getBackoffDelay(newAttemptCount)
      );
    }
  });

  // A shorter response than the batch means the server never reported on the tail
  // orders (partial failure). Leave them pending — a later push retries them; they
  // are still synced=0 so getPendingOrders will pick them up again.
}

// ─── Auto-Sync Handlers ──────────────────────────────────────────────────────

function _handleConnectivityChange(state) {
  const wasOffline = !_isOnline;
  _isOnline = state.isConnected && state.isInternetReachable !== false;

  // When connectivity restores, push pending orders immediately
  if (_isOnline && wasOffline) {
    console.warn('[SyncEngine] Connectivity restored, pushing pending orders');
    SyncEngine.pushOrders().catch((e) => {
      console.warn('[SyncEngine] Push on reconnect failed:', e.message);
    });
  }
}

function _handleAppStateChange(nextAppState) {
  // App came to foreground
  if (
    (_lastAppState === 'background' || _lastAppState === 'inactive') &&
    nextAppState === 'active'
  ) {
    const timeSinceLastSync = _lastSyncAt
      ? Date.now() - new Date(_lastSyncAt).getTime()
      : Infinity;

    if (timeSinceLastSync > FOREGROUND_STALE_MS) {
      console.warn('[SyncEngine] App foregrounded, triggering sync');
      SyncEngine.syncNow().catch((e) => {
        console.warn('[SyncEngine] Foreground sync failed:', e.message);
      });
    }
  }
  _lastAppState = nextAppState;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const SyncEngine = {
  /**
   * Initialize the sync engine with outlet and user context.
   * Must be called before any sync operations.
   *
   * @param {Object} options
   * @param {string} options.outletId - The outlet to sync data for
   * @param {string} [options.userId] - The authenticated user's ID
   */
  async init({ outletId, userId } = {}) {
    if (!outletId) {
      console.warn('[SyncEngine] init() requires outletId');
      return;
    }

    _outletId = outletId;
    _userId = userId || null;
    _initialized = true;

    await _loadPersistedState();

    // Load initial pending count
    try {
      _pendingCount = getOrderCount(outletId, { synced: 0 });
    } catch (e) {
      _pendingCount = 0;
    }

    _notifyListeners();
    console.warn('[SyncEngine] Initialized for outlet:', outletId);
  },

  /**
   * Begin automatic sync with periodic interval, connectivity, and
   * app state triggers.
   */
  startAutoSync() {
    if (!_initialized) {
      console.warn('[SyncEngine] Cannot startAutoSync before init()');
      return;
    }

    // Periodic sync every 5 minutes (only when online)
    if (!_syncInterval) {
      _syncInterval = setInterval(() => {
        if (_isOnline && !_isSyncing) {
          SyncEngine.syncNow().catch((e) => {
            console.warn('[SyncEngine] Periodic sync failed:', e.message);
          });
        }
      }, SYNC_INTERVAL_MS);
    }

    // Network connectivity listener
    if (!_netInfoUnsubscribe) {
      _netInfoUnsubscribe = NetInfo.addEventListener(_handleConnectivityChange);
    }

    // App state listener (foreground/background)
    if (!_appStateSubscription) {
      _appStateSubscription = AppState.addEventListener(
        'change',
        _handleAppStateChange
      );
    }

    console.warn('[SyncEngine] Auto-sync started');
  },

  /**
   * Stop all automatic sync triggers.
   */
  stopAutoSync() {
    if (_syncInterval) {
      clearInterval(_syncInterval);
      _syncInterval = null;
    }
    if (_netInfoUnsubscribe) {
      _netInfoUnsubscribe();
      _netInfoUnsubscribe = null;
    }
    if (_appStateSubscription) {
      _appStateSubscription.remove();
      _appStateSubscription = null;
    }
    if (_retryTimeout) {
      clearTimeout(_retryTimeout);
      _retryTimeout = null;
    }

    console.warn('[SyncEngine] Auto-sync stopped');
  },

  /**
   * Execute a full sync cycle: pull fresh data then push pending orders.
   * Returns a summary of the sync result.
   *
   * @returns {Object} { success: boolean, error?: string }
   */
  async syncNow() {
    if (!_initialized) {
      console.warn('[SyncEngine] Cannot sync before init()');
      return { success: false, error: 'Not initialized' };
    }

    if (_isSyncing) {
      console.warn('[SyncEngine] Sync already in progress, skipping');
      return { success: false, error: 'Already syncing' };
    }

    if (!_isOnline) {
      console.warn('[SyncEngine] Offline, skipping sync');
      return { success: false, error: 'Offline' };
    }

    _isSyncing = true;
    _lastError = null;
    _notifyListeners();

    try {
      // Pull first so POS has fresh menu/tables, then push pending orders
      await SyncEngine.pullData();
      await SyncEngine.pushOrders();

      await _persistLastSync();
      _lastError = null;
      return { success: true };
    } catch (e) {
      _lastError = e.message;
      console.warn('[SyncEngine] syncNow failed:', e.message);
      return { success: false, error: e.message };
    } finally {
      _isSyncing = false;
      // Refresh pending count
      try {
        _pendingCount = getOrderCount(_outletId, { synced: 0 });
      } catch (e) {
        // Non-critical
      }
      _notifyListeners();
    }
  },

  /**
   * Pull (download) menu and tables from the cloud backend.
   * Updates local SQLite cache with fresh data.
   */
  async pullData() {
    if (!_initialized) {
      throw new Error('SyncEngine not initialized');
    }

    if (!_isOnline) {
      throw new Error('Cannot pull data while offline');
    }

    const errors = [];

    // Fetch menu — don't let one failure block the other
    try {
      await _pullMenu();
    } catch (e) {
      console.warn('[SyncEngine] Menu pull failed:', e.message);
      errors.push(`menu: ${e.message}`);
    }

    // Fetch tables
    try {
      await _pullTables();
    } catch (e) {
      console.warn('[SyncEngine] Tables pull failed:', e.message);
      errors.push(`tables: ${e.message}`);
    }

    if (errors.length === 2) {
      // Both failed — throw so caller knows pull completely failed
      throw new Error(`Pull failed: ${errors.join('; ')}`);
    }
    // If only one failed, we still have partial data — log but don't throw
    if (errors.length === 1) {
      console.warn('[SyncEngine] Partial pull failure:', errors[0]);
    }
  },

  /**
   * Push (upload) pending offline orders to the cloud.
   * Processes orders in batches of MAX_BATCH_SIZE with exponential backoff.
   *
   * @returns {Object} { pushed: number, failed: number }
   */
  async pushOrders() {
    if (!_initialized) {
      throw new Error('SyncEngine not initialized');
    }

    if (!_isOnline) {
      console.warn('[SyncEngine] Offline, cannot push orders');
      return { pushed: 0, failed: 0 };
    }

    // Re-entrancy mutex — prevents concurrent pushes (see _isPushing docs) from
    // sending the same queued order twice and creating duplicates server-side.
    if (_isPushing) {
      console.warn('[SyncEngine] pushOrders already in progress, skipping');
      return { pushed: 0, failed: 0, skipped: true };
    }
    _isPushing = true;

    let totalPushed = 0;
    let totalFailed = 0;

    try {
      // Get all pending orders (synced = 0) with their items
      const allPending = getPendingOrders();

      if (!allPending || allPending.length === 0) {
        _pendingCount = 0;
        return { pushed: 0, failed: 0 };
      }

      // Filter: exclude abandoned orders (synced = -1) and those not ready for retry
      const now = Date.now();
      const eligibleOrders = [];

      for (const order of allPending) {
        // Check if order is too old (>48h) — abandon it
        const orderAge = order.created_at
          ? now - new Date(order.created_at).getTime()
          : 0;

        if (orderAge > ABANDON_THRESHOLD_MS) {
          _markOrderAbandoned(order.id, 'Order older than 48 hours');
          totalFailed++;
          continue;
        }

        // Check if order has exceeded max retry attempts
        if ((order.sync_attempts || 0) >= MAX_RETRY_ATTEMPTS) {
          _markOrderAbandoned(order.id, `Exceeded ${MAX_RETRY_ATTEMPTS} sync attempts`);
          totalFailed++;
          continue;
        }

        // Check if order is past its retry backoff period
        if (!_isOrderReadyForRetry(order.id)) {
          continue; // Skip — waiting for backoff
        }

        eligibleOrders.push(order);
      }

      if (eligibleOrders.length === 0) {
        return { pushed: 0, failed: totalFailed };
      }

      // Process in batches
      for (let i = 0; i < eligibleOrders.length; i += MAX_BATCH_SIZE) {
        const batch = eligibleOrders.slice(i, i + MAX_BATCH_SIZE);

        try {
          const syncResult = await _pushBatch(batch);
          await _handleSyncResponse(syncResult, batch);
          // Count against the flat results array (positional per batch order):
          // 'synced'/'exists' → applied, anything else → failed/retry.
          const results = Array.isArray(syncResult) ? syncResult : [];
          const okCount = results.filter(
            (r) => r?.status === 'synced' || r?.status === 'exists'
          ).length;
          totalPushed += okCount;
          totalFailed += Math.max(batch.length, results.length) - okCount;
        } catch (e) {
          console.warn('[SyncEngine] Batch push failed:', e.message);

          // Network-level failure — increment attempt count for all in batch
          for (const order of batch) {
            const newAttemptCount = (order.sync_attempts || 0) + 1;
            if (newAttemptCount >= MAX_RETRY_ATTEMPTS) {
              markOrderSyncFailed(order.id, e.message);
              _markOrderAbandoned(order.id, `Failed after ${MAX_RETRY_ATTEMPTS} attempts`);
            } else {
              _setOrderRetry(order.id, newAttemptCount, now + _getBackoffDelay(newAttemptCount));
            }
          }
          totalFailed += batch.length;

          // Schedule a retry with backoff
          const delay = _getBackoffDelay(1);
          if (_retryTimeout) clearTimeout(_retryTimeout);
          _retryTimeout = setTimeout(() => {
            if (_isOnline) {
              SyncEngine.pushOrders().catch(() => {});
            }
          }, delay);

          // Stop processing further batches on network error
          break;
        }
      }
    } catch (e) {
      console.warn('[SyncEngine] pushOrders error:', e.message);
      _lastError = e.message;
    } finally {
      // Always release the mutex, even if the batch loop threw.
      _isPushing = false;

      // Update pending count
      try {
        _pendingCount = getOrderCount(_outletId, { synced: 0 });
      } catch (e) {
        // Non-critical
      }

      _notifyListeners();
    }

    return { pushed: totalPushed, failed: totalFailed };
  },

  /**
   * Get the current sync status.
   *
   * @returns {Object} Status object with sync state information
   */
  getStatus() {
    return {
      isSyncing: _isSyncing,
      lastSyncAt: _lastSyncAt,
      pendingCount: _pendingCount,
      lastError: _lastError,
      isOnline: _isOnline,
      isInitialized: _initialized,
    };
  },

  /**
   * Register a listener for status changes.
   * Returns an unsubscribe function.
   *
   * @param {Function} cb - Callback receiving the status object
   * @returns {Function} Unsubscribe function
   */
  onStatusChange(cb) {
    if (typeof cb !== 'function') {
      console.warn('[SyncEngine] onStatusChange requires a function');
      return () => {};
    }

    const id = ++_listenerIdCounter;
    const entry = { id, cb };
    _listeners.add(entry);

    // Return unsubscribe function
    return () => {
      _listeners.delete(entry);
    };
  },

  /**
   * Tear down the sync engine and clean up all subscriptions.
   * Call this on logout or when the component unmounts permanently.
   */
  destroy() {
    SyncEngine.stopAutoSync();
    _listeners.clear();
    _initialized = false;
    _outletId = null;
    _userId = null;
    _isSyncing = false;
    _isPushing = false;
    _lastError = null;
    _pendingCount = 0;
    _lastSyncAt = null;

    console.warn('[SyncEngine] Destroyed');
  },
};

export default SyncEngine;
