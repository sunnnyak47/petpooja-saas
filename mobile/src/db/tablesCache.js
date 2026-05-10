import { getDb } from './sqlite';

/**
 * Bulk insert/replace tables for an outlet.
 * Replaces all existing table data for the outlet in a transaction.
 *
 * @param {string} outletId
 * @param {Array} tables - Array of table objects from the API
 */
export function cacheTables(outletId, tables) {
  const db = getDb();

  if (!outletId) {
    throw new Error('[TablesCache] outletId is required');
  }

  try {
    db.execSync('BEGIN TRANSACTION');

    // Clear existing tables for this outlet
    db.runSync('DELETE FROM tables_cache WHERE outlet_id = ?', [outletId]);

    // Insert all tables
    for (const table of tables) {
      db.runSync(
        `INSERT OR REPLACE INTO tables_cache (id, outlet_id, name, section, capacity, status, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          table.id,
          outletId,
          table.name ?? table.table_name ?? `Table ${table.id}`,
          table.section ?? table.area ?? null,
          table.capacity ?? table.seats ?? null,
          table.status ?? 'available',
          JSON.stringify(table),
          table.updated_at ?? table.updatedAt ?? new Date().toISOString(),
        ]
      );
    }

    db.execSync('COMMIT');

    // Update sync timestamp
    const now = new Date().toISOString();
    db.runSync(
      `INSERT OR REPLACE INTO sync_meta (key, value, updated_at)
       VALUES (?, ?, ?)`,
      [`tables_last_sync_${outletId}`, now, now]
    );
  } catch (error) {
    db.execSync('ROLLBACK');
    console.error('[TablesCache] Failed to cache tables:', error);
    throw error;
  }
}

/**
 * Get all cached tables for a given outlet.
 *
 * @param {string} outletId
 * @returns {Array} Array of table objects with parsed data
 */
export function getCachedTables(outletId) {
  const db = getDb();

  try {
    const rows = db.getAllSync(
      `SELECT * FROM tables_cache
       WHERE outlet_id = ?
       ORDER BY section ASC, name ASC`,
      [outletId]
    );

    return rows.map((row) => ({
      id: row.id,
      outlet_id: row.outlet_id,
      name: row.name,
      section: row.section,
      capacity: row.capacity,
      status: row.status,
      data: safeJsonParse(row.data_json),
      updated_at: row.updated_at,
    }));
  } catch (error) {
    console.error('[TablesCache] Failed to get tables:', error);
    return [];
  }
}

/**
 * Update the local status of a single table.
 * Useful for optimistic UI updates (e.g., marking a table as occupied).
 *
 * @param {string} tableId
 * @param {string} status - New status (e.g., 'available', 'occupied', 'reserved')
 */
export function updateTableStatus(tableId, status) {
  const db = getDb();

  if (!tableId || !status) {
    throw new Error('[TablesCache] tableId and status are required');
  }

  try {
    db.runSync(
      `UPDATE tables_cache SET status = ?, updated_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), tableId]
    );
  } catch (error) {
    console.error('[TablesCache] Failed to update table status:', error);
    throw error;
  }
}

/**
 * Delete all cached table data for an outlet.
 *
 * @param {string} outletId
 */
export function clearTablesCache(outletId) {
  const db = getDb();

  try {
    db.runSync('DELETE FROM tables_cache WHERE outlet_id = ?', [outletId]);
    db.runSync('DELETE FROM sync_meta WHERE key = ?', [
      `tables_last_sync_${outletId}`,
    ]);
  } catch (error) {
    console.error('[TablesCache] Failed to clear cache:', error);
    throw error;
  }
}

// --- Internal Helpers ---

function safeJsonParse(jsonStr, fallback = null) {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}
