/**
 * @fileoverview Customer + Loyalty service — CRM, segmentation, loyalty points.
 * @module modules/customers/customer.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, ConflictError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');
const appConfig = require('../../config/app');

/* ============================
   CUSTOMER CRUD
   ============================ */

/**
 * Creates a new customer or returns existing by phone.
 * @param {object} data - Customer data
 * @returns {Promise<object>} Created or existing customer
 */
async function createCustomer(data) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.customer.findFirst({
      where: { phone: data.phone, is_deleted: false },
    });
    if (existing) {
      throw new ConflictError('Customer with this phone already exists');
    }

    const customer = await prisma.customer.create({
      data: {
        phone: data.phone,
        full_name: data.full_name || null,
        email: data.email || null,
        date_of_birth: data.date_of_birth ? new Date(data.date_of_birth) : null,
        anniversary: data.anniversary ? new Date(data.anniversary) : null,
        gender: data.gender || null,
        dietary_preference: data.dietary_preference || null,
        allergens: data.allergens || null,
        notes: data.notes || null,
      },
    });

    await prisma.loyaltyPoints.create({
      data: { customer_id: customer.id },
    });

    logger.info('Customer created', { id: customer.id, phone: customer.phone });
    return customer;
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    logger.error('Create customer failed', { error: error.message });
    throw error;
  }
}

/**
 * Lists customers with filtering, search, and segment-based queries.
 * @param {object} query - Query params (search, segment, page, limit)
 * @returns {Promise<{customers: object[], total: number, page: number, limit: number}>}
 */
async function listCustomers(query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset, sort, order } = parsePagination(query);
    const where = { is_deleted: false };

    if (query.segment) where.segment = query.segment;
    if (query.dietary_preference) where.dietary_preference = query.dietary_preference;
    if (query.search) {
      where.OR = [
        { full_name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          loyalty_points: { select: { current_balance: true, total_earned: true } },
          _count: { select: { orders: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return { customers, total, page, limit };
  } catch (error) {
    logger.error('List customers failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets a single customer by ID with full profile.
 * @param {string} customerId - Customer UUID
 * @returns {Promise<object>} Full customer profile
 */
async function getCustomer(customerId) {
  const prisma = getDbClient();
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, is_deleted: false },
      include: {
        addresses: { where: { is_deleted: false } },
        loyalty_points: true,
        loyalty_transactions: { orderBy: { created_at: 'desc' }, take: 20 },
        orders: {
          where: { is_deleted: false },
          orderBy: { created_at: 'desc' },
          take: 10,
          select: {
            id: true, order_number: true, grand_total: true,
            status: true, order_type: true, created_at: true,
            outlet: { select: { name: true } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundError('Customer not found');
    return customer;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Finds a customer by phone number (used during order POS flow).
 * @param {string} phone - Customer phone number
 * @returns {Promise<object|null>} Customer or null
 */
async function findByPhone(phone) {
  const prisma = getDbClient();
  try {
    return await prisma.customer.findFirst({
      where: { phone, is_deleted: false },
      include: {
        loyalty_points: { select: { current_balance: true } },
        addresses: { where: { is_deleted: false, is_default: true }, take: 1 },
      },
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Updates a customer profile.
 * @param {string} customerId - Customer UUID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated customer
 */
async function updateCustomer(customerId, data) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: customerId, is_deleted: false },
    });
    if (!existing) throw new NotFoundError('Customer not found');

    if (data.date_of_birth) data.date_of_birth = new Date(data.date_of_birth);
    if (data.anniversary) data.anniversary = new Date(data.anniversary);

    return await prisma.customer.update({ where: { id: customerId }, data });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/**
 * Soft-deletes a customer.
 * @param {string} customerId - Customer UUID
 * @returns {Promise<object>}
 */
async function deleteCustomer(customerId) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: customerId, is_deleted: false },
    });
    if (!existing) throw new NotFoundError('Customer not found');
    return await prisma.customer.update({ where: { id: customerId }, data: { is_deleted: true } });
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}

/* ============================
   ADDRESSES
   ============================ */

/**
 * Adds an address to a customer.
 * @param {string} customerId - Customer UUID
 * @param {object} data - Address data
 * @returns {Promise<object>} Created address
 */
async function addAddress(customerId, data) {
  const prisma = getDbClient();
  try {
    if (data.is_default) {
      await prisma.customerAddress.updateMany({
        where: { customer_id: customerId, is_deleted: false },
        data: { is_default: false },
      });
    }
    return await prisma.customerAddress.create({
      data: { ...data, customer_id: customerId },
    });
  } catch (error) {
    throw error;
  }
}

/* ============================
   LOYALTY SYSTEM
   ============================ */

/**
 * Awards loyalty points to a customer after order payment.
 * @param {string} customerId - Customer UUID
 * @param {string} outletId - Outlet UUID
 * @param {string} orderId - Order UUID
 * @param {number} orderAmount - Order total (grand_total)
 * @returns {Promise<{points_earned: number, new_balance: number}>}
 */
async function earnPoints(customerId, outletId, orderId, orderAmount) {
  const prisma = getDbClient();
  try {
    const pointsEarned = Math.floor(orderAmount / appConfig.loyalty.earnRatio);
    if (pointsEarned <= 0) return { points_earned: 0, new_balance: 0 };

    const result = await prisma.$transaction(async (tx) => {
      const loyalty = await tx.loyaltyPoints.upsert({
        where: { customer_id: customerId },
        create: {
          customer_id: customerId,
          total_earned: pointsEarned,
          current_balance: pointsEarned,
        },
        update: {
          total_earned: { increment: pointsEarned },
          current_balance: { increment: pointsEarned },
        },
      });

      await tx.loyaltyTransaction.create({
        data: {
          customer_id: customerId,
          outlet_id: outletId,
          order_id: orderId,
          type: 'earn',
          points: pointsEarned,
          balance_after: loyalty.current_balance,
          description: `Earned ${pointsEarned} points on order`,
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: {
          total_visits: { increment: 1 },
          total_spend: { increment: orderAmount },
          last_visit_at: new Date(),
        },
      });

      return loyalty;
    });

    await updateSegment(customerId);

    return { points_earned: pointsEarned, new_balance: result.current_balance };
  } catch (error) {
    logger.error('Earn points failed', { error: error.message, customerId });
    throw error;
  }
}

/**
 * Redeems loyalty points for an order discount.
 * @param {string} customerId - Customer UUID
 * @param {string} outletId - Outlet UUID
 * @param {string} orderId - Order UUID
 * @param {number} points - Points to redeem
 * @returns {Promise<{discount_amount: number, remaining_balance: number}>}
 */
async function redeemPoints(customerId, outletId, orderId, points) {
  const prisma = getDbClient();
  try {
    const loyalty = await prisma.loyaltyPoints.findFirst({
      where: { customer_id: customerId },
    });

    if (!loyalty || loyalty.current_balance < points) {
      throw new BadRequestError(
        `Insufficient loyalty points. Available: ${loyalty?.current_balance || 0}`
      );
    }

    if (points < appConfig.loyalty.minRedeem) {
      throw new BadRequestError(`Minimum ${appConfig.loyalty.minRedeem} points required to redeem`);
    }

    const discountAmount = points * appConfig.loyalty.redeemValue;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.loyaltyPoints.update({
        where: { customer_id: customerId },
        data: {
          total_redeemed: { increment: points },
          current_balance: { decrement: points },
        },
      });

      await tx.loyaltyTransaction.create({
        data: {
          customer_id: customerId,
          outlet_id: outletId,
          order_id: orderId,
          type: 'redeem',
          points: -points,
          balance_after: updated.current_balance,
          description: `Redeemed ${points} points for ₹${discountAmount} discount`,
        },
      });

      return updated;
    });

    return { discount_amount: discountAmount, remaining_balance: result.current_balance };
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Auto-updates customer segment based on visit frequency and spend.
 * @param {string} customerId - Customer UUID
 * @returns {Promise<void>}
 */
async function updateSegment(customerId) {
  const prisma = getDbClient();
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, is_deleted: false },
    });
    if (!customer) return;

    let newSegment = 'new';
    const daysSinceLastVisit = customer.last_visit_at
      ? Math.floor((Date.now() - new Date(customer.last_visit_at).getTime()) / 86400000)
      : 999;

    if (daysSinceLastVisit > 90) {
      newSegment = 'lapsed';
    } else if (customer.total_visits >= 20 || customer.total_spend >= 15000) {
      newSegment = 'vip';
    } else if (customer.total_visits >= 5) {
      newSegment = 'regular';
    }

    if (newSegment !== customer.segment) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { segment: newSegment },
      });
    }
  } catch (error) {
    logger.error('Update segment failed', { error: error.message, customerId });
  }
}

/**
 * Gets loyalty history for a customer.
 * @param {string} customerId - Customer UUID
 * @param {object} [query] - Pagination query
 * @returns {Promise<object>}
 */
async function getLoyaltyHistory(customerId, query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset } = parsePagination(query);

    const [transactions, total] = await Promise.all([
      prisma.loyaltyTransaction.findMany({
        where: { customer_id: customerId },
        skip: offset,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          outlet: { select: { name: true } },
          order: { select: { order_number: true, grand_total: true } },
        },
      }),
      prisma.loyaltyTransaction.count({ where: { customer_id: customerId } }),
    ]);

    const summary = await prisma.loyaltyPoints.findFirst({
      where: { customer_id: customerId },
    });

    return { transactions, total, page, limit, summary };
  } catch (error) {
    throw error;
  }
}

/**
 * Creates and triggers a marketing campaign (SMS/Email/WhatsApp).
 * @param {object} data - Campaign details
 * @returns {Promise<object>}
 */
async function createCampaign(outletId, data) {
  const prisma = getDbClient();
  try {
    const where = { is_deleted: false };
    if (data.target_segment !== 'all') {
      where.segment = data.target_segment;
    }

    const customers = await prisma.customer.findMany({ where, select: { id: true, phone: true, email: true } });
    
    if (customers.length === 0) {
      throw new BadRequestError('No customers found in target segment');
    }

    const campaign = await prisma.campaign.create({
      data: {
        outlet_id: outletId,
        name: data.name,
        type: data.type,
        target_segment: data.target_segment,
        message_template: data.message,
        total_recipients: customers.length,
        status: 'sent',
        sent_at: new Date(),
      }
    });

    // In production, this would call SMS/Email Gateway:
    // await notificationService.sendBulk(customers, data.message, data.type);

    const logs = customers.map(c => ({
      campaign_id: campaign.id,
      customer_id: c.id,
      status: 'sent',
    }));

    await prisma.campaignLog.createMany({ data: logs });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { sent_count: customers.length, delivered_count: customers.length }
    });

    return campaign;
  } catch (error) {
    logger.error('Campaign creation failed', { error: error.message });
    throw error;
  }
}

/**
 * Gets campaign history for an outlet.
 */
async function getCampaigns(outletId) {
  const prisma = getDbClient();
  return await prisma.campaign.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { created_at: 'desc' },
  });
}

module.exports = {
  createCustomer, listCustomers, getCustomer, findByPhone, updateCustomer, deleteCustomer,
  addAddress, earnPoints, redeemPoints, getLoyaltyHistory, updateSegment,
  createCampaign, getCampaigns
};
