import { useState, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getDb } from '../db/sqlite';

// Lazy import — SyncEngine may not be initialized yet
function getSyncEngine() {
  try {
    return require('../sync/syncEngine').SyncEngine;
  } catch {
    return null;
  }
}

/**
 * Generate a UUID v4-style local ID for offline orders.
 */
function generateLocalId() {
  const seg = () =>
    Math.random().toString(16).slice(2, 6);
  return `local_${seg()}${seg()}-${seg()}-${seg()}-${seg()}-${seg()}${seg()}${seg()}`;
}

/**
 * Hook for creating orders that works both online and offline.
 *
 * Strategy: always write to local SQLite first (instant, works offline),
 * then immediately attempt to push to server if online.
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
   * Create an order locally and attempt server sync.
   *
   * @param {Object} orderData
   * @param {string} orderData.outlet_id - Outlet ID
   * @param {string} orderData.order_type - 'dine_in' | 'takeaway' | 'delivery'
   * @param {string} [orderData.table_id] - Table ID for dine-in
   * @param {Array} orderData.items - Order items
   * @param {string} [orderData.notes] - Order notes
   * @param {string} orderData.created_by - User ID
   * @returns {Promise<Object>} The local order object with id
   */
  const createOrder = useCallback(async (orderData) => {
    if (mountedRef.current) {
      setIsCreating(true);
      setError(null);
    }

    const orderId = generateLocalId();
    const now = new Date().toISOString();

    // Calculate totals from items
    const items = orderData.items || [];
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

    try {
      const db = getDb();

      // Insert order and items in a transaction
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

      // Insert each order item
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

      // Attach items to the returned order object
      order.items = items;

      if (mountedRef.current) {
        setLastOrder(order);
        setIsCreating(false);
      }

      // If online, immediately trigger sync push
      triggerSyncIfOnline();

      return order;
    } catch (err) {
      // Rollback on failure
      try {
        const db = getDb();
        db.execSync('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }

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
