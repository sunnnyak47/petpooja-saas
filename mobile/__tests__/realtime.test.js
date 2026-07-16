/**
 * Unit tests for the pure realtime event→cache mapping (realtimeEvents.js).
 * No React, no socket, no network — this locks which React-Query keys each
 * server Socket.IO event invalidates, and that those keys match KEYS in useApi.
 */

import {
  ORDER_EVENTS,
  KOT_EVENTS,
  TABLE_EVENTS,
  MENU_EVENTS,
  STOCK_EVENTS,
  REALTIME_EVENTS,
  keysForEvent,
} from '../src/lib/realtimeEvents';
// The shared, dependency-free key registry (same object realtimeEvents uses).
import { KEYS } from '../src/lib/queryKeys';

describe('REALTIME_EVENTS', () => {
  test('is the union of every group, with no duplicates', () => {
    const union = [...ORDER_EVENTS, ...KOT_EVENTS, ...TABLE_EVENTS, ...MENU_EVENTS, ...STOCK_EVENTS];
    expect(REALTIME_EVENTS).toEqual(union);
    expect(new Set(REALTIME_EVENTS).size).toBe(REALTIME_EVENTS.length);
  });

  test('includes the events the backend actually emits to the /orders room', () => {
    // A representative sample from backend socket emits — must all be subscribed.
    for (const e of ['new_order', 'order_status_change', 'kot_complete', 'kot_item_ready', 'table_status_change', 'menu_updated', 'low_stock_alert']) {
      expect(REALTIME_EVENTS).toContain(e);
    }
  });
});

describe('keysForEvent', () => {
  test('order events refresh orders, dashboard and eod', () => {
    expect(keysForEvent('new_order')).toEqual([['orders'], ['dashboard'], ['eod']]);
    expect(keysForEvent('order_status_change')).toEqual([['orders'], ['dashboard'], ['eod']]);
  });

  test('KOT events refresh the kot board plus orders + dashboard', () => {
    expect(keysForEvent('kot_complete')).toEqual([['kot'], ['orders'], ['dashboard']]);
    expect(keysForEvent('kot_item_ready')).toEqual([['kot'], ['orders'], ['dashboard']]);
  });

  test('table events refresh orders + dashboard (occupancy feeds both)', () => {
    expect(keysForEvent('table_status_change')).toEqual([['orders'], ['dashboard']]);
  });

  test('menu / availability events refresh the menu cache', () => {
    expect(keysForEvent('menu_updated')).toEqual([['menu-items']]);
    expect(keysForEvent('item_availability_change')).toEqual([['menu-items']]);
  });

  test('low-stock refreshes inventory + dashboard badge', () => {
    expect(keysForEvent('low_stock_alert')).toEqual([['inventory'], ['dashboard']]);
  });

  test('unknown events map to no invalidation', () => {
    expect(keysForEvent('something_else')).toEqual([]);
    expect(keysForEvent('')).toEqual([]);
    expect(keysForEvent(undefined)).toEqual([]);
  });

  test('the mapped key strings stay in sync with KEYS in useApi', () => {
    // Guards against drift: if someone renames a KEYS prefix, this fails.
    expect(keysForEvent('new_order')).toContainEqual(KEYS.orders);
    expect(keysForEvent('new_order')).toContainEqual(KEYS.dashboard);
    expect(keysForEvent('new_order')).toContainEqual(KEYS.eod);
    expect(keysForEvent('kot_complete')).toContainEqual(KEYS.kot);
    expect(keysForEvent('menu_updated')).toContainEqual(KEYS.menuItems);
    expect(keysForEvent('low_stock_alert')).toContainEqual(KEYS.inventory);
  });
});
