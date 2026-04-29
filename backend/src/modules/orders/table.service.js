/**
 * @fileoverview Table service — CRUD, status management, and floor plan layout for restaurant tables.
 * @module modules/orders/table.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError } = require('../../utils/errors');

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
      data: { status, current_order_id: status === 'available' ? null : table.current_order_id },
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
  try {
    return await prisma.tableArea.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      orderBy: { display_order: 'asc' },
      include: { _count: { select: { tables: { where: { is_deleted: false } } } } },
    });
  } catch (error) {
    throw error;
  }
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

module.exports = {
  listTables,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
  saveFloorPlan,
  listTableAreas,
  createTableArea,
  updateTableArea,
  deleteTableArea,
  getTableQR,
};
