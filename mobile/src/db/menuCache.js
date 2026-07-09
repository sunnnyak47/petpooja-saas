import { getDb } from './sqlite';

/**
 * Bulk insert/replace menu categories and items for an outlet.
 * Wraps in a transaction for atomicity.
 *
 * @param {string} outletId
 * @param {Array} categories - Array of category objects from the API
 * @param {Array} items - Array of menu item objects from the API
 */
export function cacheMenu(outletId, categories, items) {
  const db = getDb();

  try {
    db.execSync('BEGIN TRANSACTION');

    // Clear existing data for this outlet
    db.runSync('DELETE FROM menu_items WHERE outlet_id = ?', [outletId]);
    db.runSync('DELETE FROM menu_categories WHERE outlet_id = ?', [outletId]);

    // Insert categories
    for (const cat of categories) {
      db.runSync(
        `INSERT OR REPLACE INTO menu_categories (id, outlet_id, name, sort_order, is_active, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.id,
          outletId,
          cat.name,
          cat.sort_order ?? cat.sortOrder ?? 0,
          cat.is_active ?? cat.isActive ?? 1,
          cat.data_json ?? JSON.stringify(cat),
          cat.updated_at ?? cat.updatedAt ?? new Date().toISOString(),
        ]
      );
    }

    // Insert items
    for (const item of items) {
      db.runSync(
        `INSERT OR REPLACE INTO menu_items (id, category_id, outlet_id, name, price, is_available, is_veg, image_url, variants_json, addons_json, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.category_id ?? item.categoryId,
          outletId,
          item.name,
          // Backend field is `base_price` (Prisma Decimal → serialized as string);
          // the old mapper read `item.price` which never exists → every item cached ₹0.
          Number(item.base_price ?? item.price ?? 0) || 0,
          (item.is_available ?? item.isAvailable ?? true) ? 1 : 0,
          // Backend encodes veg/non-veg as `food_type` ('veg' | 'non_veg' | 'egg'),
          // not a boolean. The old mapper read `item.is_veg` (absent) → every item
          // cached as non-veg. Derive the flag from food_type, keeping the boolean
          // fallback for any pre-mapped payloads.
          (item.food_type != null
            ? item.food_type === 'veg'
            : (item.is_veg ?? item.isVeg ?? false))
            ? 1
            : 0,
          item.image_url ?? item.imageUrl ?? null,
          JSON.stringify(item.variants ?? item.variants_json ?? []),
          JSON.stringify(item.addons ?? item.addons_json ?? []),
          JSON.stringify(item),
          item.updated_at ?? item.updatedAt ?? new Date().toISOString(),
        ]
      );
    }

    db.execSync('COMMIT');

    // Update sync timestamp
    setMenuLastSync(outletId);
  } catch (error) {
    db.execSync('ROLLBACK');
    console.error('[MenuCache] Failed to cache menu:', error);
    throw error;
  }
}

/**
 * Get all active categories for a given outlet, sorted by sort_order.
 *
 * @param {string} outletId
 * @returns {Array} Array of category objects
 */
export function getCachedCategories(outletId) {
  const db = getDb();

  try {
    const rows = db.getAllSync(
      `SELECT * FROM menu_categories
       WHERE outlet_id = ? AND is_active = 1
       ORDER BY sort_order ASC`,
      [outletId]
    );

    return rows.map((row) => ({
      ...row,
      is_active: Boolean(row.is_active),
      data: row.data_json ? safeJsonParse(row.data_json) : null,
    }));
  } catch (error) {
    console.error('[MenuCache] Failed to get categories:', error);
    return [];
  }
}

/**
 * Get cached menu items for an outlet, optionally filtered by category.
 *
 * @param {string} outletId
 * @param {string} [categoryId] - Optional category filter
 * @returns {Array} Array of item objects with parsed variants/addons
 */
export function getCachedItems(outletId, categoryId, includeUnavailable = false) {
  const db = getDb();

  try {
    // POS ordering wants available-only; the MENU MANAGEMENT screen must see
    // out-of-stock items too (else they vanish and the "Out of Stock" count is
    // always 0, and an item toggled unavailable can never be toggled back).
    let query = `SELECT * FROM menu_items WHERE outlet_id = ?`;
    const params = [outletId];

    if (!includeUnavailable) {
      query += ' AND is_available = 1';
    }

    if (categoryId) {
      query += ' AND category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY name ASC';

    const rows = db.getAllSync(query, params);

    return rows.map(parseMenuItem);
  } catch (error) {
    console.error('[MenuCache] Failed to get items:', error);
    return [];
  }
}

/**
 * Get a single menu item by ID with parsed variants and addons.
 *
 * @param {string} itemId
 * @returns {Object|null} Parsed menu item or null if not found
 */
export function getItemById(itemId) {
  const db = getDb();

  try {
    const rows = db.getAllSync('SELECT * FROM menu_items WHERE id = ?', [
      itemId,
    ]);

    if (rows.length === 0) return null;

    return parseMenuItem(rows[0]);
  } catch (error) {
    console.error('[MenuCache] Failed to get item by ID:', error);
    return null;
  }
}

/**
 * Delete all menu data (categories + items) for a given outlet.
 *
 * @param {string} outletId
 */
export function clearMenuCache(outletId) {
  const db = getDb();

  try {
    db.execSync('BEGIN TRANSACTION');
    db.runSync('DELETE FROM menu_items WHERE outlet_id = ?', [outletId]);
    db.runSync('DELETE FROM menu_categories WHERE outlet_id = ?', [outletId]);
    db.runSync('DELETE FROM sync_meta WHERE key = ?', [
      `menu_last_sync_${outletId}`,
    ]);
    db.execSync('COMMIT');
  } catch (error) {
    db.execSync('ROLLBACK');
    console.error('[MenuCache] Failed to clear cache:', error);
    throw error;
  }
}

/**
 * Get the last sync timestamp for menu data of a given outlet.
 *
 * @param {string} outletId
 * @returns {string|null} ISO timestamp or null if never synced
 */
export function getMenuLastSync(outletId) {
  const db = getDb();

  try {
    const rows = db.getAllSync(
      'SELECT value FROM sync_meta WHERE key = ?',
      [`menu_last_sync_${outletId}`]
    );

    if (rows.length === 0) return null;
    return rows[0].value;
  } catch (error) {
    console.error('[MenuCache] Failed to get last sync:', error);
    return null;
  }
}

/**
 * Update the last sync timestamp for menu data of a given outlet.
 *
 * @param {string} outletId
 */
export function setMenuLastSync(outletId) {
  const db = getDb();
  const now = new Date().toISOString();

  try {
    db.runSync(
      `INSERT OR REPLACE INTO sync_meta (key, value, updated_at)
       VALUES (?, ?, ?)`,
      [`menu_last_sync_${outletId}`, now, now]
    );
  } catch (error) {
    console.error('[MenuCache] Failed to set last sync:', error);
  }
}

/**
 * Check if the menu cache is stale (older than maxAgeMs).
 *
 * @param {string} outletId
 * @param {number} [maxAgeMs=86400000] - Max age in milliseconds (default 24h)
 * @returns {boolean} True if cache is stale or missing
 */
export function isMenuStale(outletId, maxAgeMs = 24 * 60 * 60 * 1000) {
  const lastSync = getMenuLastSync(outletId);

  if (!lastSync) return true;

  const lastSyncTime = new Date(lastSync).getTime();
  const now = Date.now();

  return now - lastSyncTime > maxAgeMs;
}

// --- Internal Helpers ---

function parseMenuItem(row) {
  return {
    id: row.id,
    category_id: row.category_id,
    outlet_id: row.outlet_id,
    name: row.name,
    price: row.price,
    is_available: Boolean(row.is_available),
    is_veg: Boolean(row.is_veg),
    image_url: row.image_url,
    variants: safeJsonParse(row.variants_json, []),
    addons: safeJsonParse(row.addons_json, []),
    data: safeJsonParse(row.data_json),
    updated_at: row.updated_at,
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
