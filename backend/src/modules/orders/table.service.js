/**
 * @fileoverview Table service — CRUD and status management for restaurant tables.
 * @module modules/orders/table.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError } = require('../../utils/errors');

/**
 * Lists all tables for an outlet with current order status.
 * @param {string} outletId - Outlet UUID
 * @param {object} [query] - Optional filters (area_id, status)
 * @returns {Promise<object[]>} Array of tables with order info
 */
async function listTables(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const where = { outlet_id: outletId, is_deleted: false };
    if (query.area_id) where.area_id = query.area_id;
    if (query.status) where.status = query.status;

    return await prisma.table.findMany({
      where,
      orderBy: { display_order: 'asc' },
      include: {
        area: { select: { name: true } },
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
 * Updates table status and emits socket event.
 * @param {string} tableId - Table UUID
 * @param {string} status - New status (available/occupied/reserved/blocked)
 * @returns {Promise<object>}
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
 * Lists table areas for an outlet.
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object[]>}
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
 * Creates a new table for an outlet.
 * @param {object} data - Table data (outlet_id, table_number, capacity, area_id)
 * @returns {Promise<object>} Created table
 */
async function createTable(data) {
  const prisma = getDbClient();
  try {
    return await prisma.table.create({
      data: {
        outlet_id: data.outlet_id,
        table_number: data.table_number,
        seating_capacity: data.capacity || data.seating_capacity || 4,
        area_id: data.area_id || null,
        status: 'available',
      }
    });
  } catch (error) {
    logger.error('Create table failed', { error: error.message });
    throw error;
  }
}

/**
 * Soft deletes a table.
 * @param {string} tableId - Table UUID
 * @returns {Promise<object>}
 */
async function deleteTable(tableId) {
  const prisma = getDbClient();
  try {
    return await prisma.table.update({
      where: { id: tableId },
      data: { is_deleted: true }
    });
  } catch (error) {
    logger.error('Delete table failed', { error: error.message });
    throw error;
  }
}

module.exports = { listTables, updateTableStatus, listTableAreas, createTable, deleteTable };
