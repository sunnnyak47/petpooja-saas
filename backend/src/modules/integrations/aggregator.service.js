/**
 * @fileoverview Online aggregator integration service — Swiggy, Zomato, Uber Eats.
 * Handles webhook reception, order ingestion, status sync, and menu push.
 * @module modules/integrations/aggregator.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { calculateGST, generateOrderNumber } = require('../../utils/helpers');
const crypto = require('crypto');

const AGGREGATOR_CONFIG = {
  swiggy: {
    name: 'Swiggy',
    webhookSecret: process.env.SWIGGY_WEBHOOK_SECRET || '',
    apiUrl: process.env.SWIGGY_API_URL || 'https://partner-api.swiggy.com',
    apiKey: process.env.SWIGGY_API_KEY || '',
  },
  zomato: {
    name: 'Zomato',
    webhookSecret: process.env.ZOMATO_WEBHOOK_SECRET || '',
    apiUrl: process.env.ZOMATO_API_URL || 'https://api.zomato.com',
    apiKey: process.env.ZOMATO_API_KEY || '',
  },
  ubereats: {
    name: 'Uber Eats',
    webhookSecret: process.env.UBEREATS_WEBHOOK_SECRET || '',
    apiUrl: process.env.UBEREATS_API_URL || 'https://api.uber.com/eats',
    apiKey: process.env.UBEREATS_API_KEY || '',
  },
};

/**
 * Verifies webhook signature from aggregator platform.
 * @param {string} platform - Platform name (swiggy/zomato/ubereats)
 * @param {string} signature - Signature header
 * @param {string} payload - Raw request body
 * @returns {boolean} Whether signature is valid
 */
function verifyWebhookSignature(platform, signature, payload) {
  const config = AGGREGATOR_CONFIG[platform];
  if (!config || !config.webhookSecret) {
    logger.warn(`No webhook secret configured for ${platform}`);
    return process.env.NODE_ENV === 'development';
  }

  const expected = crypto
    .createHmac('sha256', config.webhookSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature || '', 'utf-8'),
    Buffer.from(expected, 'utf-8')
  );
}

/**
 * Processes an incoming order from an aggregator platform.
 * Maps external items to internal menu items and creates an order.
 * @param {string} platform - Platform name
 * @param {object} webhookData - Raw webhook payload
 * @returns {Promise<object>} Created internal order
 */
async function processIncomingOrder(platform, webhookData) {
  const prisma = getDbClient();

  try {
    const externalOrderId = extractExternalOrderId(platform, webhookData);
    const outletExternalId = extractOutletId(platform, webhookData);

    const existingOrder = await prisma.order.findFirst({
      where: { aggregator_order_id: externalOrderId, is_deleted: false },
    });
    if (existingOrder) {
      logger.info(`Duplicate order ignored: ${externalOrderId}`, { platform });
      return existingOrder;
    }

    const outletMapping = await prisma.outletSetting.findFirst({
      where: {
        setting_key: `${platform}_store_id`,
        setting_value: outletExternalId,
        is_deleted: false,
      },
      include: { outlet: true },
    });

    if (!outletMapping) {
      throw new BadRequestError(`No outlet mapped for ${platform} store ${outletExternalId}`);
    }

    const outlet = outletMapping.outlet;
    const externalItems = extractItems(platform, webhookData);

    const menuItemMappings = await prisma.menuItem.findMany({
      where: {
        outlet_id: outlet.id,
        is_deleted: false,
        external_id: { in: externalItems.map((i) => i.external_id) },
      },
    });

    const mappingMap = new Map(menuItemMappings.map((m) => [m.external_id, m]));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await prisma.order.count({
      where: { outlet_id: outlet.id, created_at: { gte: todayStart } },
    });

    const orderNumber = generateOrderNumber(outlet.code, todayCount + 1);
    let subtotal = 0;
    const orderItemsData = [];

    for (const extItem of externalItems) {
      const internalItem = mappingMap.get(extItem.external_id);

      const unitPrice = internalItem ? Number(internalItem.base_price) : extItem.price;
      const itemTotal = unitPrice * extItem.quantity;
      subtotal += itemTotal;

      orderItemsData.push({
        menu_item_id: internalItem?.id || null,
        name: extItem.name,
        quantity: extItem.quantity,
        unit_price: unitPrice,
        item_total: itemTotal,
        gst_rate: internalItem ? Number(internalItem.gst_rate) : 5,
        kitchen_station: internalItem?.kitchen_station || 'KITCHEN',
        notes: extItem.notes || null,
        variant_price: 0,
        addons_total: 0,
      });
    }

    let totalTax = 0;
    for (const oi of orderItemsData) {
      const gst = calculateGST(oi.item_total, oi.gst_rate, true);
      oi.item_tax = gst.totalTax;
      totalTax += gst.totalTax;
    }

    const totalAmount = subtotal + totalTax;
    const grandTotal = Math.round(totalAmount);

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          outlet_id: outlet.id,
          order_number: orderNumber,
          order_type: 'online',
          status: 'created',
          source: 'online',
          aggregator_order_id: externalOrderId,
          aggregator: platform,
          subtotal,
          taxable_amount: subtotal,
          total_tax: Math.round(totalTax * 100) / 100,
          total_amount: Math.round(totalAmount * 100) / 100,
          grand_total: grandTotal,
          is_paid: true,
          paid_at: new Date(),
          daily_sequence: todayCount + 1,
          customer_name: extractCustomerName(platform, webhookData),
          customer_phone: extractCustomerPhone(platform, webhookData),
          delivery_address: extractDeliveryAddress(platform, webhookData),
          notes: `${AGGREGATOR_CONFIG[platform].name} Order #${externalOrderId}`,
        },
      });

      for (const oi of orderItemsData) {
        await tx.orderItem.create({ data: { order_id: newOrder.id, ...oi } });
      }

      await tx.orderStatusHistory.create({
        data: { order_id: newOrder.id, from_status: null, to_status: 'created' },
      });

      await tx.payment.create({
        data: {
          outlet_id: outlet.id, order_id: newOrder.id,
          method: 'online_prepaid', amount: grandTotal,
          status: 'success', transaction_id: externalOrderId,
          processed_at: new Date(),
        },
      });

      return newOrder;
    });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${outlet.id}`).emit('new_online_order', {
        order_id: order.id, order_number: orderNumber,
        platform, external_id: externalOrderId,
      });
    }

    logger.info(`Online order ingested from ${platform}`, {
      orderId: order.id, externalOrderId, outlet: outlet.code,
    });

    return order;
  } catch (error) {
    logger.error(`Process ${platform} order failed`, { error: error.message });
    throw error;
  }
}

/**
 * Accepts an online order and syncs status back to aggregator.
 * @param {string} orderId - Internal order UUID
 * @returns {Promise<object>}
 */
async function acceptOnlineOrder(orderId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
    });
    if (!order) throw new NotFoundError('Order not found');

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'confirmed' },
      });
    });

    if (order.aggregator && order.aggregator_order_id) {
      await syncStatusToAggregator(order.aggregator, order.aggregator_order_id, 'accepted');
    }

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('online_order_accepted', {
        order_id: orderId,
      });
    }

    return await prisma.order.findFirst({ where: { id: orderId } });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Rejects an online order with reason.
 * @param {string} orderId - Internal order UUID
 * @param {string} reason - Rejection reason
 * @returns {Promise<object>}
 */
async function rejectOnlineOrder(orderId, reason) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, is_deleted: false } });
    if (!order) throw new NotFoundError('Order not found');

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled', void_reason: reason } });
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'cancelled', reason },
      });
    });

    if (order.aggregator && order.aggregator_order_id) {
      await syncStatusToAggregator(order.aggregator, order.aggregator_order_id, 'rejected', reason);
    }

    return await prisma.order.findFirst({ where: { id: orderId } });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Marks an online order as ready for pickup.
 * @param {string} orderId - Internal order UUID
 * @returns {Promise<object>}
 */
async function markOrderReady(orderId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
    });
    if (!order) throw new NotFoundError('Order not found');

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'ready' } });
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'ready' },
      });
    });

    if (order.aggregator && order.aggregator_order_id) {
      await syncStatusToAggregator(order.aggregator, order.aggregator_order_id, 'ready');
    }

    return await prisma.order.findFirst({ where: { id: orderId } });
  } catch (error) { throw error; }
}

/**
 * Fetches active online orders for an outlet.
 */
async function getActiveOnlineOrders(outletId) {
  const prisma = getDbClient();
  return await prisma.order.findMany({
    where: { 
      outlet_id: outletId, 
      order_type: 'online',
      status: { in: ['created', 'confirmed', 'preparing', 'ready'] },
      is_deleted: false 
    },
    include: { order_items: true },
    orderBy: { created_at: 'desc' }
  });
}

/**
 * Fetches online order history for an outlet.
 */
async function getOnlineOrderHistory(outletId, query) {
  const prisma = getDbClient();
  const { from, to, status, aggregator, search } = query;
  
  const where = {
    outlet_id: outletId,
    order_type: 'online',
    is_deleted: false
  };

  if (from && to) where.created_at = { gte: new Date(from), lte: new Date(to) };
  if (status) where.status = status;
  if (aggregator) where.aggregator = aggregator;
  if (search) {
    where.OR = [
      { order_number: { contains: search, mode: 'insensitive' } },
      { aggregator_order_id: { contains: search, mode: 'insensitive' } }
    ];
  }

  return await prisma.order.findMany({
    where,
    include: { order_items: true },
    orderBy: { created_at: 'desc' },
    take: 50
  });
}

/**
 * Aggregates today's online order stats.
 */
async function getOnlineStats(outletId) {
  const prisma = getDbClient();
  const today = new Date();
  today.setHours(0,0,0,0);

  const orders = await prisma.order.findMany({
    where: {
      outlet_id: outletId,
      order_type: 'online',
      created_at: { gte: today },
      is_deleted: false
    }
  });

  const stats = {
    total_orders: orders.length,
    total_revenue: orders.reduce((sum, o) => sum + Number(o.grand_total), 0),
    by_platform: {
      zomato: { count: 0, revenue: 0 },
      swiggy: { count: 0, revenue: 0 },
      other: { count: 0, revenue: 0 }
    }
  };

  orders.forEach(o => {
    const platform = o.aggregator === 'zomato' ? 'zomato' : (o.aggregator === 'swiggy' ? 'swiggy' : 'other');
    stats.by_platform[platform].count += 1;
    stats.by_platform[platform].revenue += Number(o.grand_total);
  });

  return stats;
}

/**
 * Syncs order status back to aggregator platform API.
 * @param {string} platform - Platform name
 * @param {string} externalOrderId - External order ID
 * @param {string} status - Status to sync
 * @param {string} [reason] - Optional reason for rejection
 */
async function syncStatusToAggregator(platform, externalOrderId, status, reason) {
  const config = AGGREGATOR_CONFIG[platform];
  if (!config || !config.apiKey) {
    logger.warn(`Cannot sync to ${platform}: no API key configured`);
    return;
  }

  try {
    logger.info(`Syncing status to ${platform}`, { externalOrderId, status });
    /* In production, this would make an HTTP call:
    await axios.post(`${config.apiUrl}/orders/${externalOrderId}/status`, {
      status, reason,
    }, { headers: { 'Authorization': `Bearer ${config.apiKey}` } });
    */
  } catch (error) {
    logger.error(`Failed to sync to ${platform}`, { error: error.message, externalOrderId });
  }
}

/* ============================
   PLATFORM-SPECIFIC PARSERS
   ============================ */

function extractExternalOrderId(platform, data) {
  switch (platform) {
    case 'swiggy': return data.order_id || data.orderId;
    case 'zomato': return data.order?.id || data.order_id;
    case 'ubereats': return data.id || data.order_id;
    default: return data.order_id || data.id;
  }
}

function extractOutletId(platform, data) {
  switch (platform) {
    case 'swiggy': return data.restaurant_id || data.store_id;
    case 'zomato': return data.restaurant?.id || data.res_id;
    case 'ubereats': return data.store?.id || data.store_id;
    default: return data.store_id || data.restaurant_id;
  }
}

function extractItems(platform, data) {
  const rawItems = data.items || data.order?.items || data.order_items || [];
  return rawItems.map((item) => ({
    external_id: String(item.id || item.item_id || item.external_id),
    name: item.name || item.item_name || 'Unknown Item',
    quantity: item.quantity || item.qty || 1,
    price: Number(item.price || item.unit_price || 0),
    notes: item.instructions || item.notes || item.special_instructions || null,
  }));
}

function extractCustomerName(platform, data) {
  return data.customer?.name || data.customer_name || data.delivery?.name || null;
}

function extractCustomerPhone(platform, data) {
  return data.customer?.phone || data.customer_phone || data.delivery?.phone || null;
}

function extractDeliveryAddress(platform, data) {
  const addr = data.delivery_address || data.customer?.address || data.delivery?.address;
  if (typeof addr === 'string') return addr;
  if (addr) return [addr.line1, addr.line2, addr.city, addr.pincode].filter(Boolean).join(', ');
  return null;
}

module.exports = {
  verifyWebhookSignature, processIncomingOrder,
  acceptOnlineOrder, rejectOnlineOrder, markOrderReady,
  getActiveOnlineOrders, getOnlineOrderHistory, getOnlineStats,
  syncStatusToAggregator,
};
