/**
 * React-Query key registry — the single source of truth for cache keys.
 *
 * Kept in its own dependency-free module (no React / RN / native imports) so it
 * can be imported by both the data hooks (useApi.js) and the pure realtime
 * mapping (realtimeEvents.js) without dragging in AsyncStorage/expo. Anything
 * that invalidates a cache should reference these — never a bare string — so a
 * rename is a one-line change here.
 */
export const KEYS = {
  dashboard: ['dashboard'],
  orders: ['orders'],
  order: (id) => ['orders', id],
  inventory: ['inventory'],
  reports: (range) => ['reports', range],
  purchaseOrders: ['purchase-orders'],
  menuItems: ['menu-items'],
  staff: ['staff'],
  reservations: (outletId, date) => ['reservations', outletId, date],
  customers: ['customers'],
  kot: ['kot'],
  expenses: ['expenses'],
  eod: ['eod'],
};
