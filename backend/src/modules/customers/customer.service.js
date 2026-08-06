/**
 * @fileoverview Customer + Loyalty + CRM service.
 * @module modules/customers/customer.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, ConflictError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');
const appConfig = require('../../config/app');
// Real SMS/WhatsApp gateway. Dispatches through MSG91 (SMS) / Meta WhatsApp when
// their provider env is configured, and no-ops to a [DEV] log otherwise — so the
// campaign send path is safe with or without gateway credentials set.
const notifications = require('../integrations/notification.service');

/* ============================
   TENANT SCOPING HELPERS
   ============================ */

/**
 * Build the Prisma filter that restricts a Customer query to the caller's
 * tenant. Customers have no head_office_id/outlet_id column — they belong to a
 * tenant only via their orders (Order.outlet_id -> Outlet.head_office_id).
 *
 * @param {{ role?: string, head_office_id?: string }} [caller]
 * @returns {Promise<object>} A `where`-fragment to spread into the query.
 *   - super_admin (or no caller context): {} (sees all tenants).
 *   - tenant user: requires >=1 order in an outlet of the caller's head office.
 */
async function tenantScopeFilter(caller) {
  // super_admin (and internal/unauthenticated callers) bypass tenant scoping.
  if (!caller || caller.role === 'super_admin' || !caller.head_office_id) return {};
  return {
    orders: { some: { outlet: { head_office_id: caller.head_office_id } } },
  };
}

/* ============================
   CUSTOMER CRUD
   ============================ */

async function createCustomer(data, caller) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({ where: { phone: data.phone, is_deleted: false } });
  if (existing) throw new ConflictError('Customer with this phone already exists');

  const customer = await prisma.customer.create({
    data: {
      phone: data.phone,
      // Stamp the creating tenant so a just-created (order-less) customer is
      // scoped to its own head office and doesn't leak into other tenants.
      head_office_id: caller?.head_office_id || data.head_office_id || null,
      full_name: data.full_name || null,
      email: data.email || null,
      date_of_birth: data.date_of_birth ? new Date(data.date_of_birth) : null,
      anniversary: data.anniversary ? new Date(data.anniversary) : null,
      gender: data.gender || null,
      dietary_preference: data.dietary_preference || null,
      allergens: data.allergens || null,
      notes: data.notes || null,
      // Marketing segment chosen at signup (defaults to 'new'); later auto-managed
      // by updateSegment() as the customer transacts.
      segment: data.segment || 'new',
      // Marketing-campaign consent captured on the create form (DPDP basis).
      ...(data.marketing_consent !== undefined
        ? {
            marketing_consent: !!data.marketing_consent,
            consent_at: data.marketing_consent ? new Date() : null,
            consent_source: data.marketing_consent ? 'pos' : null,
          }
        : {}),
    },
  });

  await prisma.loyaltyPoints.create({ data: { customer_id: customer.id } });
  logger.info('Customer created', { id: customer.id });
  return customer;
}

async function listCustomers(outletId, query = {}, caller) {
  const prisma = getDbClient();
  const { page, limit, offset } = parsePagination(query);
  const where = { is_deleted: false };
  // Tenant scope (orders in caller's head office) AND optional single-outlet
  // filter are combined so a forged ?outlet_id cannot escape the tenant.
  const scopeAnd = [];
  const tenantFilter = await tenantScopeFilter(caller);
  if (Object.keys(tenantFilter).length) scopeAnd.push(tenantFilter);
  if (outletId) scopeAnd.push({ orders: { some: { outlet_id: outletId, is_deleted: false } } });
  if (scopeAnd.length) {
    // A just-created customer has no orders yet, so the order-based scope would
    // hide it — the "added successfully but never shows in the list" bug. We now
    // stamp head_office_id on create, so surface order-less customers of THIS
    // tenant only (not globally, which leaked every tenant's fresh customers).
    // Once they place their first order they also match the order-based branch.
    const orBranches = [{ AND: scopeAnd }];
    if (caller?.head_office_id) orBranches.push({ head_office_id: caller.head_office_id });
    where.AND = [{ OR: orBranches }];
  }
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

async function getCustomer(customerId, caller) {
  const prisma = getDbClient();
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false, ...(await tenantScopeFilter(caller)) },
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

async function findByPhone(phone, caller) {
  const prisma = getDbClient();
  return await prisma.customer.findFirst({
    where: { phone, is_deleted: false, ...(await tenantScopeFilter(caller)) },
    include: {
      loyalty_points: { select: { current_balance: true } },
      addresses: { where: { is_deleted: false, is_default: true }, take: 1 },
    },
  });
}

async function updateCustomer(customerId, data, caller) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false, ...(await tenantScopeFilter(caller)) },
  });
  if (!existing) throw new NotFoundError('Customer not found');
  if (data.date_of_birth) data.date_of_birth = new Date(data.date_of_birth);
  if (data.anniversary) data.anniversary = new Date(data.anniversary);
  return await prisma.customer.update({ where: { id: customerId }, data });
}

async function deleteCustomer(customerId, caller) {
  const prisma = getDbClient();
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false, ...(await tenantScopeFilter(caller)) },
  });
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
    prisma.customer.count({ where: { is_deleted: false, ...(outletId ? { orders: { some: { outlet_id: outletId } } } : {}) } }),

    prisma.customer.groupBy({
      by: ['segment'],
      where: { is_deleted: false, ...(outletId ? { orders: { some: { outlet_id: outletId } } } : {}) },
      _count: { id: true },
    }),

    prisma.customer.findMany({
      where: { is_deleted: false, ...(outletId ? { orders: { some: { outlet_id: outletId } } } : {}) },
      orderBy: { total_spend: 'desc' },
      take: 10,
      select: {
        id: true, full_name: true, phone: true, segment: true,
        total_visits: true, total_spend: true, last_visit_at: true,
        loyalty_points: { select: { current_balance: true } },
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

    // Scope loyalty totals to the outlet like every other metric above; without
    // a where clause the aggregate summed balances across ALL outlets/tenants in
    // the single-DB row-level-tenant model even when an outletId was supplied.
    prisma.loyaltyPoints.aggregate({
      where: { is_deleted: false, ...(outletId ? { customer: { orders: { some: { outlet_id: outletId } } } } : {}) },
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
    loyalty_config: await getLoyaltyConfig(outletId),
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
      AND (
        CASE WHEN TO_CHAR(CURRENT_DATE + (${daysAhead} || ' days')::INTERVAL, 'MM-DD') >= TO_CHAR(CURRENT_DATE, 'MM-DD')
        THEN TO_CHAR(date_of_birth, 'MM-DD') BETWEEN TO_CHAR(CURRENT_DATE, 'MM-DD') AND TO_CHAR(CURRENT_DATE + (${daysAhead} || ' days')::INTERVAL, 'MM-DD')
        ELSE (TO_CHAR(date_of_birth, 'MM-DD') >= TO_CHAR(CURRENT_DATE, 'MM-DD') OR TO_CHAR(date_of_birth, 'MM-DD') <= TO_CHAR(CURRENT_DATE + (${daysAhead} || ' days')::INTERVAL, 'MM-DD'))
        END
      )
    ORDER BY TO_CHAR(date_of_birth, 'MM-DD')
    LIMIT 50
  `;
}

/* ============================
   LOYALTY SYSTEM
   ============================ */

async function earnPoints(customerId, outletId, orderId, orderAmount) {
  const prisma = getDbClient();
  // Use per-outlet config so each outlet can run their own programme.
  const cfg = await getLoyaltyConfig(outletId);
  if (!cfg.enabled) return { points_earned: 0, new_balance: 0 };
  const pointsEarned = Math.floor((orderAmount / cfg.earn_per_amount) * cfg.earn_rate);
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
  const cfg = await getLoyaltyConfig(outletId);
  if (points < cfg.min_redemption) {
    throw new BadRequestError(`Minimum ${cfg.min_redemption} points required to redeem`);
  }

  const discountAmount = points * cfg.redeem_value;

  const result = await prisma.$transaction(async (tx) => {
    // Atomic guarded decrement — the `current_balance >= points` predicate in the
    // WHERE is what makes concurrent redeems safe. The pre-check above is only a
    // fast-fail; without this guard two concurrent /loyalty/redeem calls could both
    // pass the read-time check and overspend, driving the signed Int current_balance
    // negative (there is no DB check constraint).
    const dec = await tx.loyaltyPoints.updateMany({
      where: { customer_id: customerId, current_balance: { gte: points } },
      data: { total_redeemed: { increment: points }, current_balance: { decrement: points } },
    });
    if (dec.count !== 1) throw new BadRequestError('Insufficient points');

    // Re-read to capture the post-decrement balance for the transaction record.
    const updated = await tx.loyaltyPoints.findFirst({ where: { customer_id: customerId } });

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

async function adjustPoints(customerId, outletId, points, reason, caller) {
  const prisma = getDbClient();
  // Tenant-scope the lookup so a tenant-A staff member cannot mutate a tenant-B
  // customer's loyalty by UUID (cross-tenant IDOR); a cross-tenant id 404s.
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false, ...(await tenantScopeFilter(caller)) },
  });
  if (!customer) throw new NotFoundError('Customer not found');

  // Read the current balance so a negative adjustment cannot drive current_balance
  // below zero (Int column, no DB floor). For a decrement we set an explicit
  // clamped value instead of an unbounded increment of a negative number.
  const current = await prisma.loyaltyPoints.findFirst({ where: { customer_id: customerId } });
  const currentBalance = current?.current_balance || 0;

  const loyalty = await prisma.loyaltyPoints.upsert({
    where: { customer_id: customerId },
    create: { customer_id: customerId, total_earned: Math.max(0, points), current_balance: Math.max(0, points) },
    update: points > 0
      ? { total_earned: { increment: points }, current_balance: { increment: points } }
      : { current_balance: Math.max(0, currentBalance + points) },
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

async function getLoyaltyHistory(customerId, query = {}, caller) {
  const prisma = getDbClient();
  const { page, limit, offset } = parsePagination(query);

  // Tenant-scope: verify the customer belongs to the caller's tenant before
  // returning their loyalty history — this function previously did no customer
  // check at all, so a tenant-A user could read a tenant-B customer's ledger.
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, is_deleted: false, ...(await tenantScopeFilter(caller)) },
  });
  if (!customer) throw new NotFoundError('Customer not found');

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

/**
 * Dispatch a campaign's messages through the REAL SMS/WhatsApp gateway
 * (notification.service). This is the send path the assistant's send_campaign
 * action drives — it is no longer a simulation.
 *
 * Safety:
 *   - The gateway degrades to a [DEV] log (returning `{ mode:'dev' }`) when the
 *     provider env (MSG91_AUTH_KEY / WHATSAPP_TOKEN + WHATSAPP_PHONE_ID) is unset,
 *     so calling this with no credentials configured is a graceful no-op-send.
 *   - A per-recipient failure is caught and recorded as `failed`; it never aborts
 *     the batch or throws out of createCampaign (mirrors the "notify failures must
 *     not crash the flow" pattern used elsewhere).
 *
 * @param {Array<{id:string, phone?:string, email?:string, full_name?:string}>} customers
 * @param {{type?:string, message:string, template_name?:string}} data
 * @returns {Promise<Array<{customer_id:string, status:'sent'|'failed'}>>}
 */
async function dispatchCampaign(customers, data) {
  const channel = String(data.type || 'sms').toLowerCase();
  const results = [];
  for (const c of customers) {
    let ok = true;
    try {
      if (channel === 'whatsapp') {
        if (!c.phone) throw new Error('no phone on file');
        // Marketing WhatsApp is delivered via an approved template with the
        // campaign copy passed as the body parameter.
        await notifications.sendWhatsApp(c.phone, data.template_name || 'campaign', [data.message]);
      } else if (channel === 'email') {
        // Email campaigns are delivered by the mail pipeline, not the SMS/WhatsApp
        // gateway — nothing to dispatch here.
        ok = true;
      } else {
        // sms / text — MSG91 transactional route.
        if (!c.phone) throw new Error('no phone on file');
        await notifications.sendSMS(c.phone, data.message);
      }
    } catch (err) {
      ok = false;
      logger.warn('Campaign message dispatch failed', { customer_id: c.id, channel, error: err.message });
    }
    results.push({ customer_id: c.id, status: ok ? 'sent' : 'failed' });
  }
  return results;
}

async function createCampaign(outletId, data) {
  const prisma = getDbClient();

  // Scope customers to those who have placed at least one order at this outlet
  const where = { is_deleted: false };
  if (outletId) where.orders = { some: { outlet_id: outletId, is_deleted: false } };
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

  // Immediate campaigns dispatch NOW through the real SMS/WhatsApp gateway
  // (notification.service). It no-ops to a [DEV] log when the provider env is
  // unset, so this is safe unconfigured; a per-recipient failure is recorded, not
  // thrown. Scheduled campaigns are sent later by their scheduler — not here.
  const results = data.schedule_at
    ? customers.map((c) => ({ customer_id: c.id, status: 'sent' }))
    : await dispatchCampaign(customers, data);

  const logs = results.map((r) => ({
    campaign_id: campaign.id,
    customer_id: r.customer_id,
    status: r.status,
  }));
  await prisma.campaignLog.createMany({ data: logs });

  if (!data.schedule_at) {
    const sentCount = results.filter((r) => r.status === 'sent').length;
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { sent_count: sentCount, delivered_count: sentCount },
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

async function getCampaignDetail(campaignId, outletId = null) {
  const prisma = getDbClient();
  const where = { id: campaignId, is_deleted: false };
  if (outletId) where.outlet_id = outletId;
  const campaign = await prisma.campaign.findFirst({
    where,
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

/* ============================
   LOYALTY PROGRAMME CONFIG
   ============================ */

// Setting key shape we persist to OutletSetting.
const LOYALTY_CONFIG_KEY = 'loyalty_config';

// Validated whitelist — only these keys are accepted from the request body.
const LOYALTY_CONFIG_FIELDS = [
  'enabled',                 // boolean — programme on/off
  'earn_rate',               // number  — points earned per `earn_per_amount`
  'earn_per_amount',         // number  — currency unit a customer must spend to earn 1×earn_rate
  'redeem_value',            // number  — currency value of 1 point at redemption
  'min_redemption',          // number  — minimum points required to redeem
  'max_redemption_pct',      // number  — cap (%) on what a single order can be paid in points
  'signup_bonus',            // number  — points awarded on customer signup
  'birthday_bonus',          // number  — points awarded on customer birthday
  'referral_bonus',          // number  — points awarded for referrals
  'vip_threshold',           // number  — total spend to reach VIP tier
  'vip_multiplier',          // number  — VIP earn multiplier
  'expiry_months',           // number  — months until points expire (0 = no expiry)
  'eligible_categories',     // array   — empty = all categories; otherwise list of category IDs
];

function defaultLoyaltyConfig() {
  return {
    enabled:             true,
    earn_rate:           Number(appConfig.loyalty?.earnRate)        || 1,
    earn_per_amount:     Number(appConfig.loyalty?.earnPerAmount)   || 100,
    redeem_value:        Number(appConfig.loyalty?.redeemValue)     || 1,
    min_redemption:      Number(appConfig.loyalty?.minRedemption)   || 100,
    max_redemption_pct:  50,
    signup_bonus:        0,
    birthday_bonus:      0,
    referral_bonus:      0,
    vip_threshold:       10000,
    vip_multiplier:      2,
    expiry_months:       12,
    eligible_categories: [],
  };
}

async function getLoyaltyConfig(outletId) {
  const prisma = getDbClient();
  const row = await prisma.outletSetting.findUnique({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: LOYALTY_CONFIG_KEY } },
  }).catch(() => null);
  let saved = {};
  if (row?.setting_value) {
    try { saved = JSON.parse(row.setting_value); } catch { /* ignore */ }
  }
  return { ...defaultLoyaltyConfig(), ...saved };
}

async function updateLoyaltyConfig(outletId, patch) {
  if (!outletId) throw new BadRequestError('outlet_id is required');
  // Whitelist + coerce types
  const next = { ...await getLoyaltyConfig(outletId) };
  for (const k of LOYALTY_CONFIG_FIELDS) {
    if (patch[k] === undefined) continue;
    if (k === 'enabled') next[k] = !!patch[k];
    else if (k === 'eligible_categories') next[k] = Array.isArray(patch[k]) ? patch[k] : [];
    else next[k] = Number(patch[k]) || 0;
  }
  // Sanity guards
  if (next.earn_rate < 0) next.earn_rate = 0;
  if (next.earn_per_amount <= 0) next.earn_per_amount = 1;
  if (next.redeem_value < 0) next.redeem_value = 0;
  if (next.min_redemption < 0) next.min_redemption = 0;
  if (next.max_redemption_pct < 0 || next.max_redemption_pct > 100) next.max_redemption_pct = 50;
  if (next.expiry_months < 0) next.expiry_months = 0;

  const prisma = getDbClient();
  await prisma.outletSetting.upsert({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: LOYALTY_CONFIG_KEY } },
    create: { outlet_id: outletId, setting_key: LOYALTY_CONFIG_KEY, setting_value: JSON.stringify(next) },
    update: { setting_value: JSON.stringify(next) },
  });
  return next;
}

module.exports = {
  // Exported so sibling services (e.g. customer.privacy.service) can apply the
  // exact same tenant scoping as the scoped CRUD reads, closing cross-tenant IDOR.
  tenantScopeFilter,
  createCustomer, listCustomers, getCustomer, findByPhone, updateCustomer, deleteCustomer,
  addAddress,
  getCRMDashboard, getBirthdayCustomers,
  earnPoints, redeemPoints, adjustPoints, getLoyaltyHistory, updateSegment,
  createCampaign, getCampaigns, getCampaignDetail, sendBirthdayCampaign,
  getLoyaltyConfig, updateLoyaltyConfig, defaultLoyaltyConfig,
};
