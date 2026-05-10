import { getDb } from './sqlite';

/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID if available, otherwise falls back to pattern replacement.
 *
 * @returns {string} A UUID v4 string
 */
function generateUUID() {
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
 * Create an offline order with its items.
 * Calculates subtotal and total from items automatically.
 *
 * @param {Object} orderData
 * @param {string} orderData.outlet_id
 * @param {string} [orderData.order_type='dine_in']
 * @param {string} [orderData.table_id]
 * @param {string} [orderData.customer_id]
 * @param {string} [orderData.source='pos']
 * @param {string} [orderData.notes]
 * @param {number} [orderData.tax=0]
 * @param {number} [orderData.discount=0]
 * @param {string} [orderData.created_by]
 * @param {Array} orderData.items - Array of order item objects
 * @param {string} orderData.items[].menu_item_id
 * @param {string} orderData.items[].item_name
 * @param {string} [orderData.items[].variant_id]
 * @param {string} [orderData.items[].variant_name]
 * @param {number} orderData.items[].quantity
 * @param {number} orderData.items[].unit_price
 * @param {string} [orderData.items[].notes]
 * @param {Array} [orderData.items[].addons]
 * @returns {Object} The created order with id and items
 */
export function createOfflineOrder(orderData) {
  const db = getDb();
  const orderId = generateUUID();
  const now = new Date().toISOString();

  const {
    outlet_id,
    order_type = 'dine_in',
    table_id = null,
    customer_id = null,
    source = 'pos',
    notes = null,
    tax = 0,
    discount = 0,
    created_by = null,
    items = [],
  } = orderData;

  if (!outlet_id) {
    throw new Error('[OfflineOrders] outlet_id is required');
  }

  if (!items || items.length === 0) {
    throw new Error('[OfflineOrders] At least one item is required');
  }

  // Calculate subtotal from items
  const orderItems = items.map((item) => {
    const totalPrice = (item.unit_price ?? 0) * (item.quantity ?? 1);
    return {
      id: generateUUID(),
      order_id: orderId,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      variant_id: item.variant_id ?? null,
      variant_name: item.variant_name ?? null,
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? 0,
      total_price: totalPrice,
      notes: item.notes ?? null,
      addons_json: JSON.stringify(item.addons ?? []),
    };
  });

  const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
  const total = subtotal + tax - discount;

  try {
    db.execSync('BEGIN TRANSACTION');

    // Insert order
    db.runSync(
      `INSERT INTO offline_orders (id, outlet_id, order_type, table_id, customer_id, source, notes, subtotal, tax, discount, total, status, payment_status, created_by, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'unpaid', ?, ?, 0)`,
      [
        orderId,
        outlet_id,
        order_type,
        table_id,
        customer_id,
        source,
        notes,
        subtotal,
        tax,
        discount,
        total,
        created_by,
        now,
      ]
    );

    // Insert order items
    for (const item of orderItems) {
      db.runSync(
        `INSERT INTO offline_order_items (id, order_id, menu_item_id, item_name, variant_id, variant_name, quantity, unit_price, total_price, notes, addons_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.order_id,
          item.menu_item_id,
          item.item_name,
          item.variant_id,
          item.variant_name,
          item.quantity,
          item.unit_price,
          item.total_price,
          item.notes,
          item.addons_json,
        ]
      );
    }

    db.execSync('COMMIT');

    return {
      id: orderId,
      outlet_id,
      order_type,
      table_id,
      customer_id,
      source,
      notes,
      subtotal,
      tax,
      discount,
      total,
      status: 'active',
      payment_status: 'unpaid',
      created_by,
      created_at: now,
      synced: false,
      items: orderItems.map((item) => ({
        ...item,
        addons: safeJsonParse(item.addons_json, []),
      })),
    };
  } catch (error) {
    db.execSync('ROLLBACK');
    console.error('[OfflineOrders] Failed to create order:', error);
    throw error;
  }
}

/**
 * Get offline orders for an outlet with optional filters.
 *
 * @param {string} outletId
 * @param {Object} [options]
 * @param {number} [options.synced] - Filter by sync status (0 or 1)
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @returns {Array} Array of order objects (without items)
 */
export function getOfflineOrders(outletId, options = {}) {
  const db = getDb();
  const { synced, limit = 50, offset = 0 } = options;

  try {
    let query = 'SELECT * FROM offline_orders WHERE outlet_id = ?';
    const params = [outletId];

    if (synced !== undefined && synced !== null) {
      query += ' AND synced = ?';
      params.push(synced);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.getAllSync(query, params);

    return rows.map(parseOrder);
  } catch (error) {
    console.error('[OfflineOrders] Failed to get orders:', error);
    return [];
  }
}

/**
 * Get a single offline order by ID, including its items.
 *
 * @param {string} orderId
 * @returns {Object|null} Order with items array, or null if not found
 */
export function getOfflineOrderById(orderId) {
  const db = getDb();

  try {
    const orderRows = db.getAllSync(
      'SELECT * FROM offline_orders WHERE id = ?',
      [orderId]
    );

    if (orderRows.length === 0) return null;

    const order = parseOrder(orderRows[0]);

    const itemRows = db.getAllSync(
      'SELECT * FROM offline_order_items WHERE order_id = ? ORDER BY item_name ASC',
      [orderId]
    );

    order.items = itemRows.map((item) => ({
      ...item,
      addons: safeJsonParse(item.addons_json, []),
    }));

    return order;
  } catch (error) {
    console.error('[OfflineOrders] Failed to get order by ID:', error);
    return null;
  }
}

/**
 * Get all orders that haven't been synced yet, ordered by creation time.
 *
 * @returns {Array} Array of unsynced orders with their items
 */
export function getPendingOrders() {
  const db = getDb();

  try {
    const orderRows = db.getAllSync(
      'SELECT * FROM offline_orders WHERE synced = 0 ORDER BY created_at ASC'
    );

    return orderRows.map((row) => {
      const order = parseOrder(row);

      const itemRows = db.getAllSync(
        'SELECT * FROM offline_order_items WHERE order_id = ?',
        [order.id]
      );

      order.items = itemRows.map((item) => ({
        ...item,
        addons: safeJsonParse(item.addons_json, []),
      }));

      return order;
    });
  } catch (error) {
    console.error('[OfflineOrders] Failed to get pending orders:', error);
    return [];
  }
}

/**
 * Mark an order as successfully synced to the cloud.
 *
 * @param {string} orderId
 * @param {string} cloudId - The ID assigned by the server
 */
export function markOrderSynced(orderId, cloudId) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    db.runSync(
      `UPDATE offline_orders
       SET synced = 1, synced_at = ?, cloud_id = ?, sync_error = NULL
       WHERE id = ?`,
      [now, cloudId, orderId]
    );
  } catch (error) {
    console.error('[OfflineOrders] Failed to mark order synced:', error);
    throw error;
  }
}

/**
 * Mark an order sync attempt as failed.
 *
 * @param {string} orderId
 * @param {string} error - Error message from the sync attempt
 */
export function markOrderSyncFailed(orderId, error) {
  const db = getDb();

  try {
    db.runSync(
      `UPDATE offline_orders
       SET sync_attempts = sync_attempts + 1, sync_error = ?
       WHERE id = ?`,
      [error, orderId]
    );
  } catch (err) {
    console.error('[OfflineOrders] Failed to mark order sync failed:', err);
    throw err;
  }
}

/**
 * Get count of orders for an outlet with optional sync filter.
 *
 * @param {string} outletId
 * @param {Object} [options]
 * @param {number} [options.synced] - Filter by sync status (0 or 1)
 * @returns {number} Count of matching orders
 */
export function getOrderCount(outletId, options = {}) {
  const db = getDb();
  const { synced } = options;

  try {
    let query = 'SELECT COUNT(*) as count FROM offline_orders WHERE outlet_id = ?';
    const params = [outletId];

    if (synced !== undefined && synced !== null) {
      query += ' AND synced = ?';
      params.push(synced);
    }

    const rows = db.getAllSync(query, params);
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error('[OfflineOrders] Failed to get order count:', error);
    return 0;
  }
}

/**
 * Delete synced orders older than the specified number of days.
 * Only removes orders that have been successfully synced.
 *
 * @param {number} [daysOld=7] - Delete orders older than this many days
 * @returns {number} Number of orders deleted
 */
export function deleteOldSyncedOrders(daysOld = 7) {
  const db = getDb();
  const cutoffDate = new Date(
    Date.now() - daysOld * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    db.execSync('BEGIN TRANSACTION');

    // Get IDs of orders to delete
    const ordersToDelete = db.getAllSync(
      `SELECT id FROM offline_orders
       WHERE synced = 1 AND created_at < ?`,
      [cutoffDate]
    );

    if (ordersToDelete.length === 0) {
      db.execSync('COMMIT');
      return 0;
    }

    const orderIds = ordersToDelete.map((o) => o.id);

    // Delete items for those orders
    for (const id of orderIds) {
      db.runSync('DELETE FROM offline_order_items WHERE order_id = ?', [id]);
    }

    // Delete the orders themselves
    const result = db.runSync(
      `DELETE FROM offline_orders WHERE synced = 1 AND created_at < ?`,
      [cutoffDate]
    );

    db.execSync('COMMIT');

    const deletedCount = result.changes ?? orderIds.length;
    console.log(
      `[OfflineOrders] Cleaned up ${deletedCount} old synced orders`
    );
    return deletedCount;
  } catch (error) {
    db.execSync('ROLLBACK');
    console.error('[OfflineOrders] Failed to delete old orders:', error);
    return 0;
  }
}

// --- Internal Helpers ---

function parseOrder(row) {
  return {
    id: row.id,
    outlet_id: row.outlet_id,
    order_type: row.order_type,
    table_id: row.table_id,
    customer_id: row.customer_id,
    source: row.source,
    notes: row.notes,
    subtotal: row.subtotal,
    tax: row.tax,
    discount: row.discount,
    total: row.total,
    status: row.status,
    payment_status: row.payment_status,
    created_by: row.created_by,
    created_at: row.created_at,
    synced: Boolean(row.synced),
    synced_at: row.synced_at,
    sync_attempts: row.sync_attempts,
    sync_error: row.sync_error,
    cloud_id: row.cloud_id,
  };
}

function safeJsonParse(jsonStr, fallback = null) {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}
