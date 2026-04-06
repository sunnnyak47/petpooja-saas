/**
 * @fileoverview Menu management service — categories, items, variants, addons, combos, scheduling, bulk ops.
 * @module modules/menu/menu.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');

/* ============================
   CATEGORIES
   ============================ */

/**
 * Creates a new menu category for an outlet.
 * @param {object} data - Category data with outlet_id, name, description, display_order
 * @returns {Promise<object>} Created category
 */
async function createCategory(data) {
  const prisma = getDbClient();
  try {
    const category = await prisma.menuCategory.create({ data });
    logger.info('Menu category created', { id: category.id, name: category.name });
    return category;
  } catch (error) {
    logger.error('Create category failed', { error: error.message });
    throw error;
  }
}

/**
 * Lists categories for an outlet with optional search.
 * @param {string} outletId - Outlet UUID
 * @param {object} query - Query params (search, page, limit)
 * @returns {Promise<{categories: object[], total: number}>}
 */
async function listCategories(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const where = { outlet_id: outletId, is_deleted: false };
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.is_active !== undefined) {
      where.is_active = query.is_active === 'true';
    }

    const [categories, total] = await Promise.all([
      prisma.menuCategory.findMany({
        where,
        orderBy: { display_order: 'asc' },
        include: { _count: { select: { menu_items: { where: { is_deleted: false } } } } },
      }),
      prisma.menuCategory.count({ where }),
    ]);

    return { categories, total };
  } catch (error) {
    logger.error('List categories failed', { error: error.message });
    throw error;
  }
}

/**
 * Updates a category by ID.
 * @param {string} categoryId - Category UUID
 * @param {string} outletId - Outlet UUID for scoping
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated category
 */
async function updateCategory(categoryId, outletId, data) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, outlet_id: outletId, is_deleted: false },
    });
    if (!existing) throw new NotFoundError('Category not found');

    const updated = await prisma.menuCategory.update({
      where: { id: categoryId },
      data,
    });
    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    logger.error('Update category failed', { error: error.message });
    throw error;
  }
}

/**
 * Soft-deletes a category.
 * @param {string} categoryId - Category UUID
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>}
 */
async function deleteCategory(categoryId, outletId) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.menuCategory.findFirst({
      where: { id: categoryId, outlet_id: outletId, is_deleted: false },
    });
    if (!existing) throw new NotFoundError('Category not found');

    const deleted = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: { is_deleted: true },
    });
    return deleted;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Reorders categories by updating display_order.
 * @param {string} outletId - Outlet UUID
 * @param {Array<{id: string, display_order: number}>} orderedItems - New order
 * @returns {Promise<void>}
 */
async function reorderCategories(outletId, orderedItems) {
  const prisma = getDbClient();
  try {
    await prisma.$transaction(
      orderedItems.map((item) =>
        prisma.menuCategory.updateMany({
          where: { id: item.id, outlet_id: outletId, is_deleted: false },
          data: { display_order: item.display_order },
        })
      )
    );
  } catch (error) {
    logger.error('Reorder categories failed', { error: error.message });
    throw error;
  }
}

/* ============================
   MENU ITEMS
   ============================ */

/**
 * Creates a new menu item with optional nested variants, addons, and schedules.
 * @param {object} data - Menu item data
 * @returns {Promise<object>} Created menu item
 */
async function createMenuItem(data) {
  const prisma = getDbClient();
  const { variants, addons, menu_schedules, ...itemData } = data;
  try {
    const item = await prisma.menuItem.create({
      data: {
        ...itemData,
        variants: variants && variants.length > 0 ? {
          create: variants.map((v, idx) => ({ ...v, display_order: idx })),
        } : undefined,
        addons: addons && addons.length > 0 ? {
          create: addons.map((a) => ({ addon_group_id: a.addon_group_id })),
        } : undefined,
        menu_schedules: menu_schedules && menu_schedules.length > 0 ? {
          create: menu_schedules.map((s) => ({ ...s })),
        } : undefined,
      },
      include: { category: { select: { name: true } }, variants: true, addons: true, menu_schedules: true },
    });
    logger.info('Menu item created', { id: item.id, name: item.name });
    return item;
  } catch (error) {
    logger.error('Create menu item failed', { error: error.message });
    throw error;
  }
}

/**
 * Lists menu items for an outlet with filtering, search, and pagination.
 * @param {string} outletId - Outlet UUID
 * @param {object} query - Query params (category_id, food_type, search, is_available, page, limit)
 * @returns {Promise<{items: object[], total: number, page: number, limit: number}>}
 */
async function listMenuItems(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset, sort, order } = parsePagination(query);
    const where = { outlet_id: outletId, is_deleted: false };

    if (query.category_id) where.category_id = query.category_id;
    if (query.food_type) where.food_type = query.food_type;
    if (query.kitchen_station) where.kitchen_station = query.kitchen_station;
    if (query.is_available !== undefined) where.is_available = query.is_available === 'true';
    if (query.is_active !== undefined) where.is_active = query.is_active === 'true';
    if (query.is_bestseller === 'true') where.is_bestseller = true;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { short_code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          category: { select: { id: true, name: true } },
          variants: { where: { is_deleted: false }, orderBy: { display_order: 'asc' } },
          addons: {
            where: { is_deleted: false },
            include: { addon_group: { select: { id: true, name: true, min_selection: true, max_selection: true, is_required: true } } },
          },
          menu_schedules: { where: { is_deleted: false } },
        },
      }),
      prisma.menuItem.count({ where }),
    ]);

    return { items, total, page, limit };
  } catch (error) {
    logger.error('List menu items failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets a single menu item by ID with all related data.
 * @param {string} itemId - Menu item UUID
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>}
 */
async function getMenuItem(itemId, outletId) {
  const prisma = getDbClient();
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, outlet_id: outletId, is_deleted: false },
      include: {
        category: true,
        variants: { where: { is_deleted: false }, orderBy: { display_order: 'asc' } },
        addons: {
          where: { is_deleted: false },
          include: { addon_group: true },
        },
        recipe: { include: { ingredients: { include: { inventory_item: true } } } },
        menu_schedules: { where: { is_deleted: false } },
        outlet_overrides: { where: { is_deleted: false } },
      },
    });
    if (!item) throw new NotFoundError('Menu item not found');
    return item;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Updates an existing menu item with nested relations replacement.
 * @param {string} itemId - Menu item UUID
 * @param {string} outletId - Outlet UUID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated item
 */
async function updateMenuItem(itemId, outletId, data) {
  const prisma = getDbClient();
  const { variants, addons, menu_schedules, ...itemData } = data;
  try {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, outlet_id: outletId, is_deleted: false },
    });
    if (!existing) throw new NotFoundError('Menu item not found');

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...itemData,
        variants: variants ? {
          deleteMany: {},
          create: variants.map((v, idx) => ({ ...v, id: undefined, display_order: idx })),
        } : undefined,
        addons: addons ? {
          deleteMany: {},
          create: addons.map((a) => ({ addon_group_id: a.addon_group_id })),
        } : undefined,
        menu_schedules: menu_schedules ? {
          deleteMany: {},
          create: menu_schedules.map((s) => ({ ...s, id: undefined })),
        } : undefined,
      },
      include: { category: { select: { name: true } }, variants: true, menu_schedules: true },
    });
    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Soft-deletes a menu item.
 * @param {string} itemId - Menu item UUID
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>}
 */
async function deleteMenuItem(itemId, outletId) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, outlet_id: outletId, is_deleted: false },
    });
    if (!existing) throw new NotFoundError('Menu item not found');

    return await prisma.menuItem.update({
      where: { id: itemId },
      data: { is_deleted: true },
    });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/* ============================
   VARIANTS
   ============================ */

/**
 * Creates a variant for a menu item.
 * @param {string} menuItemId - Menu item UUID
 * @param {object} data - Variant data (name, price_addition, is_default)
 * @returns {Promise<object>} Created variant
 */
async function createVariant(menuItemId, data) {
  const prisma = getDbClient();
  try {
    const variant = await prisma.itemVariant.create({
      data: { ...data, menu_item_id: menuItemId },
    });
    return variant;
  } catch (error) {
    logger.error('Create variant failed', { error: error.message });
    throw error;
  }
}

/**
 * Updates a variant.
 * @param {string} variantId - Variant UUID
 * @param {object} data - Fields to update
 * @returns {Promise<object>}
 */
async function updateVariant(variantId, data) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.itemVariant.findFirst({ where: { id: variantId, is_deleted: false } });
    if (!existing) throw new NotFoundError('Variant not found');
    return await prisma.itemVariant.update({ where: { id: variantId }, data });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Soft-deletes a variant.
 * @param {string} variantId - Variant UUID
 * @returns {Promise<object>}
 */
async function deleteVariant(variantId) {
  const prisma = getDbClient();
  try {
    return await prisma.itemVariant.update({ where: { id: variantId }, data: { is_deleted: true } });
  } catch (error) {
    throw error;
  }
}

/* ============================
   ADDON GROUPS & ADDONS
   ============================ */

/**
 * Creates an addon group for an outlet.
 * @param {object} data - Addon group data
 * @returns {Promise<object>}
 */
async function createAddonGroup(data) {
  const prisma = getDbClient();
  try {
    return await prisma.addonGroup.create({ data });
  } catch (error) {
    logger.error('Create addon group failed', { error: error.message });
    throw error;
  }
}

/**
 * Lists addon groups for an outlet.
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object[]>}
 */
async function listAddonGroups(outletId) {
  const prisma = getDbClient();
  try {
    return await prisma.addonGroup.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      include: { addons: { where: { is_deleted: false } } },
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Creates an addon item linked to a group and menu item.
 * @param {object} data - Addon data
 * @returns {Promise<object>}
 */
async function createAddon(data) {
  const prisma = getDbClient();
  try {
    return await prisma.itemAddon.create({ data });
  } catch (error) {
    logger.error('Create addon failed', { error: error.message });
    throw error;
  }
}

/**
 * Updates an addon.
 * @param {string} addonId - Addon UUID
 * @param {object} data - Fields to update
 * @returns {Promise<object>}
 */
async function updateAddon(addonId, data) {
  const prisma = getDbClient();
  try {
    return await prisma.itemAddon.update({ where: { id: addonId }, data });
  } catch (error) {
    throw error;
  }
}

/**
 * Soft-deletes an addon.
 * @param {string} addonId - Addon UUID
 * @returns {Promise<object>}
 */
async function deleteAddon(addonId) {
  const prisma = getDbClient();
  try {
    return await prisma.itemAddon.update({ where: { id: addonId }, data: { is_deleted: true } });
  } catch (error) {
    throw error;
  }
}

/* ============================
   BULK OPERATIONS
   ============================ */

/**
 * Bulk updates prices for multiple menu items.
 * @param {string} outletId - Outlet UUID
 * @param {Array<{item_id: string, new_price: number}>} items - Items with new prices
 * @returns {Promise<{updated: number}>}
 */
async function bulkPriceUpdate(outletId, items) {
  const prisma = getDbClient();
  try {
    const updates = items.map((item) =>
      prisma.menuItem.updateMany({
        where: { id: item.item_id, outlet_id: outletId, is_deleted: false },
        data: { base_price: item.new_price },
      })
    );
    const results = await prisma.$transaction(updates);
    const updated = results.reduce((sum, r) => sum + r.count, 0);
    logger.info('Bulk price update completed', { outletId, updated });
    return { updated };
  } catch (error) {
    logger.error('Bulk price update failed', { error: error.message });
    throw error;
  }
}

/**
 * Bulk updates availability for multiple menu items.
 * @param {string} outletId - Outlet UUID
 * @param {Array<{item_id: string, is_available: boolean}>} items - Items with availability
 * @returns {Promise<{updated: number}>}
 */
async function bulkAvailability(outletId, items) {
  const prisma = getDbClient();
  try {
    const updates = items.map((item) =>
      prisma.menuItem.updateMany({
        where: { id: item.item_id, outlet_id: outletId, is_deleted: false },
        data: { is_available: item.is_available },
      })
    );
    const results = await prisma.$transaction(updates);
    const updated = results.reduce((sum, r) => sum + r.count, 0);
    return { updated };
  } catch (error) {
    logger.error('Bulk availability update failed', { error: error.message });
    throw error;
  }
}

/**
 * Sets outlet-specific price/availability override for a menu item.
 * @param {string} outletId - Outlet UUID
 * @param {string} menuItemId - Menu item UUID
 * @param {object} data - { override_price, is_available }
 * @returns {Promise<object>}
 */
async function setOutletOverride(outletId, menuItemId, data) {
  const prisma = getDbClient();
  try {
    return await prisma.outletMenuOverride.upsert({
      where: { outlet_id_menu_item_id: { outlet_id: outletId, menu_item_id: menuItemId } },
      create: { outlet_id: outletId, menu_item_id: menuItemId, ...data },
      update: data,
    });
  } catch (error) {
    logger.error('Set outlet override failed', { error: error.message });
    throw error;
  }
}

/* ============================
   SCHEDULING
   ============================ */

/**
 * Adds a schedule to a menu item.
 * @param {string} menuItemId - Menu item UUID
 * @param {object} data - { day_of_week, start_time, end_time }
 * @returns {Promise<object>}
 */
async function createSchedule(menuItemId, data) {
  const prisma = getDbClient();
  try {
    return await prisma.menuSchedule.create({
      data: { ...data, menu_item_id: menuItemId },
    });
  } catch (error) {
    logger.error('Create menu schedule failed', { error: error.message });
    throw error;
  }
}

/**
 * Deletes a menu schedule.
 * @param {string} scheduleId - Schedule UUID
 * @returns {Promise<object>}
 */
async function deleteSchedule(scheduleId) {
  const prisma = getDbClient();
  try {
    return await prisma.menuSchedule.update({
      where: { id: scheduleId },
      data: { is_deleted: true },
    });
  } catch (error) {
    throw error;
  }
}

/* ============================
   COMBOS
   ============================ */

/**
 * Creates a menu combo.
 * @param {object} data - { outlet_id, name, description, combo_price, items: [{ menu_item_id, quantity }] }
 * @returns {Promise<object>}
 */
async function createCombo(data) {
  const prisma = getDbClient();
  const { items, ...comboData } = data;
  try {
    return await prisma.$transaction(async (tx) => {
      const combo = await tx.itemCombo.create({ data: comboData });
      if (items && items.length > 0) {
        await tx.comboItem.createMany({
          data: items.map((i) => ({ ...i, combo_id: combo.id })),
        });
      }
      return tx.itemCombo.findUnique({
        where: { id: combo.id },
        include: { combo_items: { include: { menu_item: true } } },
      });
    });
  } catch (error) {
    logger.error('Create combo failed', { error: error.message });
    throw error;
  }
}

/**
 * Lists combos for an outlet.
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object[]>}
 */
async function listCombos(outletId) {
  const prisma = getDbClient();
  try {
    return await prisma.itemCombo.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      include: { combo_items: { include: { menu_item: true } } },
    });
  } catch (error) {
    throw error;
  }
}

module.exports = {
  createCategory, listCategories, updateCategory, deleteCategory, reorderCategories,
  createMenuItem, listMenuItems, getMenuItem, updateMenuItem, deleteMenuItem,
  createVariant, updateVariant, deleteVariant,
  createAddonGroup, listAddonGroups, createAddon, updateAddon, deleteAddon,
  bulkPriceUpdate, bulkAvailability, setOutletOverride,
  createSchedule, deleteSchedule,
  createCombo, listCombos,
};
