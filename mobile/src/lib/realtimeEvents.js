/**
 * realtimeEvents — the pure event→cache mapping for the live socket layer.
 *
 * The backend broadcasts Socket.IO events to the `outlet:<id>` room on the
 * `/orders` namespace whenever something changes (a new order, a KOT flips to
 * ready, a table frees up, an item is 86'd…). This module maps each server
 * event to the set of React-Query keys that must be invalidated so the affected
 * screens refetch and update live — instead of waiting on the 20s poll.
 *
 * It is intentionally free of any React / React-Native / socket imports so the
 * mapping can be unit-tested deterministically. It references the shared KEYS
 * registry directly, so a key rename can never silently desync the two.
 */
import { KEYS } from './queryKeys';

// ─── Server event groups (names copied verbatim from backend socket emits) ───

// Order lifecycle — affects the Orders list, Dashboard KPIs and EOD totals.
export const ORDER_EVENTS = [
  'new_order',
  'order_accepted',
  'order_status_change',
  'order_cancelled',
  'order_complete',
  'order_partial_payment',
  'new_online_order',
  'new_online_order_cleared',
  'online_order_accepted',
  'auto_order_created',
];

// Kitchen ticket lifecycle — affects the KOT board (and, transitively, orders).
export const KOT_EVENTS = [
  'new_kot',
  'kot_item_ready',
  'kot_item_served',
  'kot_complete',
];

// Table floor changes — occupancy feeds Dashboard's active-tables + order views.
export const TABLE_EVENTS = ['table_status_change', 'tables_changed'];

// Menu / availability — an item 86'd or the menu re-published.
export const MENU_EVENTS = ['menu_updated', 'item_availability_change'];

// Stock — a low-stock alert should refresh inventory + the dashboard badge.
export const STOCK_EVENTS = ['low_stock_alert'];

// Every event we subscribe to on the socket (union of the groups above).
export const REALTIME_EVENTS = [
  ...ORDER_EVENTS,
  ...KOT_EVENTS,
  ...TABLE_EVENTS,
  ...MENU_EVENTS,
  ...STOCK_EVENTS,
];

// ─── Mapping ────────────────────────────────────────────────────────────────

/**
 * The React-Query key prefixes to invalidate for a given server event.
 * Prefixes match React-Query's partial-key semantics: invalidating ['orders']
 * matches every query keyed ['orders', outletId, …]. Unknown events → [].
 *
 * @param {string} event
 * @returns {Array<Array<string>>} list of queryKey prefixes
 */
export function keysForEvent(event) {
  if (ORDER_EVENTS.includes(event)) return [KEYS.orders, KEYS.dashboard, KEYS.eod];
  if (KOT_EVENTS.includes(event)) return [KEYS.kot, KEYS.orders, KEYS.dashboard];
  if (TABLE_EVENTS.includes(event)) return [KEYS.orders, KEYS.dashboard];
  if (MENU_EVENTS.includes(event)) return [KEYS.menuItems];
  if (STOCK_EVENTS.includes(event)) return [KEYS.inventory, KEYS.dashboard];
  return [];
}
