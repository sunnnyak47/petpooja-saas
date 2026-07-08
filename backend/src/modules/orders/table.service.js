/**
 * @fileoverview Table service — CRUD, status management, and floor plan layout for restaurant tables.
 * @module modules/orders/table.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');

/**
 * Lists all tables for an outlet with current order status.
 */
async function listTables(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const where = { outlet_id: outletId, is_deleted: false };
    if (query.area_id) where.area_id = query.area_id;
    if (query.status) where.status = query.status;

    return await prisma.table.findMany({
      where,
      orderBy: [{ area_id: 'asc' }, { display_order: 'asc' }, { table_number: 'asc' }],
      include: {
        area: { select: { id: true, name: true, color: true } },
        orders: {
          where: { status: { notIn: ['paid', 'cancelled', 'voided'] }, is_deleted: false },
          select: { id: true, order_number: true, grand_total: true, status: true, created_at: true },
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
    });
  } catch (error) {
    logger.error('List tables failed', { error: error.message });
    throw error;
  }
}

/**
 * Creates a new table.
 */
async function createTable(data) {
  const prisma = getDbClient();
  try {
    // Auto-position: find the furthest right table and place next to it
    const existing = await prisma.table.findMany({
      where: { outlet_id: data.outlet_id, is_deleted: false },
      select: { pos_x: true, pos_y: true },
      orderBy: { pos_x: 'desc' },
      take: 1,
    });
    const autoX = existing.length > 0 ? (existing[0].pos_x + 100) : 20;
    const autoY = existing.length > 0 ? existing[0].pos_y : 20;

    return await prisma.table.create({
      data: {
        outlet_id: data.outlet_id,
        table_number: data.table_number,
        seating_capacity: data.capacity || data.seating_capacity || 4,
        area_id: data.area_id || null,
        status: 'available',
        pos_x: data.pos_x !== undefined ? data.pos_x : autoX,
        pos_y: data.pos_y !== undefined ? data.pos_y : autoY,
        width: data.width || 80,
        height: data.height || 80,
        shape: data.shape || 'square',
        rotation: data.rotation || 0,
      },
    });
  } catch (error) {
    logger.error('Create table failed', { error: error.message });
    throw error;
  }
}

/**
 * Updates a single table's properties (number, capacity, shape, position, etc.).
 */
async function updateTable(tableId, data) {
  const prisma = getDbClient();
  try {
    const table = await prisma.table.findFirst({ where: { id: tableId, is_deleted: false } });
    if (!table) throw new NotFoundError('Table not found');

    const updateData = {};
    if (data.table_number !== undefined) updateData.table_number = data.table_number;
    if (data.seating_capacity !== undefined) updateData.seating_capacity = data.seating_capacity;
    if (data.area_id !== undefined) updateData.area_id = data.area_id || null;
    if (data.pos_x !== undefined) updateData.pos_x = data.pos_x;
    if (data.pos_y !== undefined) updateData.pos_y = data.pos_y;
    if (data.width !== undefined) updateData.width = data.width;
    if (data.height !== undefined) updateData.height = data.height;
    if (data.shape !== undefined) updateData.shape = data.shape;
    if (data.rotation !== undefined) updateData.rotation = data.rotation;
    if (data.display_order !== undefined) updateData.display_order = data.display_order;

    return await prisma.table.update({ where: { id: tableId }, data: updateData });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    logger.error('Update table failed', { error: error.message });
    throw error;
  }
}

/**
 * Updates table status and emits socket event.
 */
async function updateTableStatus(tableId, status) {
  const prisma = getDbClient();
  try {
    const table = await prisma.table.findFirst({ where: { id: tableId, is_deleted: false } });
    if (!table) throw new NotFoundError('Table not found');

    const updated = await prisma.table.update({
      where: { id: tableId },
      data: {
        status,
        current_order_id: status === 'available' ? null : table.current_order_id,
        // Freeing a table also clears any cleaning-reminder schedule so the
        // dirty/cleaning loop can't re-fire against a now-free table.
        ...(status === 'available' ? { auto_free_at: null, cleaning_started_at: null, reminder_count: 0 } : {}),
      },
    });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${table.outlet_id}`).emit('table_status_change', {
        table_id: tableId, status, table_number: table.table_number,
      });
    }

    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Bulk-creates multiple tables in one call, each with its own configuration
 * (number, capacity, shape, area). Auto-positions each table progressively so
 * they don't overlap on the floor plan. Skips rows with a blank table_number.
 * Resilient to duplicates: existing table_numbers (including soft-deleted rows,
 * which still hold the unique [outlet_id, table_number] constraint) are skipped
 * and reported rather than aborting the whole batch.
 * @param {string} outletId
 * @param {Array<{table_number,capacity,shape,area_id}>} rows
 * @returns {Promise<{ created: number, skipped: number, skipped_numbers: string[], tables: object[] }>}
 */
async function bulkCreateTables(outletId, rows) {
  const prisma = getDbClient();
  const clean = (rows || []).filter((r) => r && String(r.table_number || '').trim() !== '');
  if (clean.length === 0) throw new BadRequestError('Provide at least one table with a number');

  // Pre-filter against numbers that already exist for this outlet. The unique
  // constraint [outlet_id, table_number] is enforced regardless of is_deleted,
  // so we must consider soft-deleted rows too.
  const existingRows = await prisma.table.findMany({
    where: { outlet_id: outletId },
    select: { table_number: true },
  });
  const existingNumbers = new Set(existingRows.map((t) => t.table_number));

  // De-dupe within the incoming batch as well, and skip any that already exist.
  const seen = new Set();
  const skipped = [];
  const toCreate = [];
  for (const r of clean) {
    const num = String(r.table_number).trim();
    if (existingNumbers.has(num) || seen.has(num)) {
      skipped.push(num);
      continue;
    }
    seen.add(num);
    toCreate.push(r);
  }

  if (toCreate.length === 0) {
    return { created: 0, skipped: skipped.length, skipped_numbers: skipped, tables: [] };
  }

  // Start positioning from the furthest-right existing table.
  const existing = await prisma.table.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    select: { pos_x: true, pos_y: true },
    orderBy: { pos_x: 'desc' },
    take: 1,
  });
  let x = existing.length > 0 ? existing[0].pos_x + 100 : 20;
  const y = existing.length > 0 ? existing[0].pos_y : 20;

  const data = toCreate.map((r) => {
    const row = {
      outlet_id: outletId,
      table_number: String(r.table_number).trim(),
      seating_capacity: Number(r.capacity || r.seating_capacity) || 4,
      area_id: r.area_id || null,
      status: 'available',
      pos_x: x,
      pos_y: y,
      width: 80,
      height: 80,
      shape: r.shape || 'square',
      rotation: 0,
    };
    x += 100; // next table to the right
    return row;
  });

  // skipDuplicates guards against a race where a number is created between the
  // pre-filter read and this write; pre-filtering already handles soft-deleted rows.
  await prisma.table.createMany({ data, skipDuplicates: true });
  const created = await prisma.table.findMany({
    where: { outlet_id: outletId, table_number: { in: data.map((d) => d.table_number) }, is_deleted: false },
  });

  const io = getIO();
  if (io) io.of('/orders').to(`outlet:${outletId}`).emit('tables_changed', { outlet_id: outletId });

  return {
    created: created.length,
    skipped: skipped.length,
    skipped_numbers: skipped,
    tables: created,
  };
}

/**
 * Bulk-updates the status of multiple tables at once (tick-select → mark free /
 * change status). Emits a socket event per table so all devices stay in sync.
 * @param {string[]} tableIds
 * @param {string} status
 * @returns {Promise<{ updated: number, table_ids: string[] }>}
 */
async function bulkUpdateTableStatus(tableIds, status) {
  const prisma = getDbClient();
  const tables = await prisma.table.findMany({
    where: { id: { in: tableIds }, is_deleted: false },
    select: { id: true, outlet_id: true, table_number: true },
  });
  if (tables.length === 0) throw new NotFoundError('No matching tables found');

  // When freeing tables, also clear their current order link and any cleaning
  // reminder schedule (stops the dirty/cleaning loop for those tables).
  await prisma.table.updateMany({
    where: { id: { in: tables.map((t) => t.id) } },
    data: {
      status,
      ...(status === 'available'
        ? { current_order_id: null, auto_free_at: null, cleaning_started_at: null, reminder_count: 0 }
        : {}),
    },
  });

  const io = getIO();
  if (io) {
    for (const t of tables) {
      io.of('/orders').to(`outlet:${t.outlet_id}`).emit('table_status_change', {
        table_id: t.id, status, table_number: t.table_number,
      });
    }
  }

  return { updated: tables.length, table_ids: tables.map((t) => t.id) };
}

/**
 * Soft deletes a table.
 */
async function deleteTable(tableId) {
  const prisma = getDbClient();
  try {
    return await prisma.table.update({ where: { id: tableId }, data: { is_deleted: true } });
  } catch (error) {
    logger.error('Delete table failed', { error: error.message });
    throw error;
  }
}

/**
 * Bulk saves the entire floor plan layout (positions + area positions) in one transaction.
 */
async function saveFloorPlan(outletId, tables, areas) {
  const prisma = getDbClient();
  try {
    await prisma.$transaction(async (tx) => {
      // Update each table's position, shape, size, area
      for (const t of tables) {
        const updateData = {
          pos_x: t.pos_x,
          pos_y: t.pos_y,
          width: t.width,
          height: t.height,
          shape: t.shape,
          rotation: t.rotation || 0,
        };
        if (t.area_id !== undefined) updateData.area_id = t.area_id || null;
        if (t.table_number !== undefined) updateData.table_number = t.table_number;
        if (t.seating_capacity !== undefined) updateData.seating_capacity = t.seating_capacity;

        await tx.table.updateMany({
          where: { id: t.id, outlet_id: outletId, is_deleted: false },
          data: updateData,
        });
      }

      // Update each area's position and size
      for (const a of (areas || [])) {
        const areaUpdate = {};
        if (a.pos_x !== undefined) areaUpdate.pos_x = a.pos_x;
        if (a.pos_y !== undefined) areaUpdate.pos_y = a.pos_y;
        if (a.width !== undefined) areaUpdate.width = a.width;
        if (a.height !== undefined) areaUpdate.height = a.height;
        if (a.color !== undefined) areaUpdate.color = a.color;
        if (a.name !== undefined) areaUpdate.name = a.name;

        if (Object.keys(areaUpdate).length > 0) {
          await tx.tableArea.updateMany({
            where: { id: a.id, outlet_id: outletId, is_deleted: false },
            data: areaUpdate,
          });
        }
      }
    });

    // Return fresh full layout
    return await listTables(outletId);
  } catch (error) {
    logger.error('Save floor plan failed', { error: error.message });
    throw error;
  }
}

/**
 * Lists table areas for an outlet.
 */
async function listTableAreas(outletId) {
  const prisma = getDbClient();
  return await prisma.tableArea.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { display_order: 'asc' },
    include: { _count: { select: { tables: { where: { is_deleted: false } } } } },
  });
}

/**
 * Creates a new table area (zone).
 */
async function createTableArea(data) {
  const prisma = getDbClient();
  try {
    return await prisma.tableArea.create({
      data: {
        outlet_id: data.outlet_id,
        name: data.name,
        display_order: data.display_order || 0,
        color: data.color || '#1e293b',
        pos_x: data.pos_x || 0,
        pos_y: data.pos_y || 0,
        width: data.width || 400,
        height: data.height || 300,
      },
    });
  } catch (error) {
    logger.error('Create table area failed', { error: error.message });
    throw error;
  }
}

/**
 * Updates a table area.
 */
async function updateTableArea(areaId, data) {
  const prisma = getDbClient();
  try {
    const area = await prisma.tableArea.findFirst({ where: { id: areaId, is_deleted: false } });
    if (!area) throw new NotFoundError('Table area not found');

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.display_order !== undefined) updateData.display_order = data.display_order;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.pos_x !== undefined) updateData.pos_x = data.pos_x;
    if (data.pos_y !== undefined) updateData.pos_y = data.pos_y;
    if (data.width !== undefined) updateData.width = data.width;
    if (data.height !== undefined) updateData.height = data.height;

    return await prisma.tableArea.update({ where: { id: areaId }, data: updateData });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    logger.error('Update table area failed', { error: error.message });
    throw error;
  }
}

/**
 * Soft deletes a table area. Unlinks tables from the area.
 */
async function deleteTableArea(areaId) {
  const prisma = getDbClient();
  try {
    await prisma.$transaction([
      prisma.table.updateMany({ where: { area_id: areaId, is_deleted: false }, data: { area_id: null } }),
      prisma.tableArea.update({ where: { id: areaId }, data: { is_deleted: true } }),
    ]);
  } catch (error) {
    logger.error('Delete table area failed', { error: error.message });
    throw error;
  }
}

/**
 * Generates the QR ordering URL for a table.
 */
async function getTableQR(tableId) {
  const prisma = getDbClient();
  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table) throw new NotFoundError('Table not found');
  const baseUrl = process.env.CUSTOMER_UI_URL || 'https://petpooja-menu.vercel.app';
  return `${baseUrl}/?outlet=${table.outlet_id}&table=${table.id}`;
}

/**
 * Auto-free popup actions, driven by the global client manager:
 *   - 'free':       free the table now (grace expired or staff confirmed)
 *   - 'cancel':     drop the schedule, keep the table occupied (staff will free manually)
 *   - 'reschedule': push the reminder out by `minutes` (snooze — customer still seated)
 */
async function autoFreeAction(tableId, action, minutes) {
  const prisma = getDbClient();
  const table = await prisma.table.findFirst({ where: { id: tableId, is_deleted: false } });
  if (!table) throw new NotFoundError('Table not found');

  const io = getIO();
  const room = io ? io.of('/orders').to(`outlet:${table.outlet_id}`) : null;

  if (action === 'free') {
    await prisma.table.update({
      where: { id: tableId },
      data: { status: 'available', current_order_id: null, auto_free_at: null },
    });
    if (room) room.emit('table_status_change', { table_id: tableId, status: 'available', table_number: table.table_number });
    return { table_id: tableId, status: 'available' };
  }

  if (action === 'cancel') {
    await prisma.table.update({ where: { id: tableId }, data: { auto_free_at: null } });
    if (room) room.emit('table:auto_free_updated', { table_id: tableId, auto_free_at: null, cancelled: true });
    return { table_id: tableId, auto_free_at: null };
  }

  // reschedule
  const mins = Math.min(240, Math.max(1, Number(minutes) || 15));
  const autoFreeAt = new Date(Date.now() + mins * 60_000);
  await prisma.table.update({ where: { id: tableId }, data: { auto_free_at: autoFreeAt } });
  if (room) {
    room.emit('table:auto_free_updated', {
      table_id: tableId, table_number: table.table_number,
      auto_free_at: autoFreeAt.toISOString(), predicted_minutes: mins,
    });
  }
  return { table_id: tableId, auto_free_at: autoFreeAt.toISOString() };
}

/* ══════════════════════════════════════════════════════
   DIRTY / CLEANING LIFECYCLE
   On payment a dine-in table goes 'dirty' (cleaning) instead of free. The floor
   operator then either sets a timed reminder (autofree.scheduleCleaningReminder),
   marks it free, stops the reminder loop, or hands the still-dirty table to the
   next customer if cleaning finishes within CLEANING_WINDOW_MINUTES.
══════════════════════════════════════════════════════ */

/** Emits a table_status_change to the outlet floor. */
function emitTableStatus(outletId, tableId, status, tableNumber) {
  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${outletId}`).emit('table_status_change', {
      table_id: tableId, status, table_number: tableNumber,
    });
  }
}

/**
 * Hard "Mark as Free": frees the table immediately AND stops the auto-reminder
 * loop (clears the reminder schedule + cleaning anchor + count).
 */
async function markTableFree(tableId) {
  const prisma = getDbClient();
  const table = await prisma.table.findFirst({ where: { id: tableId, is_deleted: false } });
  if (!table) throw new NotFoundError('Table not found');

  const updated = await prisma.table.update({
    where: { id: tableId },
    data: {
      status: 'available',
      current_order_id: null,
      auto_free_at: null,
      cleaning_started_at: null,
      reminder_count: 0,
    },
  });
  emitTableStatus(table.outlet_id, tableId, 'available', table.table_number);
  return updated;
}

/**
 * "No more reminders": keep the table 'dirty' (still visibly needs cleaning) but
 * drop the reminder schedule so the loop stops nagging. A fresh timer can still
 * be started later via scheduleCleaningReminder.
 */
async function stopCleaningReminders(tableId) {
  const prisma = getDbClient();
  const table = await prisma.table.findFirst({ where: { id: tableId, is_deleted: false } });
  if (!table) throw new NotFoundError('Table not found');

  const updated = await prisma.table.update({
    where: { id: tableId },
    data: { auto_free_at: null },
  });
  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${table.outlet_id}`).emit('table:cleaning_reminder_set', {
      table_id: tableId, table_number: table.table_number, status: 'dirty',
      auto_free_at: null, reminder_count: updated.reminder_count, stopped: true,
    });
  }
  return updated;
}

/**
 * Assign-during-cleaning: a still-'dirty' table may be handed to the next
 * customer if cleaning finishes within CLEANING_WINDOW_MINUTES of going dirty.
 * Clears the dirty/cleaning state so the table is immediately assignable in POS
 * (this is what lets the within-window reuse bypass the "dirty blocks reuse" UI
 * rule). Returns the freed table; the caller opens POS with it pre-selected.
 */
async function assignTableDuringCleaning(tableId) {
  const prisma = getDbClient();
  const { CLEANING_WINDOW_MINUTES } = require('./autofree.service');
  const table = await prisma.table.findFirst({ where: { id: tableId, is_deleted: false } });
  if (!table) throw new NotFoundError('Table not found');
  if (table.status !== 'dirty') {
    throw new BadRequestError('Table is not in a cleaning state');
  }
  if (table.cleaning_started_at) {
    const ageMs = Date.now() - new Date(table.cleaning_started_at).getTime();
    if (ageMs > CLEANING_WINDOW_MINUTES * 60_000) {
      throw new BadRequestError('Cleaning window has passed — mark the table free before reassigning');
    }
  }

  const updated = await prisma.table.update({
    where: { id: tableId },
    data: {
      status: 'available',
      current_order_id: null,
      auto_free_at: null,
      cleaning_started_at: null,
      reminder_count: 0,
    },
  });
  emitTableStatus(table.outlet_id, tableId, 'available', table.table_number);
  return updated;
}

module.exports = {
  listTables,
  createTable,
  updateTable,
  updateTableStatus,
  bulkUpdateTableStatus,
  bulkCreateTables,
  deleteTable,
  saveFloorPlan,
  listTableAreas,
  createTableArea,
  updateTableArea,
  deleteTableArea,
  getTableQR,
  autoFreeAction,
  markTableFree,
  stopCleaningReminders,
  assignTableDuringCleaning,
};
