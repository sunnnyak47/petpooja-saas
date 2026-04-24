/**
 * Petpooja ERP — Local SQLite Database Service
 *
 * Provides offline-first storage for all POS data using better-sqlite3.
 * Database is stored in the user's OS application data directory:
 *   - Windows: C:\Users\<User>\AppData\Roaming\petpooja-erp\petpooja-local.db
 *   - macOS:   ~/Library/Application Support/petpooja-erp/petpooja-local.db
 *
 * Architecture:
 *   - MenuDB    → local menu cache (synced from cloud)
 *   - OrderDB   → orders created offline, synced when back online
 *   - KotDB     → KOTs created offline, synced when back online
 *   - TableDB   → table status managed locally in real-time
 *   - SyncDB    → queue of records waiting to upload to cloud
 *   - SettingsDB→ cached key-value settings
 */

const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')
const crypto = require('crypto')

const DB_PATH = path.join(app.getPath('userData'), 'petpooja-local.db')

let db = null

// ─────────────────────────────────────
// CONNECTION
// ─────────────────────────────────────
/**
 * Returns a singleton better-sqlite3 connection.
 * Creates and initializes the DB on first call.
 * @returns {Database.Database}
 */
function getDB() {
  if (db) return db

  db = new Database(DB_PATH, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null,
  })

  // Performance + correctness pragmas
  db.pragma('journal_mode = WAL')     // Write-Ahead Logging — better concurrency
  db.pragma('synchronous = NORMAL')   // Balanced durability vs speed
  db.pragma('foreign_keys = ON')      // Enforce referential integrity
  db.pragma('cache_size = -16000')    // 16MB cache

  initSchema()
  return db
}

// ─────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────
/**
 * Creates all tables and indexes required for offline POS operation.
 * Uses IF NOT EXISTS so safe to call on every startup.
 */
function initSchema() {
  const database = getDB()

  database.exec(`
    -- ── Outlet Config ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS outlets (
      id                    TEXT PRIMARY KEY,
      name                  TEXT NOT NULL,
      address               TEXT,
      city                  TEXT,
      state                 TEXT,
      gstin                 TEXT,
      fssai                 TEXT,
      phone                 TEXT,
      logo_url              TEXT,
      gst_rate              REAL DEFAULT 5,
      service_charge        REAL DEFAULT 0,
      qr_ordering_enabled   INTEGER DEFAULT 0,
      operating_hours       TEXT,
      synced_at             TEXT,
      updated_at            TEXT
    );

    -- ── Menu Categories ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS menu_categories (
      id            TEXT PRIMARY KEY,
      outlet_id     TEXT NOT NULL,
      name          TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1,
      synced_at     TEXT
    );

    -- ── Menu Items ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS menu_items (
      id            TEXT PRIMARY KEY,
      outlet_id     TEXT NOT NULL,
      category_id   TEXT,
      name          TEXT NOT NULL,
      description   TEXT,
      price         REAL NOT NULL,
      image_url     TEXT,
      veg_type      TEXT DEFAULT 'veg',
      gst_rate      REAL DEFAULT 5,
      hsn_code      TEXT DEFAULT '9963',
      is_available  INTEGER DEFAULT 1,
      is_bestseller INTEGER DEFAULT 0,
      short_code    TEXT,
      display_order INTEGER DEFAULT 0,
      synced_at     TEXT
    );

    -- ── Item Variants ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS item_variants (
      id             TEXT PRIMARY KEY,
      item_id        TEXT NOT NULL,
      name           TEXT NOT NULL,
      price_addition REAL DEFAULT 0,
      is_default     INTEGER DEFAULT 0
    );

    -- ── Item Addons ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS item_addons (
      id       TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      item_id  TEXT NOT NULL,
      name     TEXT NOT NULL,
      price    REAL DEFAULT 0
    );

    -- ── Tables ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tables (
      id           TEXT PRIMARY KEY,
      outlet_id    TEXT NOT NULL,
      table_number INTEGER NOT NULL,
      area_name    TEXT,
      capacity     INTEGER DEFAULT 4,
      status       TEXT DEFAULT 'available'
    );

    -- ── Orders ─────────────────────────────────────────────────
    -- Created offline, synced to cloud when network restores
    CREATE TABLE IF NOT EXISTS orders (
      id                 TEXT PRIMARY KEY,
      outlet_id          TEXT NOT NULL,
      order_number       TEXT,
      table_id           TEXT,
      table_number       INTEGER,
      order_type         TEXT DEFAULT 'dine_in',
      source             TEXT DEFAULT 'pos',
      status             TEXT DEFAULT 'active',
      customer_name      TEXT,
      customer_phone     TEXT,
      covers             INTEGER DEFAULT 1,
      notes              TEXT,
      subtotal           REAL DEFAULT 0,
      tax_amount         REAL DEFAULT 0,
      cgst_amount        REAL DEFAULT 0,
      sgst_amount        REAL DEFAULT 0,
      service_charge     REAL DEFAULT 0,
      discount_amount    REAL DEFAULT 0,
      total_amount       REAL DEFAULT 0,
      payment_method     TEXT,
      payment_status     TEXT DEFAULT 'pending',
      invoice_number     TEXT,
      synced             INTEGER DEFAULT 0,
      sync_error         TEXT,
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now')),
      billed_at          TEXT,
      paid_at            TEXT,
      cancelled_at       TEXT,
      cancellation_reason TEXT
    );

    -- ── Order Items ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS order_items (
      id             TEXT PRIMARY KEY,
      order_id       TEXT NOT NULL,
      outlet_id      TEXT NOT NULL,
      menu_item_id   TEXT,
      menu_item_name TEXT NOT NULL,
      variant_id     TEXT,
      variant_name   TEXT,
      quantity       INTEGER DEFAULT 1,
      unit_price     REAL NOT NULL,
      addon_total    REAL DEFAULT 0,
      line_total     REAL NOT NULL,
      kot_status     TEXT DEFAULT 'pending',
      notes          TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    -- ── KOTs ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS kot (
      id           TEXT PRIMARY KEY,
      order_id     TEXT NOT NULL,
      outlet_id    TEXT NOT NULL,
      kot_number   TEXT,
      table_number INTEGER,
      source       TEXT DEFAULT 'pos',
      status       TEXT DEFAULT 'sent',
      items_count  INTEGER DEFAULT 0,
      printed_at   TEXT,
      synced       INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- ── KOT Items ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS kot_items (
      id             TEXT PRIMARY KEY,
      kot_id         TEXT NOT NULL,
      order_item_id  TEXT,
      menu_item_name TEXT NOT NULL,
      quantity       INTEGER NOT NULL,
      addons         TEXT,
      notes          TEXT
    );

    -- ── Sync Queue ─────────────────────────────────────────────
    -- Pending cloud uploads for when connectivity restores
    CREATE TABLE IF NOT EXISTS sync_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name  TEXT NOT NULL,
      record_id   TEXT NOT NULL,
      operation   TEXT NOT NULL,
      data        TEXT NOT NULL,
      attempts    INTEGER DEFAULT 0,
      last_error  TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- ── Sync Conflict Audit ─────────────────────────────────────
    -- Durable record of offline/cloud conflicts resolved by SyncEngine.
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id             TEXT PRIMARY KEY,
      outlet_id      TEXT NOT NULL,
      table_name     TEXT NOT NULL,
      record_id      TEXT NOT NULL,
      conflict_type  TEXT NOT NULL,
      cloud_status   TEXT,
      local_status   TEXT,
      resolution     TEXT NOT NULL,
      payload        TEXT,
      resolved_at    TEXT DEFAULT (datetime('now')),
      created_at     TEXT DEFAULT (datetime('now'))
    );

    -- ── Staff ──────────────────────────────────────────────────
    -- Cached locally for PIN verification without internet
    CREATE TABLE IF NOT EXISTS staff (
      id        TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL,
      name      TEXT NOT NULL,
      role      TEXT NOT NULL,
      pin       TEXT,
      is_active INTEGER DEFAULT 1
    );

    -- ── Settings Cache ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT
    );

    -- ── Indexes ────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_orders_outlet      ON orders(outlet_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_table       ON orders(table_id);
    CREATE INDEX IF NOT EXISTS idx_orders_synced      ON orders(synced);
    CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_kot    ON order_items(order_id, kot_status);
    CREATE INDEX IF NOT EXISTS idx_kot_order          ON kot(order_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue(attempts);
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_outlet ON sync_conflicts(outlet_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_record ON sync_conflicts(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_outlet  ON menu_items(outlet_id, is_available);
    CREATE INDEX IF NOT EXISTS idx_menu_items_cat     ON menu_items(category_id);
  `)
}

// ─────────────────────────────────────
// MENU OPERATIONS
// ─────────────────────────────────────
const MenuDB = {

  /**
   * Returns all active menu categories with item counts.
   * @param {string} outletId
   * @returns {object[]}
   */
  getCategories(outletId) {
    return getDB().prepare(`
      SELECT c.*, COUNT(i.id) as item_count
      FROM menu_categories c
      LEFT JOIN menu_items i ON i.category_id = c.id AND i.is_available = 1
      WHERE c.outlet_id = ? AND c.is_active = 1
      GROUP BY c.id
      ORDER BY c.display_order
    `).all(outletId)
  },

  /**
   * Returns available menu items, optionally filtered by category.
   * @param {string} outletId
   * @param {string|null} categoryId
   * @returns {object[]}
   */
  getItems(outletId, categoryId = null) {
    if (categoryId) {
      return getDB().prepare(`
        SELECT * FROM menu_items
        WHERE outlet_id = ? AND category_id = ? AND is_available = 1
        ORDER BY display_order
      `).all(outletId, categoryId)
    }
    return getDB().prepare(`
      SELECT * FROM menu_items
      WHERE outlet_id = ? AND is_available = 1
      ORDER BY display_order
    `).all(outletId)
  },

  /**
   * Returns all variants for a menu item.
   * @param {string} itemId
   */
  getVariants(itemId) {
    return getDB().prepare(`SELECT * FROM item_variants WHERE item_id = ?`).all(itemId)
  },

  /**
   * Returns all addons for a menu item.
   * @param {string} itemId
   */
  getAddons(itemId) {
    return getDB().prepare(`SELECT * FROM item_addons WHERE item_id = ?`).all(itemId)
  },

  /**
   * Bulk-saves categories and items from a cloud sync payload.
   * Uses a single transaction for atomicity.
   * @param {object[]} categories
   * @param {object[]} items
   */
  saveMenuFromSync(categories, items) {
    const database = getDB()
    const now = new Date().toISOString()

    const insertCat = database.prepare(`
      INSERT OR REPLACE INTO menu_categories
      (id, outlet_id, name, display_order, is_active, synced_at)
      VALUES (@id, @outlet_id, @name, @display_order, @is_active, @synced_at)
    `)

    const insertItem = database.prepare(`
      INSERT OR REPLACE INTO menu_items
      (id, outlet_id, category_id, name, description, price, image_url,
       veg_type, gst_rate, hsn_code, is_available, is_bestseller,
       short_code, display_order, synced_at)
      VALUES
      (@id, @outlet_id, @category_id, @name, @description, @price, @image_url,
       @veg_type, @gst_rate, @hsn_code, @is_available, @is_bestseller,
       @short_code, @display_order, @synced_at)
    `)

    database.transaction((cats, itms) => {
      for (const cat of cats) insertCat.run({ ...cat, synced_at: now })
      for (const item of itms) insertItem.run({ ...item, synced_at: now })
    })(categories, items)
  },
}

// ─────────────────────────────────────
// ORDER OPERATIONS
// ─────────────────────────────────────
const OrderDB = {

  /**
   * Creates a new order locally and queues it for cloud sync.
   * @param {object} orderData
   * @returns {string} new order UUID
   */
  create(orderData) {
    const id = orderData.id || crypto.randomUUID()
    const now = new Date().toISOString()

    getDB().prepare(`
      INSERT INTO orders (
        id, outlet_id, order_number, table_id, table_number,
        order_type, source, status, customer_name, customer_phone,
        covers, notes, subtotal, tax_amount, cgst_amount, sgst_amount,
        service_charge, discount_amount, total_amount, synced, created_at, updated_at
      ) VALUES (
        @id, @outlet_id, @order_number, @table_id, @table_number,
        @order_type, @source, @status, @customer_name, @customer_phone,
        @covers, @notes, @subtotal, @tax_amount, @cgst_amount, @sgst_amount,
        @service_charge, @discount_amount, @total_amount, 0, @created_at, @updated_at
      )
    `).run({ ...orderData, id, created_at: now, updated_at: now })

    SyncDB.enqueue('orders', id, 'INSERT', { ...orderData, id })
    return id
  },

  /**
   * Returns the active order on a table with its items joined.
   * @param {string} tableId
   * @param {string} outletId
   * @returns {object|undefined}
   */
  getByTable(tableId, outletId) {
    const order = getDB().prepare(`
      SELECT * FROM orders
      WHERE table_id = ? AND outlet_id = ?
        AND status IN ('active','confirmed','billed')
      ORDER BY created_at DESC LIMIT 1
    `).get(tableId, outletId)

    if (order) {
      order.items = getDB().prepare(`
        SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at
      `).all(order.id)
    }
    return order
  },

  /**
   * Returns a full order with its items by ID.
   * @param {string} orderId
   * @returns {object|undefined}
   */
  getById(orderId) {
    const order = getDB().prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId)
    if (order) {
      order.items = getDB().prepare(`
        SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at
      `).all(orderId)
    }
    return order
  },

  /**
   * Updates the order status and optional extra fields (invoice, timestamps).
   * Queues the update for cloud sync.
   * @param {string} orderId
   * @param {string} status
   * @param {object} extra - optional { invoice_number, billed_at, paid_at, payment_method }
   */
  updateStatus(orderId, status, extra = {}) {
    const now = new Date().toISOString()
    const fields = ['status = @status', 'updated_at = @updated_at']
    const params = { orderId, status, updated_at: now }

    if (extra.invoice_number) { fields.push('invoice_number = @invoice_number'); params.invoice_number = extra.invoice_number }
    if (extra.billed_at)      { fields.push('billed_at = @billed_at');           params.billed_at = extra.billed_at }
    if (extra.paid_at)        { fields.push('paid_at = @paid_at');               params.paid_at = extra.paid_at }
    if (extra.payment_method) { fields.push('payment_method = @payment_method'); params.payment_method = extra.payment_method }

    getDB().prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = @orderId`).run(params)
    SyncDB.enqueue('orders', orderId, 'UPDATE', { id: orderId, status, updated_at: now, ...extra })
  },

  /**
   * Adds an item to an order and recalculates order totals.
   * @param {object} itemData
   * @returns {string} new order item UUID
   */
  addItem(itemData) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    getDB().prepare(`
      INSERT INTO order_items (
        id, order_id, outlet_id, menu_item_id, menu_item_name,
        variant_id, variant_name, quantity, unit_price, addon_total,
        line_total, kot_status, notes, created_at
      ) VALUES (
        @id, @order_id, @outlet_id, @menu_item_id, @menu_item_name,
        @variant_id, @variant_name, @quantity, @unit_price, @addon_total,
        @line_total, 'pending', @notes, @created_at
      )
    `).run({ ...itemData, id, created_at: now })

    // Recalculate order totals atomically
    const rows = getDB().prepare(`
      SELECT SUM(line_total) as subtotal FROM order_items WHERE order_id = ?
    `).get(itemData.order_id)

    const subtotal = rows.subtotal || 0
    const cgst = subtotal * 0.025
    const sgst = subtotal * 0.025
    const total = subtotal + cgst + sgst

    getDB().prepare(`
      UPDATE orders
      SET subtotal = ?, cgst_amount = ?, sgst_amount = ?,
          tax_amount = ?, total_amount = ?, updated_at = ?
      WHERE id = ?
    `).run(subtotal, cgst, sgst, cgst + sgst, total, now, itemData.order_id)

    return id
  },

  /**
   * Returns all order items with status 'pending' (not yet sent to kitchen).
   * @param {string} orderId
   * @returns {object[]}
   */
  getPendingItems(orderId) {
    return getDB().prepare(`
      SELECT * FROM order_items WHERE order_id = ? AND kot_status = 'pending'
    `).all(orderId)
  },

  /**
   * Marks all pending items on an order as 'sent' after KOT generation.
   * @param {string} orderId
   */
  markItemsKOTSent(orderId) {
    getDB().prepare(`
      UPDATE order_items SET kot_status = 'sent'
      WHERE order_id = ? AND kot_status = 'pending'
    `).run(orderId)
  },

  /**
   * Returns paginated orders for an outlet with optional filters.
   * @param {string} outletId
   * @param {{ status?: string, date?: string }} filters
   * @returns {object[]}
   */
  getAll(outletId, filters = {}) {
    let sql = `SELECT * FROM orders WHERE outlet_id = ?`
    const params = [outletId]

    if (filters.status) { sql += ` AND status = ?`; params.push(filters.status) }
    if (filters.date)   { sql += ` AND date(created_at) = date(?)`; params.push(filters.date) }

    sql += ` ORDER BY created_at DESC LIMIT 100`
    return getDB().prepare(sql).all(...params)
  },

  /**
   * Returns orders not yet synced to the cloud, oldest first.
   * @returns {object[]}
   */
  getUnsyncedOrders() {
    return getDB().prepare(`
      SELECT * FROM orders WHERE synced = 0 ORDER BY created_at ASC LIMIT 50
    `).all()
  },

  /**
   * Marks an order as successfully synced to the cloud.
   * @param {string} orderId
   */
  markSynced(orderId) {
    getDB().prepare(`
      UPDATE orders SET synced = 1, sync_error = NULL WHERE id = ?
    `).run(orderId)
  },

  /**
   * Records the latest sync error on an order without changing business state.
   * @param {string} orderId
   * @param {string} error
   */
  markSyncError(orderId, error) {
    getDB().prepare(`
      UPDATE orders SET sync_error = ? WHERE id = ?
    `).run(error, orderId)
  },

  /**
   * Applies an authoritative cloud conflict resolution without enqueueing
   * another local UPDATE operation.
   * @param {string} orderId
   * @param {string} status
   * @param {object} extra
   */
  applyConflictResolution(orderId, status, extra = {}) {
    const now = new Date().toISOString()
    const fields = [
      'status = @status',
      'synced = 1',
      'sync_error = NULL',
      'updated_at = @updated_at',
    ]
    const params = { orderId, status, updated_at: now }

    if (extra.invoice_number) { fields.push('invoice_number = @invoice_number'); params.invoice_number = extra.invoice_number }
    if (extra.billed_at)      { fields.push('billed_at = @billed_at');           params.billed_at = extra.billed_at }
    if (extra.paid_at)        { fields.push('paid_at = @paid_at');               params.paid_at = extra.paid_at }
    if (extra.payment_method) { fields.push('payment_method = @payment_method'); params.payment_method = extra.payment_method }
    if (extra.cancelled_at)   { fields.push('cancelled_at = @cancelled_at');     params.cancelled_at = extra.cancelled_at }
    if (extra.cancellation_reason) {
      fields.push('cancellation_reason = @cancellation_reason')
      params.cancellation_reason = extra.cancellation_reason
    }

    getDB().prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = @orderId`).run(params)
  },
}

// ─────────────────────────────────────
// KOT OPERATIONS
// ─────────────────────────────────────
const KotDB = {

  /**
   * Creates a KOT and its line items in a single transaction.
   * Queues for cloud sync.
   * @param {object} kotData
   * @param {object[]} items
   * @returns {string} KOT UUID
   */
  create(kotData, items) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const database = getDB()
    database.prepare(`
      INSERT INTO kot (id, order_id, outlet_id, kot_number, table_number,
        source, status, items_count, printed_at, synced, created_at)
      VALUES (@id, @order_id, @outlet_id, @kot_number, @table_number,
        @source, 'sent', @items_count, @printed_at, 0, @created_at)
    `).run({ ...kotData, id, created_at: now })

    const insertItem = database.prepare(`
      INSERT INTO kot_items (id, kot_id, order_item_id, menu_item_name, quantity, addons, notes)
      VALUES (@id, @kot_id, @order_item_id, @menu_item_name, @quantity, @addons, @notes)
    `)

    for (const item of items) {
      insertItem.run({
        id: crypto.randomUUID(),
        kot_id: id,
        order_item_id: item.order_item_id || null,
        menu_item_name: item.menu_item_name,
        quantity: item.quantity,
        addons: item.addons || null,
        notes: item.notes || null,
      })
    }

    SyncDB.enqueue('kot', id, 'INSERT', { ...kotData, id, items })
    return id
  },

  /**
   * Returns all KOTs for an order with their line items as JSON.
   * @param {string} orderId
   * @returns {object[]}
   */
  getForOrder(orderId) {
    return getDB().prepare(`
      SELECT k.*,
        json_group_array(json_object(
          'name', ki.menu_item_name,
          'qty', ki.quantity,
          'addons', ki.addons,
          'notes', ki.notes
        )) as items
      FROM kot k
      LEFT JOIN kot_items ki ON ki.kot_id = k.id
      WHERE k.order_id = ?
      GROUP BY k.id
      ORDER BY k.created_at
    `).all(orderId)
  },
}

// ─────────────────────────────────────
// TABLE OPERATIONS
// ─────────────────────────────────────
const TableDB = {

  /**
   * Returns all tables for an outlet with current active order info joined.
   * @param {string} outletId
   * @returns {object[]}
   */
  getAll(outletId) {
    return getDB().prepare(`
      SELECT t.*,
        o.id               as order_id,
        o.total_amount     as order_total,
        o.created_at       as order_started_at,
        o.covers
      FROM tables t
      LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('active','confirmed','billed')
      WHERE t.outlet_id = ?
      ORDER BY t.table_number
    `).all(outletId)
  },

  /**
   * Updates the local status of a table (available / occupied / reserved).
   * @param {string} tableId
   * @param {string} status
   */
  updateStatus(tableId, status) {
    getDB().prepare(`UPDATE tables SET status = ? WHERE id = ?`).run(status, tableId)
  },

  /**
   * Bulk-saves tables from a cloud sync payload.
   * @param {object[]} tables
   */
  saveFromSync(tables) {
    const insert = getDB().prepare(`
      INSERT OR REPLACE INTO tables (id, outlet_id, table_number, area_name, capacity, status)
      VALUES (@id, @outlet_id, @table_number, @area_name, @capacity, @status)
    `)
    for (const table of tables) insert.run(table)
  },
}

// ─────────────────────────────────────
// SYNC QUEUE
// ─────────────────────────────────────
const SyncDB = {

  /**
   * Adds a record operation to the upload queue.
   * @param {string} tableName
   * @param {string} recordId
   * @param {'INSERT'|'UPDATE'|'DELETE'} operation
   * @param {object} data
   */
  enqueue(tableName, recordId, operation, data) {
    getDB().prepare(`
      INSERT INTO sync_queue (table_name, record_id, operation, data)
      VALUES (?, ?, ?, ?)
    `).run(tableName, recordId, operation, JSON.stringify(data))
  },

  /**
   * Returns up to 20 pending records with fewer than 3 failed attempts.
   * @returns {object[]}
   */
  getPending() {
    return getDB().prepare(`
      SELECT * FROM sync_queue WHERE attempts < 3 ORDER BY created_at ASC LIMIT 20
    `).all()
  },

  /**
   * Removes a successfully synced record from the queue.
   * @param {number} id
   */
  markSuccess(id) {
    getDB().prepare(`DELETE FROM sync_queue WHERE id = ?`).run(id)
  },

  /**
   * Increments attempt count and logs the error for a failed sync.
   * @param {number} id
   * @param {string} error
   */
  markFailed(id, error) {
    getDB().prepare(`
      UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?
    `).run(error, id)
  },

  /** Clears the entire sync queue (use only after full re-sync). */
  clearAll() {
    getDB().prepare(`DELETE FROM sync_queue`).run()
  },

  /**
   * Persists an offline/cloud conflict resolution for audit and diagnostics.
   * @param {object} conflict
   * @returns {string}
   */
  logConflict(conflict) {
    const id = conflict.id || crypto.randomUUID()
    getDB().prepare(`
      INSERT INTO sync_conflicts (
        id, outlet_id, table_name, record_id, conflict_type, cloud_status,
        local_status, resolution, payload, resolved_at, created_at
      ) VALUES (
        @id, @outlet_id, @table_name, @record_id, @conflict_type, @cloud_status,
        @local_status, @resolution, @payload, @resolved_at, @created_at
      )
    `).run({
      id,
      outlet_id: conflict.outlet_id,
      table_name: conflict.table_name,
      record_id: conflict.record_id,
      conflict_type: conflict.conflict_type,
      cloud_status: conflict.cloud_status || null,
      local_status: conflict.local_status || null,
      resolution: conflict.resolution,
      payload: JSON.stringify(conflict.payload || {}),
      resolved_at: conflict.resolved_at || new Date().toISOString(),
      created_at: conflict.created_at || new Date().toISOString(),
    })
    return id
  },

  /**
   * Returns recent sync conflicts for an outlet.
   * @param {string} outletId
   * @param {number} limit
   * @returns {object[]}
   */
  getConflicts(outletId, limit = 50) {
    return getDB().prepare(`
      SELECT * FROM sync_conflicts
      WHERE outlet_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(outletId, limit)
  },
}

// ─────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────
const SettingsDB = {

  /**
   * Retrieves a cached setting value by key.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const row = getDB().prepare(`SELECT value FROM settings WHERE key = ?`).get(key)
    return row ? JSON.parse(row.value) : null
  },

  /**
   * Persists a setting value (any JSON-serializable value).
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    getDB().prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `).run(key, JSON.stringify(value))
  },
}

/**
 * Returns the absolute path to the SQLite database file.
 * Useful for diagnostic logging.
 * @returns {string}
 */
function getDBPath() {
  return DB_PATH
}

module.exports = {
  getDB,
  MenuDB,
  OrderDB,
  KotDB,
  TableDB,
  SyncDB,
  SettingsDB,
  getDBPath,
}
