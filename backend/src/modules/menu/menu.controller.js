/**
 * @fileoverview Menu controller — HTTP handlers for menu management endpoints.
 * @module modules/menu/menu.controller
 */

const menuService = require('./menu.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');
const { uploadToS3 } = require('../../config/aws');

/** POST /api/menu/categories */
async function createCategory(req, res, next) {
  try {
    const category = await menuService.createCategory(req.body);
    sendCreated(res, category, 'Category created successfully');
  } catch (error) { next(error); }
}

/** GET /api/menu/categories?outlet_id=&search= */
async function listCategories(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { categories, total } = await menuService.listCategories(outletId, req.query);
    sendSuccess(res, categories, 'Categories retrieved', { total });
  } catch (error) { next(error); }
}

/** PATCH /api/menu/categories/:id */
async function updateCategory(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const category = await menuService.updateCategory(req.params.id, outletId, req.body);
    sendSuccess(res, category, 'Category updated');
  } catch (error) { next(error); }
}

/** DELETE /api/menu/categories/:id */
async function deleteCategory(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await menuService.deleteCategory(req.params.id, outletId);
    sendSuccess(res, null, 'Category deleted');
  } catch (error) { next(error); }
}

/** POST /api/menu/categories/reorder */
async function reorderCategories(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await menuService.reorderCategories(outletId, req.body.items);
    sendSuccess(res, null, 'Categories reordered');
  } catch (error) { next(error); }
}

/** POST /api/menu/items */
async function createMenuItem(req, res, next) {
  try {
    const item = await menuService.createMenuItem(req.body);
    sendCreated(res, item, 'Menu item created');
  } catch (error) { next(error); }
}

/** GET /api/menu/items?outlet_id=&category_id=&food_type=&search=&page=&limit= */
async function listMenuItems(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { items, total, page, limit } = await menuService.listMenuItems(outletId, req.query);
    sendPaginated(res, items, total, page, limit, 'Menu items retrieved');
  } catch (error) { next(error); }
}

/** GET /api/menu/items/:id */
async function getMenuItem(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const item = await menuService.getMenuItem(req.params.id, outletId);
    sendSuccess(res, item, 'Menu item retrieved');
  } catch (error) { next(error); }
}

/** PATCH /api/menu/items/:id */
async function updateMenuItem(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const item = await menuService.updateMenuItem(req.params.id, outletId, req.body);
    sendSuccess(res, item, 'Menu item updated');
  } catch (error) { next(error); }
}

/** DELETE /api/menu/items/:id */
async function deleteMenuItem(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await menuService.deleteMenuItem(req.params.id, outletId);
    sendSuccess(res, null, 'Menu item deleted');
  } catch (error) { next(error); }
}

/** POST /api/menu/items/:id/variants */
async function createVariant(req, res, next) {
  try {
    const variant = await menuService.createVariant(req.params.id, req.body);
    sendCreated(res, variant, 'Variant created');
  } catch (error) { next(error); }
}

/** PATCH /api/menu/variants/:id */
async function updateVariant(req, res, next) {
  try {
    const variant = await menuService.updateVariant(req.params.id, req.body);
    sendSuccess(res, variant, 'Variant updated');
  } catch (error) { next(error); }
}

/** DELETE /api/menu/variants/:id */
async function deleteVariant(req, res, next) {
  try {
    await menuService.deleteVariant(req.params.id);
    sendSuccess(res, null, 'Variant deleted');
  } catch (error) { next(error); }
}

/** POST /api/menu/addon-groups */
async function createAddonGroup(req, res, next) {
  try {
    const group = await menuService.createAddonGroup(req.body);
    sendCreated(res, group, 'Addon group created');
  } catch (error) { next(error); }
}

/** GET /api/menu/addon-groups?outlet_id= */
async function listAddonGroups(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const groups = await menuService.listAddonGroups(outletId);
    sendSuccess(res, groups, 'Addon groups retrieved');
  } catch (error) { next(error); }
}

/** POST /api/menu/addons */
async function createAddon(req, res, next) {
  try {
    const addon = await menuService.createAddon(req.body);
    sendCreated(res, addon, 'Addon created');
  } catch (error) { next(error); }
}

/** PATCH /api/menu/addons/:id */
async function updateAddon(req, res, next) {
  try {
    const addon = await menuService.updateAddon(req.params.id, req.body);
    sendSuccess(res, addon, 'Addon updated');
  } catch (error) { next(error); }
}

/** DELETE /api/menu/addons/:id */
async function deleteAddon(req, res, next) {
  try {
    await menuService.deleteAddon(req.params.id);
    sendSuccess(res, null, 'Addon deleted');
  } catch (error) { next(error); }
}

/** POST /api/menu/items/bulk-price-update */
async function bulkPriceUpdate(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await menuService.bulkPriceUpdate(outletId, req.body.items);
    sendSuccess(res, result, `${result.updated} items updated`);
  } catch (error) { next(error); }
}

/** POST /api/menu/items/bulk-availability */
async function bulkAvailability(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await menuService.bulkAvailability(outletId, req.body.items);
    sendSuccess(res, result, `${result.updated} items updated`);
  } catch (error) { next(error); }
}

/** POST /api/menu/items/:id/outlet-override */
async function setOutletOverride(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const override = await menuService.setOutletOverride(outletId, req.params.itemId, req.body);
    sendSuccess(res, override, 'Outlet override set');
  } catch (error) { next(error); }
}

/** POST /api/menu/items/:id/schedules */
async function createSchedule(req, res, next) {
  try {
    const schedule = await menuService.createSchedule(req.params.id, req.body);
    sendCreated(res, schedule, 'Menu schedule added');
  } catch (error) { next(error); }
}

/** DELETE /api/menu/schedules/:id */
async function deleteSchedule(req, res, next) {
  try {
    await menuService.deleteSchedule(req.params.id);
    sendSuccess(res, null, 'Menu schedule removed');
  } catch (error) { next(error); }
}

/** POST /api/menu/combos */
async function createCombo(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const combo = await menuService.createCombo({ ...req.body, outlet_id: outletId });
    sendCreated(res, combo, 'Combo created successfully');
  } catch (error) { next(error); }
}

/** GET /api/menu/combos?outlet_id= */
async function listCombos(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const combos = await menuService.listCombos(outletId);
    sendSuccess(res, combos, 'Combos retrieved');
  } catch (error) { next(error); }
}

/** POST /api/menu/upload-image */
async function uploadImage(req, res, next) {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const { url } = await uploadToS3(req.file.buffer, req.file.originalname, 'menu-items', req.file.mimetype);
    sendSuccess(res, { url }, 'Image uploaded successfully');
  } catch (error) { next(error); }
}

module.exports = {
  createCategory, listCategories, updateCategory, deleteCategory, reorderCategories,
  createMenuItem, listMenuItems, getMenuItem, updateMenuItem, deleteMenuItem,
  createVariant, updateVariant, deleteVariant,
  createAddonGroup, listAddonGroups, createAddon, updateAddon, deleteAddon,
  bulkPriceUpdate, bulkAvailability, setOutletOverride,
  createSchedule, deleteSchedule,
  createCombo, listCombos,
  uploadImage,
};
