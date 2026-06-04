/**
 * @fileoverview Square inventory fetcher — summarises a merchant's stock
 * levels via the Square REST API for the Phase-2 analytics dashboard. Calls
 * `/v2/inventory/counts/batch-retrieve`, paginates via the response cursor,
 * and aggregates IN_STOCK counts into tracked-item / unit totals plus
 * out-of-stock and low-stock breakdowns.
 *
 * Square `quantity` values arrive as STRINGS; coerce with Number(). Many
 * merchants lack the INVENTORY_READ scope, so any failure is swallowed and
 * reported as `{ available: false }` — this never throws.
 *
 * @module modules/performance/square.fetch.inventory
 */
const { sqPost, MAX_PAGES } = require('./square.http');
const logger = require('../../config/logger');

module.exports = { fetchInventory };

/**
 * Summarise inventory stock levels for a single Square location.
 * @param {object} ctx - Square API context { apiBase, accessToken, version, locationId, currency }.
 * @param {string} locationId - Square location id to summarise.
 * @returns {Promise<object>} { available, total_tracked, total_units, out_of_stock, low_stock }.
 */
async function fetchInventory(ctx, locationId) {
  if (!locationId) return { available: false };

  try {
    // Sum IN_STOCK quantity per catalog object across all pages.
    const qtyByItem = new Map();
    let cursor;
    let pages = 0;

    do {
      const body = { location_ids: [locationId], limit: 1000 };
      if (cursor) body.cursor = cursor;

      const data = await sqPost(ctx, '/v2/inventory/counts/batch-retrieve', body);
      const counts = data.counts || [];

      for (const c of counts) {
        if (c.state !== 'IN_STOCK') continue;
        const id = c.catalog_object_id;
        if (!id) continue;
        qtyByItem.set(id, (qtyByItem.get(id) || 0) + Number(c.quantity));
      }

      cursor = data.cursor;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);

    if (qtyByItem.size === 0) return { available: false };

    let totalUnits = 0;
    let outOfStock = 0;
    const lowStock = [];

    for (const [id, qty] of qtyByItem) {
      totalUnits += qty;
      if (qty <= 0) {
        outOfStock += 1;
      } else if (qty < 5) {
        lowStock.push({ name: `Item ${id.slice(0, 6)}`, qty });
      }
    }

    lowStock.sort((a, b) => a.qty - b.qty);

    return {
      available: true,
      total_tracked: qtyByItem.size,
      total_units: totalUnits,
      out_of_stock: outOfStock,
      low_stock: lowStock.slice(0, 10),
    };
  } catch (e) {
    logger.warn('[SquarePull] inventory unavailable', { error: e.message });
    return { available: false };
  }
}
