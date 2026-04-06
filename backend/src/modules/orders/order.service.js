/**
 * @fileoverview Order service — creates orders, manages items, generates KOTs, processes payments.
 * This is the MOST CRITICAL module in the entire system.
 * @module modules/orders/order.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../../utils/errors');
const { calculateGST, generateOrderNumber, parsePagination, getFinancialYear, generateInvoiceNumber: formatInvoiceNumber } = require('../../utils/helpers');
const customerService = require('../customers/customer.service');

/**
 * Creates a new order with items, calculates totals and taxes.
 * @param {object} data - Order data including items array
 * @param {string} staffId - Staff user ID creating the order
 * @returns {Promise<object>} Complete order with items and totals
 */
async function createOrder(data, staffId) {
  const prisma = getDbClient();

  try {
    const outlet = await prisma.outlet.findFirst({
      where: { id: data.outlet_id, is_deleted: false, is_active: true },
    });
    if (!outlet) throw new NotFoundError('Outlet not found or inactive');

    if (data.table_id) {
      const table = await prisma.table.findFirst({
        where: { id: data.table_id, outlet_id: data.outlet_id, is_deleted: false },
      });
      if (!table) throw new NotFoundError('Table not found');
      if (table.status === 'occupied' && table.current_order_id) {
        throw new BadRequestError('Table is already occupied. Use add items to existing order.');
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayOrderCount = await prisma.order.count({
      where: { outlet_id: data.outlet_id, created_at: { gte: todayStart } },
    });
    const dailySequence = todayOrderCount + 1;
    const orderNumber = generateOrderNumber(outlet.code, dailySequence);

    const menuItemIds = data.items.map((i) => i.menu_item_id);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, outlet_id: data.outlet_id, is_deleted: false },
      include: { variants: { where: { is_deleted: false } }, addons: { where: { is_deleted: false } } },
    });

    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
    let subtotal = 0;
    const orderItemsData = [];

    for (const item of data.items) {
      const menuItem = menuItemMap.get(item.menu_item_id);
      if (!menuItem) throw new BadRequestError(`Menu item not found: ${item.menu_item_id}`);
      if (!menuItem.is_available) throw new BadRequestError(`Item '${menuItem.name}' is currently unavailable`);

      let unitPrice = Number(menuItem.base_price);
      let variantPrice = 0;
      let variantName = null;

      if (item.variant_id) {
        const variant = menuItem.variants.find((v) => v.id === item.variant_id);
        if (!variant) throw new BadRequestError(`Variant not found for ${menuItem.name}`);
        variantPrice = Number(variant.price_addition);
        variantName = variant.name;
      }

      let addonsTotal = 0;
      const orderAddons = [];
      if (item.addons && item.addons.length > 0) {
        for (const addonReq of item.addons) {
          const addon = menuItem.addons.find((a) => a.id === addonReq.addon_id);
          if (!addon) throw new BadRequestError(`Addon not found: ${addonReq.addon_id}`);
          const addonLineTotal = Number(addon.price) * (addonReq.quantity || 1);
          addonsTotal += addonLineTotal;
          orderAddons.push({
            addon_id: addon.id,
            name: addon.name,
            price: Number(addon.price),
            quantity: addonReq.quantity || 1,
          });
        }
      }

      const itemTotal = (unitPrice + variantPrice + addonsTotal) * item.quantity;
      subtotal += itemTotal;

      orderItemsData.push({
        menu_item_id: item.menu_item_id,
        variant_id: item.variant_id || null,
        name: menuItem.name,
        variant_name: variantName,
        quantity: item.quantity,
        unit_price: unitPrice,
        variant_price: variantPrice,
        addons_total: addonsTotal,
        item_total: itemTotal,
        gst_rate: Number(menuItem.gst_rate),
        kitchen_station: menuItem.kitchen_station,
        notes: item.notes || null,
        addons: orderAddons,
      });
    }

    const isSameState = true;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const oi of orderItemsData) {
      const gst = calculateGST(oi.item_total, Number(oi.gst_rate), isSameState);
      oi.item_tax = gst.totalTax;
      totalCgst += gst.cgst;
      totalSgst += gst.sgst;
      totalIgst += gst.igst;
    }

    const totalTax = totalCgst + totalSgst + totalIgst;
    const totalAmount = subtotal + totalTax;
    const roundOff = Math.round(totalAmount) - totalAmount;
    const grandTotal = Math.round(totalAmount);

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          outlet_id: data.outlet_id,
          order_number: orderNumber,
          order_type: data.order_type || 'dine_in',
          status: 'created',
          table_id: data.table_id || null,
          customer_id: data.customer_id || null,
          staff_id: staffId,
          subtotal,
          taxable_amount: subtotal,
          cgst: Math.round(totalCgst * 100) / 100,
          sgst: Math.round(totalSgst * 100) / 100,
          igst: Math.round(totalIgst * 100) / 100,
          total_tax: Math.round(totalTax * 100) / 100,
          total_amount: Math.round(totalAmount * 100) / 100,
          round_off: Math.round(roundOff * 100) / 100,
          grand_total: grandTotal,
          source: data.source || 'pos',
          notes: data.notes || null,
          daily_sequence: dailySequence,
        },
      });

      for (const oi of orderItemsData) {
        const createdItem = await tx.orderItem.create({
          data: {
            order_id: newOrder.id,
            menu_item_id: oi.menu_item_id,
            variant_id: oi.variant_id,
            name: oi.name,
            variant_name: oi.variant_name,
            quantity: oi.quantity,
            unit_price: oi.unit_price,
            variant_price: oi.variant_price,
            addons_total: oi.addons_total,
            item_total: oi.item_total,
            gst_rate: oi.gst_rate,
            item_tax: oi.item_tax,
            kitchen_station: oi.kitchen_station,
            notes: oi.notes,
          },
        });

        if (oi.addons.length > 0) {
          await tx.orderItemAddon.createMany({
            data: oi.addons.map((a) => ({ ...a, order_item_id: createdItem.id })),
          });
        }
      }

      await tx.orderStatusHistory.create({
        data: { order_id: newOrder.id, from_status: null, to_status: 'created', changed_by: staffId },
      });

      if (data.table_id) {
        await tx.table.update({
          where: { id: data.table_id },
          data: { status: 'occupied', current_order_id: newOrder.id },
        });
      }

      return newOrder;
    });

    const fullOrder = await getOrderById(order.id);

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${data.outlet_id}`).emit('new_order', fullOrder);
      if (data.table_id) {
        io.of('/orders').to(`outlet:${data.outlet_id}`).emit('table_status_change', {
          table_id: data.table_id, status: 'occupied', order_id: order.id,
        });
      }
    }

    logger.info('Order created', { orderId: order.id, orderNumber, outlet: outlet.code });
    return fullOrder;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    logger.error('Create order failed', { error: error.message });
    throw error;
  }
}

/**
 * Retrieves a full order with all items, addons, status history, and payments.
 * @param {string} orderId - Order UUID
 * @returns {Promise<object>} Complete order object
 */
async function getOrderById(orderId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      include: {
        outlet: { select: { id: true, name: true, code: true, gstin: true } },
        table: { select: { id: true, table_number: true } },
        customer: { select: { id: true, full_name: true, phone: true } },
        staff: { select: { id: true, full_name: true } },
        order_items: {
          where: { is_deleted: false },
          include: { addons: true, variant: { select: { name: true } } },
          orderBy: { created_at: 'asc' },
        },
        status_history: { orderBy: { created_at: 'asc' } },
        kots: { include: { kot_items: true }, orderBy: { created_at: 'asc' } },
        payments: { where: { is_deleted: false } },
      },
    });
    if (!order) throw new NotFoundError('Order not found');
    return order;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Lists orders with filtering and pagination.
 * @param {string} outletId - Outlet UUID
 * @param {object} query - Filter params
 * @returns {Promise<{orders: object[], total: number, page: number, limit: number}>}
 */
async function listOrders(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset, sort, order: sortOrder } = parsePagination(query);
    const where = { outlet_id: outletId, is_deleted: false };

    if (query.status) where.status = query.status;
    if (query.order_type) where.order_type = query.order_type;
    if (query.source) where.source = query.source;
    if (query.from && query.to) {
      where.created_at = { gte: new Date(query.from), lte: new Date(query.to) };
    }
    if (query.table_id) where.table_id = query.table_id;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { [sort]: sortOrder },
        include: {
          table: { select: { table_number: true } },
          staff: { select: { full_name: true } },
          customer: { select: { full_name: true, phone: true } },
          _count: { select: { order_items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return { orders, total, page, limit };
  } catch (error) {
    logger.error('List orders failed', { error: error.message });
    throw error;
  }
}

/**
 * Adds items to an existing (running) order and recalculates totals.
 * @param {string} orderId - Order UUID
 * @param {Array} items - New items to add
 * @param {string} staffId - Staff ID
 * @returns {Promise<object>} Updated order
 */
async function addItemsToOrder(orderId, items, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
    });
    if (!order) throw new NotFoundError('Order not found');
    if (['paid', 'cancelled', 'voided', 'refunded'].includes(order.status)) {
      throw new BadRequestError(`Cannot add items to ${order.status} order`);
    }

    const menuItemIds = items.map((i) => i.menu_item_id);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, outlet_id: order.outlet_id, is_deleted: false },
      include: { variants: { where: { is_deleted: false } }, addons: { where: { is_deleted: false } } },
    });
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    let addedSubtotal = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const menuItem = menuItemMap.get(item.menu_item_id);
        if (!menuItem) throw new BadRequestError(`Menu item not found: ${item.menu_item_id}`);

        let unitPrice = Number(menuItem.base_price);
        let variantPrice = 0;
        let variantName = null;

        if (item.variant_id) {
          const variant = menuItem.variants.find((v) => v.id === item.variant_id);
          if (!variant) throw new BadRequestError(`Variant not found`);
          variantPrice = Number(variant.price_addition);
          variantName = variant.name;
        }

        let addonsTotal = 0;
        const orderAddons = [];
        if (item.addons && item.addons.length > 0) {
          for (const addonReq of item.addons) {
            const addon = menuItem.addons.find((a) => a.id === addonReq.addon_id);
            if (!addon) throw new BadRequestError(`Addon not found`);
            addonsTotal += Number(addon.price) * (addonReq.quantity || 1);
            orderAddons.push({ addon_id: addon.id, name: addon.name, price: Number(addon.price), quantity: addonReq.quantity || 1 });
          }
        }

        const itemTotal = (unitPrice + variantPrice + addonsTotal) * item.quantity;
        addedSubtotal += itemTotal;

        const createdItem = await tx.orderItem.create({
          data: {
            order_id: orderId, menu_item_id: item.menu_item_id, variant_id: item.variant_id || null,
            name: menuItem.name, variant_name: variantName, quantity: item.quantity,
            unit_price: unitPrice, variant_price: variantPrice, addons_total: addonsTotal,
            item_total: itemTotal, gst_rate: Number(menuItem.gst_rate),
            kitchen_station: menuItem.kitchen_station, notes: item.notes || null,
          },
        });

        if (orderAddons.length > 0) {
          await tx.orderItemAddon.createMany({
            data: orderAddons.map((a) => ({ ...a, order_item_id: createdItem.id })),
          });
        }
      }

      const allItems = await tx.orderItem.findMany({
        where: { order_id: orderId, is_deleted: false },
      });

      let newSubtotal = 0;
      let newCgst = 0;
      let newSgst = 0;
      for (const oi of allItems) {
        newSubtotal += Number(oi.item_total);
        const gst = calculateGST(Number(oi.item_total), Number(oi.gst_rate), true);
        newCgst += gst.cgst;
        newSgst += gst.sgst;
      }

      const totalTax = newCgst + newSgst;
      const totalAmount = newSubtotal + totalTax;

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: newSubtotal,
          taxable_amount: newSubtotal,
          cgst: Math.round(newCgst * 100) / 100,
          sgst: Math.round(newSgst * 100) / 100,
          total_tax: Math.round(totalTax * 100) / 100,
          total_amount: Math.round(totalAmount * 100) / 100,
          round_off: Math.round(Math.round(totalAmount) - totalAmount * 100) / 100,
          grand_total: Math.round(totalAmount),
        },
      });
    });

    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Generates KOTs from un-KOT'd items, split by kitchen station.
 * @param {string} orderId - Order UUID
 * @returns {Promise<object[]>} Array of generated KOT objects
 */
async function generateKOT(orderId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      include: {
        order_items: { where: { is_kot_sent: false, is_deleted: false }, include: { addons: true } },
        outlet: { select: { id: true, code: true } },
      },
    });
    if (!order) throw new NotFoundError('Order not found');

    const unsentItems = order.order_items;
    if (unsentItems.length === 0) {
      throw new BadRequestError('No new items to send to kitchen');
    }

    const stationGroups = {};
    for (const item of unsentItems) {
      const station = item.kitchen_station || 'KITCHEN';
      if (!stationGroups[station]) stationGroups[station] = [];
      stationGroups[station].push(item);
    }

    const kots = [];
    await prisma.$transaction(async (tx) => {
      for (const [station, items] of Object.entries(stationGroups)) {
        const kotCount = await tx.kOT.count({ where: { outlet_id: order.outlet_id } });
        const kotNumber = `KOT-${kotCount + 1}`;

        const kot = await tx.kOT.create({
          data: {
            outlet_id: order.outlet_id, order_id: orderId,
            kot_number: kotNumber, station, items_count: items.length,
            printed_at: new Date(),
          },
        });

        for (const item of items) {
          await tx.kOTItem.create({
            data: { kot_id: kot.id, order_item_id: item.id, quantity: item.quantity },
          });
          await tx.orderItem.update({
            where: { id: item.id },
            data: { is_kot_sent: true, kot_id: kot.id, status: 'sent' },
          });
        }

        kots.push({ ...kot, items });
      }

      if (order.status === 'created') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
        await tx.orderStatusHistory.create({
          data: { order_id: orderId, from_status: 'created', to_status: 'confirmed' },
        });
      }
    });

    const io = getIO();
    if (io) {
      const dbKots = await prisma.kOT.findMany({
        where: { id: { in: kots.map(k => k.id) } },
        include: {
          kot_items: {
            include: {
              order_item: {
                select: { name: true, variant_name: true, quantity: true, notes: true, addons: { select: { name: true } } },
              },
            },
          },
        },
      });

      for (const kot of dbKots) {
        const payload = {
          ...kot,
          order_number: order.order_number,
          order_type: order.order_type,
          table_id: order.table_id,
          table_number: order.table?.table_number
        };
        io.of('/kitchen').to(`outlet:${order.outlet_id}`).emit('new_kot', payload);
        io.of('/kitchen').to(`station:${order.outlet_id}:${kot.station}`).emit('new_kot', payload);
      }
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
        order_id: orderId, status: 'confirmed',
      });
    }

    logger.info('KOTs generated', { orderId, kotCount: kots.length });
    return kots;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Processes payment for an order. Marks as PAID, triggers stock deduction.
 * @param {string} orderId - Order UUID
 * @param {object} paymentData - Payment method, amount, splits
 * @param {string} staffId - Staff processing payment
 * @returns {Promise<object>} Payment result with invoice info
 */
async function processPayment(orderId, paymentData, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.is_paid) throw new BadRequestError('Order is already paid');
    if (['cancelled', 'voided'].includes(order.status)) {
      throw new BadRequestError(`Cannot pay for ${order.status} order`);
    }

    if (Math.abs(paymentData.amount - Number(order.grand_total)) > 1) {
      throw new BadRequestError(
        `Payment amount ₹${paymentData.amount} does not match order total ₹${order.grand_total}`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          outlet_id: order.outlet_id, order_id: orderId,
          method: paymentData.method, amount: paymentData.amount,
          transaction_id: paymentData.transaction_id || null,
          status: 'success', processed_by: staffId, processed_at: new Date(),
        },
      });

      if (paymentData.method === 'split' && paymentData.splits) {
        for (const split of paymentData.splits) {
          await tx.paymentSplit.create({
            data: {
              payment_id: payment.id, method: split.method,
              amount: split.amount, transaction_id: split.transaction_id || null,
            },
          });
        }
      }

      const invoiceNumber = await generateInvoiceNumber(tx, order.outlet_id);
      
      await tx.order.update({
        where: { id: orderId },
        data: { 
          is_paid: true, 
          paid_at: new Date(), 
          status: 'paid',
          invoice_number: invoiceNumber 
        },
      });

      if (order.customer_id) {
         await customerService.earnPoints(order.customer_id, order.outlet_id, order.id, Number(order.grand_total));
      }

      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'paid', changed_by: staffId },
      });
      
      return { payment, invoiceNumber };
    });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_complete', { order_id: orderId });
      if (order.table_id) {
        io.of('/orders').to(`outlet:${order.outlet_id}`).emit('table_status_change', {
          table_id: order.table_id, status: 'available',
        });
      }
    }

    logger.info('Payment processed', { orderId, method: paymentData.method, amount: paymentData.amount });
    
    // ASYNC: Trigger inventory deduction based on recipes
    const inventoryService = require('../inventory/inventory.service');
    inventoryService.deductByRecipe(orderId).catch(err => {
      logger.error('Inventory deduction failed after payment', { orderId, error: err.message });
    });

    return { payment: result, order: await getOrderById(orderId) };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Voids an order (requires manager PIN verification).
 * @param {string} orderId - Order UUID
 * @param {string} managerPin - Manager's PIN for authorization
 * @param {string} reason - Void reason
 * @param {string} staffId - Staff performing void
 * @returns {Promise<object>} Voided order
 */
async function voidOrder(orderId, managerPin, reason, staffId) {
  const prisma = getDbClient();
  try {
    const manager = await prisma.staffProfile.findFirst({
      where: { manager_pin: managerPin, is_deleted: false },
      include: { user: { include: { user_roles: { include: { role: true } } } } },
    });

    if (!manager) throw new ForbiddenError('Invalid manager PIN');

    const hasManagerRole = manager.user.user_roles.some(
      (ur) => ['super_admin', 'owner', 'manager'].includes(ur.role.name)
    );
    if (!hasManagerRole) throw new ForbiddenError('PIN does not belong to an authorized manager');

    const order = await prisma.order.findFirst({ where: { id: orderId, is_deleted: false } });
    if (!order) throw new NotFoundError('Order not found');
    if (['paid', 'cancelled', 'voided'].includes(order.status)) {
      throw new BadRequestError(`Cannot void a ${order.status} order`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'voided', void_reason: reason, voided_by: staffId },
      });
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'voided', changed_by: staffId, reason },
      });
      if (order.table_id) {
        await tx.table.update({
          where: { id: order.table_id },
          data: { status: 'available', current_order_id: null },
        });
      }
      await tx.auditLog.create({
        data: {
          user_id: staffId, outlet_id: order.outlet_id,
          action: 'ORDER_VOIDED', entity_type: 'order', entity_id: orderId,
          new_values: { reason, authorized_by: manager.user_id },
        },
      });
    });

    logger.warn('Order voided', { orderId, reason, voidedBy: staffId });
    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Updates order status.
 * @param {string} orderId - Order UUID
 * @param {string} newStatus - New status
 * @param {string} staffId - Staff making the change
 * @returns {Promise<object>}
 */
async function updateOrderStatus(orderId, newStatus, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, is_deleted: false } });
    if (!order) throw new NotFoundError('Order not found');

    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: newStatus } });
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: newStatus, changed_by: staffId },
      });
    });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
        order_id: orderId, status: newStatus,
      });
    }

    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Generates the next invoice number for an outlet by incrementing its sequence.
 * @param {object} tx - Prisma transaction client
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<string>} Formatted invoice number
 */
async function generateInvoiceNumber(tx, outletId) {
  const fy = getFinancialYear();
  const sequence = await tx.invoiceSequence.upsert({
    where: { outlet_id_financial_year: { outlet_id: outletId, financial_year: fy } },
    update: { last_sequence: { increment: 1 } },
    create: { outlet_id: outletId, financial_year: fy, last_sequence: 1 },
  });

  const outlet = await tx.outlet.findUnique({ where: { id: outletId }, select: { code: true } });
  return formatInvoiceNumber(fy, outlet.code, sequence.last_sequence);
}

module.exports = {
  createOrder, getOrderById, listOrders, addItemsToOrder,
  generateKOT, processPayment, voidOrder, updateOrderStatus,
};
