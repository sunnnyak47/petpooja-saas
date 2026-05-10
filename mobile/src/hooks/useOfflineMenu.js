import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  getCachedCategories,
  getCachedItems,
  getItemById,
  isMenuStale,
} from '../db/menuCache';

// Lazy import — dataPrefetch may not exist yet
function getPrefetch() {
  try {
    return require('../sync/dataPrefetch');
  } catch {
    return null;
  }
}

/**
 * Hook that provides menu data from the local SQLite cache.
 * Supports offline-first POS — always loads from local DB, refreshes
 * from API only when online and explicitly requested.
 *
 * @param {string} outletId - The outlet to load menu for
 * @returns {{
 *   categories: Array,
 *   items: Array,
 *   getItemsByCategory: (categoryId: string) => Array,
 *   getItem: (itemId: string) => Object|null,
 *   isStale: boolean,
 *   isLoading: boolean,
 *   refresh: () => Promise<void>
 * }}
 */
export function useOfflineMenu(outletId) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const mountedRef = useRef(true);

  // Load data from SQLite cache
  const loadFromCache = useCallback(() => {
    if (!outletId) {
      setCategories([]);
      setItems([]);
      setIsLoading(false);
      return;
    }

    try {
      const cats = getCachedCategories(outletId);
      const allItems = getCachedItems(outletId);
      const staleStatus = isMenuStale(outletId);

      if (mountedRef.current) {
        setCategories(cats);
        setItems(allItems);
        setStale(staleStatus);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[useOfflineMenu] Failed to load from cache:', err);
      if (mountedRef.current) {
        setCategories([]);
        setItems([]);
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
   * Get items filtered by category ID.
   * Uses the already-loaded items array for instant filtering.
   */
  const getItemsByCategory = useCallback(
    (categoryId) => {
      if (!categoryId) return items;
      return items.filter((item) => item.category_id === categoryId);
    },
    [items]
  );

  /**
   * Get a single item by ID from SQLite.
   */
  const getItem = useCallback(
    (itemId) => {
      if (!itemId) return null;
      try {
        return getItemById(itemId);
      } catch {
        return null;
      }
    },
    []
  );

  /**
   * Refresh menu data — triggers a prefetch from API if online,
   * then reloads the local cache.
   */
  const refresh = useCallback(async () => {
    if (!outletId) return;

    if (mountedRef.current) setIsLoading(true);

    try {
      // Check if we're online
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
      console.warn('[useOfflineMenu] Prefetch failed:', err.message);
    }

    // Reload from cache regardless (prefetch may have updated it)
    loadFromCache();
  }, [outletId, loadFromCache]);

  return {
    categories,
    items,
    getItemsByCategory,
    getItem,
    isStale: stale,
    isLoading,
    refresh,
  };
}
