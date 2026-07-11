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

let _DB_PATH = null
function getDbPath() {
  if (!_DB_PATH) _DB_PATH = path.join(app.getPath('userData'), 'petpooja-local.db')
  return _DB_PATH
}

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

  db = new Database(getDbPath(), {
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

    -- ── Customers (offline lookup cache + queued creates) ──────
    CREATE TABLE IF NOT EXISTS customers (
      id         TEXT PRIMARY KEY,
      outlet_id  TEXT NOT NULL,
      name       TEXT,
      phone      TEXT,
      email      TEXT,
      synced     INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
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
    CREATE INDEX IF NOT EXISTS idx_customers_outlet   ON customers(outlet_id, phone);
    CREATE INDEX IF NOT EXISTS idx_customers_unsynced ON customers(synced);
  `)

  migrateSchema(database)
}

/**
 * Additive column migrations for databases created by older app versions.
 * SQLite has no ADD COLUMN IF NOT EXISTS, so each ALTER is individually
 * try/caught — "duplicate column name" simply means it already ran.
 */
function migrateSchema(database) {
  const alters = [
    // Region awareness — without these the offline biller cannot know the
    // outlet is Australian and silently falls back to Indian 5% CGST/SGST.
    `ALTER TABLE outlets ADD COLUMN code         TEXT`,
    `ALTER TABLE outlets ADD COLUMN country_code TEXT`,
    `ALTER TABLE outlets ADD COLUMN region       TEXT`,
    `ALTER TABLE outlets ADD COLUMN currency     TEXT`,
    `ALTER TABLE outlets ADD COLUMN abn          TEXT`,
    `ALTER TABLE outlets ADD COLUMN gst_inclusive INTEGER DEFAULT 0`,
    // Sync fidelity — the cloud allocates its own order number on sync; keep
    // it alongside the offline one so receipts remain traceable both ways.
    `ALTER TABLE orders ADD COLUMN cloud_order_number TEXT`,
    // Record-&-reconcile payments taken on a standalone terminal while offline.
    `ALTER TABLE orders ADD COLUMN payment_note TEXT`,
    `ALTER TABLE orders ADD COLUMN customer_id  TEXT`,
    // Discount fidelity — POS sends discount_type/discount_value (percentage or
    // flat); keep them so the offline biller derives the same amount as cloud
    // and receipts can show the discount basis.
    `ALTER TABLE orders ADD COLUMN discount_type  TEXT`,
    `ALTER TABLE orders ADD COLUMN discount_value REAL`,
    // Rupee round-off carried on the order so the offline total matches the
    // cloud computeGrandTotal (nearest-whole-rupee for exclusive IN orders).
    `ALTER TABLE orders ADD COLUMN round_off      REAL DEFAULT 0`,
    // Poison/dead-letter counter — orders that keep failing to sync are parked
    // after N attempts instead of blocking the queue forever.
    `ALTER TABLE orders ADD COLUMN sync_attempts  INTEGER DEFAULT 0`,
  ]
  for (const sql of alters) {
    try { database.exec(sql) } catch (e) {
      if (!/duplicate column name/i.test(e.message)) throw e
    }
  }
}

// ─────────────────────────────────────
// TAX ENGINE (mirrors backend resolveOutletTaxConfig + computeOrderTotals)
// ─────────────────────────────────────
/**
 * Derives the tax configuration from the cached outlet row.
 * MUST match backend/src/utils/outlet.js: ANY AU signal wins, AU GST is
 * ALWAYS 10% inclusive (single line, no CGST/SGST split); India defaults to
 * the outlet gst_rate (5%) added on top as CGST+SGST halves.
 *
 * @param {object|null} outlet - Row from OutletDB.get (may be null pre-sync)
 * @returns {{ isAU: boolean, rate: number, inclusive: boolean }}
 */
function resolveTaxConfig(outlet) {
  const o = outlet || {}
  const isAU = o.country_code === 'AU' || o.region === 'AU'
    || o.currency === 'AUD' || o.country === 'Australia'
  if (isAU) return { isAU: true, rate: 10, inclusive: true }
  return { isAU: false, rate: Number(o.gst_rate) || 5, inclusive: !!o.gst_inclusive }
}

/**
 * Computes order totals for the offline biller.
 * AU (inclusive): tax is carved OUT of the item prices — total equals the
 *   discounted subtotal; single GST amount, cgst/sgst stay 0.
 * IN (exclusive default): CGST+SGST halves added ON TOP of the discounted base.
 *
 * @param {number} subtotal - Sum of line totals (menu prices)
 * @param {number} discount - Absolute discount amount
 * @param {{ isAU: boolean, rate: number, inclusive: boolean }} cfg
 * @returns {{ subtotal, discount, cgst, sgst, tax, total }}
 */
function computeTotals(subtotal, discount, cfg) {
  const r2 = (n) => Math.round(n * 100) / 100
  const base = Math.max(0, subtotal - (discount || 0))
  if (cfg.inclusive) {
    // Tax already inside the price: tax = base × r/(100+r); total unchanged.
    // Inclusive (AU 10%) carries no rupee round-off.
    const tax = r2(base * cfg.rate / (100 + cfg.rate))
    return { subtotal: r2(subtotal), discount: r2(discount || 0), cgst: 0, sgst: 0, tax, total: r2(base), round_off: 0 }
  }
  const tax = r2(base * cfg.rate / 100)
  const half = r2(tax / 2)
  // Exclusive (IN): round the grand total to the nearest whole rupee and carry
  // the delta as round_off — mirrors the cloud computeGrandTotal.
  const rawTotal = base + tax
  const total = Math.round(rawTotal)
  const round_off = r2(total - rawTotal)
  return { subtotal: r2(subtotal), discount: r2(discount || 0), cgst: half, sgst: r2(tax - half), tax, total, round_off }
}

// ─────────────────────────────────────
// DEVICE ID + LOCAL SEQUENCES (collision-proof offline numbering)
// ─────────────────────────────────────
/**
 * Stable 4-char device id, generated once per install. Namespaces every
 * offline order/invoice number so two tills can never mint the same number
 * — and the "D" segment guarantees no clash with cloud numbers
 * (`CODE-YYYYMMDD-0001`), whose third segment is always purely numeric.
 * @returns {string}
 */
function getDeviceId() {
  let id = SettingsDB.get('device_id')
  if (!id) {
    id = crypto.randomBytes(2).toString('hex').toUpperCase()
    SettingsDB.set('device_id', id)
  }
  return id
}

/**
 * Atomic per-key daily counter backed by the settings table.
 * @param {string} key - e.g. 'order_seq' or 'invoice_seq'
 * @returns {number} next sequence (>= 1)
 */
function nextLocalSequence(key) {
  const day = new Date().toISOString().slice(0, 10)
  const fullKey = `${key}_${day}`
  const tx = getDB().transaction(() => {
    const cur = SettingsDB.get(fullKey) || 0
    const next = cur + 1
    SettingsDB.set(fullKey, next)
    return next
  })
  return tx()
}

/**
 * Builds an offline order number: `CODE-YYYYMMDD-D{device}-{seq}`.
 * @param {object|null} outlet
 * @returns {string}
 */
function nextOfflineOrderNumber(outlet) {
  const code = (outlet?.code || (outlet?.name || 'POS').slice(0, 3)).toUpperCase()
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seq = String(nextLocalSequence('order_seq')).padStart(3, '0')
  return `${code}-${dateStr}-D${getDeviceId()}-${seq}`
}

/**
 * Builds an offline invoice number: `FY-CODE-D{device}-{seq}` (sequential,
 * replaces the old Date.now() slice which was neither sequential nor unique).
 * @param {object|null} outlet
 * @returns {string}
 */
function nextOfflineInvoiceNumber(outlet) {
  const now = new Date()
  const fy = now.getMonth() >= 3
    ? `FY${String(now.getFullYear()).slice(2)}${String(now.getFullYear() + 1).slice(2)}`
    : `FY${String(now.getFullYear() - 1).slice(2)}${String(now.getFullYear()).slice(2)}`
  const code = (outlet?.code || (outlet?.name || 'POS').slice(0, 3)).toUpperCase()
  const seq = String(nextLocalSequence('invoice_seq')).padStart(4, '0')
  return `${fy}-${code}-D${getDeviceId()}-${seq}`
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
    // Alias price→base_price, veg_type→food_type so frontend field names match
    if (categoryId) {
      return getDB().prepare(`
        SELECT *, price AS base_price, veg_type AS food_type FROM menu_items
        WHERE outlet_id = ? AND category_id = ? AND is_available = 1
        ORDER BY display_order
      `).all(outletId, categoryId)
    }
    return getDB().prepare(`
      SELECT *, price AS base_price, veg_type AS food_type FROM menu_items
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
      for (const cat of cats) {
        insertCat.run({
          ...cat,
          is_active: cat.is_active !== undefined ? (cat.is_active ? 1 : 0) : 1,
          synced_at: now,
        })
      }
      for (const item of itms) {
        insertItem.run({
          ...item,
          // Map cloud field names → SQLite column names
          price: item.price ?? item.base_price ?? 0,
          veg_type: item.veg_type ?? item.food_type ?? 'veg',
          is_available: item.is_available !== undefined ? (item.is_available ? 1 : 0) : 1,
          is_bestseller: item.is_bestseller ? 1 : 0,
          synced_at: now,
        })
      }
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
    const database = getDB()
    const id = orderData.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const items = orderData.items || []

    // Calculate totals from items
    let subtotal = 0
    for (const item of items) {
      const addonTotal = (item.addons || []).reduce((s, a) => s + (Number(a.price || 0) * (a.quantity || 1)), 0)
      subtotal += (Number(item.unit_price || 0) + addonTotal) * (item.quantity || 1)
    }

    // Region-aware totals (AU: single 10% GST inclusive; IN: CGST/SGST on top)
    // — replaces the hardcoded Indian 2.5%+2.5% that mis-billed AU outlets.
    // Discount is applied BEFORE tax (previously stored but never subtracted).
    const outlet = OutletDB.get(orderData.outlet_id)
    const cfg = resolveTaxConfig(outlet)
    // POS sends discount_type ('percentage'|'flat') + discount_value, NOT a
    // pre-computed discount_amount. Derive the absolute amount here (clamped to
    // [0, subtotal]) so the offline biller subtracts it before tax.
    const disc = orderData.discount_amount ?? (orderData.discount_type === 'percentage'
      ? subtotal * (Number(orderData.discount_value) || 0) / 100
      : (Number(orderData.discount_value) || 0))
    const discountAmount = Math.min(Math.max(disc, 0), subtotal)
    const { cgst, sgst, tax, total, round_off } = computeTotals(subtotal, discountAmount, cfg)

    // Device-namespaced local order number — can never collide with another
    // till or with cloud-generated numbers.
    const orderNumber = orderData.order_number || nextOfflineOrderNumber(outlet)

    database.transaction(() => {
      // 1. Insert order header
      database.prepare(`
        INSERT INTO orders (
          id, outlet_id, order_number, table_id, table_number,
          order_type, source, status, customer_id, customer_name, customer_phone,
          covers, notes, subtotal, tax_amount, cgst_amount, sgst_amount,
          service_charge, discount_amount, discount_type, discount_value,
          round_off, total_amount, synced, created_at, updated_at
        ) VALUES (
          @id, @outlet_id, @order_number, @table_id, @table_number,
          @order_type, @source, @status, @customer_id, @customer_name, @customer_phone,
          @covers, @notes, @subtotal, @tax_amount, @cgst_amount, @sgst_amount,
          @service_charge, @discount_amount, @discount_type, @discount_value,
          @round_off, @total_amount, 0, @created_at, @updated_at
        )
      `).run({
        id,
        outlet_id: orderData.outlet_id,
        order_number: orderNumber,
        table_id: orderData.table_id || null,
        table_number: orderData.table_number || null,
        order_type: orderData.order_type || 'dine_in',
        source: orderData.source || 'pos',
        status: orderData.status || 'active',
        customer_id: orderData.customer_id || null,
        customer_name: orderData.customer_name || null,
        customer_phone: orderData.customer_phone || null,
        covers: orderData.covers || 1,
        notes: orderData.notes || null,
        subtotal,
        tax_amount: tax,
        cgst_amount: cgst,
        sgst_amount: sgst,
        service_charge: orderData.service_charge || 0,
        discount_amount: discountAmount,
        discount_type: orderData.discount_type || null,
        discount_value: orderData.discount_value != null ? Number(orderData.discount_value) : null,
        round_off,
        total_amount: total,
        created_at: now,
        updated_at: now,
      })

      // 2. Insert each order item
      const insertItem = database.prepare(`
        INSERT INTO order_items (
          id, order_id, outlet_id, menu_item_id, menu_item_name,
          variant_id, variant_name, quantity, unit_price, addon_total,
          line_total, kot_status, notes, created_at
        ) VALUES (
          @id, @order_id, @outlet_id, @menu_item_id, @menu_item_name,
          @variant_id, @variant_name, @quantity, @unit_price, @addon_total,
          @line_total, 'pending', @notes, @created_at
        )
      `)

      for (const item of items) {
        const addonTotal = (item.addons || []).reduce((s, a) => s + (Number(a.price || 0) * (a.quantity || 1)), 0)
        const lineTotal = (Number(item.unit_price || 0) + addonTotal) * (item.quantity || 1)
        insertItem.run({
          id: crypto.randomUUID(),
          order_id: id,
          outlet_id: orderData.outlet_id,
          menu_item_id: item.menu_item_id || null,
          menu_item_name: item.menu_item_name || item.name || 'Unknown Item',
          variant_id: item.variant_id || null,
          variant_name: item.variant_name || null,
          quantity: item.quantity || 1,
          unit_price: Number(item.unit_price || 0),
          addon_total: addonTotal,
          line_total: lineTotal,
          notes: item.notes || null,
          created_at: now,
        })
      }
    })()

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
        AND status IN ('active','confirmed','billed','created')
      ORDER BY created_at DESC LIMIT 1
    `).get(tableId, outletId)

    if (order) {
      order.order_items = getDB().prepare(`
        SELECT *, menu_item_name AS name FROM order_items WHERE order_id = ? ORDER BY created_at
      `).all(order.id)
      // Also expose as items for internal use
      order.items = order.order_items
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
      order.order_items = getDB().prepare(`
        SELECT *, menu_item_name AS name FROM order_items WHERE order_id = ? ORDER BY created_at
      `).all(orderId)
      // Also expose as items for internal use
      order.items = order.order_items
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
    // Re-flag the order for upload: a payment/status change made after the first
    // sync must re-upload (backend forward-merge handles the 'exists' replay).
    const fields = ['status = @status', 'updated_at = @updated_at', 'synced = 0', 'sync_error = NULL']
    const params = { orderId, status, updated_at: now }

    if (extra.invoice_number) { fields.push('invoice_number = @invoice_number'); params.invoice_number = extra.invoice_number }
    if (extra.billed_at)      { fields.push('billed_at = @billed_at');           params.billed_at = extra.billed_at }
    if (extra.paid_at)        { fields.push('paid_at = @paid_at');               params.paid_at = extra.paid_at }
    if (extra.payment_method) { fields.push('payment_method = @payment_method'); params.payment_method = extra.payment_method }
    // Record-&-reconcile: card/UPI taken on a standalone terminal while offline
    // is flagged so the manager can match it against the terminal settlement.
    if (extra.payment_note)   { fields.push('payment_note = @payment_note');     params.payment_note = extra.payment_note }

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

    // Calculate addon_total and line_total if not provided
    const addonTotal = itemData.addon_total ?? (itemData.addons || []).reduce((s, a) => s + (Number(a.price || 0) * (a.quantity || 1)), 0)
    const lineTotal = itemData.line_total ?? ((Number(itemData.unit_price || 0) + addonTotal) * (itemData.quantity || 1))

    // Get outlet_id from the order if not provided
    let outletId = itemData.outlet_id
    if (!outletId) {
      const order = getDB().prepare(`SELECT outlet_id FROM orders WHERE id = ?`).get(itemData.order_id)
      outletId = order?.outlet_id || ''
    }

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
    `).run({
      ...itemData,
      id,
      outlet_id: outletId,
      addon_total: addonTotal,
      line_total: lineTotal,
      menu_item_name: itemData.menu_item_name || itemData.name || 'Unknown Item',
      variant_name: itemData.variant_name || null,
      created_at: now,
    })

    // Recalculate order totals atomically — region-aware (AU 10% inclusive vs
    // IN CGST/SGST on top) and honouring any discount already on the order.
    const rows = getDB().prepare(`
      SELECT SUM(line_total) as subtotal FROM order_items WHERE order_id = ?
    `).get(itemData.order_id)
    const orderRow = getDB().prepare(`
      SELECT outlet_id, discount_amount FROM orders WHERE id = ?
    `).get(itemData.order_id)

    const subtotal = rows.subtotal || 0
    const cfg = resolveTaxConfig(OutletDB.get(orderRow?.outlet_id || outletId))
    const { cgst, sgst, tax, total, round_off } = computeTotals(subtotal, Number(orderRow?.discount_amount || 0), cfg)

    // Re-flag for upload (synced = 0, sync_error = NULL): an item added after
    // the first sync must re-upload so the cloud copy stays in step.
    getDB().prepare(`
      UPDATE orders
      SET subtotal = ?, cgst_amount = ?, sgst_amount = ?,
          tax_amount = ?, round_off = ?, total_amount = ?, updated_at = ?,
          synced = 0, sync_error = NULL
      WHERE id = ?
    `).run(subtotal, cgst, sgst, tax, round_off, total, now, itemData.order_id)

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
    // Park poison orders (>= 10 failed attempts) so they can't block the queue;
    // fewest-attempts first, then oldest, so healthy orders always drain first.
    return getDB().prepare(`
      SELECT * FROM orders
      WHERE synced = 0 AND sync_attempts < 10
      ORDER BY sync_attempts ASC, created_at ASC LIMIT 50
    `).all()
  },

  /**
   * Returns orders that exceeded the sync-attempt ceiling (dead-letter) for a
   * future manual-review UI. These are excluded from getUnsyncedOrders().
   * @returns {object[]}
   */
  getStuckOrders() {
    return getDB().prepare(`
      SELECT * FROM orders
      WHERE synced = 0 AND sync_attempts >= 10
      ORDER BY created_at ASC
    `).all()
  },

  /**
   * Marks an order as successfully synced to the cloud, recording the
   * cloud-allocated order number so receipts stay traceable both ways.
   * @param {string} orderId
   * @param {string|null} cloudOrderNumber
   */
  markSynced(orderId, cloudOrderNumber = null) {
    getDB().prepare(`
      UPDATE orders SET synced = 1, sync_error = NULL,
        cloud_order_number = COALESCE(?, cloud_order_number)
      WHERE id = ?
    `).run(cloudOrderNumber, orderId)
  },

  /**
   * Records the latest sync error on an order WITHOUT changing business state
   * and WITHOUT touching the dead-letter counter. This is the TRANSIENT path:
   * transport blips (404/5xx/network/401) leave sync_attempts untouched so a
   * flaky connection can never park a healthy order in the dead-letter bucket.
   * @param {string} orderId
   * @param {string} error
   */
  markSyncError(orderId, error) {
    getDB().prepare(`
      UPDATE orders SET sync_error = ? WHERE id = ?
    `).run(error, orderId)
  },

  /**
   * Records a PERMANENT sync failure and advances the dead-letter counter.
   * This is the only path that increments sync_attempts — reserved for orders
   * the backend actively rejected (a per-order 'failed' in a 200 batch, or an
   * order that still 400/422s when re-sent alone). getUnsyncedOrders() parks
   * a row once sync_attempts >= 10, so it stops blocking the queue.
   * @param {string} orderId
   * @param {string} error
   */
  markSyncPermanentFailure(orderId, error) {
    getDB().prepare(`
      UPDATE orders SET sync_error = ?, sync_attempts = sync_attempts + 1 WHERE id = ?
    `).run(error, orderId)
  },

  /**
   * End-of-day summary computed from LOCAL orders — lets the manager close
   * the day during an outage. Includes the unsynced count so EOD can warn
   * "N orders not yet uploaded" before the day is treated as final.
   * @param {string} outletId
   * @param {string} [date] - YYYY-MM-DD (defaults to today)
   * @returns {object}
   */
  eodSummary(outletId, date) {
    const day = date || new Date().toISOString().slice(0, 10)
    const totals = getDB().prepare(`
      SELECT
        COUNT(*)                                                   AS order_count,
        COALESCE(SUM(total_amount), 0)                             AS gross_sales,
        COALESCE(SUM(tax_amount), 0)                               AS total_tax,
        COALESCE(SUM(discount_amount), 0)                          AS total_discount,
        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) AS collected,
        SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END)                AS unsynced_count
      FROM orders
      WHERE outlet_id = ? AND date(created_at) = date(?)
        AND status != 'cancelled'
    `).get(outletId, day)

    // cancelled_count must be computed OVER cancelled rows — the totals query
    // excludes them, so a CASE there would always read 0.
    const cancelled = getDB().prepare(`
      SELECT COUNT(*) AS cancelled_count
      FROM orders
      WHERE outlet_id = ? AND date(created_at) = date(?)
        AND status = 'cancelled'
    `).get(outletId, day)
    totals.cancelled_count = cancelled?.cancelled_count || 0

    const byMethod = getDB().prepare(`
      SELECT payment_method AS method,
             COUNT(*) AS count,
             COALESCE(SUM(total_amount), 0) AS amount,
             SUM(CASE WHEN payment_note IS NOT NULL THEN 1 ELSE 0 END) AS offline_captured
      FROM orders
      WHERE outlet_id = ? AND date(created_at) = date(?) AND status = 'paid'
      GROUP BY payment_method
    `).all(outletId, day)

    return { date: day, ...totals, by_payment_method: byMethod, is_offline_summary: true }
  },

  /** Count of orders not yet uploaded (for the status bar + EOD warning). */
  getUnsyncedCount() {
    const row = getDB().prepare(`SELECT COUNT(*) AS n FROM orders WHERE synced = 0`).get()
    return row?.n || 0
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
    const rows = getDB().prepare(`
      SELECT t.*,
        o.id               as order_id,
        o.total_amount     as order_total,
        o.created_at       as order_started_at,
        o.covers           as order_covers,
        o.status           as order_status
      FROM tables t
      LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('active','confirmed','billed','created')
      WHERE t.outlet_id = ?
      ORDER BY t.table_number
    `).all(outletId)

    // Transform flat rows into nested format matching cloud API response
    return rows.map(row => {
      const table = {
        id: row.id,
        outlet_id: row.outlet_id,
        table_number: row.table_number,
        area_name: row.area_name,
        capacity: row.capacity,
        status: row.order_id ? 'occupied' : (row.status || 'available'),
        orders: [],
      }
      if (row.order_id) {
        table.orders = [{
          id: row.order_id,
          total_amount: row.order_total,
          created_at: row.order_started_at,
          covers: row.order_covers,
          status: row.order_status,
        }]
      }
      return table
    })
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
    // Cloud rows carry seating_capacity and a nested area:{ name }, and omit the
    // exact column names the prepared statement binds — coerce every named
    // param so better-sqlite3 never throws 'Missing named parameter'.
    getDB().transaction((list) => {
      for (const t of list) {
        insert.run({
          id: t.id,
          outlet_id: t.outlet_id,
          table_number: t.table_number,
          area_name: t.area?.name ?? t.area_name ?? null,
          capacity: t.seating_capacity ?? t.capacity ?? 4,
          status: t.status ?? 'available',
        })
      }
    })(tables)
  },
}

// ─────────────────────────────────────
// CUSTOMERS (offline lookup cache + queued creates)
// ─────────────────────────────────────
const CustomerDB = {

  /**
   * Searches cached customers by name or phone (for POS attach while offline).
   * @param {string} outletId
   * @param {string} query
   * @returns {object[]}
   */
  search(outletId, query) {
    const q = `%${(query || '').trim()}%`
    return getDB().prepare(`
      SELECT * FROM customers
      WHERE outlet_id = ? AND (name LIKE ? OR phone LIKE ?)
      ORDER BY created_at DESC LIMIT 20
    `).all(outletId, q, q)
  },

  /**
   * Creates a walk-in customer locally; synced to cloud by name+phone
   * (find-or-create server-side), so no UUID coupling is needed.
   * @param {{ outlet_id, name, phone, email? }} data
   * @returns {object} the created row
   */
  createLocal(data) {
    const id = crypto.randomUUID()
    getDB().prepare(`
      INSERT INTO customers (id, outlet_id, name, phone, email, synced)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, data.outlet_id, data.name || null, data.phone || null, data.email || null)
    SyncDB.enqueue('customers', id, 'INSERT', { id, ...data })
    return { id, ...data }
  },

  /**
   * Bulk-saves customers from a cloud sync payload (lookup cache).
   * @param {object[]} customers
   */
  saveFromSync(customers) {
    const insert = getDB().prepare(`
      INSERT OR REPLACE INTO customers (id, outlet_id, name, phone, email, synced)
      VALUES (@id, @outlet_id, @name, @phone, @email, 1)
    `)
    getDB().transaction((list) => {
      for (const c of list) {
        insert.run({
          id: c.id,
          outlet_id: c.outlet_id,
          name: c.name || c.full_name || null,
          phone: c.phone || null,
          email: c.email || null,
        })
      }
    })(customers)
  },

  /** Returns locally-created customers not yet uploaded. */
  getUnsynced() {
    return getDB().prepare(`SELECT * FROM customers WHERE synced = 0`).all()
  },

  /** Marks a locally-created customer as uploaded. */
  markSynced(id) {
    getDB().prepare(`UPDATE customers SET synced = 1 WHERE id = ?`).run(id)
  },

  /** Returns a single cached customer row by id (or null). */
  getById(id) {
    return getDB().prepare(`SELECT * FROM customers WHERE id = ?`).get(id) || null
  },

  /**
   * Rewrites a locally-created customer's id to the server-allocated cloud id,
   * repointing any orders that reference it — in ONE transaction — so the order
   * FK never fails on upload. Marks the row synced. If the cloud id matches the
   * local id (or is falsy) this is just a markSynced.
   * @param {string} localId
   * @param {string|null} cloudId
   */
  remapId(localId, cloudId) {
    if (!cloudId || cloudId === localId) {
      this.markSynced(localId)
      return
    }
    const database = getDB()
    database.transaction(() => {
      database.prepare(`UPDATE orders SET customer_id = @cloud WHERE customer_id = @local`)
        .run({ cloud: cloudId, local: localId })
      database.prepare(`UPDATE customers SET id = @cloud, synced = 1 WHERE id = @local`)
        .run({ cloud: cloudId, local: localId })
    })()
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

// ─────────────────────────────────────
// OUTLET
// ─────────────────────────────────────
const OutletDB = {
  /**
   * Save outlet data from cloud sync for offline bill header.
   */
  save(outlet) {
    // Region signals (code/country/currency/abn) are what let the offline
    // biller and receipt know an outlet is Australian — never drop them.
    const ho = outlet.head_office || {}
    getDB().prepare(`
      INSERT OR REPLACE INTO outlets
        (id, name, address, city, state, gstin, fssai, phone, logo_url,
         gst_rate, service_charge, code, country_code, region, currency, abn,
         gst_inclusive, synced_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      outlet.id, outlet.name, outlet.address || null, outlet.city || null,
      outlet.state || null, outlet.gstin || null, outlet.fssai || null,
      outlet.phone || null, outlet.logo_url || null,
      outlet.gst_rate || 5, outlet.service_charge || 0,
      outlet.code || null,
      outlet.country_code || ho.country_code || (outlet.country === 'Australia' ? 'AU' : null),
      outlet.region || ho.region || null,
      outlet.currency || ho.currency || null,
      outlet.abn || ho.abn || null,
      (outlet.gst_inclusive ?? ho.gst_inclusive) ? 1 : 0
    )
  },

  /**
   * Get outlet by id.
   */
  get(outletId) {
    return getDB().prepare(`SELECT * FROM outlets WHERE id = ?`).get(outletId) || null
  },
}

/**
 * Returns the absolute path to the SQLite database file.
 * Useful for diagnostic logging.
 * @returns {string}
 */
function getDBPath() {
  return getDbPath()
}

module.exports = {
  getDB,
  MenuDB,
  OrderDB,
  KotDB,
  TableDB,
  SyncDB,
  SettingsDB,
  OutletDB,
  CustomerDB,
  getDBPath,
  // Tax + numbering engine (exported for main-process IPC + tests)
  resolveTaxConfig,
  computeTotals,
  getDeviceId,
  nextOfflineOrderNumber,
  nextOfflineInvoiceNumber,
}
