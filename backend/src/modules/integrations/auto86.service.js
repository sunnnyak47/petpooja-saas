/**
 * @fileoverview Auto-86 service — keeps menu-item availability in sync with
 * ingredient stock across ALL connected delivery channels (Swiggy, Zomato,
 * DoorDash, Menulog, Uber Eats) and locally.
 *
 * "86" is restaurant slang for "out of stock / pull it from the menu". When an
 * item can no longer be made from current ingredient stock it is auto-paused on
 * every connected aggregator; when restocked it is auto-resumed. A manual
 * override toggle is also provided.
 *
 * One-way dependency on aggregator.service (no cycle): we call
 * `setItemAvailabilityAllPlatforms` to fan availability changes out to every
 * connected platform — it handles "no platforms connected" gracefully.
 *
 * @module modules/integrations/auto86.service
 */

const prisma = require('../../config/database').getDbClient();
const agg = require('./aggregator.service');
const logger = require('../../config/logger');
const { getIO } = require('../../socket/index');
const { NotFoundError } = require('../../utils/errors');

const SETTING_KEY = 'auto_86_enabled';
/** Below this many servings remaining an item is flagged 'low' (running out). */
const LOW_SERVINGS_THRESHOLD = 3;

/* ─── Config (OutletSetting: auto_86_enabled) ───────────────────────────── */

/**
 * Reads the auto-86 config for an outlet. Defaults to enabled when unset.
 * @param {string} outletId
 * @returns {Promise<{ auto_86_enabled: boolean }>}
 */
async function getConfig(outletId) {
  const row = await prisma.outletSetting.findFirst({
    where: { outlet_id: outletId, setting_key: SETTING_KEY, is_deleted: false },
  });
  // Default ON: stock-driven 86 is the safe production default.
  const enabled = row ? row.setting_value === 'true' : true;
  return { auto_86_enabled: enabled };
}

/**
 * Persists the auto-86 config for an outlet.
 * @param {string} outletId
 * @param {{ auto_86_enabled: boolean }} cfg
 * @returns {Promise<{ auto_86_enabled: boolean }>}
 */
async function setConfig(outletId, { auto_86_enabled }) {
  const value = auto_86_enabled ? 'true' : 'false';
  const existing = await prisma.outletSetting.findFirst({
    where: { outlet_id: outletId, setting_key: SETTING_KEY },
  });
  if (existing) {
    await prisma.outletSetting.update({
      where: { id: existing.id },
      data: { setting_value: value, is_deleted: false },
    });
  } else {
    await prisma.outletSetting.create({
      data: { outlet_id: outletId, setting_key: SETTING_KEY, setting_value: value, data_type: 'string' },
    });
  }
  return { auto_86_enabled: !!auto_86_enabled };
}

/* ─── Core stock logic ──────────────────────────────────────────────────── */

/**
 * Whether an item can be made for at least one serving from current stock.
 * Items with no recipe / no ingredients are NOT stock-tracked → always makeable.
 * @param {{ recipe?: { ingredients?: Array<{ inventory_item_id: string, quantity: any }> } | null }} item
 * @param {Record<string, number>} stockMap - inventory_item_id → current_stock
 * @returns {boolean}
 */
function canMake(item, stockMap) {
  const ingredients = item?.recipe?.ingredients;
  if (!ingredients || ingredients.length === 0) return true;
  return ingredients.every(
    (ing) => (stockMap[ing.inventory_item_id] ?? 0) >= Number(ing.quantity)
  );
}

/**
 * Builds a stock map for an outlet keyed by inventory_item_id.
 * @param {string} outletId
 * @returns {Promise<Record<string, number>>}
 */
async function _buildStockMap(outletId) {
  const stocks = await prisma.inventoryStock.findMany({
    where: { outlet_id: outletId, is_deleted: false },
  });
  const stockMap = {};
  for (const s of stocks) stockMap[s.inventory_item_id] = Number(s.current_stock);
  return stockMap;
}

/**
 * Computes the limiting ingredient (fewest servings remaining) for an item.
 * Prefers the first failing ingredient (servings < 1), otherwise the minimum.
 * @returns {{ name: string, current: number, required: number } | null}
 */
function _limitingIngredient(item, stockMap) {
  const ingredients = item?.recipe?.ingredients;
  if (!ingredients || ingredients.length === 0) return null;

  let best = null; // { name, current, required, servings }
  for (const ing of ingredients) {
    const current = stockMap[ing.inventory_item_id] ?? 0;
    const required = Number(ing.quantity);
    const servings = required > 0 ? current / required : Infinity;
    const name = ing.inventory_item?.name || 'Unknown';
    const candidate = { name, current, required, servings };
    if (!best || servings < best.servings) best = candidate;
  }
  if (!best) return null;
  return { name: best.name, current: best.current, required: best.required };
}

/**
 * Stock status bucket for an item: 'out' | 'low' | 'ok'.
 */
function _stockStatus(item, stockMap, makeable) {
  if (!makeable) return 'out';
  const ingredients = item?.recipe?.ingredients || [];
  for (const ing of ingredients) {
    const current = stockMap[ing.inventory_item_id] ?? 0;
    const required = Number(ing.quantity);
    if (required > 0 && current / required < LOW_SERVINGS_THRESHOLD) return 'low';
  }
  return 'ok';
}

/* ─── Board (read-only dashboard view) ──────────────────────────────────── */

/**
 * Returns the full availability board for an outlet — every active item with
 * its computed makeability, stock status, and limiting ingredient.
 * @param {string} outletId
 * @returns {Promise<{ items: object[], summary: { total: number, out: number, low: number } }>}
 */
async function getBoard(outletId) {
  const items = await prisma.menuItem.findMany({
    where: { outlet_id: outletId, is_active: true, is_deleted: false },
    include: {
      recipe: { include: { ingredients: { include: { inventory_item: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  const stockMap = await _buildStockMap(outletId);

  let out = 0;
  let low = 0;
  const rows = items.map((item) => {
    const tracked = !!item.recipe?.ingredients?.length;
    const makeable = canMake(item, stockMap);
    const stock_status = _stockStatus(item, stockMap, makeable);
    if (stock_status === 'out') out += 1;
    else if (stock_status === 'low') low += 1;
    return {
      id: item.id,
      name: item.name,
      category_id: item.category_id,
      is_available: item.is_available,
      tracked,
      can_make: makeable,
      stock_status,
      limiting_ingredient: tracked ? _limitingIngredient(item, stockMap) : null,
    };
  });

  return { items: rows, summary: { total: rows.length, out, low } };
}

/* ─── Auto-evaluation (the auto-86 engine) ──────────────────────────────── */

/**
 * Re-evaluates availability against current stock and flips items whose
 * makeability changed, pushing the change to every connected platform.
 *
 * Respects the `auto_86_enabled` config: when disabled, returns early so manual
 * control still works but stock never auto-flips items. Never throws — failures
 * are logged and returned as `{ error }`.
 *
 * @param {string} outletId
 * @param {string[]|null} [menuItemIds] - Limit to these item ids; null = all tracked items.
 * @returns {Promise<{ changed?: object[], pushed?: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */
async function evaluateAvailability(outletId, menuItemIds = null) {
  try {
    if (!outletId) return { skipped: true, reason: 'no outlet' };

    const { auto_86_enabled } = await getConfig(outletId);
    if (!auto_86_enabled) return { skipped: true, reason: 'auto-86 disabled' };

    const where = { outlet_id: outletId, is_active: true, is_deleted: false };
    if (Array.isArray(menuItemIds) && menuItemIds.length) {
      where.id = { in: menuItemIds };
    }

    const items = await prisma.menuItem.findMany({
      where,
      include: { recipe: { include: { ingredients: true } } },
    });

    const stockMap = await _buildStockMap(outletId);

    const idsTo86 = []; // became unavailable
    const idsToUn86 = []; // became available
    const changed = [];

    for (const item of items) {
      // Only stock-tracked items participate in auto-86.
      const tracked = !!item.recipe?.ingredients?.length;
      if (!tracked) continue;
      const makeable = canMake(item, stockMap);
      if (item.is_available === makeable) continue;
      if (makeable) idsToUn86.push(item.id);
      else idsTo86.push(item.id);
      changed.push({ id: item.id, name: item.name, is_available: makeable });
    }

    if (!changed.length) return { changed: [], pushed: false };

    // Fan out to all connected platforms (also updates local is_available).
    if (idsTo86.length) {
      await agg.setItemAvailabilityAllPlatforms(outletId, idsTo86, false);
    }
    if (idsToUn86.length) {
      await agg.setItemAvailabilityAllPlatforms(outletId, idsToUn86, true);
    }

    _emitChange(outletId, changed);

    logger.info('Auto-86 evaluated', {
      outletId, eighty_sixed: idsTo86.length, restored: idsToUn86.length,
    });

    return { changed, pushed: true };
  } catch (error) {
    logger.error('Auto-86 evaluateAvailability failed', { outletId, error: error.message });
    return { error: error.message };
  }
}

/* ─── Manual override ───────────────────────────────────────────────────── */

/**
 * Manually toggle an item's availability and push to all platforms.
 * @param {string} outletId
 * @param {string} menuItemId
 * @param {boolean} available
 * @param {object} [user] - Acting user (for logging/audit).
 * @returns {Promise<object>} The updated menu item.
 */
async function manualToggle(outletId, menuItemId, available, user) {
  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, outlet_id: outletId, is_deleted: false },
  });
  if (!item) throw new NotFoundError('Menu item not found');

  const updated = await prisma.menuItem.update({
    where: { id: menuItemId },
    data: { is_available: !!available },
  });

  // Push to every connected platform (also re-asserts local state).
  await agg.setItemAvailabilityAllPlatforms(outletId, [menuItemId], !!available);

  _emitChange(outletId, [{ id: menuItemId, name: updated.name, is_available: !!available }]);

  logger.info('Auto-86 manual toggle', {
    outletId, menuItemId, available: !!available, by: user?.id || user?.user_id || null,
  });

  return updated;
}

/* ─── Socket emit (best-effort) ─────────────────────────────────────────── */

function _emitChange(outletId, changes) {
  try {
    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${outletId}`).emit('item_availability_change', {
        outlet_id: outletId,
        changes,
        at: new Date().toISOString(),
      });
    }
  } catch (e) {
    logger.warn('Auto-86 socket emit failed', { error: e.message });
  }
}

module.exports = {
  canMake,
  getBoard,
  evaluateAvailability,
  manualToggle,
  getConfig,
  setConfig,
};
