/**
 * Central Kitchen Service
 * Handles raw material requisitions from branch → central kitchen → dispatch tracking
 */
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

// Status flow: pending → approved → dispatched → received | rejected

/**
 * List indents with filters
 */
async function listIndents(query, user) {
  const prisma = getDbClient();
  const { outlet_id, status, role } = query;

  const where = { is_deleted: false };

  if (status) where.status = status;

  if (role === 'ck') {
    // Central kitchen view — show indents directed to this outlet
    where.ck_outlet_id = outlet_id || user.outlet_id;
  } else if (outlet_id) {
    where.requesting_outlet_id = outlet_id;
  } else if (user.outlet_id) {
    // Default: show indents from user's outlet
    where.requesting_outlet_id = user.outlet_id;
  }

  const indents = await prisma.centralKitchenIndent.findMany({
    where,
    include: {
      requesting_outlet: { select: { id: true, name: true } },
      ck_outlet: { select: { id: true, name: true } },
      items: {
        include: {
          inventory_item: { select: { id: true, name: true, unit: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 100,
  });

  return indents;
}

/**
 * Get single indent
 */
async function getIndent(id) {
  const prisma = getDbClient();
  const indent = await prisma.centralKitchenIndent.findFirst({
    where: { id, is_deleted: false },
    include: {
      requesting_outlet: { select: { id: true, name: true, address: true } },
      ck_outlet: { select: { id: true, name: true } },
      items: {
        include: {
          inventory_item: { select: { id: true, name: true, unit: true, category: true } },
        },
      },
    },
  });
  if (!indent) throw new Error('Indent not found');
  return indent;
}

/**
 * Branch creates a requisition
 * body: { requesting_outlet_id, ck_outlet_id, notes, items: [{inventory_item_id, requested_quantity, unit, notes}] }
 */
async function createIndent(body, user) {
  const prisma = getDbClient();
  const { requesting_outlet_id, ck_outlet_id, notes, items } = body;

  if (!items || items.length === 0) throw new Error('At least one item is required');

  const indentNumber = `IND-${Date.now().toString(36).toUpperCase()}`;

  const indent = await prisma.centralKitchenIndent.create({
    data: {
      requesting_outlet_id: requesting_outlet_id || user.outlet_id,
      ck_outlet_id,
      indent_number: indentNumber,
      status: 'pending',
      total_items: items.length,
      notes,
      requested_by: user.id,
      items: {
        create: items.map((item) => ({
          inventory_item_id: item.inventory_item_id,
          requested_quantity: parseFloat(item.requested_quantity),
          unit: item.unit,
          notes: item.notes || null,
        })),
      },
    },
    include: {
      requesting_outlet: { select: { id: true, name: true } },
      ck_outlet: { select: { id: true, name: true } },
      items: { include: { inventory_item: { select: { id: true, name: true, unit: true } } } },
    },
  });

  logger.info('CK indent created', { indent_number: indentNumber, user: user.id });
  return indent;
}

/**
 * CK approves indent — sets approved quantities per item
 * body: { items: [{id, approved_quantity}] }
 */
async function approveIndent(id, body, user) {
  const prisma = getDbClient();

  const indent = await prisma.centralKitchenIndent.findFirst({ where: { id, is_deleted: false } });
  if (!indent) throw new Error('Indent not found');
  if (indent.status !== 'pending') throw new Error(`Cannot approve indent in status: ${indent.status}`);

  // Update approved quantities per item
  if (body.items && body.items.length > 0) {
    await Promise.all(
      body.items.map((item) =>
        prisma.centralKitchenIndentItem.update({
          where: { id: item.id },
          data: { approved_quantity: parseFloat(item.approved_quantity) },
        })
      )
    );
  }

  const updated = await prisma.centralKitchenIndent.update({
    where: { id },
    data: {
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date(),
    },
    include: {
      requesting_outlet: { select: { id: true, name: true } },
      ck_outlet: { select: { id: true, name: true } },
      items: { include: { inventory_item: { select: { id: true, name: true, unit: true } } } },
    },
  });

  logger.info('CK indent approved', { id, user: user.id });
  return updated;
}

/**
 * CK dispatches goods — deducts stock from CK outlet, sets dispatched quantities
 * body: { items: [{id, dispatched_quantity}] }
 */
async function dispatchIndent(id, body, user) {
  const prisma = getDbClient();

  const indent = await prisma.centralKitchenIndent.findFirst({
    where: { id, is_deleted: false },
    include: { items: true },
  });
  if (!indent) throw new Error('Indent not found');
  if (!['approved', 'pending'].includes(indent.status)) {
    throw new Error(`Cannot dispatch indent in status: ${indent.status}`);
  }

  const itemUpdates = body.items || indent.items.map((i) => ({
    id: i.id,
    dispatched_quantity: i.approved_quantity || i.requested_quantity,
  }));

  await prisma.$transaction(async (tx) => {
    // Update dispatched quantities
    await Promise.all(
      itemUpdates.map((item) =>
        tx.centralKitchenIndentItem.update({
          where: { id: item.id },
          data: { dispatched_quantity: parseFloat(item.dispatched_quantity) },
        })
      )
    );

    // Deduct stock from CK outlet for each item
    for (const item of itemUpdates) {
      const indentItem = indent.items.find((i) => i.id === item.id);
      if (!indentItem) continue;
      const qty = parseFloat(item.dispatched_quantity);

      // Upsert stock record deduction
      await tx.inventoryStock.upsert({
        where: {
          outlet_id_inventory_item_id: {
            outlet_id: indent.ck_outlet_id,
            inventory_item_id: indentItem.inventory_item_id,
          },
        },
        update: { current_stock: { decrement: qty } },
        create: {
          outlet_id: indent.ck_outlet_id,
          inventory_item_id: indentItem.inventory_item_id,
          current_stock: -qty,
        },
      });

      // Add to requesting branch stock
      await tx.inventoryStock.upsert({
        where: {
          outlet_id_inventory_item_id: {
            outlet_id: indent.requesting_outlet_id,
            inventory_item_id: indentItem.inventory_item_id,
          },
        },
        update: { current_stock: { increment: qty } },
        create: {
          outlet_id: indent.requesting_outlet_id,
          inventory_item_id: indentItem.inventory_item_id,
          current_stock: qty,
        },
      });

      // Stock transaction records
      await tx.stockTransaction.create({
        data: {
          outlet_id: indent.ck_outlet_id,
          inventory_item_id: indentItem.inventory_item_id,
          transaction_type: 'transfer_out',
          quantity: qty,
          reference_type: 'ck_indent',
          reference_id: id,
          reason: `Dispatched to branch indent ${indent.indent_number}`,
          performed_by: user.id,
        },
      });

      await tx.stockTransaction.create({
        data: {
          outlet_id: indent.requesting_outlet_id,
          inventory_item_id: indentItem.inventory_item_id,
          transaction_type: 'transfer_in',
          quantity: qty,
          reference_type: 'ck_indent',
          reference_id: id,
          reason: `Received from CK indent ${indent.indent_number}`,
          performed_by: user.id,
        },
      });
    }

    await tx.centralKitchenIndent.update({
      where: { id },
      data: { status: 'dispatched' },
    });
  });

  logger.info('CK indent dispatched', { id, user: user.id });
  return getIndent(id);
}

/**
 * Branch confirms receipt
 */
async function receiveIndent(id, user) {
  const prisma = getDbClient();

  const indent = await prisma.centralKitchenIndent.findFirst({ where: { id, is_deleted: false } });
  if (!indent) throw new Error('Indent not found');
  if (indent.status !== 'dispatched') throw new Error('Indent must be dispatched before receiving');

  const updated = await prisma.centralKitchenIndent.update({
    where: { id },
    data: { status: 'received' },
    include: {
      requesting_outlet: { select: { id: true, name: true } },
      ck_outlet: { select: { id: true, name: true } },
      items: { include: { inventory_item: { select: { id: true, name: true, unit: true } } } },
    },
  });

  logger.info('CK indent received', { id, user: user.id });
  return updated;
}

/**
 * CK rejects indent
 */
async function rejectIndent(id, body, user) {
  const prisma = getDbClient();

  const indent = await prisma.centralKitchenIndent.findFirst({ where: { id, is_deleted: false } });
  if (!indent) throw new Error('Indent not found');
  if (!['pending', 'approved'].includes(indent.status)) {
    throw new Error(`Cannot reject indent in status: ${indent.status}`);
  }

  const updated = await prisma.centralKitchenIndent.update({
    where: { id },
    data: {
      status: 'rejected',
      notes: body.reason ? `${indent.notes || ''}\nRejected: ${body.reason}`.trim() : indent.notes,
    },
    include: {
      requesting_outlet: { select: { id: true, name: true } },
      ck_outlet: { select: { id: true, name: true } },
      items: { include: { inventory_item: { select: { id: true, name: true, unit: true } } } },
    },
  });

  logger.info('CK indent rejected', { id, user: user.id });
  return updated;
}

/**
 * Get outlets for selectors
 */
async function getOutlets(user) {
  const prisma = getDbClient();
  return prisma.outlet.findMany({
    where: { is_deleted: false },
    select: { id: true, name: true, address: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Get inventory items for an outlet
 */
async function getInventoryItems(outlet_id) {
  const prisma = getDbClient();
  return prisma.inventoryItem.findMany({
    where: { outlet_id, is_active: true, is_deleted: false },
    select: { id: true, name: true, unit: true, category: true, cost_per_unit: true },
    orderBy: { name: 'asc' },
  });
}

module.exports = {
  listIndents,
  getIndent,
  createIndent,
  approveIndent,
  dispatchIndent,
  receiveIndent,
  rejectIndent,
  getOutlets,
  getInventoryItems,
};
