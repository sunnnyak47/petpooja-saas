/**
 * @fileoverview Procurement service — Suppliers, Purchase Orders and GRNs.
 * @module modules/inventory/procurement.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');

/**
 * Lists all suppliers for an outlet.
 */
async function listSuppliers(outletId, query = {}) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId, is_deleted: false };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { contact_person: { contains: query.search, mode: 'insensitive' } }
    ];
  }
  return await prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
}

/**
 * Lists purchase orders.
 */
async function listPurchaseOrders(outletId, query = {}) {
  const prisma = getDbClient();
  const { offset, limit } = parsePagination(query);
  const where = { outlet_id: outletId, is_deleted: false };
  if (query.status) where.status = query.status;
  if (query.supplier_id) where.supplier_id = query.supplier_id;

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where, skip: offset, take: limit,
      include: { supplier: true, _count: { select: { po_items: true } } },
      orderBy: { created_at: 'desc' }
    }),
    prisma.purchaseOrder.count({ where })
  ]);

  return { items, total };
}

/**
 * Creates a new purchase order.
 */
async function createPurchaseOrder(outletId, data, userId) {
  const prisma = getDbClient();
  const poNumber = `PO-${Date.now().toString().slice(-6)}`;
  
  return await prisma.purchaseOrder.create({
    data: {
      outlet_id: outletId,
      supplier_id: data.supplier_id,
      po_number: poNumber,
      notes: data.notes,
      expected_date: data.expected_date ? new Date(data.expected_date) : null,
      created_by: userId,
      total_amount: data.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0),
      po_items: {
        create: data.items.map(item => ({
          inventory_item_id: item.inventory_item_id,
          ordered_quantity: item.quantity,
          unit_cost: item.unit_cost
        }))
      }
    },
    include: { po_items: true }
  });
}

/**
 * Receives a PO and creates a GRN.
 */
async function receivePurchaseOrder(outletId, poId, data, userId) {
  const prisma = getDbClient();
  
  return await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: poId, outlet_id: outletId },
      include: { po_items: true }
    });
    if (!po) throw new NotFoundError('Purchase Order not found');
    if (po.status === 'received') throw new BadRequestError('PO already received');

    const grnNumber = `GRN-${Date.now().toString().slice(-6)}`;
    const grn = await tx.goodsReceivedNote.create({
      data: {
        outlet_id: outletId,
        purchase_order_id: poId,
        grn_number: grnNumber,
        received_by: userId,
        notes: data.notes,
        grn_items: {
          create: data.items.map(item => ({
            inventory_item_id: item.inventory_item_id,
            received_quantity: item.quantity,
            unit_cost: item.unit_cost,
            quality_status: item.quality_status || 'accepted'
          }))
        }
      }
    });

    // Update stock levels
    for (const item of data.items) {
      await tx.inventoryStock.upsert({
        where: { outlet_id_inventory_item_id: { outlet_id: outletId, inventory_item_id: item.inventory_item_id } },
        create: { outlet_id: outletId, inventory_item_id: item.inventory_item_id, current_stock: item.quantity },
        update: { current_stock: { increment: item.quantity } }
      });

      await tx.stockTransaction.create({
        data: {
          outlet_id: outletId, inventory_item_id: item.inventory_item_id,
          transaction_type: 'receipt', quantity: item.quantity, unit_cost: item.unit_cost,
          reference_type: 'grn', reference_id: grn.id,
          performed_by: userId
        }
      });
    }

    // Update PO status
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'received' }
    });

    return grn;
  });
}

module.exports = {
  listSuppliers, listPurchaseOrders, createPurchaseOrder, receivePurchaseOrder
};
