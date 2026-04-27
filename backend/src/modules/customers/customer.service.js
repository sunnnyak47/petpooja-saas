/**
 * @fileoverview Customer + Loyalty + CRM service.
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

async function createCustomer(data) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({ where: { phone: data.phone, is_deleted: false } });
  if (existing) throw new ConflictError('Customer with this phone already exists');

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

  await prisma.loyaltyPoints.create({ data: { customer_id: customer.id } });
  logger.info('Customer created', { id: customer.id });
  return customer;
}

async function listCustomers(query = {}) {
  const prisma = getDbClient();
  const { page, limit, offset } = parsePagination(query);
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
      orderBy: { created_at: 'desc' },
      include: {
        loyalty_points: { select: { current_balance: true, total_earned: true, total_redeemed: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { customers, total, page, limit };
}

async function getCustomer(customerId) {
  const prisma = getDbClient();
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false },
    include: {
      addresses: { where: { is_deleted: false } },
      loyalty_points: true,
      loyalty_transactions: {
        orderBy: { created_at: 'desc' },
        take: 30,
        include: {
          outlet: { select: { name: true } },
          order: { select: { order_number: true, grand_total: true } },
        },
      },
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
}

async function findByPhone(phone) {
  const prisma = getDbClient();
  return await prisma.customer.findFirst({
    where: { phone, is_deleted: false },
    include: {
      loyalty_points: { select: { current_balance: true } },
      addresses: { where: { is_deleted: false, is_default: true }, take: 1 },
    },
  });
}

async function updateCustomer(customerId, data) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({ where: { id: customerId, is_deleted: false } });
  if (!existing) throw new NotFoundError('Customer not found');
  if (data.date_of_birth) data.date_of_birth = new Date(data.date_of_birth);
  if (data.anniversary) data.anniversary = new Date(data.anniversary);
  return await prisma.customer.update({ where: { id: customerId }, data });
}

async function deleteCustomer(customerId) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({ where: { id: customerId, is_deleted: false } });
  if (!existing) throw new NotFoundError('Customer not found');
  return await prisma.customer.update({ where: { id: customerId }, data: { is_deleted: true } });
}

async function addAddress(customerId, data) {
  const prisma = getDbClient();
  if (data.is_default) {
    await prisma.customerAddress.updateMany({
      where: { customer_id: customerId, is_deleted: false },
      data: { is_default: false },
    });
  }
  return await prisma.customerAddress.create({ data: { ...data, customer_id: customerId } });
}

/* ============================
   CRM ANALYTICS
   ============================ */

async function getCRMDashboard(outletId) {
  const prisma = getDbClient();

  const [
    totalCustomers,
    segmentCounts,
    topSpenders,
    birthdayUpcoming,
    recentTransactions,
    loyaltyStats,
  ] = await Promise.all([
    prisma.customer.count({ where: { is_deleted: false } }),

    prisma.customer.groupBy({
      by: ['segment'],
      where: { is_deleted: false },
      _count: { id: true },
    }),

    prisma.customer.findMany({
      where: { is_deleted: false },
      orderBy: { total_spend: 'desc' },
      take: 10,
      include: { loyalty_points: { select: { current_balance: true } } },
      select: {
        id: true, full_name: true, phone: true, segment: true,
        total_visits: true, total_spend: true, last_visit_at: true,
        loyalty_points: true,
      },
    }),

    // Birthdays in next 7 days
    prisma.$queryRaw`
      SELECT id, full_name, phone, date_of_birth
      FROM customers
      WHERE is_deleted = false
        AND date_of_birth IS NOT NULL
        AND (
          EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE + INTERVAL '0 days')
          AND EXTRACT(DAY FROM date_of_birth) BETWEEN EXTRACT(DAY FROM CURRENT_DATE) AND EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '7 days')
        )
      LIMIT 20
    `,

    prisma.loyaltyTransaction.findMany({
      where: { outlet_id: outletId },
      orderBy: { created_at: 'desc' },
      take: 10,
      include: { customer: { select: { full_name: true, phone: true } } },
    }),

    prisma.loyaltyPoints.aggregate({
      _sum: { current_balance: true, total_earned: true, total_redeemed: true },
    }),
  ]);

  const segmentMap = {};
  for (const s of segmentCounts) segmentMap[s.segment] = s._count.id;

  return {
    total_customers: totalCustomers,
    segments: {
      new: segmentMap.new || 0,
      regular: segmentMap.regular || 0,
      vip: segmentMap.vip || 0,
      lapsed: segmentMap.lapsed || 0,
    },
    top_spenders: topSpenders,
    birthday_upcoming: birthdayUpcoming,
    recent_transactions: recentTransactions,
    loyalty_stats: {
      total_points_outstanding: loyaltyStats._sum.current_balance || 0,
      total_points_earned: loyaltyStats._sum.total_earned || 0,
      total_points_redeemed: loyaltyStats._sum.total_redeemed || 0,
    },
    loyalty_config: {
      earn_per_amount: appConfig.loyalty.earnPerAmount,
      earn_rate: appConfig.loyalty.earnRate,
      redeem_value: appConfig.loyalty.redeemValue,
      min_redemption: appConfig.loyalty.minRedemption,
    },
  };
}

async function getBirthdayCustomers(daysAhead = 7) {
  const prisma = getDbClient();
  return await prisma.$queryRaw`
    SELECT id, full_name, phone, email, date_of_birth,
           EXTRACT(DAY FROM date_of_birth) as birth_day,
           EXTRACT(MONTH FROM date_of_birth) as birth_month
    FROM customers
    WHERE is_deleted = false
      AND date_of_birth IS NOT NULL
      AND TO_CHAR(date_of_birth, 'MM-DD') BETWEEN
          TO_CHAR(CURRENT_DATE, 'MM-DD') AND
          TO_CHAR(CURRENT_DATE + (${daysAhead} || ' days')::INTERVAL, 'MM-DD')
    ORDER BY TO_CHAR(date_of_birth, 'MM-DD')
    LIMIT 50
  `;
}

/* ============================
   LOYALTY SYSTEM
   ============================ */

async function earnPoints(customerId, outletId, orderId, orderAmount) {
  const prisma = getDbClient();
  // earnRate points per earnPerAmount rupees
  const pointsEarned = Math.floor((orderAmount / appConfig.loyalty.earnPerAmount) * appConfig.loyalty.earnRate);
  if (pointsEarned <= 0) return { points_earned: 0, new_balance: 0 };

  const result = await prisma.$transaction(async (tx) => {
    const loyalty = await tx.loyaltyPoints.upsert({
      where: { customer_id: customerId },
      create: { customer_id: customerId, total_earned: pointsEarned, current_balance: pointsEarned },
      update: { total_earned: { increment: pointsEarned }, current_balance: { increment: pointsEarned } },
    });

    await tx.loyaltyTransaction.create({
      data: {
        customer_id: customerId,
        outlet_id: outletId,
        order_id: orderId,
        type: 'earn',
        points: pointsEarned,
        balance_after: loyalty.current_balance,
        description: `Earned ${pointsEarned} pts on ₹${orderAmount}`,
      },
    });

    await tx.customer.update({
      where: { id: customerId },
      data: { total_visits: { increment: 1 }, total_spend: { increment: orderAmount }, last_visit_at: new Date() },
    });

    return loyalty;
  });

  await updateSegment(customerId);
  return { points_earned: pointsEarned, new_balance: result.current_balance };
}

async function redeemPoints(customerId, outletId, orderId, points) {
  const prisma = getDbClient();
  const loyalty = await prisma.loyaltyPoints.findFirst({ where: { customer_id: customerId } });
  if (!loyalty || loyalty.current_balance < points) {
    throw new BadRequestError(`Insufficient points. Available: ${loyalty?.current_balance || 0}`);
  }
  if (points < appConfig.loyalty.minRedemption) {
    throw new BadRequestError(`Minimum ${appConfig.loyalty.minRedemption} points required to redeem`);
  }

  const discountAmount = points * appConfig.loyalty.redeemValue;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.loyaltyPoints.update({
      where: { customer_id: customerId },
      data: { total_redeemed: { increment: points }, current_balance: { decrement: points } },
    });

    await tx.loyaltyTransaction.create({
      data: {
        customer_id: customerId,
        outlet_id: outletId,
        order_id: orderId || null,
        type: 'redeem',
        points: -points,
        balance_after: updated.current_balance,
        description: `Redeemed ${points} pts for ₹${discountAmount.toFixed(2)} discount`,
      },
    });

    return updated;
  });

  return { discount_amount: discountAmount, remaining_balance: result.current_balance };
}

async function adjustPoints(customerId, outletId, points, reason) {
  const prisma = getDbClient();
  const customer = await prisma.customer.findFirst({ where: { id: customerId, is_deleted: false } });
  if (!customer) throw new NotFoundError('Customer not found');

  const loyalty = await prisma.loyaltyPoints.upsert({
    where: { customer_id: customerId },
    create: { customer_id: customerId, total_earned: Math.max(0, points), current_balance: Math.max(0, points) },
    update: points > 0
      ? { total_earned: { increment: points }, current_balance: { increment: points } }
      : { current_balance: { increment: points } },
  });

  await prisma.loyaltyTransaction.create({
    data: {
      customer_id: customerId,
      outlet_id: outletId,
      type: points > 0 ? 'earn' : 'redeem',
      points,
      balance_after: loyalty.current_balance,
      description: reason || 'Manual adjustment',
    },
  });

  return loyalty;
}

async function updateSegment(customerId) {
  const prisma = getDbClient();
  const customer = await prisma.customer.findFirst({ where: { id: customerId, is_deleted: false } });
  if (!customer) return;

  const daysSince = customer.last_visit_at
    ? Math.floor((Date.now() - new Date(customer.last_visit_at).getTime()) / 86400000)
    : 999;

  let newSegment = 'new';
  if (daysSince > 90) newSegment = 'lapsed';
  else if (customer.total_visits >= 20 || Number(customer.total_spend) >= 15000) newSegment = 'vip';
  else if (customer.total_visits >= 5) newSegment = 'regular';

  if (newSegment !== customer.segment) {
    await prisma.customer.update({ where: { id: customerId }, data: { segment: newSegment } });
  }
}

async function getLoyaltyHistory(customerId, query = {}) {
  const prisma = getDbClient();
  const { page, limit, offset } = parsePagination(query);

  const [transactions, total, summary] = await Promise.all([
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
    prisma.loyaltyPoints.findFirst({ where: { customer_id: customerId } }),
  ]);

  return { transactions, total, page, limit, summary };
}

/* ============================
   CAMPAIGNS
   ============================ */

async function createCampaign(outletId, data) {
  const prisma = getDbClient();

  const where = { is_deleted: false };
  if (data.target_segment && data.target_segment !== 'all') where.segment = data.target_segment;

  const customers = await prisma.customer.findMany({
    where,
    select: { id: true, phone: true, email: true, full_name: true },
  });

  if (customers.length === 0) throw new BadRequestError('No customers in target segment');

  const campaign = await prisma.campaign.create({
    data: {
      outlet_id: outletId,
      name: data.name,
      type: data.type || 'sms',
      target_segment: data.target_segment || 'all',
      message_template: data.message,
      total_recipients: customers.length,
      status: data.schedule_at ? 'scheduled' : 'sent',
      sent_at: data.schedule_at ? null : new Date(),
      scheduled_at: data.schedule_at ? new Date(data.schedule_at) : null,
    },
  });

  // Simulate message send (in production: Twilio / MSG91 / WhatsApp Business API)
  // await notificationService.sendBulk(customers, data.message, data.type);

  const logs = customers.map(c => ({
    campaign_id: campaign.id,
    customer_id: c.id,
    status: 'sent',
  }));
  await prisma.campaignLog.createMany({ data: logs });

  if (!data.schedule_at) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { sent_count: customers.length, delivered_count: customers.length },
    });
  }

  logger.info('Campaign created', { id: campaign.id, recipients: customers.length });
  return { ...campaign, total_recipients: customers.length };
}

async function getCampaigns(outletId, query = {}) {
  const prisma = getDbClient();
  const { page, limit, offset } = parsePagination(query);

  const where = { is_deleted: false };
  if (outletId) where.outlet_id = outletId;
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.campaign.count({ where }),
  ]);

  return { campaigns, total, page, limit };
}

async function getCampaignDetail(campaignId) {
  const prisma = getDbClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, is_deleted: false },
    include: {
      campaign_logs: {
        take: 20,
        orderBy: { sent_at: 'desc' },
      },
    },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  return campaign;
}

async function sendBirthdayCampaign(outletId, messageTemplate) {
  const prisma = getDbClient();
  // Customers whose birthday is today
  const customers = await prisma.$queryRaw`
    SELECT id, full_name, phone, email
    FROM customers
    WHERE is_deleted = false
      AND date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM CURRENT_DATE)
  `;

  if (!customers || customers.length === 0) {
    return { sent: 0, message: 'No birthdays today' };
  }

  const template = messageTemplate || 'Happy Birthday {name}! 🎂 Enjoy 10% off your next visit with code BDAY10. From Team MS-RM!';

  const campaign = await prisma.campaign.create({
    data: {
      outlet_id: outletId,
      name: `Birthday Campaign — ${new Date().toDateString()}`,
      type: 'sms',
      target_segment: 'birthday',
      message_template: template,
      total_recipients: customers.length,
      status: 'sent',
      sent_at: new Date(),
      sent_count: customers.length,
      delivered_count: customers.length,
    },
  });

  const logs = customers.map(c => ({
    campaign_id: campaign.id,
    customer_id: c.id,
    status: 'sent',
  }));
  await prisma.campaignLog.createMany({ data: logs });

  return { sent: customers.length, campaign_id: campaign.id };
}

module.exports = {
  createCustomer, listCustomers, getCustomer, findByPhone, updateCustomer, deleteCustomer,
  addAddress,
  getCRMDashboard, getBirthdayCustomers,
  earnPoints, redeemPoints, adjustPoints, getLoyaltyHistory, updateSegment,
  createCampaign, getCampaigns, getCampaignDetail, sendBirthdayCampaign,
};
