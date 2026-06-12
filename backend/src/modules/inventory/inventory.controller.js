/**
 * @fileoverview Inventory controller — HTTP handlers for inventory endpoints.
 * @module modules/inventory/inventory.controller
 */

const inventoryService = require('./inventory.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

/** GET /api/inventory/stock */
async function getStock(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await inventoryService.getStock(outletId, req.query);
    sendPaginated(res, result.items, result.total, result.page, result.limit, 'Stock levels retrieved');
  } catch (error) { next(error); }
}

/** POST /api/inventory/adjust */
async function adjustStock(req, res, next) {
  try {
    const result = await inventoryService.adjustStock(
      req.body.outlet_id, req.body.item_id, req.body.quantity, req.body.reason, req.user.id
    );
    sendSuccess(res, result, 'Stock adjusted');
  } catch (error) { next(error); }
}

/** POST /api/inventory/wastage */
async function recordWastage(req, res, next) {
  try {
    const result = await inventoryService.recordWastage(req.body.outlet_id, req.body.items, req.user.id);
    sendSuccess(res, result, `${result.logged} items wastage recorded`);
  } catch (error) { next(error); }
}

/** POST /api/inventory/recipes/:menuItemId */
async function createRecipe(req, res, next) {
  try {
    const recipe = await inventoryService.createRecipe(req.params.menuItemId, req.body);
    sendCreated(res, recipe, 'Recipe created');
  } catch (error) { next(error); }
}

/** GET /api/inventory/recipes/:menuItemId/cost */
async function getRecipeCost(req, res, next) {
  try {
    const cost = await inventoryService.getRecipeCost(req.params.menuItemId);
    sendSuccess(res, cost, 'Recipe cost calculated');
  } catch (error) { next(error); }
}

/** GET /api/inventory/items */
async function listItems(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await inventoryService.listInventoryItems(outletId, req.query);
    sendPaginated(res, result.items, result.total, result.page, result.limit, 'Inventory items retrieved');
  } catch (error) { next(error); }
}

/** POST /api/inventory/items */
async function createItem(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const item = await inventoryService.createInventoryItem(outletId, req.body);
    sendCreated(res, item, 'Inventory item created');
  } catch (error) { next(error); }
}

/** PATCH /api/inventory/items/:id */
async function updateItem(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const item = await inventoryService.updateInventoryItem(req.params.id, req.body, outletId);
    sendSuccess(res, item, 'Inventory item updated');
  } catch (error) { next(error); }
}

/** DELETE /api/inventory/items/:id */
async function deleteItem(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await inventoryService.deleteInventoryItem(req.params.id, outletId);
    sendSuccess(res, null, 'Inventory item deleted');
  } catch (error) { next(error); }
}

/** GET /api/inventory/items/:id/transactions */
async function getItemTransactions(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const rows = await inventoryService.listItemTransactions(outletId, req.params.id, req.query.limit);
    sendSuccess(res, rows, 'Transactions retrieved');
  } catch (error) { next(error); }
}

/** GET /api/inventory/low-stock */
async function getLowStock(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const items = await inventoryService.getLowStock(outletId);
    sendSuccess(res, items, 'Low stock items retrieved');
  } catch (error) { next(error); }
}

/** GET /api/inventory/wastage */
async function getWastageLogs(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const logs = await inventoryService.getWastageLogs(outletId, req.query);
    sendSuccess(res, logs, 'Wastage logs retrieved');
  } catch (error) { next(error); }
}

/** GET /api/inventory/consumption-report */
async function getConsumptionReport(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await inventoryService.getConsumptionReport(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'Consumption report retrieved');
  } catch (error) { next(error); }
}

/** POST /api/inventory/auto-order */
async function triggerAutoOrder(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await inventoryService.checkAndAutoOrder(outletId);
    sendSuccess(res, result, `Auto-order check: ${result.orders_created} PO(s) created`);
  } catch (error) { next(error); }
}

/** POST /api/inventory/restock-order */
async function restockOrder(req, res, next) {
  try {
    const result = await inventoryService.restockFromCancelledOrder(req.body.order_id);
    sendSuccess(res, result, `Restocked ${result.restocked} ingredient(s)`);
  } catch (error) { next(error); }
}

/** GET /api/inventory/recipes */
async function listRecipes(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const prisma = require('../../config/database').getDbClient();
    const recipes = await prisma.recipe.findMany({
      where: { menu_item: { outlet_id: outletId }, is_deleted: false },
      include: {
        menu_item: { select: { id: true, name: true, base_price: true } },
        ingredients: {
          where: { is_deleted: false },
          include: { inventory_item: { select: { id: true, name: true, unit: true, cost_per_unit: true } } },
        },
      },
      orderBy: { menu_item: { name: 'asc' } },
    });
    sendSuccess(res, recipes, 'Recipes retrieved');
  } catch (error) { next(error); }
}

/**
 * GET /api/inventory/summary
 * Aggregated view: total items, low-stock count, out-of-stock count, categories.
 */
async function getSummary(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { getDbClient } = require('../../config/database');
    const prisma = getDbClient();

    const [allStock, lowStockItems, categories] = await Promise.all([
      // All stock rows for this outlet with their item definitions
      prisma.inventoryStock.findMany({
        where: { outlet_id: outletId, is_deleted: false },
        include: {
          item: {
            select: { name: true, unit: true, category: true, min_threshold: true },
          },
        },
      }),
      // Low-stock items (current_stock <= min_threshold)
      inventoryService.getLowStock(outletId),
      // Distinct categories for this outlet's items
      prisma.inventoryItem.findMany({
        where: { outlet_id: outletId, is_deleted: false },
        distinct: ['category'],
        select: { category: true },
      }),
    ]);

    const outOfStock = allStock.filter((s) => Number(s.current_stock) <= 0);

    const summary = {
      outlet_id: outletId,
      total_items: allStock.length,
      low_stock_count: lowStockItems.length,
      out_of_stock_count: outOfStock.length,
      categories: categories.map((c) => c.category).filter(Boolean),
      low_stock_items: lowStockItems.slice(0, 20),
      out_of_stock_items: outOfStock.slice(0, 20).map((s) => ({
        item_id: s.inventory_item_id,
        name: s.item?.name,
        unit: s.item?.unit,
        current_stock: Number(s.current_stock),
      })),
    };

    sendSuccess(res, summary, 'Inventory summary retrieved');
  } catch (error) { next(error); }
}

module.exports = {
  getStock, adjustStock, recordWastage, createRecipe, getRecipeCost,
  listItems, createItem, updateItem, deleteItem,
  getItemTransactions,
  getLowStock, getWastageLogs, getConsumptionReport,
  triggerAutoOrder, restockOrder,
  listRecipes,
  getSummary,
};
