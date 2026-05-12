/**
 * @fileoverview Order service — creates orders, manages items, generates KOTs, processes payments.
 * Region-aware tax engine: AU 10% GST inclusive, IN multi-slab GST exclusive.
 * @module modules/orders/order.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../../utils/errors');
const { generateOrderNumber, parsePagination, getFinancialYear, generateInvoiceNumber: formatInvoiceNumber } = require('../../utils/helpers');
const { calculateItemTax } = require('./tax.service');
const customerService = require('../customers/customer.service');
const { sendOrderReadySms } = require('../../utils/sms.service');

/**
 * Fetch the tax configuration for an outlet by reading its HeadOffice settings.
 * Returns the outletConfig shape expected by calculateItemTax.
 * @param {object} prismaClient - Prisma client (or transaction)
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<{country_code: string, gst_inclusive: boolean, state: string, currency: string}>}
 */
async function getOutletTaxConfig(prismaClient, outletId) {
  const outlet = await prismaClient.outlet.findFirst({
    where: { id: outletId, is_deleted: false },
    select: { state: true, country: true, currency: true, head_office: { select: { country_code: true, gst_inclusive: true, currency: true } } },
  });
  if (!outlet) return { country_code: 'IN', gst_inclusive: false, state: '', currency: 'INR' };

  // Detect country code from multiple signals (head_office > outlet.currency > outlet.country)
  const hoCountry = outlet.head_office?.country_code;
  const isAU = hoCountry === 'AU' || outlet.currency === 'AUD' || outlet.country === 'Australia';
  const countryCode = hoCountry || (isAU ? 'AU' : 'IN');
  // AU GST is inclusive by law — always true for AU regardless of DB default
  // (Prisma defaults gst_inclusive to false; ?? won't override false, only null/undefined)
  const gstInclusive = isAU ? true : (outlet.head_office?.gst_inclusive ?? false);
  const currency = outlet.head_office?.currency || outlet.currency || 'INR';

  return {
    country_code: countryCode,
    gst_inclusive: gstInclusive,
    state: outlet.state || '',
    currency,
  };
}

/**
 * Compute the rounded grand total based on region.
 * - IN: round to nearest whole rupee
 * - AU: round to nearest cent (no rounding) for card; nearest 5 cents for cash
 * @param {number} totalAmount - Total before rounding
 * @param {string} countryCode - 'AU' or 'IN'
 * @returns {{ grandTotal: number, roundOff: number }}
 */
function computeGrandTotal(totalAmount, countryCode) {
  if (countryCode === 'AU') {
    // AU: keep to 2 decimal places (no whole-number rounding)
    const grandTotal = Math.round(totalAmount * 100) / 100;
    const roundOff = Math.round((grandTotal - totalAmount) * 100) / 100;
    return { grandTotal, roundOff };
  }
  // IN (default): round to nearest whole rupee
  const grandTotal = Math.round(totalAmount);
  const roundOff = Math.round((grandTotal - totalAmount) * 100) / 100;
  return { grandTotal, roundOff };
}

/**
 * Recalculate tax totals for all items on an order using the proper tax engine.
 * Used by addItemsToOrder and mergeOrder.
 * @param {object} tx - Prisma transaction client
 * @param {string} orderId - Order UUID
 * @param {object} taxConfig - From getOutletTaxConfig
 * @returns {Promise<{subtotal:number, cgst:number, sgst:number, igst:number, totalTax:number, totalAmount:number, grandTotal:number, roundOff:number}>}
 */
async function recalcOrderTotals(tx, orderId, taxConfig) {
  const allItems = await tx.orderItem.findMany({
    where: { order_id: orderId, is_deleted: false },
  });

  let subtotalPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalTaxPaise = 0;

  for (const oi of allItems) {
    const itemTotal = Number(oi.item_total);
    subtotalPaise += Math.round(itemTotal * 100);

    const tax = calculateItemTax(
      { base_price: itemTotal / Number(oi.quantity), quantity: Number(oi.quantity), gst_rate: Number(oi.gst_rate), is_inclusive: taxConfig.gst_inclusive },
      { country_code: taxConfig.country_code, state: taxConfig.state }
    );

    totalCgstPaise += Math.round(tax.cgst * 100);
    totalSgstPaise += Math.round(tax.sgst * 100);
    totalIgstPaise += Math.round(tax.igst * 100);
    totalTaxPaise += Math.round(tax.total_tax * 100);
  }

  const subtotal = subtotalPaise / 100;
  const totalCgst = totalCgstPaise / 100;
  const totalSgst = totalSgstPaise / 100;
  const totalIgst = totalIgstPaise / 100;
  const totalTax = totalTaxPaise / 100;

  let totalAmount;
  if (taxConfig.gst_inclusive) {
    // Price already includes tax — total is just the subtotal
    totalAmount = subtotal;
  } else {
    totalAmount = subtotal + totalTax;
  }

  const { grandTotal, roundOff } = computeGrandTotal(totalAmount, taxConfig.country_code);

  return { subtotal, cgst: totalCgst, sgst: totalSgst, igst: totalIgst, totalTax, totalAmount, grandTotal, roundOff };
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
      include: { head_office: { select: { country_code: true, gst_inclusive: true, currency: true } } },
    });
    if (!outlet) throw new NotFoundError('Outlet not found or inactive');

    // Tax config for this outlet
    const hoCountry = outlet.head_office?.country_code;
    const isAU = hoCountry === 'AU' || outlet.currency === 'AUD' || outlet.country === 'Australia';
    const countryCode = hoCountry || (isAU ? 'AU' : 'IN');
    // AU GST is inclusive by law — default true when head_office is missing
    const gstInclusive = outlet.head_office?.gst_inclusive ?? (isAU ? true : false);
    const outletTaxConfig = { country_code: countryCode, gst_inclusive: gstInclusive, state: outlet.state || '' };

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

    // Build tax config — pass customer_state for inter-state detection (IN only)
    const customerState = data.delivery_address_state || '';
    const taxCfg = { ...outletTaxConfig, customer_state: customerState };

    let totalCgstPaise = 0;
    let totalSgstPaise = 0;
    let totalIgstPaise = 0;
    let totalTaxPaise = 0;

    for (const oi of orderItemsData) {
      const tax = calculateItemTax(
        { base_price: oi.unit_price + oi.variant_price + (oi.addons_total / oi.quantity), quantity: oi.quantity, gst_rate: oi.gst_rate, is_inclusive: gstInclusive },
        taxCfg
      );
      oi.item_tax = tax.total_tax;
      oi.taxable_amount = tax.taxable_amount;
      totalCgstPaise += Math.round(tax.cgst * 100);
      totalSgstPaise += Math.round(tax.sgst * 100);
      totalIgstPaise += Math.round(tax.igst * 100);
      totalTaxPaise += Math.round(tax.total_tax * 100);
    }

    const totalCgst = totalCgstPaise / 100;
    const totalSgst = totalSgstPaise / 100;
    const totalIgst = totalIgstPaise / 100;
    const totalTax = totalTaxPaise / 100;

    // For inclusive pricing (AU), total is just the subtotal (tax is already inside)
    const totalAmount = gstInclusive ? subtotal : subtotal + totalTax;
    const { grandTotal, roundOff } = computeGrandTotal(totalAmount, countryCode);

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          outlet_id: data.outlet_id,
          order_number: orderNumber,
          order_type: data.order_type || 'dine_in',
          status: data.status || 'created',
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
        data: { order_id: newOrder.id, from_status: null, to_status: data.status || 'created', changed_by: staffId },
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

    // Only emit new_order to POS/KDS if the order is actually active and not pending staff acceptance.
    // Online QR orders start as 'pending' and are announced via 'new_online_order' instead.
    if (fullOrder.status !== 'pending') {
      const io = getIO();
      if (io) {
        io.of('/orders').to(`outlet:${data.outlet_id}`).emit('new_order', fullOrder);
        if (data.table_id) {
          io.of('/orders').to(`outlet:${data.outlet_id}`).emit('table_status_change', {
            table_id: data.table_id, status: 'occupied', order_id: order.id,
          });
        }
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
    const { page, limit, offset, sort: rawSort, order: sortOrder } = parsePagination(query);
    const ALLOWED_SORTS = ['created_at', 'grand_total', 'status', 'order_number', 'updated_at', 'order_type'];
    const sort = ALLOWED_SORTS.includes(rawSort) ? rawSort : 'created_at';
    const where = { outlet_id: outletId, is_deleted: false };

    if (query.status) {
      if (typeof query.status === 'string' && query.status.includes(',')) {
        where.status = { in: query.status.split(',') };
      } else {
        where.status = query.status;
      }
    }
    if (query.order_type) where.order_type = query.order_type;
    if (query.source) where.source = query.source;
    if (query.from && query.to) {
      // Date-only strings like '2026-05-08' parse as UTC midnight.
      // Always expand 'to' to end-of-day UTC so the window covers the full day.
      const fromDate = new Date(query.from);
      const toEnd = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
        toEnd.setUTCHours(23, 59, 59, 999);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
        fromDate.setUTCHours(0, 0, 0, 0);
      }
      where.created_at = { gte: fromDate, lte: toEnd };
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
          payments: { where: { is_deleted: false }, select: { id: true, method: true, amount: true, status: true, processed_at: true } },
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

      // Recalculate full order totals using proper tax engine
      const taxConfig = await getOutletTaxConfig(tx, order.outlet_id);
      const totals = await recalcOrderTotals(tx, orderId, taxConfig);

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: totals.subtotal,
          taxable_amount: totals.subtotal,
          cgst: Math.round(totals.cgst * 100) / 100,
          sgst: Math.round(totals.sgst * 100) / 100,
          igst: Math.round(totals.igst * 100) / 100,
          total_tax: Math.round(totals.totalTax * 100) / 100,
          total_amount: Math.round(totals.totalAmount * 100) / 100,
          round_off: Math.round(totals.roundOff * 100) / 100,
          grand_total: totals.grandTotal,
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
    if (order.status === 'pending') {
      throw new BadRequestError('Cannot generate KOT for a pending online order. Please accept the order first.');
    }

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
        const kotNumber = `KOT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;

        const kot = await tx.kOT.create({
          data: {
            outlet_id: order.outlet_id, order_id: orderId,
            kot_number: kotNumber, station, items_count: items.length,
            status: 'pending',
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
      if (order.status === 'created') {
        io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
          order_id: orderId, status: 'confirmed',
        });
      }
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
        `Payment amount ${paymentData.amount} does not match order total ${order.grand_total}`
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

      await tx.order.update({
        where: { id: orderId },
        data: { 
          is_paid: true, 
          paid_at: new Date(), 
          status: 'paid'
        },
      });

      if (order.table_id) {
        await tx.table.update({
          where: { id: order.table_id },
          data: { status: 'available', current_order_id: null },
        });
      }

      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'paid', changed_by: staffId },
      });

      // --- Inventory deduction (atomic with payment) ---
      const orderWithItems = await tx.order.findFirst({
        where: { id: orderId, is_deleted: false },
        include: { order_items: { where: { is_deleted: false } } },
      });
      const deductionAlerts = [];
      if (orderWithItems) {
        for (const orderItem of orderWithItems.order_items) {
          const recipe = await tx.recipe.findFirst({
            where: { menu_item_id: orderItem.menu_item_id, is_deleted: false },
            include: { ingredients: { include: { inventory_item: true } } },
          });
          if (!recipe) {
            logger.warn('No recipe found for menu item — skipping inventory deduction', { menuItemId: orderItem.menu_item_id, itemName: orderItem.name, orderId });
            continue;
          }
          for (const ingredient of recipe.ingredients) {
            const consumeQty = Number(ingredient.quantity) * orderItem.quantity;
            const stock = await tx.inventoryStock.upsert({
              where: {
                outlet_id_inventory_item_id: {
                  outlet_id: order.outlet_id,
                  inventory_item_id: ingredient.inventory_item_id,
                },
              },
              create: {
                outlet_id: order.outlet_id, inventory_item_id: ingredient.inventory_item_id,
                current_stock: -consumeQty,
              },
              update: { current_stock: { decrement: consumeQty } },
            });
            await tx.stockTransaction.create({
              data: {
                outlet_id: order.outlet_id, inventory_item_id: ingredient.inventory_item_id,
                transaction_type: 'consumption', quantity: -consumeQty,
                reference_type: 'order', reference_id: orderId,
              },
            });
            const newStock = Number(stock.current_stock);
            const minThreshold = Number(ingredient.inventory_item.min_threshold);
            if (newStock <= minThreshold) {
              deductionAlerts.push({
                item_name: ingredient.inventory_item.name,
                current_stock: newStock,
                min_threshold: minThreshold,
                unit: ingredient.inventory_item.unit,
              });
            }
          }
        }
      }

      return { payment, deductionAlerts };
    });

    if (order.customer_id) {
      try {
        await customerService.earnPoints(order.customer_id, order.outlet_id, order.id, Number(order.grand_total));
      } catch (loyaltyErr) {
        logger.warn('Loyalty points failed (non-critical):', loyaltyErr.message);
      }
    }

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

    // Emit low-stock alerts from the atomic deduction that ran inside the transaction
    if (result.deductionAlerts && result.deductionAlerts.length > 0) {
      const ioRef = getIO();
      if (ioRef) {
        for (const alert of result.deductionAlerts) {
          ioRef.of('/orders').to(`outlet:${order.outlet_id}`).emit('low_stock_alert', alert);
        }
      }
    }

    return { payment: result.payment, order: await getOrderById(orderId) };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Generates a bill (invoice) for an order without processing payment.
 * @param {string} orderId - Order UUID
 * @param {string} staffId - Staff generating the bill
 * @returns {Promise<object>} Updated order with invoice number
 */
async function generateBill(orderId, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.is_paid) throw new BadRequestError('Order is already paid');
    if (order.status === 'cancelled') throw new BadRequestError('Cannot bill a cancelled order');
    
    // Prevent re-billing if already has invoice (optional, usually okay to re-print)
    if (order.invoice_number && order.status === 'billed') {
      return await getOrderById(orderId);
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await generateInvoiceNumber(tx, order.outlet_id);

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'billed',
          invoice_number: invoiceNumber,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          order_id: orderId,
          from_status: order.status,
          to_status: 'billed',
          changed_by: staffId,
        },
      });

      return updatedOrder;
    });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
        order_id: orderId, status: 'billed', invoice_number: result.invoice_number
      });
    }

    logger.info('Bill generated', { orderId, invoiceNumber: result.invoice_number });
    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Cancels an order, freeing the table and notifying the kitchen.
 * @param {string} orderId - Order UUID
 * @param {string} reason - Cancellation reason
 * @param {string} staffId - Staff performing cancellation
 * @returns {Promise<object>} Cancelled order
 */
async function cancelOrder(orderId, reason, staffId) {
  const prisma = getDbClient();
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      include: { kots: true, order_items: true }
    });
    if (!order) throw new NotFoundError('Order not found');
    if (order.is_paid) throw new BadRequestError('Cannot cancel a paid order. Use refund instead.');
    if (order.status === 'cancelled') return order;

    await prisma.$transaction(async (tx) => {
      if (order.invoice_number) {
        // CASE A: Bill generated -> Keep record but cancel it
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'cancelled',
            cancelled_at: new Date(),
            cancelled_by: staffId,
            cancel_reason: reason,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            order_id: orderId,
            from_status: order.status,
            to_status: 'cancelled',
            changed_by: staffId,
            reason,
          },
        });

        await tx.auditLog.create({
          data: {
            user_id: staffId,
            outlet_id: order.outlet_id,
            action: 'ORDER_CANCELLED',
            entity_type: 'order',
            entity_id: orderId,
            metadata: { reason },
          },
        });
      } else {
        // CASE B: No bill generated -> SOFT DELETE FULLY (as per constitution)
        // 1. Soft Delete KOT Items
        const kotIds = order.kots.map(k => k.id);
        if (kotIds.length > 0) {
          await tx.kOTItem.updateMany({ 
            where: { kot_id: { in: kotIds } },
            data: { is_deleted: true }
          });
        }
        
        // 2. Soft Delete KOTs
        await tx.kOT.updateMany({ 
          where: { order_id: orderId },
          data: { is_deleted: true }
        });

        // 3. Soft Delete Order Item Addons
        const orderItemIds = order.order_items.map(oi => oi.id);
        if (orderItemIds.length > 0) {
          await tx.orderItemAddon.updateMany({ 
            where: { order_item_id: { in: orderItemIds } },
            data: { is_deleted: true }
          });
        }

        // 4. Soft Delete Order Items
        await tx.orderItem.updateMany({ 
          where: { order_id: orderId },
          data: { is_deleted: true }
        });

        // 5. Soft Delete Status History
        await tx.orderStatusHistory.updateMany({ 
          where: { order_id: orderId },
          data: { is_deleted: true }
        });

        // 6. Soft Delete Loyalty Transactions
        await tx.loyaltyTransaction.updateMany({
          where: { order_id: orderId },
          data: { is_deleted: true }
        });

        // 7. Soft Delete the Order itself
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'cancelled',
            is_deleted: true,
            cancelled_at: new Date(),
            cancelled_by: staffId,
            cancel_reason: reason,
          },
        });
      }

      // Always free the table
      if (order.table_id) {
        await tx.table.update({
          where: { id: order.table_id },
          data: { status: 'available', current_order_id: null },
        });
      }
    });

    const io = getIO();
    if (io) {
      // Notify orders namespace
      io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_status_change', {
        order_id: orderId, status: 'cancelled',
      });
      if (order.table_id) {
        io.of('/orders').to(`outlet:${order.outlet_id}`).emit('table_status_change', {
          table_id: order.table_id, status: 'available',
        });
      }
      // Notify kitchen for cancellation
      io.of('/kitchen').to(`outlet:${order.outlet_id}`).emit('order_cancelled', {
        order_id: orderId,
        order_number: order.order_number,
        reason
      });
    }

    // Restock raw materials used by this order (recipe-based reversal)
    try {
      const inventoryService = require('../inventory/inventory.service');
      await inventoryService.restockFromCancelledOrder(orderId);
      logger.info('Inventory restocked after order cancellation', { orderId });
    } catch (invErr) {
      logger.warn('Restock after cancel failed (non-fatal)', { orderId, error: invErr.message });
    }

    logger.warn('Order cancelled', { orderId, reason, staffId, purged: !order.invoice_number });
    return order.invoice_number ? await getOrderById(orderId) : { id: orderId, status: 'cancelled', purged: true };
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

      if (order.table_id) {
        await tx.table.update({
          where: { id: order.table_id },
          data: { status: 'available', current_order_id: null },
        });
      }
      await tx.orderStatusHistory.create({
        data: { order_id: orderId, from_status: order.status, to_status: 'voided', changed_by: staffId, reason },
      });
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
    const order = await prisma.order.findFirst({
      where: { id: orderId, is_deleted: false },
      include: { outlet: { select: { name: true } } },
    });
    if (!order) throw new NotFoundError('Order not found');

    await prisma.$transaction(async (tx) => {
      // If transitioning to 'paid' via status update, also set is_paid + paid_at
      // so revenue calculations stay consistent with processPayment flow.
      const updateData = { status: newStatus };
      if (newStatus === 'paid' && !order.is_paid) {
        updateData.is_paid = true;
        updateData.paid_at = new Date();
      }
      await tx.order.update({ where: { id: orderId }, data: updateData });
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

    // Notify customer via SMS when food is ready
    if (newStatus === 'ready' && order.customer_phone) {
      const outletName = order.outlet?.name || 'our kitchen';
      sendOrderReadySms(order.customer_phone, order.order_number, outletName).catch(() => {});
    }

    return await getOrderById(orderId);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

async function refundOrder(orderId, data, userId) {
  const prisma = getDbClient();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'paid') throw new BadRequestError('Can only refund paid orders');

  const payment = order.payments.find(p => p.status === 'completed');
  if (!payment) throw new BadRequestError('No completed payment found');

  const refund = await prisma.payment.create({
    data: {
      order_id: orderId, outlet_id: order.outlet_id,
      method: payment.method, amount: -(data.refund_amount || order.grand_total),
      status: 'refunded', transaction_id: `RFND-${Date.now()}`,
    },
  });
  await prisma.order.update({ where: { id: orderId }, data: { status: 'refunded' } });
  logger.info('Order refunded', { orderId, refundAmount: data.refund_amount, userId });
  return refund;
}

async function transferTable(orderId, targetTableId, userId) {
  const prisma = getDbClient();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (!targetTableId) throw new BadRequestError('Target table ID required');

  return prisma.$transaction(async (tx) => {
    // Free old table
    if (order.table_id) {
      await tx.table.update({ where: { id: order.table_id }, data: { status: 'available', current_order_id: null } });
    }
    // Move order to new table
    await tx.order.update({ where: { id: orderId }, data: { table_id: targetTableId } });
    await tx.table.update({ where: { id: targetTableId }, data: { status: 'occupied', current_order_id: orderId } });
    logger.info('Table transferred', { orderId, from: order.table_id, to: targetTableId, userId });
    return { success: true, orderId, newTableId: targetTableId };
  });
}

async function mergeOrder(sourceOrderId, targetOrderId, userId) {
  const prisma = getDbClient();
  if (!targetOrderId || targetOrderId === 'auto') throw new BadRequestError('Valid target order ID required');
  const [source, target] = await Promise.all([
    prisma.order.findUnique({ where: { id: sourceOrderId }, include: { order_items: true } }),
    prisma.order.findUnique({ where: { id: targetOrderId } }),
  ]);
  if (!source || !target) throw new NotFoundError('Source or target order not found');

  return prisma.$transaction(async (tx) => {
    // Move items from source to target
    await tx.orderItem.updateMany({ where: { order_id: sourceOrderId }, data: { order_id: targetOrderId } });
    // Recalculate target totals with proper tax engine
    const taxConfig = await getOutletTaxConfig(tx, target.outlet_id);
    const totals = await recalcOrderTotals(tx, targetOrderId, taxConfig);
    await tx.order.update({
      where: { id: targetOrderId },
      data: {
        subtotal: totals.subtotal,
        taxable_amount: totals.subtotal,
        cgst: Math.round(totals.cgst * 100) / 100,
        sgst: Math.round(totals.sgst * 100) / 100,
        igst: Math.round(totals.igst * 100) / 100,
        total_tax: Math.round(totals.totalTax * 100) / 100,
        total_amount: Math.round(totals.totalAmount * 100) / 100,
        round_off: Math.round(totals.roundOff * 100) / 100,
        grand_total: totals.grandTotal,
      },
    });
    // Cancel source order
    await tx.order.update({ where: { id: sourceOrderId }, data: { status: 'cancelled', notes: `Merged into ${targetOrderId}` } });
    if (source.table_id) {
      await tx.table.update({ where: { id: source.table_id }, data: { status: 'available', current_order_id: null } });
    }
    logger.info('Orders merged', { source: sourceOrderId, target: targetOrderId, userId });
    return { success: true, targetOrderId };
  });
}

async function syncOfflineOrders(orders, userId) {
  const prisma = getDbClient();
  const results = [];
  for (const orderData of orders) {
    try {
      const existing = orderData.id ? await prisma.order.findUnique({ where: { id: orderData.id } }) : null;
      if (existing) { results.push({ id: orderData.id, status: 'exists' }); continue; }
      const order = await createOrder(orderData, userId);
      results.push({ id: order.id, status: 'synced' });
    } catch (err) {
      results.push({ id: orderData.id, status: 'failed', error: err.message });
    }
  }
  return results;
}

module.exports = {
  createOrder, getOrderById, listOrders, addItemsToOrder,
  generateKOT, generateBill, processPayment, cancelOrder, voidOrder, updateOrderStatus,
  generateInvoiceNumber, refundOrder, transferTable, mergeOrder, syncOfflineOrders,
};
