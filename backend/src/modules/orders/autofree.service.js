/**
 * @fileoverview Auto-free table — predictive scheduling helper.
 * Shared by payment + KOT-complete flows. When a dine-in order is BOTH billed
 * and kitchen-served, we stamp the table with a predicted free time instead of
 * freeing it immediately. A global client manager then shows the 30s grace
 * popup and performs (or snoozes) the actual free.
 * @module modules/orders/autofree.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');

// Snooze / preset durations (minutes) shared with the frontend popup.
const PRESET_MINUTES = [10, 15, 20, 25, 30, 45, 60, 120, 240];

/** Reads the outlet's auto-free config from OutletSetting (one round-trip). */
async function getAutoFreeConfig(prisma, outletId) {
  const rows = await prisma.outletSetting.findMany({
    where: { outlet_id: outletId, setting_key: { in: ['auto_free_enabled', 'auto_free_grace_seconds'] } },
    select: { setting_key: true, setting_value: true },
  });
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    enabled: map.auto_free_enabled === 'true',
    graceSeconds: Math.max(10, Number(map.auto_free_grace_seconds) || 30),
  };
}

/**
 * Predict how long the party will linger after being billed+served, in minutes.
 * Heuristic: a base settle/leave time plus a little per dish and per seat. The
 * result is snapped to the nearest preset so it lines up with the snooze list.
 */
function predictDwellMinutes(dishes, seats) {
  const raw = 10 + Number(dishes || 0) * 2 + Number(seats || 0) * 3;
  const clamped = Math.min(240, Math.max(10, raw));
  return PRESET_MINUTES.reduce((best, p) =>
    Math.abs(p - clamped) < Math.abs(best - clamped) ? p : best, PRESET_MINUTES[0]);
}

/**
 * If the order is a dine-in that is now both paid and kitchen-served (status
 * 'ready'), stamp its table with a predicted auto-free time and notify clients.
 * Idempotent and safe to call from both the payment and KOT-complete paths.
 * @returns {Promise<boolean>} true if a schedule was set
 */
async function scheduleAutoFreeIfReady(orderId, prismaArg) {
  const prisma = prismaArg || getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      select: {
        id: true, outlet_id: true, order_type: true, table_id: true,
        is_paid: true, status: true,
        order_items: { where: { is_deleted: false }, select: { quantity: true } },
      },
    });
    if (!order) return false;
    if (order.order_type !== 'dine_in' || !order.table_id) return false;
    if (!order.is_paid) return false;                              // must be billed

    // Kitchen must be done: no KOT still pending/preparing/ready (i.e. all
    // served/completed, or the order has no kitchen tickets at all).
    const pendingKots = await prisma.kOT.count({
      where: { order_id: order.id, is_deleted: false, status: { notIn: ['completed', 'served'] } },
    });
    if (pendingKots > 0) return false;                             // not served yet

    const cfg = await getAutoFreeConfig(prisma, order.outlet_id);
    if (!cfg.enabled) return false;

    const table = await prisma.table.findFirst({
      where: { id: order.table_id, is_deleted: false },
      select: { id: true, table_number: true, seating_capacity: true, auto_free_at: true },
    });
    if (!table) return false;

    const dishes = order.order_items.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const seats = table.seating_capacity || 0;
    const minutes = predictDwellMinutes(dishes, seats);
    const autoFreeAt = new Date(Date.now() + minutes * 60_000);

    await prisma.table.update({ where: { id: table.id }, data: { auto_free_at: autoFreeAt } });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('table:auto_free_scheduled', {
        table_id: table.id,
        table_number: table.table_number,
        order_id: order.id,
        auto_free_at: autoFreeAt.toISOString(),
        predicted_minutes: minutes,
        dishes,
        seats,
        grace_seconds: cfg.graceSeconds,
      });
    }
    logger.info('Auto-free scheduled', { table: table.table_number, minutes, dishes, seats });
    return true;
  } catch (err) {
    // Never let an auto-free hiccup break payment / KOT flows.
    logger.warn('scheduleAutoFreeIfReady failed (non-critical)', { err: err.message });
    return false;
  }
}

module.exports = { getAutoFreeConfig, predictDwellMinutes, scheduleAutoFreeIfReady, PRESET_MINUTES };
