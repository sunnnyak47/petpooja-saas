/**
 * @fileoverview Online Order service — handles customer-placed QR orders.
 * @module modules/online-orders/online-order.service
 */

const { getDbClient } = require('../../config/database');
const orderService = require('../orders/order.service');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');

/**
 * Places an order from the customer-facing QR menu.
 * @param {object} orderData - Order details (outlet_id, table_id, items, etc.)
 * @returns {Promise<object>} Created order
 */
/**
 * Places an order from the customer-facing QR menu.
 * Starts as PENDING and requires acceptance from POS staff.
 * @param {object} orderData - Order details
 * @returns {Promise<object>} Created order
 */
async function placeCustomerOrder(orderData) {
  const prisma = getDbClient();
  
  // 1. Validate Table & Outlet Correlation
  const table = await prisma.table.findFirst({
    where: { id: orderData.table_id, outlet_id: orderData.outlet_id, is_deleted: false }
  });
  if (!table) throw new NotFoundError('Invalid table or outlet provided');

  // 2. Prepare order data for core service
  const processedData = {
    ...orderData,
    source: 'qr',
    order_type: 'qr_order',
    status: 'pending' // Online orders must be accepted by staff
  };

  // 3. Create the order
  const createdOrder = await orderService.createOrder(processedData, null);

  // 4. Mark table as OCCUPIED
  await prisma.table.update({
    where: { id: orderData.table_id },
    data: { status: 'occupied', current_order_id: createdOrder.id }
  });

  // 5. Notify POS for "New Incoming Order" alert
  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${orderData.outlet_id}`).emit('new_online_order', {
      order_id: createdOrder.id,
      order_number: createdOrder.order_number,
      table_number: table.table_number,
      customer_name: orderData.customer_name,
      total_amount: createdOrder.total_amount,
      items_count: orderData.items.length
    });
  }

  return createdOrder;
}

/**
 * Accepts a pending online order, transitioning it to CREATED and generating KOT.
 * @param {string} orderId - Order UUID
 * @param {string} outletId - Outlet UUID
 * @param {string} staffId - Staff user accepting the order
 * @returns {Promise<object>} Updated order
 */
async function acceptCustomerOrder(orderId, outletId, staffId) {
  const prisma = getDbClient();
  
  const order = await prisma.order.findFirst({
    where: { id: orderId, outlet_id: outletId, status: 'pending', is_deleted: false }
  });
  if (!order) throw new NotFoundError('Pending order not found');

  // 1. Update status to 'created' (standard workflow start)
  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'created', staff_id: staffId }
  });

  // 2. Generate KOT (Kitchen Station gets the order now)
  try {
    await orderService.generateKOT(orderId, staffId);
    logger.info('KOT generated upon online order acceptance', { orderId });
  } catch (err) {
    logger.error('KOT generation failed during acceptance', { error: err.message });
    // Continue anyway as order is accepted
  }

  // 3. Notify sockets
  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${outletId}`).emit('order_accepted', {
      order_id: orderId,
      order_number: order.order_number
    });
    // Notify table status change as well
    io.of('/orders').to(`outlet:${outletId}`).emit('table_status_change', {
      table_id: order.table_id,
      status: 'occupied'
    });
  }

  return updatedOrder;
}

/**
 * Rejects an online order (e.g. fake order).
 * Deletes the order and releases the table.
 * @param {string} orderId - Order UUID
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<void>}
 */
async function rejectCustomerOrder(orderId, outletId) {
  const prisma = getDbClient();
  
  const order = await prisma.order.findFirst({
    where: { id: orderId, outlet_id: outletId, is_deleted: false }
  });
  if (!order) throw new NotFoundError('Order not found');

  // Hard delete if it's pending (reduces DB clutter for fake orders)
  await prisma.order.delete({ where: { id: orderId } });

  // Update table back to available
  if (order.table_id) {
    await prisma.table.update({
      where: { id: order.table_id },
      data: { status: 'available', current_order_id: null }
    });
  }

  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${outletId}`).emit('new_online_order_cleared', { order_id: orderId });
    io.of('/orders').to(`outlet:${outletId}`).emit('table_status_change', {
      table_id: order.table_id,
      status: 'available'
    });
  }
}

module.exports = {
  placeCustomerOrder,
  acceptCustomerOrder,
  rejectCustomerOrder,
};
