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
    order_type: 'qr_order'
  };

  // 3. Create the order using core service logic
  const { order: createdOrder } = await orderService.createOrder(processedData, null);

  // 4. Mark table as OCCUPIED (consistent with POS workflow)
  await prisma.table.update({
    where: { id: orderData.table_id },
    data: { status: 'occupied', current_order_id: createdOrder.id }
  });

  // 4. AUTO-GENERATE KOT (Critical Requirement)
  try {
    await orderService.generateKOT(createdOrder.id, null);
    logger.info('Auto-KOT generated for online order', { orderId: createdOrder.id });
  } catch (kotEntryError) {
    logger.error('Failed to auto-generate KOT for online order:', kotEntryError.message);
    // We don't fail the whole order if KOT fail, but we log it
  }

  // 5. Notify POS for "Online Order" arrival
  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${orderData.outlet_id}`).emit('new_online_order', {
      order_id: createdOrder.id,
      order_number: createdOrder.order_number,
      table_number: table.table_number,
      customer_name: orderData.customer_name
    });
  }

  return createdOrder;
}

module.exports = {
  placeCustomerOrder,
};
