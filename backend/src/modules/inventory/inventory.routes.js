/**
 * @fileoverview Inventory routes.
 * @module modules/inventory/inventory.routes
 */

const express = require('express');
const router = express.Router();
const inventoryController = require('./inventory.controller');
const aiController = require('./inventory.ai.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { adjustStockSchema, recordWastageSchema, createRecipeSchema, createInventoryItemSchema } = require('./inventory.validation');
const { auditLog } = require('../../middleware/audit.middleware');

// Summary — must be registered before /:id-style routes to avoid collision
router.get('/summary', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getSummary);

router.get('/items', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.listItems);
router.post('/items', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), inventoryController.createItem);
router.patch('/items/:id', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), inventoryController.updateItem);
router.delete('/items/:id', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), inventoryController.deleteItem);

router.get('/stock', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getStock);
router.get('/low-stock', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getLowStock);
router.get('/wastage', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getWastageLogs);
router.get('/consumption-report', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.getConsumptionReport);

router.post('/adjust', authenticate, hasPermission('MANAGE_INVENTORY'), validate(adjustStockSchema), auditLog('inventory'), inventoryController.adjustStock);
router.post('/wastage', authenticate, hasPermission('MANAGE_INVENTORY'), validate(recordWastageSchema), auditLog('inventory'), inventoryController.recordWastage);
router.post('/recipes/:menuItemId', authenticate, hasPermission('MANAGE_MENU'), validate(createRecipeSchema), auditLog('inventory'), inventoryController.createRecipe);
router.get('/recipes', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.listRecipes);
router.get('/recipes/:menuItemId/cost', authenticate, hasPermission('VIEW_INVENTORY'), inventoryController.getRecipeCost);

// Auto-order trigger
router.post('/auto-order', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), inventoryController.triggerAutoOrder);

// Restock from cancelled order
router.post('/restock-order', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), inventoryController.restockOrder);

// Suppliers
router.get('/suppliers', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.listSuppliers);
router.post('/suppliers', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), inventoryController.createSupplier);

// AI-powered endpoints
router.post('/ai/suggest-items',  authenticate, hasPermission('MANAGE_INVENTORY'), aiController.suggestItems);
router.post('/ai/suggest-recipe', authenticate, hasPermission('MANAGE_INVENTORY'), aiController.suggestRecipe);
router.get('/ai/insights',        authenticate, hasPermission('VIEW_INVENTORY'),   enforceOutletScope, aiController.getInsights);
router.post('/ai/build-po',       authenticate, hasPermission('MANAGE_INVENTORY'), aiController.buildPO);
router.post('/ai/autofill-item',  authenticate, hasPermission('MANAGE_INVENTORY'), aiController.autofillItem);

// ── Mobile app aliases ────────────────────────────────────────────────────────
// The mobile app calls GET/POST /api/inventory and PATCH /api/inventory/:itemId
// These are aliases for the /items sub-routes so the mobile app works without
// needing to know the internal sub-resource naming convention.

/** GET /api/inventory  →  alias for GET /api/inventory/items */
router.get('/', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, inventoryController.listItems);

/** POST /api/inventory  →  alias for POST /api/inventory/items */
router.post('/', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), inventoryController.createItem);

/** PATCH /api/inventory/:itemId  →  alias for PATCH /api/inventory/items/:id */
router.patch('/:itemId', authenticate, hasPermission('MANAGE_INVENTORY'), auditLog('inventory'), (req, res, next) => {
  // Re-map :itemId → :id so the controller can read req.params.id consistently
  req.params.id = req.params.itemId;
  return inventoryController.updateItem(req, res, next);
});

module.exports = router;
