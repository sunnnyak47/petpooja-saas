/**
 * queryPersist — Offline cache persistence + real-reachability wiring for React Query
 *
 * - Persists the ENTIRE React Query cache to IndexedDB (via idb-keyval) so every
 *   cached read survives reloads and is available offline.
 * - Ships a single configured QueryClient tuned for offline-first behavior.
 * - Ships persistOptions for <PersistQueryClientProvider>.
 *
 * The persister itself is harmless on the web: it just mirrors the in-memory cache
 * to IndexedDB and restores it on boot. It does NOT alter online/offline semantics.
 * Real backend reachability is wired separately (onlineManager) and only in Electron.
 */
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del, entries } from 'idb-keyval';

// Storage key for the serialized React Query cache in IndexedDB.
const CACHE_KEY = 'msrm-rq-cache';

// Cache buster — bumping this invalidates the persisted cache. Prefer a build-time
// app version when one is provided; otherwise fall back to a stable default.
const APP_VERSION =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_APP_VERSION) ||
  'v1';

/**
 * AsyncStorage-shaped adapter backed by idb-keyval.
 * createAsyncStoragePersister only needs getItem/setItem/removeItem; `entries`
 * is exposed for completeness/debugging of the idb-keyval-backed store.
 */
const idbStorage = {
  getItem: (key) => get(key),
  setItem: (key, value) => set(key, value),
  removeItem: (key) => del(key),
  entries: () => entries(),
};

// Async persister that writes the cache to IndexedDB under CACHE_KEY.
export const persister = createAsyncStoragePersister({
  storage: idbStorage,
  key: CACHE_KEY,
});

// Detect the Electron desktop shell exactly once. The aggressive offline-first
// tuning below (and whole-cache IndexedDB persistence, wired in main.jsx) only
// makes sense inside the desktop app. On the plain web build we keep React Query's
// prior defaults so behavior is identical to before the offline work.
export const IS_ELECTRON =
  typeof window !== 'undefined' &&
  (!!window.electron ||
    window.location?.hostname === '127.0.0.1' ||
    window.location?.protocol === 'app:' ||
    window.location?.protocol === 'file:');

// Single configured QueryClient.
//  • Electron → offline-first so reads resolve from cache and queries/mutations
//    pause (rather than error) when the backend is unreachable.
//  • Web → prior defaults (gcTime ~5min, retry 1, default networkMode) so the
//    non-Electron app behaves exactly as it did before the offline work.
export const queryClient = new QueryClient({
  defaultOptions: IS_ELECTRON
    ? {
        queries: {
          gcTime: Infinity,
          staleTime: 30_000,
          networkMode: 'offlineFirst',
          retry: 2,
          refetchOnWindowFocus: false,
        },
        mutations: {
          networkMode: 'offlineFirst',
          retry: 0,
        },
      }
    : {
        queries: {
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
});

// Options for <PersistQueryClientProvider>.
export const persistOptions = {
  persister,
  maxAge: Infinity,
  buster: APP_VERSION,
};
