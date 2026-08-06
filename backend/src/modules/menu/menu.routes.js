/**
 * @fileoverview Menu routes — maps endpoints to controllers with auth + validation middleware.
 * @module modules/menu/menu.routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const menuController = require('./menu.controller');
const aiMenuController = require('./ai_menu.controller');
const { authenticate, isSuperAdmin } = require('../../middleware/auth.middleware');
const { hasRole, hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  createCategorySchema, updateCategorySchema,
  createMenuItemSchema, updateMenuItemSchema,
  createVariantSchema, createAddonGroupSchema, createAddonSchema,
  bulkPriceUpdateSchema, bulkAvailabilitySchema,
  createMenuScheduleSchema, createComboSchema,
} = require('./menu.validation');
const { auditLog } = require('../../middleware/audit.middleware');

/* -- AI Menu Sync -- five input modes, all funnel into the same review/confirm step -- */
router.post('/ai/scan-menu',   authenticate, hasPermission('MANAGE_MENU'), upload.single('image'), auditLog('menu'), aiMenuController.scanMenu);
router.post('/ai/scan-pdf',    authenticate, hasPermission('MANAGE_MENU'), upload.single('pdf'),   auditLog('menu'), aiMenuController.scanPdf);
router.post('/ai/parse-text',  authenticate, hasPermission('MANAGE_MENU'),                          auditLog('menu'), aiMenuController.parseText);
router.post('/ai/parse-url',   authenticate, hasPermission('MANAGE_MENU'),                          auditLog('menu'), aiMenuController.parseUrl);
router.post('/ai/parse-csv',   authenticate, hasPermission('MANAGE_MENU'), upload.single('file'),  auditLog('menu'), aiMenuController.parseCsv);
router.post('/ai/confirm-sync',authenticate, hasPermission('MANAGE_MENU'),                          auditLog('menu'), aiMenuController.confirmSync);

/* -- Categories -- */
// enforceOutletScope pins body.outlet_id to the caller's own outlet for scoped
// roles (owners/super_admins bypass), preventing a scoped MANAGE_* manager from
// creating/writing menu data in another outlet via an attacker-supplied outlet_id.
router.post('/categories', authenticate, enforceOutletScope, hasPermission('MANAGE_CATEGORIES'), validate(createCategorySchema), auditLog('menu'), menuController.createCategory);
router.get('/categories', authenticate, enforceOutletScope, menuController.listCategories);
router.patch('/categories/:id', authenticate, hasPermission('MANAGE_CATEGORIES'), validate(updateCategorySchema), auditLog('menu'), menuController.updateCategory);
router.delete('/categories/:id', authenticate, hasPermission('MANAGE_CATEGORIES'), auditLog('menu'), menuController.deleteCategory);
router.post('/categories/reorder', authenticate, hasPermission('MANAGE_CATEGORIES'), auditLog('menu'), menuController.reorderCategories);

/* -- Menu Items -- */
// enforceOutletScope forces body.outlet_id to the caller's outlet (owners bypass),
// blocking cross-outlet item creation by a scoped manager.
router.post('/items', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), validate(createMenuItemSchema), auditLog('menu'), menuController.createMenuItem);
router.get('/items', authenticate, enforceOutletScope, menuController.listMenuItems);
router.get('/items/:id', authenticate, enforceOutletScope, menuController.getMenuItem);
router.patch('/items/:id', authenticate, hasPermission('MANAGE_MENU'), validate(updateMenuItemSchema), auditLog('menu'), menuController.updateMenuItem);
router.delete('/items/:id', authenticate, hasPermission('MANAGE_MENU'), auditLog('menu'), menuController.deleteMenuItem);
router.post('/upload-image', authenticate, hasPermission('MANAGE_MENU'), upload.single('image'), menuController.uploadImage);

/* -- Variants -- */
router.post('/items/:id/variants', authenticate, hasPermission('MANAGE_MENU'), validate(createVariantSchema), auditLog('menu'), menuController.createVariant);
router.patch('/variants/:id', authenticate, hasPermission('MANAGE_MENU'), auditLog('menu'), menuController.updateVariant);
router.delete('/variants/:id', authenticate, hasPermission('MANAGE_MENU'), auditLog('menu'), menuController.deleteVariant);

/* -- Addon Groups & Addons -- */
router.post('/addon-groups', authenticate, hasPermission('MANAGE_MENU'), validate(createAddonGroupSchema), auditLog('menu'), menuController.createAddonGroup);
router.get('/addon-groups', authenticate, enforceOutletScope, menuController.listAddonGroups);
router.post('/addons', authenticate, hasPermission('MANAGE_MENU'), validate(createAddonSchema), auditLog('menu'), menuController.createAddon);
router.patch('/addons/:id', authenticate, hasPermission('MANAGE_MENU'), auditLog('menu'), menuController.updateAddon);
router.delete('/addons/:id', authenticate, hasPermission('MANAGE_MENU'), auditLog('menu'), menuController.deleteAddon);

/* -- Bulk Operations -- */
// enforceOutletScope forces body.outlet_id to the caller's outlet (owners bypass),
// stopping a scoped manager from bulk-mutating another outlet's items.
router.post('/items/bulk-price-update', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), validate(bulkPriceUpdateSchema), auditLog('menu'), menuController.bulkPriceUpdate);
router.post('/items/bulk-availability', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), validate(bulkAvailabilitySchema), auditLog('menu'), menuController.bulkAvailability);

/* -- Outlet Overrides -- */
// enforceOutletScope forces body.outlet_id to the caller's outlet (owners bypass),
// preventing a scoped manager from writing a price/availability override for another outlet.
router.post('/items/:itemId/outlet-override', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), auditLog('menu'), menuController.setOutletOverride);

/* -- Menu Scheduling -- */
router.post('/items/:id/schedules', authenticate, hasPermission('MANAGE_MENU'), validate(createMenuScheduleSchema), auditLog('menu'), menuController.createSchedule);
router.delete('/schedules/:id', authenticate, hasPermission('MANAGE_MENU'), auditLog('menu'), menuController.deleteSchedule);

/* -- Item Combos -- */
// enforceOutletScope forces body.outlet_id to the caller's outlet (owners bypass),
// blocking cross-outlet combo creation by a scoped manager.
router.post('/combos', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), validate(createComboSchema), auditLog('menu'), menuController.createCombo);
router.get('/combos', authenticate, enforceOutletScope, menuController.listCombos);

/* -- AU Menu Templates -- */
const menuTemplatesSvc = require('./menu-templates.service');
const { sendSuccess } = require('../../utils/response');

router.get('/templates', authenticate, async (req, res, next) => {
  try {
    const list = await menuTemplatesSvc.listTemplates(req.query.region);
    sendSuccess(res, list, 'Menu templates retrieved');
  } catch (e) { next(e); }
});

router.post('/templates/seed', authenticate, isSuperAdmin, async (req, res, next) => {
  try {
    const result = await menuTemplatesSvc.seedTemplates();
    sendSuccess(res, result, 'Templates seeded');
  } catch (e) { next(e); }
});

router.post('/apply-template', authenticate, hasPermission('MANAGE_MENU'), async (req, res, next) => {
  try {
    const { outlet_id, template_name } = req.body;
    const outletId = outlet_id || req.user.outlet_id;
    const result = await menuTemplatesSvc.applyTemplate(outletId, template_name);
    sendSuccess(res, result, 'Menu template applied successfully');
  } catch (e) { next(e); }
});

module.exports = router;
