/**
 * PetPooja Data Prefetch Service
 *
 * Handles initial data loading when a user logs in or switches outlets.
 * Downloads menu, categories, and table data so the POS can operate
 * offline immediately after the first sync.
 *
 * Usage:
 *   import { prefetchOutletData, isPrefetchComplete } from '../sync/dataPrefetch';
 *   await prefetchOutletData(outletId);
 *   if (isPrefetchComplete(outletId)) { // ready for offline POS }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import api from '../lib/api';
import { cacheMenu } from '../db/menuCache';
import { cacheTables } from '../db/tablesCache';

// ─── Constants ────────────────────────────────────────────────────────────────

const PREFETCH_STATUS_PREFIX = 'prefetch_complete_';
const MENU_SYNC_PREFIX = 'menu_last_sync_';
const TABLES_SYNC_PREFIX = 'tables_last_sync_';

// ─── Internal State ───────────────────────────────────────────────────────────

// In-memory cache of prefetch status to avoid async lookups on hot path
const _prefetchStatusCache = new Map();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Prefetch all required data for a single outlet.
 *
 * Downloads menu categories, items, and table layout, storing everything
 * in the local SQLite database for offline access.
 *
 * @param {string} outletId - The outlet to prefetch data for
 * @param {Object} [options] - Optional configuration
 * @param {Function} [options.onProgress] - Callback: (step, total) => void
 * @param {AbortSignal} [options.signal] - Abort signal to cancel prefetch
 *
 * @returns {Object} { success: boolean, error?: string, stats?: { menuItems, tables } }
 */
export async function prefetchOutletData(outletId, options = {}) {
  if (!outletId) {
    return { success: false, error: 'outletId is required' };
  }

  const { onProgress, signal } = options;
  const totalSteps = 3; // menu fetch, tables fetch, finalize
  let currentStep = 0;

  const reportProgress = () => {
    currentStep++;
    if (typeof onProgress === 'function') {
      try {
        onProgress(currentStep, totalSteps);
      } catch (e) {
        // Ignore progress callback errors
      }
    }
  };

  try {
    // ── Step 1: Fetch and store menu data ───────────────────────────────
    if (signal?.aborted) {
      return { success: false, error: 'Prefetch aborted' };
    }

    let menuItemCount = 0;
    try {
      // Backend serves menu as two endpoints (categories + items).
      const [catResp, itemResp] = await Promise.all([
        api.get(`/menu/categories?outlet_id=${outletId}`),
        api.get(`/menu/items?outlet_id=${outletId}`),
      ]);

      // API interceptor unwraps axios .data → each is { success, data, message }
      if (!catResp?.success || !itemResp?.success) {
        throw new Error(catResp?.message || itemResp?.message || 'Menu fetch failed');
      }

      const cData = catResp.data;
      const iData = itemResp.data;

      // Each endpoint may return a bare array or a wrapped object — stay tolerant.
      const categories = Array.isArray(cData)
        ? cData
        : (cData?.categories || cData?.items || cData?.rows || []);
      const items = Array.isArray(iData)
        ? iData
        : (iData?.items || iData?.rows || []);

      // Store in SQLite
      cacheMenu(outletId, categories, items);
      menuItemCount = items.length;

      // Record sync timestamp
      await AsyncStorage.setItem(
        `${MENU_SYNC_PREFIX}${outletId}`,
        new Date().toISOString()
      );
    } catch (e) {
      console.warn('[Prefetch] Menu fetch failed for outlet', outletId, e.message);
      return {
        success: false,
        error: `Menu prefetch failed: ${e.message}`,
        partial: true,
      };
    }

    reportProgress();

    // ── Step 2: Fetch and store tables data ─────────────────────────────
    if (signal?.aborted) {
      return { success: false, error: 'Prefetch aborted' };
    }

    let tableCount = 0;
    try {
      const tablesResponse = await api.get(`/orders/tables?outlet_id=${outletId}`);

      if (!tablesResponse || !tablesResponse.success) {
        throw new Error(tablesResponse?.message || 'Tables fetch failed');
      }

      const tablesData = tablesResponse.data;

      // Tables API might return an array or { tables: [...] }
      const tables = Array.isArray(tablesData)
        ? tablesData
        : (tablesData?.tables || []);

      // Store in SQLite
      cacheTables(outletId, tables);
      tableCount = tables.length;

      // Record sync timestamp
      await AsyncStorage.setItem(
        `${TABLES_SYNC_PREFIX}${outletId}`,
        new Date().toISOString()
      );
    } catch (e) {
      console.warn('[Prefetch] Tables fetch failed for outlet', outletId, e.message);
      // Tables are non-critical for basic POS operation (dine-in needs them,
      // but takeaway/delivery don't). Continue but note the failure.
      console.warn('[Prefetch] Continuing without tables data');
    }

    reportProgress();

    // ── Step 3: Mark prefetch as complete ───────────────────────────────
    if (signal?.aborted) {
      return { success: false, error: 'Prefetch aborted' };
    }

    await AsyncStorage.setItem(
      `${PREFETCH_STATUS_PREFIX}${outletId}`,
      JSON.stringify({
        completedAt: new Date().toISOString(),
        menuItems: menuItemCount,
        tables: tableCount,
      })
    );

    // Update in-memory cache
    _prefetchStatusCache.set(outletId, true);

    reportProgress();

    return {
      success: true,
      stats: {
        menuItems: menuItemCount,
        tables: tableCount,
      },
    };
  } catch (e) {
    console.warn('[Prefetch] Unexpected error for outlet', outletId, e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Prefetch data for multiple outlets (e.g., multi-outlet manager).
 *
 * Runs prefetch sequentially to avoid overwhelming the backend/device.
 *
 * @param {string[]} outletIds - Array of outlet IDs to prefetch
 * @param {Object} [options] - Optional configuration
 * @param {Function} [options.onOutletProgress] - Callback: (outletId, index, total) => void
 *
 * @returns {Object} { results: { [outletId]: { success, error?, stats? } }, summary }
 */
export async function prefetchAllData(outletIds, options = {}) {
  if (!Array.isArray(outletIds) || outletIds.length === 0) {
    return {
      results: {},
      summary: { total: 0, succeeded: 0, failed: 0 },
    };
  }

  const { onOutletProgress } = options;
  const results = {};
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < outletIds.length; i++) {
    const outletId = outletIds[i];

    // Report per-outlet progress
    if (typeof onOutletProgress === 'function') {
      try {
        onOutletProgress(outletId, i, outletIds.length);
      } catch (e) {
        // Ignore callback errors
      }
    }

    const result = await prefetchOutletData(outletId);
    results[outletId] = result;

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    results,
    summary: {
      total: outletIds.length,
      succeeded,
      failed,
    },
  };
}

/**
 * Check whether prefetch has been completed for a given outlet.
 * Uses in-memory cache first — synchronous for use in render paths.
 *
 * NOTE: On app cold start, the in-memory cache is empty. Call
 * isPrefetchCompleteAsync() at least once to hydrate it.
 *
 * @param {string} outletId - The outlet to check
 * @returns {boolean} true if prefetch is known to be complete
 */
export function isPrefetchComplete(outletId) {
  if (!outletId) return false;

  // Check in-memory cache (synchronous, fast)
  if (_prefetchStatusCache.has(outletId)) {
    return _prefetchStatusCache.get(outletId);
  }

  // If not in memory, we can't know synchronously — return false conservatively.
  // Caller should use isPrefetchCompleteAsync() for authoritative answer.
  return false;
}

/**
 * Async version of isPrefetchComplete that checks AsyncStorage.
 * Updates the in-memory cache on read.
 *
 * @param {string} outletId - The outlet to check
 * @returns {Promise<boolean>} true if prefetch is complete
 */
export async function isPrefetchCompleteAsync(outletId) {
  if (!outletId) return false;

  // Check in-memory cache first
  if (_prefetchStatusCache.has(outletId)) {
    return _prefetchStatusCache.get(outletId);
  }

  // Check persistent storage
  try {
    const stored = await AsyncStorage.getItem(
      `${PREFETCH_STATUS_PREFIX}${outletId}`
    );
    const isComplete = stored !== null;
    _prefetchStatusCache.set(outletId, isComplete);
    return isComplete;
  } catch (e) {
    console.warn('[Prefetch] Failed to check prefetch status:', e.message);
    return false;
  }
}

/**
 * Get detailed prefetch metadata for an outlet (when it was done, stats).
 *
 * @param {string} outletId - The outlet to query
 * @returns {Promise<Object|null>} Prefetch metadata or null
 */
export async function getPrefetchMeta(outletId) {
  if (!outletId) return null;

  try {
    const stored = await AsyncStorage.getItem(
      `${PREFETCH_STATUS_PREFIX}${outletId}`
    );
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (e) {
    console.warn('[Prefetch] Failed to read prefetch meta:', e.message);
    return null;
  }
}

/**
 * Clear prefetch status for an outlet, forcing a re-download on next prefetch.
 * Useful after a menu update notification or manual refresh.
 *
 * @param {string} outletId - The outlet to invalidate
 */
export async function invalidatePrefetch(outletId) {
  if (!outletId) return;

  try {
    _prefetchStatusCache.delete(outletId);
    await AsyncStorage.multiRemove([
      `${PREFETCH_STATUS_PREFIX}${outletId}`,
      `${MENU_SYNC_PREFIX}${outletId}`,
      `${TABLES_SYNC_PREFIX}${outletId}`,
    ]);
  } catch (e) {
    console.warn('[Prefetch] Failed to invalidate prefetch:', e.message);
  }
}
