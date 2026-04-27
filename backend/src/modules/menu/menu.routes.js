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

/* -- AI Menu Sync -- */
router.post('/ai/scan-menu', authenticate, hasPermission('MANAGE_MENU'), upload.single('image'), aiMenuController.scanMenu);
router.post('/ai/confirm-sync', authenticate, hasPermission('MANAGE_MENU'), aiMenuController.confirmSync);

/* -- Categories -- */
router.post('/categories', authenticate, hasPermission('MANAGE_CATEGORIES'), validate(createCategorySchema), menuController.createCategory);
router.get('/categories', authenticate, enforceOutletScope, menuController.listCategories);
router.patch('/categories/:id', authenticate, hasPermission('MANAGE_CATEGORIES'), validate(updateCategorySchema), menuController.updateCategory);
router.delete('/categories/:id', authenticate, hasPermission('MANAGE_CATEGORIES'), menuController.deleteCategory);
router.post('/categories/reorder', authenticate, hasPermission('MANAGE_CATEGORIES'), menuController.reorderCategories);

/* -- Menu Items -- */
router.post('/items', authenticate, hasPermission('MANAGE_MENU'), validate(createMenuItemSchema), menuController.createMenuItem);
router.get('/items', authenticate, enforceOutletScope, menuController.listMenuItems);
router.get('/items/:id', authenticate, enforceOutletScope, menuController.getMenuItem);
router.patch('/items/:id', authenticate, hasPermission('MANAGE_MENU'), validate(updateMenuItemSchema), menuController.updateMenuItem);
router.delete('/items/:id', authenticate, hasPermission('MANAGE_MENU'), menuController.deleteMenuItem);
router.post('/upload-image', authenticate, hasPermission('MANAGE_MENU'), upload.single('image'), menuController.uploadImage);

/* -- Variants -- */
router.post('/items/:id/variants', authenticate, hasPermission('MANAGE_MENU'), validate(createVariantSchema), menuController.createVariant);
router.patch('/variants/:id', authenticate, hasPermission('MANAGE_MENU'), menuController.updateVariant);
router.delete('/variants/:id', authenticate, hasPermission('MANAGE_MENU'), menuController.deleteVariant);

/* -- Addon Groups & Addons -- */
router.post('/addon-groups', authenticate, hasPermission('MANAGE_MENU'), validate(createAddonGroupSchema), menuController.createAddonGroup);
router.get('/addon-groups', authenticate, enforceOutletScope, menuController.listAddonGroups);
router.post('/addons', authenticate, hasPermission('MANAGE_MENU'), validate(createAddonSchema), menuController.createAddon);
router.patch('/addons/:id', authenticate, hasPermission('MANAGE_MENU'), menuController.updateAddon);
router.delete('/addons/:id', authenticate, hasPermission('MANAGE_MENU'), menuController.deleteAddon);

/* -- Bulk Operations -- */
router.post('/items/bulk-price-update', authenticate, hasPermission('MANAGE_MENU'), validate(bulkPriceUpdateSchema), menuController.bulkPriceUpdate);
router.post('/items/bulk-availability', authenticate, hasPermission('MANAGE_MENU'), validate(bulkAvailabilitySchema), menuController.bulkAvailability);

/* -- Outlet Overrides -- */
router.post('/items/:itemId/outlet-override', authenticate, hasPermission('MANAGE_MENU'), menuController.setOutletOverride);

/* -- Menu Scheduling -- */
router.post('/items/:id/schedules', authenticate, hasPermission('MANAGE_MENU'), validate(createMenuScheduleSchema), menuController.createSchedule);
router.delete('/schedules/:id', authenticate, hasPermission('MANAGE_MENU'), menuController.deleteSchedule);

/* -- Item Combos -- */
router.post('/combos', authenticate, hasPermission('MANAGE_MENU'), validate(createComboSchema), menuController.createCombo);
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
