/**
 * @fileoverview Inventory service — stock management, recipes, suppliers, POs.
 * @module modules/inventory/inventory.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');

/**
 * Gets inventory item definitions (raw materials).
 * @param {string} outletId - Outlet UUID
 * @param {object} [query] - Filters (category, search, is_active)
 * @returns {Promise<{items: object[], total: number}>}
 */
async function listInventoryItems(outletId, query = {}) {
  const prisma = getDbClient();
  const { page, limit, offset } = parsePagination(query);
  const where = { outlet_id: outletId, is_deleted: false };
  if (query.category) where.category = query.category;
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  if (query.is_active !== undefined) where.is_active = query.is_active === 'true';

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where, skip: offset, take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  return { items, total, page, limit };
}

/**
 * Creates a new inventory item definition.
 * @param {string} outletId - Outlet UUID
 * @param {object} data - Item data
 * @returns {Promise<object>}
 */
async function createInventoryItem(outletId, data) {
  const prisma = getDbClient();
  return await prisma.inventoryItem.create({
    data: {
      outlet_id: outletId,
      name: data.name,
      sku: data.sku || null,
      category: data.category,
      unit: data.unit,
      cost_per_unit: Number(data.cost_per_unit) || 0,
      min_threshold: Number(data.min_threshold) || 0,
      max_threshold: Number(data.max_threshold) || 0,
      auto_order_enabled: data.auto_order_enabled ?? false,
      reorder_qty: data.reorder_qty ? Number(data.reorder_qty) : null,
      preferred_supplier_id: data.preferred_supplier_id || null,
      is_active: data.is_active ?? true,
    },
  });
}

/**
 * Updates an inventory item.
 * @param {string} id - Item UUID
 * @param {object} data - Updated data
 * @param {string} outletId - Outlet UUID (ownership check)
 * @returns {Promise<object>}
 */
async function updateInventoryItem(id, data, outletId) {
  const prisma = getDbClient();
  // Verify item belongs to the requesting outlet before updating
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!existing) throw new NotFoundError('Inventory item not found');

  const updateData = {
    name: data.name,
    category: data.category,
    unit: data.unit,
    cost_per_unit: data.cost_per_unit !== undefined ? Number(data.cost_per_unit) : undefined,
    min_threshold: data.min_threshold !== undefined ? Number(data.min_threshold) : undefined,
    max_threshold: data.max_threshold !== undefined ? Number(data.max_threshold) : undefined,
    is_active: data.is_active,
    auto_order_enabled: data.auto_order_enabled,
    reorder_qty: data.reorder_qty !== undefined ? Number(data.reorder_qty) : undefined,
    preferred_supplier_id: data.preferred_supplier_id || null,
  };
  // Remove undefined keys
  Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);
  return await prisma.inventoryItem.update({ where: { id }, data: updateData });
}

/**
 * Soft deletes an inventory item.
 * @param {string} id - Item UUID
 * @param {string} outletId - Outlet UUID (ownership check)
 * @returns {Promise<object>}
 */
async function deleteInventoryItem(id, outletId) {
  const prisma = getDbClient();
  // Verify item belongs to the requesting outlet before deleting
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!existing) throw new NotFoundError('Inventory item not found');

  return await prisma.inventoryItem.update({
    where: { id },
    data: { is_deleted: true },
  });
}

/**
 * Gets current stock levels for an outlet.
 * @param {string} outletId - Outlet UUID
 * @param {object} [query] - Filters (category, search, low_stock)
 * @returns {Promise<{items: object[], total: number}>}
 */
async function getStock(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset } = parsePagination(query);
    const itemWhere = { outlet_id: outletId, is_deleted: false, is_active: true };
    if (query.category) itemWhere.category = query.category;
    if (query.search) itemWhere.name = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: itemWhere,
        skip: offset,
        take: limit,
        include: {
          stock: { where: { outlet_id: outletId, is_deleted: false } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.inventoryItem.count({ where: itemWhere }),
    ]);

    const enriched = items.map((item) => {
      const stockRecord = item.stock[0];
      const currentStock = stockRecord ? Number(stockRecord.current_stock) : 0;
      const minThreshold = Number(item.min_threshold);
      let stockStatus = 'OK';
      if (currentStock <= 0) stockStatus = 'OUT';
      else if (currentStock <= minThreshold) stockStatus = 'CRITICAL';
      else if (currentStock <= minThreshold * 1.5) stockStatus = 'LOW';

      return { ...item, current_stock: currentStock, stock_status: stockStatus };
    });

    if (query.low_stock === 'true') {
      const filtered = enriched.filter((i) => ['LOW', 'CRITICAL', 'OUT'].includes(i.stock_status));
      return { items: filtered, total: filtered.length, page, limit };
    }

    return { items: enriched, total, page, limit };
  } catch (error) {
    logger.error('Get stock failed', { error: error.message });
    throw error;
  }
}

/**
 * Manually adjusts stock for an inventory item.
 * @param {string} outletId - Outlet UUID
 * @param {string} itemId - Inventory item UUID
 * @param {number} quantity - Adjustment quantity (positive=add, negative=deduct)
 * @param {string} reason - Reason for adjustment
 * @param {string} userId - User performing adjustment
 * @returns {Promise<object>} Updated stock record
 */
async function adjustStock(outletId, itemId, quantity, reason, userId) {
  const prisma = getDbClient();
  try {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, outlet_id: outletId, is_deleted: false },
    });
    if (!item) throw new NotFoundError('Inventory item not found');

    const result = await prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.upsert({
        where: { outlet_id_inventory_item_id: { outlet_id: outletId, inventory_item_id: itemId } },
        create: { outlet_id: outletId, inventory_item_id: itemId, current_stock: quantity, last_updated_by: userId },
        update: { current_stock: { increment: quantity }, last_updated_by: userId },
      });

      await tx.stockTransaction.create({
        data: {
          outlet_id: outletId, inventory_item_id: itemId,
          transaction_type: 'adjustment', quantity, reason,
          performed_by: userId,
        },
      });

      return stock;
    });

    const newStock = Number(result.current_stock);
    if (newStock <= Number(item.min_threshold) && newStock > 0) {
      const io = getIO();
      if (io) {
        io.of('/orders').to(`outlet:${outletId}`).emit('low_stock_alert', {
          item_name: item.name, current_stock: newStock, min_threshold: Number(item.min_threshold),
        });
      }
    }

    logger.info('Stock adjusted', { itemId, quantity, reason, newStock });
    return result;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Auto-deducts inventory based on recipe when an order is paid.
 * @param {string} orderId - Order UUID
 * @returns {Promise<{deducted: number, alerts: object[]}>}
 */
async function deductByRecipe(orderId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      include: { order_items: { where: { is_deleted: false } } },
    });
    if (!order) throw new NotFoundError('Order not found');

    const alerts = [];
    let deducted = 0;

    await prisma.$transaction(async (tx) => {
      for (const orderItem of order.order_items) {
        const recipe = await tx.recipe.findFirst({
          where: { menu_item_id: orderItem.menu_item_id, is_deleted: false },
          include: { ingredients: { include: { inventory_item: true } } },
        });

        if (!recipe) continue;

        for (const ingredient of recipe.ingredients) {
          const consumeQty = Number(ingredient.quantity) * orderItem.quantity;

          const stock = await tx.inventoryStock.upsert({
            where: {
              outlet_id_inventory_item_id: {
                outlet_id: order.outlet_id,
                inventory_item_id: ingredient.inventory_item_id,
              },
            },
            create: {
              outlet_id: order.outlet_id, inventory_item_id: ingredient.inventory_item_id,
              current_stock: -consumeQty,
            },
            update: { current_stock: { decrement: consumeQty } },
          });

          await tx.stockTransaction.create({
            data: {
              outlet_id: order.outlet_id, inventory_item_id: ingredient.inventory_item_id,
              transaction_type: 'consumption', quantity: -consumeQty,
              reference_type: 'order', reference_id: orderId,
            },
          });

          deducted++;
          const newStock = Number(stock.current_stock);
          const minThreshold = Number(ingredient.inventory_item.min_threshold);

          if (newStock <= minThreshold) {
            alerts.push({
              item_name: ingredient.inventory_item.name,
              current_stock: newStock,
              min_threshold: minThreshold,
              unit: ingredient.inventory_item.unit,
            });
          }
        }
      }
    });

    if (alerts.length > 0) {
      const io = getIO();
      if (io) {
        for (const alert of alerts) {
          io.of('/orders').to(`outlet:${order.outlet_id}`).emit('low_stock_alert', alert);
        }
      }
    }

    logger.info('Recipe deduction completed', { orderId, deducted, alerts: alerts.length });
    return { deducted, alerts };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Records wastage for an inventory item.
 * @param {string} outletId - Outlet UUID
 * @param {Array<{item_id: string, quantity: number, reason: string}>} items - Wasted items
 * @param {string} userId - User logging wastage
 * @returns {Promise<{logged: number}>}
 */
async function recordWastage(outletId, items, userId) {
  const prisma = getDbClient();
  try {
    let logged = 0;
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.wastageLog.create({
          data: {
            outlet_id: outletId, inventory_item_id: item.item_id,
            quantity: item.quantity, reason: item.reason, logged_by: userId,
          },
        });
        await tx.inventoryStock.upsert({
          where: { outlet_id_inventory_item_id: { outlet_id: outletId, inventory_item_id: item.item_id } },
          create: { outlet_id: outletId, inventory_item_id: item.item_id, current_stock: -item.quantity, last_updated_by: userId },
          update: { current_stock: { decrement: item.quantity } },
        });
        await tx.stockTransaction.create({
          data: {
            outlet_id: outletId, inventory_item_id: item.item_id,
            transaction_type: 'wastage', quantity: -item.quantity, reason: item.reason,
            performed_by: userId,
          },
        });
        logged++;
      }
    });
    return { logged };
  } catch (error) {
    logger.error('Record wastage failed', { error: error.message });
    throw error;
  }
}

/**
 * Creates a recipe for a menu item with ingredients.
 * @param {string} menuItemId - Menu item UUID
 * @param {object} data - Recipe data with ingredients array
 * @returns {Promise<object>} Created recipe
 */
async function createRecipe(menuItemId, data) {
  const prisma = getDbClient();
  try {
    const recipe = await prisma.recipe.create({
      data: {
        menu_item_id: menuItemId,
        name: data.name,
        yield_quantity: data.yield_quantity || 1,
        yield_unit: data.yield_unit || 'pcs',
        instructions: data.instructions,
        ingredients: {
          create: data.ingredients.map((ing) => ({
            inventory_item_id: ing.inventory_item_id,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
        },
      },
      include: { ingredients: { include: { inventory_item: true } } },
    });
    return recipe;
  } catch (error) {
    logger.error('Create recipe failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets recipe cost for a menu item.
 * @param {string} menuItemId - Menu item UUID
 * @returns {Promise<{recipe_cost: number, ingredients: object[]}>}
 */
async function getRecipeCost(menuItemId) {
  const prisma = getDbClient();
  try {
    const recipe = await prisma.recipe.findFirst({
      where: { menu_item_id: menuItemId, is_deleted: false },
      include: { ingredients: { include: { inventory_item: true } } },
    });
    if (!recipe) throw new NotFoundError('Recipe not found for this item');

    let totalCost = 0;
    const ingredientCosts = recipe.ingredients.map((ing) => {
      const cost = Number(ing.quantity) * Number(ing.inventory_item.cost_per_unit);
      totalCost += cost;
      return { name: ing.inventory_item.name, quantity: Number(ing.quantity), unit: ing.unit, unit_cost: Number(ing.inventory_item.cost_per_unit), line_cost: cost };
    });

    return { recipe_cost: Math.round(totalCost * 100) / 100, ingredients: ingredientCosts };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Gets items with low stock status.
 */
async function getLowStock(outletId) {
  const result = await getStock(outletId, { low_stock: 'true' });
  return result.items || [];
}

/**
 * Gets historical wastage logs.
 */
async function getWastageLogs(outletId, query = {}) {
  const prisma = getDbClient();
  const { offset, limit } = parsePagination(query);
  return await prisma.wastageLog.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    include: { inventory_item: true },
    orderBy: { created_at: 'desc' },
    skip: offset, take: limit
  });
}

/**
 * Gets consumption summary.
 */
async function getConsumptionReport(outletId, from, to) {
  const prisma = getDbClient();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to) : new Date();

  const txns = await prisma.stockTransaction.groupBy({
    by: ['inventory_item_id'],
    where: { 
      outlet_id: outletId, 
      transaction_type: 'consumption',
      created_at: { gte: fromDate, lte: toDate }
    },
    _sum: { quantity: true }
  });

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: txns.map(t => t.inventory_item_id) } },
    select: { id: true, name: true, unit: true }
  });

  return txns.map(t => ({
    name: items.find(i => i.id === t.inventory_item_id)?.name || 'Unknown',
    quantity: Math.abs(Number(t._sum.quantity || 0)),
    unit: items.find(i => i.id === t.inventory_item_id)?.unit
  })).sort((a,b)=>b.quantity - a.quantity).slice(0, 5);
}

/**
 * Allocate the next auto-PO sequence number for an outlet atomically.
 *
 * Reuses the OutletDailyCounter table — the same atomic increment pattern used
 * by order/invoice numbering (see nextDailySequence in order.service.js). A
 * per-outlet row keyed on a stable 'po-auto' day-slot is upserted with an
 * atomic `seq` increment, so concurrent auto-order runs each get a distinct
 * number instead of colliding on count()+1. Falls back to count()+1 if the
 * counter table is unavailable (pre-migration safety); the P2002 retry in the
 * caller still guards against the rare collision there.
 *
 * @param {object} prisma - Prisma client
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<number>} Next PO sequence (>= 1)
 */
async function nextAutoPoSequence(prisma, outletId) {
  try {
    const counter = await prisma.outletDailyCounter.upsert({
      where: { outlet_id_day: { outlet_id: outletId, day: 'po-auto' } },
      create: { outlet_id: outletId, day: 'po-auto', seq: 1 },
      update: { seq: { increment: 1 } },
    });
    return counter.seq;
  } catch (err) {
    logger.warn('OutletDailyCounter unavailable for auto-PO — falling back to count()+1', { error: err.message });
    const count = await prisma.purchaseOrder.count({ where: { outlet_id: outletId } });
    return count + 1;
  }
}

/**
 * Check all items with auto_order_enabled=true, create POs for those below threshold.
 * Called: after order completion, and on manual trigger from UI.
 * @param {string} outletId
 * @returns {Promise<{checked: number, orders_created: number, pos: object[]}>}
 */
async function checkAndAutoOrder(outletId) {
  const prisma = getDbClient();
  const items = await prisma.inventoryItem.findMany({
    where: { outlet_id: outletId, auto_order_enabled: true, is_deleted: false, is_active: true },
    include: {
      stock: { where: { outlet_id: outletId } },
      preferred_supplier: true,
    },
  });

  const posCreated = [];

  for (const item of items) {
    const currentStock = Number(item.stock?.[0]?.current_stock ?? 0);
    const threshold    = Number(item.min_threshold);
    const reorderQty   = Number(item.reorder_qty ?? threshold * 2);

    if (currentStock <= threshold && item.preferred_supplier_id) {
      // Check if a draft PO for this item+supplier already exists today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const existing = await prisma.purchaseOrder.findFirst({
        where: {
          outlet_id: outletId,
          supplier_id: item.preferred_supplier_id,
          status: 'draft',
          created_at: { gte: today },
          po_items: { some: { inventory_item_id: item.id } },
        },
      });
      if (existing) continue; // already ordered today

      // Allocate the PO number via an atomic per-outlet daily sequence
      // (same OutletDailyCounter pattern as invoice/order numbering) so
      // concurrent auto-order runs never collide on the unique po_number.
      // Retry on P2002 in case two runs race the same allocated number.
      let po = null;
      const lineCost = reorderQty * Number(item.cost_per_unit);
      for (let attempt = 0; attempt < 5 && !po; attempt++) {
        const seq = await nextAutoPoSequence(prisma, outletId);
        const poNumber = `PO-AUTO-${String(seq).padStart(5, '0')}`;
        try {
          po = await prisma.purchaseOrder.create({
            data: {
              outlet_id: outletId,
              supplier_id: item.preferred_supplier_id,
              po_number: poNumber,
              status: 'draft',
              total_amount: lineCost,
              grand_total: lineCost,
              notes: `Auto-generated: ${item.name} stock (${currentStock} ${item.unit}) fell below threshold (${threshold} ${item.unit})`,
              po_items: {
                create: [{
                  inventory_item_id: item.id,
                  item_name: item.name,
                  unit: item.unit,
                  ordered_quantity: reorderQty,
                  unit_cost: Number(item.cost_per_unit),
                  total_cost: lineCost,
                }],
              },
            },
            include: { supplier: true, po_items: true },
          });
        } catch (err) {
          // Unique constraint collision on po_number — re-allocate and retry.
          if (err?.code === 'P2002' && attempt < 4) continue;
          throw err;
        }
      }
      if (!po) continue;
      const poNumber = po.po_number;

      posCreated.push(po);
      logger.info(`Auto-order PO created: ${poNumber} for ${item.name}`);

      // Emit real-time alert
      try {
        getIO().to(`outlet_${outletId}`).emit('auto_order_created', {
          item_name: item.name,
          current_stock: currentStock,
          threshold,
          po_number: poNumber,
          supplier: item.preferred_supplier?.name,
        });
      } catch {}
    }
  }

  return { checked: items.length, orders_created: posCreated.length, pos: posCreated };
}

/**
 * Restock raw materials when an order is cancelled (reverse the recipe deduction).
 * @param {string} orderId
 * @returns {Promise<{restocked: number}>}
 */
async function restockFromCancelledOrder(orderId) {
  const prisma = getDbClient();

  // Get all stock transactions caused by this order
  const transactions = await prisma.stockTransaction.findMany({
    where: { reference_id: orderId, reference_type: 'order', transaction_type: 'consumption', is_deleted: false },
    include: { inventory_item: { include: { stock: true } } },
  });

  if (!transactions.length) return { restocked: 0 };

  // All-or-nothing: stock restores, reversal rows, and is_deleted flips must
  // commit together so a mid-loop failure can't leave a partial restock.
  await prisma.$transaction(async (txc) => {
    for (const tx of transactions) {
      const outletId = tx.outlet_id;
      const qty      = Math.abs(Number(tx.quantity)); // restore this much

      // Add back stock
      await txc.inventoryStock.upsert({
        where: { outlet_id_inventory_item_id: { outlet_id: outletId, inventory_item_id: tx.inventory_item_id } },
        create: { outlet_id: outletId, inventory_item_id: tx.inventory_item_id, current_stock: qty },
        update: { current_stock: { increment: qty } },
      });

      // Log reversal transaction
      await txc.stockTransaction.create({
        data: {
          outlet_id: outletId,
          inventory_item_id: tx.inventory_item_id,
          transaction_type: 'restock',
          quantity: qty,
          reference_type: 'order_cancel',
          reference_id: orderId,
          reason: `Order cancelled — restocked ${qty} ${tx.inventory_item?.unit}`,
        },
      });

      // Mark original transaction as reversed
      await txc.stockTransaction.update({
        where: { id: tx.id },
        data: { is_deleted: true },
      });
    }
  });

  logger.info(`Restocked ${transactions.length} items from cancelled order ${orderId}`);
  return { restocked: transactions.length };
}

// NOTE: Supplier CRUD lives exclusively in modules/inventory/procurement.service.js
// (the canonical owner, mounted at /api/suppliers). The duplicate listSuppliers/
// createSupplier that previously lived here were removed to eliminate two divergent
// live endpoints.

/**
 * Lists recent stock transactions for a single inventory item.
 * @param {string} outletId - Outlet UUID (scope)
 * @param {string} itemId - Inventory item UUID
 * @param {number} [limit=15] - Max rows to return (capped at 50)
 * @returns {Promise<object[]>} Transactions, newest first
 */
async function listItemTransactions(outletId, itemId, limit = 15) {
  const prisma = getDbClient();
  const take = Math.min(Math.max(parseInt(limit, 10) || 15, 1), 50);
  return await prisma.stockTransaction.findMany({
    where: { outlet_id: outletId, inventory_item_id: itemId, is_deleted: false },
    orderBy: { created_at: 'desc' },
    take,
  });
}

module.exports = {
  getStock, adjustStock, deductByRecipe, recordWastage, createRecipe, getRecipeCost,
  listInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem,
  getLowStock, getWastageLogs, getConsumptionReport,
  checkAndAutoOrder, restockFromCancelledOrder,
  listItemTransactions,
};
