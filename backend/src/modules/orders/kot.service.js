/**
 * @fileoverview KOT service — manages Kitchen Order Tickets lifecycle.
 * @module modules/orders/kot.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError } = require('../../utils/errors');

/**
 * Lists pending KOTs for a kitchen station.
 * @param {string} outletId - Outlet UUID
 * @param {object} [query] - Optional filters (station, status)
 * @returns {Promise<object[]>} Array of KOTs with items
 */
async function listPendingKOTs(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const where = { outlet_id: outletId, is_deleted: false, status: { in: ['pending', 'preparing'] } };
    if (query.station) where.station = query.station;

    return await prisma.kOT.findMany({
      where,
      orderBy: { created_at: 'asc' },
      include: {
        order: { select: { order_number: true, order_type: true, table_id: true, table: { select: { table_number: true } } } },
        kot_items: {
          include: {
            order_item: {
              select: { name: true, variant_name: true, quantity: true, notes: true, addons: { select: { name: true, quantity: true } } },
            },
          },
        },
      },
    });
  } catch (error) {
    logger.error('List pending KOTs failed', { error: error.message });
    throw error;
  }
}

/**
 * Marks a single KOT item as ready.
 * @param {string} kotId - KOT UUID
 * @param {string} kotItemId - KOT Item UUID
 * @returns {Promise<object>} Updated KOT item
 */
async function markItemReady(kotId, kotItemId) {
  const prisma = getDbClient();
  try {
    const kotItem = await prisma.kOTItem.findFirst({ where: { id: kotItemId, kot_id: kotId } });
    if (!kotItem) throw new NotFoundError('KOT item not found');

    const updated = await prisma.kOTItem.update({
      where: { id: kotItemId },
      data: { status: 'ready', ready_at: new Date() },
    });

    await prisma.orderItem.update({
      where: { id: kotItem.order_item_id },
      data: { status: 'ready' },
    });

    const kot = await prisma.kOT.findFirst({ where: { id: kotId }, include: { order: true } });

    const io = getIO();
    if (io && kot) {
      io.of('/orders').to(`outlet:${kot.outlet_id}`).emit('kot_item_ready', {
        kot_id: kotId, item_id: kotItemId, outlet_id: kot.outlet_id,
      });
    }

    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Marks an entire KOT as completed.
 * @param {string} kotId - KOT UUID
 * @returns {Promise<object>} Updated KOT
 */
async function completeKOT(kotId) {
  const prisma = getDbClient();
  try {
    const kot = await prisma.kOT.findFirst({
      where: { id: kotId, is_deleted: false },
      include: { kot_items: true, order: true },
    });
    if (!kot) throw new NotFoundError('KOT not found');

    await prisma.$transaction(async (tx) => {
      await tx.kOT.update({ where: { id: kotId }, data: { status: 'completed', completed_at: new Date() } });
      await tx.kOTItem.updateMany({
        where: { kot_id: kotId, status: { not: 'ready' } },
        data: { status: 'ready', ready_at: new Date() },
      });
      for (const item of kot.kot_items) {
        await tx.orderItem.update({ where: { id: item.order_item_id }, data: { status: 'ready' } });
      }
    });

    const allKots = await prisma.kOT.findMany({
      where: { order_id: kot.order_id, is_deleted: false },
    });
    const allCompleted = allKots.every((k) => k.status === 'completed' || k.id === kotId);

    if (allCompleted) {
      await prisma.order.update({ where: { id: kot.order_id }, data: { status: 'ready' } });
      await prisma.orderStatusHistory.create({
        data: { order_id: kot.order_id, from_status: kot.order.status, to_status: 'ready' },
      });
    }

    const io = getIO();
    if (io) {
      io.of('/kitchen').to(`outlet:${kot.outlet_id}`).emit('kot_complete', { kot_id: kotId });
      io.of('/orders').to(`outlet:${kot.outlet_id}`).emit('order_status_change', {
        order_id: kot.order_id, status: allCompleted ? 'ready' : kot.order.status,
      });
    }

    return kot;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

module.exports = { listPendingKOTs, markItemReady, completeKOT };
