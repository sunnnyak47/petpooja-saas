/**
 * @fileoverview KOT service — manages Kitchen Order Tickets lifecycle.
 * @module modules/orders/kot.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { scheduleAutoFreeIfReady } = require('./autofree.service');

// A KOT counts as "kitchen-done" once it reaches any of these. The parent order
// rolls up to 'ready' when every non-deleted KOT is in one of these states.
const KOT_DONE_STATUSES = ['ready', 'served', 'completed'];

/**
 * Shared parent-order roll-up for the KDS flows.
 *
 * Call this AFTER a KOT has been transitioned into a ready/served/completed
 * state (the row must already reflect its new status in the DB). If every
 * non-deleted KOT for the order is now done, advance the order to 'ready',
 * record the transition in OrderStatusHistory, and fire the table auto-free
 * path. Used by both the KDS bump route and completeKOT so a KOT bumped
 * straight to 'served'/'completed' rolls the order up exactly like one that
 * passed through 'ready'.
 *
 * The order is only advanced from a kitchen stage (created/confirmed) via an
 * atomic, status-filtered updateMany — a prepaid/paid order that was billed
 * before the kitchen finished is never clobbered back to 'ready'.
 *
 * @param {import('@prisma/client').PrismaClient} prisma - DB client
 * @param {string} orderId - Parent order UUID
 * @param {string} kotId - The KOT just updated; treated as done even if a
 *   read-after-write returns a stale row
 * @param {string} priorStatus - Order status before this roll-up, recorded as
 *   OrderStatusHistory.from_status
 * @returns {Promise<boolean>} true if the order was advanced to 'ready'
 */
async function rollUpOrderIfKitchenDone(prisma, orderId, kotId, priorStatus) {
  const allKots = await prisma.kOT.findMany({ where: { order_id: orderId, is_deleted: false } });
  const kitchenDone = allKots.every((k) => k.id === kotId || KOT_DONE_STATUSES.includes(k.status));
  if (!kitchenDone) return false;

  const res = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ['created', 'confirmed'] } },
    data: { status: 'ready' },
  });
  const rolledUp = res.count > 0;
  if (rolledUp) {
    await prisma.orderStatusHistory.create({
      data: { order_id: orderId, from_status: priorStatus, to_status: 'ready' },
    });
  }

  // Kitchen is done — if the order is already billed, schedule the table
  // auto-free. Safe to call even when the order wasn't advanced here (e.g. a
  // prepaid order): the helper no-ops unless it's a paid, served dine-in.
  await scheduleAutoFreeIfReady(orderId);
  return rolledUp;
}

/**
 * Lists pending KOTs for a kitchen station.
 * @param {string} outletId - Outlet UUID
 * @param {object} [query] - Optional filters (station, status)
 * @returns {Promise<object[]>} Array of KOTs with items
 */
async function listPendingKOTs(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    // Include 'ready' so KDS can show the full board (pending → preparing → ready).
    // M3: when the client asks for completed/served tickets (SERVED column,
    // "show completed" toggle, "clear served"), also return today's completed KOTs.
    const statuses = ['pending', 'preparing', 'ready'];
    const wantCompleted = query.include_completed === 'true'
      || query.include_completed === true
      || query.show_completed === 'true'
      || query.show_completed === true;
    if (wantCompleted) statuses.push('completed');

    const where = { outlet_id: outletId, is_deleted: false, status: { in: statuses } };
    if (query.station && query.station !== 'ALL') where.station = query.station;

    // Time-bound completed tickets to today so the board doesn't grow unbounded.
    if (wantCompleted) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      where.OR = [
        { status: { in: ['pending', 'preparing', 'ready'] } },
        { status: 'completed', completed_at: { gte: startOfDay } },
      ];
      delete where.status;
    }

    return await prisma.kOT.findMany({
      where,
      orderBy: { created_at: 'asc' },
      include: {
        order: { select: { order_number: true, order_type: true, table_id: true, notes: true, table: { select: { table_number: true } } } },
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
async function markItemReady(kotId, kotItemId, outletId = null) {
  const prisma = getDbClient();
  try {
    // Tenant isolation: when an outletId is supplied (from a scoped route),
    // verify the KOT belongs to that outlet before mutating it.
    if (outletId) {
      const owns = await prisma.kOT.findFirst({ where: { id: kotId, outlet_id: outletId }, select: { id: true } });
      if (!owns) throw new NotFoundError('KOT not found');
    }
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

    // Decide the ticket's new status in a single write:
    //   • every item now ready → AUTO-ADVANCE the whole ticket to 'ready' so the
    //     cook doesn't have to tap "Mark Ready" after checking the last item
    //     (Phase 1 — per-item readiness drives the ticket).
    //   • otherwise, if cooking just began (no started_at) → 'preparing'.
    const kotBefore = await prisma.kOT.findFirst({ where: { id: kotId }, include: { order: true } });
    const siblings  = await prisma.kOTItem.findMany({ where: { kot_id: kotId }, select: { status: true } });
    const allReady  = siblings.length > 0 && siblings.every(i => i.status === 'ready');

    let autoReady = false;
    if (kotBefore) {
      if (allReady && ['pending', 'preparing'].includes(kotBefore.status)) {
        await prisma.kOT.update({
          where: { id: kotId },
          data: { status: 'ready', started_at: kotBefore.started_at || new Date() },
        });
        autoReady = true;
      } else if (!kotBefore.started_at) {
        // First item ticked — mark that cooking has started.
        await prisma.kOT.update({ where: { id: kotId }, data: { started_at: new Date(), status: 'preparing' } });
      }
    }

    // When the ticket auto-advanced to 'ready', roll the parent order up exactly
    // like the manual "Mark Ready" bump (all-KOTs-done check + history + auto-free).
    let rolledUp = false;
    if (autoReady && kotBefore) {
      rolledUp = await rollUpOrderIfKitchenDone(prisma, kotBefore.order_id, kotId, kotBefore.order.status);
    }

    const io = getIO();
    if (io && kotBefore) {
      const outId = kotBefore.outlet_id;
      const payload = { kot_id: kotId, item_id: kotItemId, outlet_id: outId };
      // KDS screens subscribe on the /kitchen namespace (KitchenDisplayPage),
      // so the live per-item sync event must be emitted there. Keep emitting on
      // /orders too for any listeners that track order-item progress.
      io.of('/kitchen').to(`outlet:${outId}`).emit('kot_item_ready', payload);
      io.of('/orders').to(`outlet:${outId}`).emit('kot_item_ready', payload);
      if (autoReady) {
        // Move the ticket on every KDS screen + update Running Orders/Order History.
        io.of('/kitchen').to(`outlet:${outId}`).emit('kot_complete', { kot_id: kotId, status: 'ready' });
        io.of('/orders').to(`outlet:${outId}`).emit('order_status_change', {
          order_id: kotBefore.order_id, status: rolledUp ? 'ready' : kotBefore.order.status,
        });
      }
    }

    return { ...updated, kot_status: autoReady ? 'ready' : (kotBefore?.status || null), kot_auto_ready: autoReady };
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
async function completeKOT(kotId, outletId = null) {
  const prisma = getDbClient();
  try {
    const kot = await prisma.kOT.findFirst({
      // Tenant isolation: scope by outlet when supplied by a scoped route.
      where: { id: kotId, is_deleted: false, ...(outletId ? { outlet_id: outletId } : {}) },
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

    // Roll the parent order up to 'ready' (+ history + auto-free) if every KOT
    // is now done. Shared with the KDS bump route so both paths behave identically.
    const rolledUp = await rollUpOrderIfKitchenDone(prisma, kot.order_id, kotId, kot.order.status);

    const io = getIO();
    if (io) {
      io.of('/kitchen').to(`outlet:${kot.outlet_id}`).emit('kot_complete', { kot_id: kotId });
      io.of('/orders').to(`outlet:${kot.outlet_id}`).emit('order_status_change', {
        order_id: kot.order_id, status: rolledUp ? 'ready' : kot.order.status,
      });
    }

    return kot;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Expo "serve whole order" — serves ALL of an order's READY station tickets in a
 * single action (Phase 2). Behaviour is order-type aware:
 *   • takeaway / delivery → the WHOLE order must be ready first; you can't hand a
 *     customer a partial bag, so this throws if any station is still cooking.
 *   • dine-in (and others) → fires the stations that are ready and leaves any that
 *     are still cooking (coursing-friendly).
 * Rolls the parent order up to 'ready' once every station is done.
 *
 * @param {string} orderId
 * @param {string|null} outletId - tenant scope (null for super_admin/owner)
 * @returns {Promise<{served:number, total:number}>}
 */
async function serveOrder(orderId, outletId = null) {
  const prisma = getDbClient();
  const where = { order_id: orderId, is_deleted: false, ...(outletId ? { outlet_id: outletId } : {}) };
  const kots = await prisma.kOT.findMany({ where, include: { order: true } });
  if (!kots.length) throw new NotFoundError('No tickets found for this order');

  const order = kots[0].order;
  const isTakeawayLike = ['takeaway', 'delivery'].includes(order.order_type);
  const notDone = kots.filter(k => !KOT_DONE_STATUSES.includes(k.status));
  if (isTakeawayLike && notDone.length > 0) {
    throw new BadRequestError('All items must be ready before pickup — some stations are still preparing.');
  }

  // Only the tickets actually ready can be handed off; still-cooking dine-in
  // stations are left untouched so they can be fired later.
  const ids = kots.filter(k => k.status === 'ready').map(k => k.id);
  if (ids.length) {
    await prisma.kOT.updateMany({ where: { id: { in: ids } }, data: { status: 'served', completed_at: new Date() } });
  }

  const rolledUp = await rollUpOrderIfKitchenDone(prisma, orderId, null, order.status);

  const io = getIO();
  if (io) {
    const outId = kots[0].outlet_id;
    io.of('/kitchen').to(`outlet:${outId}`).emit('kot_complete', { order_id: orderId, status: 'served' });
    io.of('/orders').to(`outlet:${outId}`).emit('order_status_change', {
      order_id: orderId, status: rolledUp ? 'ready' : order.status,
    });
  }

  return { served: ids.length, total: kots.length };
}

module.exports = { listPendingKOTs, markItemReady, completeKOT, serveOrder, rollUpOrderIfKitchenDone };
