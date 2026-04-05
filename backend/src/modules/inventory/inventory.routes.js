/**
 * @fileoverview Inventory routes.
 * @module modules/inventory/inventory.routes
 */

const express = require('express');
const router = express.Router();
const inventoryController = require('./inventory.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { adjustStockSchema, recordWastageSchema, createRecipeSchema, createInventoryItemSchema } = require('./inventory.validation');

router.get('/items', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.listItems);
router.post('/items', authenticate, hasPermission('MANAGE_INVENTORY'), inventoryController.createItem);
router.patch('/items/:id', authenticate, hasPermission('MANAGE_INVENTORY'), inventoryController.updateItem);
router.delete('/items/:id', authenticate, hasPermission('MANAGE_INVENTORY'), inventoryController.deleteItem);

router.get('/stock', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getStock);
router.get('/low-stock', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getLowStock);
router.get('/wastage', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getWastageLogs);
router.get('/consumption-report', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getConsumptionReport);

router.post('/adjust', authenticate, hasPermission('MANAGE_INVENTORY'), validate(adjustStockSchema), inventoryController.adjustStock);
router.post('/wastage', authenticate, hasPermission('MANAGE_INVENTORY'), validate(recordWastageSchema), inventoryController.recordWastage);
router.post('/recipes/:menuItemId', authenticate, hasPermission('MANAGE_MENU'), validate(createRecipeSchema), inventoryController.createRecipe);
router.get('/recipes/:menuItemId/cost', authenticate, hasPermission('VIEW_INVENTORY'), inventoryController.getRecipeCost);

module.exports = router;
