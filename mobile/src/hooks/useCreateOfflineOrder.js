import { useState, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getDb } from '../db/sqlite';
import api from '../lib/api';
import { updateTableStatus as updateCachedTableStatus } from '../db/tablesCache';

// Lazy import — SyncEngine may not be initialized yet
function getSyncEngine() {
  try {
    return require('../sync/syncEngine').SyncEngine;
  } catch {
    return null;
  }
}

/**
 * Generate a VALID UUID v4 for an offline order id.
 *
 * This MUST be a real uuid (not a 'local_'-prefixed string): the backend
 * Order.id column is @db.Uuid, and syncOfflineOrders does
 * findUnique({ where: { id } }) — a non-uuid string throws Prisma P2023, the
 * order is marked 'failed', retried, then abandoned → the offline order is
 * silently DROPPED (zero orders created). A valid uuid is accepted and the
 * order syncs. (Full lost-response idempotency additionally needs the backend
 * to persist this client id and dedup on it — a separate deploy.)
 */
function generateLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Hook for creating orders that works both online and offline.
 *
 * Strategy:
 *   • ONLINE  → punch the order straight to the backend via POST /orders/punch-kot.
 *               This creates the order AND its KOT atomically, so the Kitchen board
 *               (GET /kitchen/kots) is populated immediately. Nothing is written to
 *               the offline queue, so it can never be re-synced into a duplicate.
 *   • OFFLINE → write to the local SQLite queue; the SyncEngine pushes it later via
 *               POST /orders/sync when connectivity returns.
 *   • If the online punch fails (network drop mid-flight / server error), we fall back
 *               to the offline queue so the order is never lost.
 *
 * @returns {{
 *   createOrder: (orderData: Object) => Promise<Object>,
 *   isCreating: boolean,
 *   lastOrder: Object|null,
 *   error: string|null
 * }}
 */
export function useCreateOfflineOrder() {
  const [isCreating, setIsCreating] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  /**
   * Create an order — online fast-path (punch-kot) or offline queue fallback.
   *
   * @param {Object} orderData
   * @param {string} orderData.outlet_id - Outlet ID
   * @param {string} orderData.order_type - 'dine_in' | 'takeaway' | 'delivery'
   * @param {string} [orderData.table_id] - Table ID for dine-in
   * @param {Array}  orderData.items - Order items
   * @param {string} [orderData.notes] - Order notes
   * @param {string} orderData.created_by - User ID
   * @returns {Promise<Object>} The placed order. `_online:true` when punched to the
   *          server (carries `order_number`/`kots`), `_online:false` when queued offline.
   */
  const createOrder = useCallback(async (orderData) => {
    if (mountedRef.current) {
      setIsCreating(true);
      setError(null);
    }

    const items = orderData.items || [];

    // Determine connectivity up-front so we pick the right path.
    let online = false;
    try {
      const netState = await NetInfo.fetch();
      online = !!(netState.isConnected && netState.isInternetReachable !== false);
    } catch {
      online = false;
    }

    // ── ONLINE FAST-PATH: punch-kot creates order + KOT atomically ────────────
    if (online) {
      try {
        const placed = await placeOrderOnline(orderData, items);
        if (mountedRef.current) {
          setLastOrder(placed);
          setIsCreating(false);
        }
        return placed;
      } catch (err) {
        // The punch failed — fall through to the offline queue so the order is
        // never lost. (If the server actually committed but the response was lost,
        // this is the one inherent duplication window; without a server-side
        // idempotency key we cannot close it from the client alone.)
        console.warn(
          '[useCreateOfflineOrder] punch-kot failed, queueing offline:',
          err?.message
        );
      }
    }

    // ── OFFLINE (or online-failure fallback): write to the SQLite queue ───────
    try {
      const order = writeLocalOrder(orderData, items);

      if (mountedRef.current) {
        setLastOrder(order);
        setIsCreating(false);
      }

      // If we're actually online (fallback case), nudge the sync engine.
      triggerSyncIfOnline();

      return order;
    } catch (err) {
      const errMsg = err.message || 'Failed to create order';
      console.error('[useCreateOfflineOrder] Error:', errMsg);

      if (mountedRef.current) {
        setError(errMsg);
        setIsCreating(false);
      }

      throw err;
    }
  }, []);

  return { createOrder, isCreating, lastOrder, error };
}

/**
 * ONLINE path — place the order via POST /orders/punch-kot.
 *
 * Confirmed against the backend (order.validation.createOrderSchema +
 * order.service.punchKOT):
 *   Request body: {
 *     outlet_id (uuid, required), order_type, table_id|null, customer_id|null,
 *     source, notes?, items: [{ menu_item_id (uuid, required), variant_id|null,
 *       quantity (int>=1, required), notes?, addons: [{ addon_id, quantity }] }]
 *   }
 *   NOTE: prices are computed server-side — unit_price / item_name are NOT part of
 *   this schema and are stripped by the validator (stripUnknown).
 *
 *   Response envelope (unwrapped by the api interceptor to `res`):
 *     { success, message, data: {
 *         order: { id, order_number, grand_total, subtotal, status: 'confirmed' },
 *         kots:  [{ id, kot_number, station, items_count }]
 *     } }
 */
async function placeOrderOnline(orderData, items) {
  const payload = {
    outlet_id: orderData.outlet_id,
    order_type: orderData.order_type || 'dine_in',
    table_id: orderData.table_id || null,
    customer_id: orderData.customer_id || null,
    source: 'pos',
    items: items.map((it) => ({
      menu_item_id: it.menu_item_id,
      variant_id: it.variant_id || null,
      quantity: it.quantity || 1,
      notes: it.notes || null,
      addons: (it.addons || []).map((a) => ({
        addon_id: a.addon_id,
        quantity: a.quantity || 1,
      })),
    })),
  };
  // `notes` on the schema is `.allow('')` but NOT `.allow(null)`, so only include
  // it when present to avoid a validation rejection.
  if (orderData.notes) payload.notes = orderData.notes;

  const res = await api.post('/orders/punch-kot', payload);

  if (!res || !res.success || !res.data?.order) {
    throw new Error(res?.message || 'punch-kot did not return an order');
  }

  const srvOrder = res.data.order;
  const kots = res.data.kots || [];

  // Reflect table occupancy in the local cache immediately so the POS picker /
  // Tables screen don't re-offer a table the kitchen is already working. punchKOT
  // already seizes the table server-side inside its transaction; this keeps the
  // client cache in step until the next pull. (The POS screen additionally calls
  // useOfflineTables.updateStatus for the reactive in-memory state + server PATCH.)
  if (payload.table_id) {
    try {
      updateCachedTableStatus(payload.table_id, 'occupied');
    } catch {
      // Non-critical — cache will correct on next pull.
    }
  }

  return {
    id: srvOrder.id,
    cloud_id: srvOrder.id,
    order_number: srvOrder.order_number || null,
    outlet_id: orderData.outlet_id,
    order_type: payload.order_type,
    table_id: payload.table_id,
    customer_id: payload.customer_id,
    source: 'pos',
    notes: orderData.notes || null,
    subtotal: srvOrder.subtotal ?? null,
    total: srvOrder.grand_total ?? null,
    status: srvOrder.status || 'confirmed',
    payment_status: 'unpaid',
    synced: 1,
    kots,
    items,
    _online: true,
  };
}

/**
 * OFFLINE path — persist the order (and its items) to SQLite for later sync.
 * The order id IS the stable client `local_id` the SyncEngine correlates on.
 *
 * @returns {Object} The local order object (with `_online:false`).
 */
function writeLocalOrder(orderData, items) {
  const orderId = generateLocalId();
  const now = new Date().toISOString();

  const subtotal = items.reduce(
    (sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1),
    0
  );

  const order = {
    id: orderId,
    outlet_id: orderData.outlet_id,
    order_type: orderData.order_type || 'dine_in',
    table_id: orderData.table_id || null,
    customer_id: orderData.customer_id || null,
    source: 'pos',
    notes: orderData.notes || null,
    subtotal,
    tax: 0, // Tax calculated on server during sync
    discount: 0,
    total: subtotal,
    status: 'active',
    payment_status: 'unpaid',
    created_by: orderData.created_by,
    created_at: now,
    synced: 0,
    synced_at: null,
    sync_attempts: 0,
    sync_error: null,
    cloud_id: null,
  };

  const db = getDb();

  try {
    db.execSync('BEGIN TRANSACTION');

    db.runSync(
      `INSERT INTO offline_orders
        (id, outlet_id, order_type, table_id, customer_id, source, notes,
         subtotal, tax, discount, total, status, payment_status,
         created_by, created_at, synced, synced_at, sync_attempts, sync_error, cloud_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order.id,
        order.outlet_id,
        order.order_type,
        order.table_id,
        order.customer_id,
        order.source,
        order.notes,
        order.subtotal,
        order.tax,
        order.discount,
        order.total,
        order.status,
        order.payment_status,
        order.created_by,
        order.created_at,
        order.synced,
        order.synced_at,
        order.sync_attempts,
        order.sync_error,
        order.cloud_id,
      ]
    );

    for (const item of items) {
      const itemId = generateLocalId();
      const totalPrice = (item.unit_price || 0) * (item.quantity || 1);

      db.runSync(
        `INSERT INTO offline_order_items
          (id, order_id, menu_item_id, item_name, variant_id, variant_name,
           quantity, unit_price, total_price, notes, addons_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          orderId,
          item.menu_item_id,
          item.item_name,
          item.variant_id || null,
          item.variant_name || null,
          item.quantity || 1,
          item.unit_price || 0,
          totalPrice,
          item.notes || null,
          item.addons ? JSON.stringify(item.addons) : null,
        ]
      );
    }

    db.execSync('COMMIT');
  } catch (err) {
    try {
      db.execSync('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }
    throw err;
  }

  order.items = items;
  order._online = false;
  return order;
}

/**
 * Attempt to push orders to the server if device is online.
 * Non-blocking — failures are silent (sync will retry later).
 */
async function triggerSyncIfOnline() {
  try {
    const netState = await NetInfo.fetch();
    const online =
      netState.isConnected && netState.isInternetReachable !== false;

    if (online) {
      const engine = getSyncEngine();
      if (engine && engine.pushOrders) {
        engine.pushOrders();
      }
    }
  } catch {
    // Non-critical — sync will pick it up later
  }
}
