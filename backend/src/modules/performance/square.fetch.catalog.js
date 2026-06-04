/**
 * @fileoverview Fetches a Square merchant's catalog (menu) structure via the
 * Square REST API for Phase-2 analytics. Walks the paginated catalog list and
 * summarises item, category and modifier-group counts plus the busiest
 * categories. Resilient by design: any failure (e.g. a missing ITEMS_READ
 * scope) resolves to `{ available: false }` rather than throwing.
 * @module modules/performance/square.fetch.catalog
 */

const { sqGet, MAX_PAGES } = require('./square.http');
const logger = require('../../config/logger');

module.exports = { fetchCatalog };

/**
 * Pull and summarise the Square catalog for `ctx`.
 * @param {{ apiBase: string, accessToken: string, version: string, locationId?: string, currency?: string }} ctx
 * @returns {Promise<Object>} Summary, or `{ available: false }` on any failure.
 */
async function fetchCatalog(ctx) {
  try {
    const itemObjects = [];
    const categoryObjects = [];
    let modifierCount = 0;

    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let path = '/v2/catalog/list?types=ITEM,CATEGORY,MODIFIER_LIST';
      if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

      const data = await sqGet(ctx, path);
      const objects = Array.isArray(data && data.objects) ? data.objects : [];

      for (const object of objects) {
        if (object.type === 'ITEM') {
          itemObjects.push(object);
        } else if (object.type === 'CATEGORY') {
          categoryObjects.push(object);
        } else if (object.type === 'MODIFIER_LIST') {
          modifierCount += 1;
        }
      }

      cursor = (data && data.cursor) || null;
      if (!cursor) break;
    }

    const totalItems = itemObjects.length;
    const totalCategories = categoryObjects.length;
    const totalModifiers = modifierCount;

    if (totalItems === 0 && totalCategories === 0 && totalModifiers === 0) {
      logger.warn('[SquarePull] catalog unavailable', { error: 'no objects' });
      return { available: false };
    }

    const topCategories = buildTopCategories(itemObjects, categoryObjects);

    return {
      available: true,
      total_items: totalItems,
      total_categories: totalCategories,
      total_modifiers: totalModifiers,
      top_categories: topCategories,
    };
  } catch (e) {
    logger.warn('[SquarePull] catalog unavailable', { error: e.message });
    return { available: false };
  }
}

/**
 * Tally items per category and return the busiest eight.
 * @param {Object[]} itemObjects ITEM catalog objects.
 * @param {Object[]} categoryObjects CATEGORY catalog objects.
 * @returns {{ name: string, item_count: number }[]}
 */
function buildTopCategories(itemObjects, categoryObjects) {
  const nameById = new Map();
  for (const cat of categoryObjects) {
    const name = cat && cat.category_data && cat.category_data.name;
    if (cat && cat.id) nameById.set(cat.id, name || 'Uncategorised');
  }

  const countById = new Map();
  for (const item of itemObjects) {
    const itemData = (item && item.item_data) || {};
    const categoryId =
      itemData.category_id ||
      (itemData.categories && itemData.categories[0] && itemData.categories[0].id) ||
      null;
    const key = categoryId || '__uncategorised__';
    countById.set(key, (countById.get(key) || 0) + 1);
  }

  const rows = [];
  for (const [key, count] of countById.entries()) {
    const name = key === '__uncategorised__' ? 'Uncategorised' : nameById.get(key) || 'Uncategorised';
    rows.push({ name, item_count: count });
  }

  rows.sort((a, b) => b.item_count - a.item_count);
  return rows.slice(0, 8);
}
