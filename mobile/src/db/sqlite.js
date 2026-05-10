import * as SQLite from 'expo-sqlite';

let db = null;

/**
 * Get the database instance. Must call initDatabase() first.
 * @returns {SQLite.SQLiteDatabase}
 */
export function getDb() {
  if (!db) {
    throw new Error(
      '[SQLite] Database not initialized. Call initDatabase() first.'
    );
  }
  return db;
}

/**
 * Initialize the SQLite database with WAL mode and create all tables.
 * Safe to call multiple times — will only initialize once.
 */
export async function initDatabase() {
  if (db) {
    return db;
  }

  try {
    db = SQLite.openDatabaseSync('petpooja_offline.db');

    // Enable WAL mode for better concurrent read/write performance
    db.execSync('PRAGMA journal_mode = WAL');
    db.execSync('PRAGMA foreign_keys = ON');

    // Create all tables
    createTables();

    // Create indexes
    createIndexes();

    console.log('[SQLite] Database initialized successfully');
    return db;
  } catch (error) {
    console.error('[SQLite] Failed to initialize database:', error);
    throw error;
  }
}

function createTables() {
  // Menu categories cache
  db.execSync(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      data_json TEXT,
      updated_at TEXT
    )
  `);

  // Menu items cache
  db.execSync(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      outlet_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      is_available INTEGER DEFAULT 1,
      is_veg INTEGER DEFAULT 0,
      image_url TEXT,
      variants_json TEXT,
      addons_json TEXT,
      data_json TEXT,
      updated_at TEXT
    )
  `);

  // Tables cache
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tables_cache (
      id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL,
      name TEXT NOT NULL,
      section TEXT,
      capacity INTEGER,
      status TEXT DEFAULT 'available',
      data_json TEXT,
      updated_at TEXT
    )
  `);

  // Offline orders
  db.execSync(`
    CREATE TABLE IF NOT EXISTS offline_orders (
      id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL,
      order_type TEXT DEFAULT 'dine_in',
      table_id TEXT,
      customer_id TEXT,
      source TEXT DEFAULT 'pos',
      notes TEXT,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      payment_status TEXT DEFAULT 'unpaid',
      created_by TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      synced_at TEXT,
      sync_attempts INTEGER DEFAULT 0,
      sync_error TEXT,
      cloud_id TEXT
    )
  `);

  // Offline order items
  db.execSync(`
    CREATE TABLE IF NOT EXISTS offline_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      variant_id TEXT,
      variant_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      notes TEXT,
      addons_json TEXT,
      FOREIGN KEY (order_id) REFERENCES offline_orders(id)
    )
  `);

  // Sync metadata
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    )
  `);

  // Sync queue for generic operations
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      last_error TEXT,
      created_at TEXT NOT NULL,
      next_retry_at TEXT
    )
  `);
}

function createIndexes() {
  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_offline_orders_synced_created
    ON offline_orders(synced, created_at)
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_offline_orders_outlet
    ON offline_orders(outlet_id)
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_offline_order_items_order
    ON offline_order_items(order_id)
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_menu_items_category
    ON menu_items(category_id)
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_menu_items_outlet
    ON menu_items(outlet_id)
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_retry
    ON sync_queue(next_retry_at)
  `);
}

/**
 * Close the database connection. Call during app shutdown if needed.
 */
export function closeDatabase() {
  if (db) {
    db.closeSync();
    db = null;
    console.log('[SQLite] Database closed');
  }
}

/**
 * Reset the database — drops all tables and reinitializes.
 * Use with caution; primarily for development/testing.
 */
export function resetDatabase() {
  if (!db) return;

  const tables = [
    'sync_queue',
    'sync_meta',
    'offline_order_items',
    'offline_orders',
    'tables_cache',
    'menu_items',
    'menu_categories',
  ];

  for (const table of tables) {
    db.execSync(`DROP TABLE IF EXISTS ${table}`);
  }

  createTables();
  createIndexes();
  console.log('[SQLite] Database reset complete');
}
