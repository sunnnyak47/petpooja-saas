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

// Cleaning-lifecycle presets (minutes) offered in the "Table is being cleaned —
// mark free" popup and the timed reminder loop. Kept small on purpose.
const CLEANING_PRESET_MINUTES = [5, 10, 15, 30];

// Assign-during-cleaning window: a 'dirty' table may still be handed to the next
// customer if cleaning finishes within this many minutes of going dirty.
const CLEANING_WINDOW_MINUTES = 10;

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
      select: { id: true, table_number: true, seating_capacity: true, auto_free_at: true, status: true },
    });
    if (!table) return false;

    // A POS-paid dine-in order now flips its table to 'dirty' (cleaning lifecycle)
    // in processPayment. Never re-arm the old predictive grace popup on top of a
    // table that is already being cleaned — the cleaning reminder loop owns it.
    if (table.status === 'dirty') return false;

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

/**
 * Cleaning reminder scheduler (dirty/cleaning lifecycle).
 *
 * Called when the operator picks a "mark free in N minutes" duration from the
 * cleaning popup — for the FIRST timer, for "take more time", and for each
 * subsequent auto-reminder. It stamps the table's next reminder time on
 * `auto_free_at` (reused as the reminder timestamp), keeps the table 'dirty',
 * and bumps `reminder_count` so the frontend can reveal the "no more reminders"
 * option from the 2nd reminder on. Purely timestamp-driven so a server restart
 * never loses the schedule (the frontend polls `auto_free_at`).
 *
 * @param {string} tableId
 * @param {number} minutes  one of CLEANING_PRESET_MINUTES (clamped 1..240)
 * @param {object} [prismaArg]
 * @returns {Promise<{ table_id, status, auto_free_at, cleaning_started_at, reminder_count }>}
 */
async function scheduleCleaningReminder(tableId, minutes, prismaArg) {
  const prisma = prismaArg || getDbClient();
  const table = await prisma.table.findFirst({
    where: { id: tableId, is_deleted: false },
    select: { id: true, outlet_id: true, table_number: true, cleaning_started_at: true, reminder_count: true },
  });
  if (!table) {
    const { NotFoundError } = require('../../utils/errors');
    throw new NotFoundError('Table not found');
  }

  const mins = Math.min(240, Math.max(1, Number(minutes) || CLEANING_PRESET_MINUTES[1]));
  const reminderAt = new Date(Date.now() + mins * 60_000);

  const updated = await prisma.table.update({
    where: { id: tableId },
    data: {
      status: 'dirty',
      auto_free_at: reminderAt,
      // Anchor the assign-during-cleaning window the first time a timer is set.
      cleaning_started_at: table.cleaning_started_at || new Date(),
      reminder_count: (table.reminder_count || 0) + 1,
    },
  });

  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${table.outlet_id}`).emit('table:cleaning_reminder_set', {
      table_id: tableId,
      table_number: table.table_number,
      status: 'dirty',
      auto_free_at: reminderAt.toISOString(),
      reminder_count: updated.reminder_count,
      minutes: mins,
    });
    // Keep the generic floor listeners in sync too.
    io.of('/orders').to(`outlet:${table.outlet_id}`).emit('table_status_change', {
      table_id: tableId, status: 'dirty', table_number: table.table_number,
    });
  }

  logger.info('Cleaning reminder scheduled', { table: table.table_number, minutes: mins, reminder_count: updated.reminder_count });
  return {
    table_id: tableId,
    status: updated.status,
    auto_free_at: reminderAt.toISOString(),
    cleaning_started_at: updated.cleaning_started_at,
    reminder_count: updated.reminder_count,
  };
}

module.exports = {
  getAutoFreeConfig,
  predictDwellMinutes,
  scheduleAutoFreeIfReady,
  scheduleCleaningReminder,
  PRESET_MINUTES,
  CLEANING_PRESET_MINUTES,
  CLEANING_WINDOW_MINUTES,
};
