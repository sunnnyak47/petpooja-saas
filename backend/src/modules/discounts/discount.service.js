/**
 * @fileoverview M11: Discounts & Promotions Service
 * CRUD for discount rules, coupon validation, and auto-apply engine.
 * @module modules/discounts/discount.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * Creates a new discount/promo rule.
 * @param {object} data - Discount configuration
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>} Created discount
 */
async function createDiscount(data, outletId) {
  const prisma = getDbClient();
  try {
    const discount = await prisma.discount.create({
      data: {
        outlet_id: outletId,
        name: data.name,
        code: data.code || null,
        type: data.type, // 'percentage', 'flat', 'bogo', 'buy_x_get_y'
        value: data.value || 0,
        min_order_value: data.min_order_value || 0,
        max_discount: data.max_discount || null,
        applicable_on: data.applicable_on || 'all', // 'all', 'category', 'item'
        applicable_ids: data.applicable_ids || [],
        channels: data.channels || ['pos', 'online', 'kiosk'],
        start_date: data.start_date ? new Date(data.start_date) : new Date(),
        end_date: data.end_date ? new Date(data.end_date) : null,
        is_active: data.is_active !== false,
        max_uses: data.max_uses || null,
        max_uses_per_customer: data.max_uses_per_customer || null,
        auto_apply: data.auto_apply || false,
        priority: data.priority || 0,
      },
    });
    logger.info('Discount created', { id: discount.id, name: discount.name });
    return discount;
  } catch (error) {
    logger.error('Create discount failed', { error: error.message });
    throw error;
  }
}

/**
 * Lists all discounts for an outlet.
 * @param {string} outletId - Outlet UUID
 * @param {object} filters - Optional filters
 * @returns {Promise<Array>} Discount list
 */
async function listDiscounts(outletId, filters = {}) {
  const prisma = getDbClient();
  try {
    const where = { outlet_id: outletId, is_deleted: false };
    if (filters.is_active !== undefined) where.is_active = filters.is_active;
    if (filters.type) where.type = filters.type;

    const discounts = await prisma.discount.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
    return discounts;
  } catch (error) {
    logger.error('List discounts failed', { error: error.message });
    throw error;
  }
}

/**
 * Updates a discount rule.
 * @param {string} discountId - Discount UUID
 * @param {object} data - Updated fields
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>} Updated discount
 */
async function updateDiscount(discountId, data, outletId) {
  const prisma = getDbClient();
  try {
    const discount = await prisma.discount.updateMany({
      where: { id: discountId, outlet_id: outletId, is_deleted: false },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
    logger.info('Discount updated', { id: discountId });
    return discount;
  } catch (error) {
    logger.error('Update discount failed', { error: error.message });
    throw error;
  }
}

/**
 * Soft-deletes a discount.
 * @param {string} discountId - Discount UUID
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object>} Deleted discount
 */
async function deleteDiscount(discountId, outletId) {
  const prisma = getDbClient();
  try {
    const result = await prisma.discount.updateMany({
      where: { id: discountId, outlet_id: outletId },
      data: { is_deleted: true, updated_at: new Date() },
    });
    logger.info('Discount deleted', { id: discountId });
    return result;
  } catch (error) {
    logger.error('Delete discount failed', { error: error.message });
    throw error;
  }
}

/**
 * Validates a coupon code against an order.
 * @param {string} code - Coupon code
 * @param {string} outletId - Outlet UUID
 * @param {number} orderTotal - Cart subtotal
 * @param {string} [customerId] - Optional customer UUID
 * @returns {Promise<object>} Validation result with discount info
 */
async function validateCoupon(code, outletId, orderTotal, customerId) {
  const prisma = getDbClient();
  try {
    const discount = await prisma.discount.findFirst({
      where: {
        code: code.toUpperCase(),
        outlet_id: outletId,
        is_active: true,
        is_deleted: false,
      },
    });

    if (!discount) return { valid: false, message: 'Invalid coupon code' };

    const now = new Date();
    if (discount.start_date && now < discount.start_date) {
      return { valid: false, message: 'Coupon not yet active' };
    }
    if (discount.end_date && now > discount.end_date) {
      return { valid: false, message: 'Coupon has expired' };
    }
    if (discount.min_order_value && orderTotal < Number(discount.min_order_value)) {
      return { valid: false, message: `Minimum order ₹${discount.min_order_value} required` };
    }

    if (discount.max_uses) {
      const usageCount = await prisma.discountUsage.count({
        where: { discount_id: discount.id },
      });
      if (usageCount >= discount.max_uses) {
        return { valid: false, message: 'Coupon usage limit reached' };
      }
    }

    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = Math.round((orderTotal * Number(discount.value)) / 100);
      if (discount.max_discount) {
        discountAmount = Math.min(discountAmount, Number(discount.max_discount));
      }
    } else if (discount.type === 'flat') {
      discountAmount = Number(discount.value);
    }

    return {
      valid: true,
      discount: {
        id: discount.id,
        name: discount.name,
        type: discount.type,
        value: Number(discount.value),
        discountAmount,
      },
    };
  } catch (error) {
    logger.error('Validate coupon failed', { error: error.message });
    throw error;
  }
}

/**
 * Returns auto-applicable discounts for a cart.
 * @param {string} outletId - Outlet UUID
 * @param {number} orderTotal - Cart subtotal
 * @param {string} channel - Order channel (pos/online/kiosk)
 * @returns {Promise<Array>} Applicable auto-discounts
 */
async function getAutoDiscounts(outletId, orderTotal, channel = 'pos') {
  const prisma = getDbClient();
  try {
    const now = new Date();
    const discounts = await prisma.discount.findMany({
      where: {
        outlet_id: outletId,
        auto_apply: true,
        is_active: true,
        is_deleted: false,
        OR: [
          { start_date: null },
          { start_date: { lte: now } },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    return discounts
      .filter(d => !d.end_date || now <= d.end_date)
      .filter(d => !d.min_order_value || orderTotal >= Number(d.min_order_value))
      .filter(d => !d.channels || d.channels.length === 0 || d.channels.includes(channel));
  } catch (error) {
    logger.error('Get auto discounts failed', { error: error.message });
    throw error;
  }
}

module.exports = {
  createDiscount,
  listDiscounts,
  updateDiscount,
  deleteDiscount,
  validateCoupon,
  getAutoDiscounts,
};
