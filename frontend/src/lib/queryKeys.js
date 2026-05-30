/**
 * @fileoverview Centralized TanStack Query key factory.
 *
 * Goal: give the ~146 `useQuery` call sites a single, typo-proof source of
 * truth for query keys so the same endpoint can share one cache entry instead
 * of being fetched under several ad-hoc keys.
 *
 * IMPORTANT — behavior preservation:
 * Several pages already call `queryClient.invalidateQueries({ queryKey: [...] })`
 * with hard-coded string keys. Those literals are reproduced here EXACTLY so the
 * factory stays byte-compatible with existing invalidations. Do not rename a key
 * without updating every matching `invalidateQueries`/`setQueryData` call.
 *
 * Convention going forward:
 *   - First element: a stable kebab-case resource name (string literal).
 *   - Following elements: scoping params (outletId, then any sub-filters),
 *     ordered from coarsest to finest so partial-key invalidation works.
 */

export const qk = {
  // ── Menu ──────────────────────────────────────────────────────────────────
  // Canonical full-menu fetch (`/menu/items?limit=5000&outlet_id=…`).
  // NOTE: kept as the existing POSPage literal 'menuItems' so we share POS's
  // already-warm cache rather than introducing a 4th key. MenuPage historically
  // used 'menuItemsAll' and invalidates that literal in several places, so its
  // dedicated key is exposed separately below and left untouched.
  menuItems: (outletId) => ['menuItems', outletId],
  menuItemsAll: (outletId) => ['menuItemsAll', outletId],
  menuItemsQuick: (outletId, online) => ['menu-items-quick', outletId, online],
  menuCategories: (outletId) => ['menuCategories', outletId],
  menuCombos: (outletId) => ['menuCombos', outletId],
  addonGroups: (outletId) => ['addonGroups', outletId],

  // ── Orders ────────────────────────────────────────────────────────────────
  runningOrders: (outletId, online) =>
    online === undefined ? ['running-orders', outletId] : ['running-orders', outletId, online],

  // ── Tables ────────────────────────────────────────────────────────────────
  tables: (outletId) => ['tables', outletId],
  tableAreas: (outletId) => ['tableAreas', outletId],

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: (outletId) => ['dashboard', outletId],
};

export default qk;
