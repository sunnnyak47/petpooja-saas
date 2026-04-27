/**
 * @fileoverview ONDC Seller Service — onboarding, order management, webhook handler.
 * @module modules/ondc/ondc.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, ConflictError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');
const crypto = require('crypto');

/* ─────────────────────────────────────────
   SELLER PROFILE
───────────────────────────────────────── */

/**
 * Get ONDC seller profile for an outlet (creates draft if not exists).
 */
async function getSellerProfile(outletId) {
  const prisma = getDbClient();
  let profile = await prisma.ondcSellerProfile.findFirst({
    where: { outlet_id: outletId, is_deleted: false },
    include: { outlet: { select: { name: true, phone: true, email: true, gstin: true, fssai_number: true, address_line1: true, city: true, state: true, pincode: true } } },
  });

  if (!profile) {
    // Auto-seed from outlet data
    const outlet = await prisma.outlet.findFirst({ where: { id: outletId } });
    if (!outlet) throw new NotFoundError('Outlet not found');

    profile = await prisma.ondcSellerProfile.create({
      data: {
        outlet_id: outletId,
        store_name: outlet.name,
        fssai_number: outlet.fssai_number,
        gstin: outlet.gstin,
        status: 'draft',
        operating_hours: defaultOperatingHours(),
      },
      include: { outlet: { select: { name: true, phone: true, email: true } } },
    });
  }

  return profile;
}

/**
 * Upsert ONDC seller profile fields.
 */
async function updateSellerProfile(outletId, data) {
  const prisma = getDbClient();
  const profile = await getSellerProfile(outletId);

  // Sanitize – remove fields that shouldn't be directly set
  const { status, bpp_id, provider_id, subscriber_id, verified_at, went_live_at, ...safeData } = data;

  const updated = await prisma.ondcSellerProfile.update({
    where: { id: profile.id },
    data: {
      ...safeData,
      operating_hours: data.operating_hours ?? profile.operating_hours,
    },
    include: { outlet: { select: { name: true } } },
  });

  logger.info('ONDC seller profile updated', { outletId });
  return updated;
}

/**
 * Submit onboarding docs for review.
 * Validates required fields, changes status to docs_submitted.
 */
async function submitForReview(outletId) {
  const prisma = getDbClient();
  const profile = await getSellerProfile(outletId);

  if (profile.status === 'live') throw new BadRequestError('Store is already live on ONDC');
  if (profile.status === 'under_review') throw new BadRequestError('Already under review');

  const missing = [];
  if (!profile.store_name) missing.push('store_name');
  if (!profile.fssai_number) missing.push('fssai_number');
  if (!profile.gstin) missing.push('gstin');
  if (!profile.pan) missing.push('pan');
  if (!profile.bank_account_number) missing.push('bank_account_number');
  if (!profile.bank_ifsc) missing.push('bank_ifsc');
  if (!profile.tnc_accepted) missing.push('tnc_accepted');

  if (missing.length > 0) throw new BadRequestError(`Missing required fields: ${missing.join(', ')}`);

  // Simulate ONDC BPP registration — in production call actual ONDC sandbox API
  const bppId = `ondctest.msrm.in`;
  const providerId = `provider_${outletId.split('-')[0]}`;

  const updated = await prisma.ondcSellerProfile.update({
    where: { id: profile.id },
    data: {
      status: 'under_review',
      submitted_at: new Date(),
      bpp_id: bppId,
      provider_id: providerId,
      subscriber_id: `${providerId}@${bppId}`,
    },
  });

  // Simulate auto-verify after 2 seconds (demo mode — in prod this is manual)
  setTimeout(() => autoApprove(outletId), 3000);

  logger.info('ONDC profile submitted for review', { outletId, providerId });
  return updated;
}

async function autoApprove(outletId) {
  try {
    const prisma = getDbClient();
    const profile = await prisma.ondcSellerProfile.findFirst({ where: { outlet_id: outletId, is_deleted: false } });
    if (!profile || profile.status !== 'under_review') return;
    await prisma.ondcSellerProfile.update({
      where: { id: profile.id },
      data: { status: 'verified', verified_at: new Date() },
    });
    logger.info('ONDC profile auto-verified (demo mode)', { outletId });
  } catch (e) {
    logger.error('ONDC auto-approve failed', { error: e.message });
  }
}

/**
 * Toggle store live on ONDC (must be verified first).
 */
async function toggleLive(outletId, goLive) {
  const prisma = getDbClient();
  const profile = await getSellerProfile(outletId);

  if (goLive && !['verified', 'live'].includes(profile.status)) {
    throw new BadRequestError('Store must be verified before going live');
  }

  const updated = await prisma.ondcSellerProfile.update({
    where: { id: profile.id },
    data: {
      status: goLive ? 'live' : 'verified',
      went_live_at: goLive ? (profile.went_live_at || new Date()) : profile.went_live_at,
    },
  });

  logger.info(`ONDC store ${goLive ? 'live' : 'taken offline'}`, { outletId });
  return updated;
}

/* ─────────────────────────────────────────
   ONDC ORDER MANAGEMENT
───────────────────────────────────────── */

/**
 * Simulate incoming ONDC order webhook (called by external ONDC network or our test simulator).
 */
async function receiveOndcWebhook(payload) {
  const prisma = getDbClient();

  const { context, message } = payload;
  const ondcOrderId = context?.transaction_id || context?.message_id || `ONDC-${Date.now()}`;

  // Find seller profile by provider_id or outlet_id
  let sellerProfile;
  if (context?.bpp_id) {
    sellerProfile = await prisma.ondcSellerProfile.findFirst({
      where: { bpp_id: context.bpp_id, is_deleted: false },
    });
  }

  // Fallback: use the first live outlet (demo mode)
  if (!sellerProfile) {
    sellerProfile = await prisma.ondcSellerProfile.findFirst({
      where: { status: 'live', is_deleted: false },
    });
  }

  if (!sellerProfile) {
    logger.warn('ONDC webhook: no matching seller profile', { bpp_id: context?.bpp_id });
    return { ack: { status: 'NACK', error: { code: '30004', message: 'Seller not found' } } };
  }

  // Check for duplicate
  const existing = await prisma.ondcOrder.findFirst({ where: { ondc_order_id: ondcOrderId } });
  if (existing) return { ack: { status: 'ACK' } };

  const order = message?.order || {};
  const items = (order.items || []).map(i => ({
    id: i.id,
    name: i.descriptor?.name || 'Item',
    quantity: i.quantity?.count || 1,
    price: parseFloat(i.price?.value || 0),
  }));

  const itemsTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = parseFloat(order.quote?.breakup?.find(b => b.title === 'Delivery charges')?.price?.value || 0);
  const taxes = parseFloat(order.quote?.breakup?.find(b => b.title === 'Tax')?.price?.value || 0);
  const grandTotal = parseFloat(order.quote?.price?.value || itemsTotal + deliveryFee + taxes);

  const fulfillment = order.fulfillments?.[0] || {};
  const customer = order.billing || {};

  const ondcOrder = await prisma.ondcOrder.create({
    data: {
      seller_profile_id: sellerProfile.id,
      outlet_id: sellerProfile.outlet_id,
      ondc_order_id: ondcOrderId,
      bap_id: context?.bap_id,
      bap_uri: context?.bap_uri,
      transaction_id: context?.transaction_id,
      message_id: context?.message_id,
      status: 'pending',
      customer_name: customer?.name || fulfillment?.end?.contact?.name || 'ONDC Customer',
      customer_phone: customer?.phone || fulfillment?.end?.contact?.phone,
      delivery_address: fulfillment?.end?.location?.address?.door
        ? `${fulfillment.end.location.address.door}, ${fulfillment.end.location.address.city}`
        : null,
      delivery_lat: fulfillment?.end?.location?.gps?.split(',')[0] ? parseFloat(fulfillment.end.location.gps.split(',')[0]) : null,
      delivery_lng: fulfillment?.end?.location?.gps?.split(',')[1] ? parseFloat(fulfillment.end.location.gps.split(',')[1]) : null,
      items_total: itemsTotal,
      delivery_fee: deliveryFee,
      taxes,
      grand_total: grandTotal,
      payment_method: order.payment?.type || 'prepaid',
      payment_status: order.payment?.status || 'PAID',
      items,
      raw_payload: payload,
    },
  });

  // Auto-accept if configured
  if (sellerProfile.auto_accept) {
    await acceptOrder(ondcOrder.id, sellerProfile.prep_time_minutes || 30);
  }

  logger.info('ONDC order received', { ondcOrderId, outletId: sellerProfile.outlet_id });
  return { ack: { status: 'ACK' }, order_id: ondcOrder.id };
}

/**
 * List ONDC orders for an outlet.
 */
async function listOndcOrders(outletId, query = {}) {
  const prisma = getDbClient();
  const { page, limit, offset } = parsePagination(query);
  const where = { outlet_id: outletId, is_deleted: false };
  if (query.status) where.status = query.status;

  const [orders, total] = await Promise.all([
    prisma.ondcOrder.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.ondcOrder.count({ where }),
  ]);

  return { orders, total, page, limit };
}

/**
 * Accept an ONDC order.
 */
async function acceptOrder(orderId, prepTimeMinutes) {
  const prisma = getDbClient();
  const order = await prisma.ondcOrder.findFirst({ where: { id: orderId, is_deleted: false } });
  if (!order) throw new NotFoundError('ONDC order not found');
  if (!['pending'].includes(order.status)) throw new BadRequestError(`Order already ${order.status}`);

  const updated = await prisma.ondcOrder.update({
    where: { id: orderId },
    data: {
      status: 'accepted',
      accepted_at: new Date(),
      prep_time_minutes: prepTimeMinutes || 30,
    },
  });

  // In production: call back bap_uri with on_confirm callback
  await sendOndcCallback(order.bap_uri, 'on_confirm', {
    order_id: order.ondc_order_id,
    status: 'ACCEPTED',
    prep_time: prepTimeMinutes || 30,
  });

  logger.info('ONDC order accepted', { orderId, ondcOrderId: order.ondc_order_id });
  return updated;
}

/**
 * Reject an ONDC order.
 */
async function rejectOrder(orderId, reason) {
  const prisma = getDbClient();
  const order = await prisma.ondcOrder.findFirst({ where: { id: orderId, is_deleted: false } });
  if (!order) throw new NotFoundError('ONDC order not found');
  if (!['pending'].includes(order.status)) throw new BadRequestError(`Order already ${order.status}`);

  const updated = await prisma.ondcOrder.update({
    where: { id: orderId },
    data: {
      status: 'rejected',
      rejected_at: new Date(),
      rejection_reason: reason || 'Seller rejected the order',
    },
  });

  await sendOndcCallback(order.bap_uri, 'on_cancel', {
    order_id: order.ondc_order_id,
    status: 'CANCELLED',
    reason,
  });

  logger.info('ONDC order rejected', { orderId });
  return updated;
}

/**
 * Mark order ready / picked up.
 */
async function updateOrderStatus(orderId, newStatus) {
  const prisma = getDbClient();
  const order = await prisma.ondcOrder.findFirst({ where: { id: orderId, is_deleted: false } });
  if (!order) throw new NotFoundError('ONDC order not found');

  const allowed = { accepted: ['preparing'], preparing: ['ready'], ready: ['picked_up'] };
  if (!allowed[order.status]?.includes(newStatus)) {
    throw new BadRequestError(`Cannot move from ${order.status} to ${newStatus}`);
  }

  const data = { status: newStatus };
  if (newStatus === 'ready') data.ready_at = new Date();
  if (newStatus === 'picked_up') data.picked_up_at = new Date();

  const updated = await prisma.ondcOrder.update({ where: { id: orderId }, data });
  logger.info('ONDC order status updated', { orderId, newStatus });
  return updated;
}

/**
 * Get ONDC analytics for an outlet.
 */
async function getAnalytics(outletId, from, to) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId, is_deleted: false };
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at.gte = new Date(from);
    if (to) where.created_at.lte = new Date(to);
  }

  const [total, byStatus, revenue, bapBreakdown] = await Promise.all([
    prisma.ondcOrder.count({ where }),

    prisma.ondcOrder.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    }),

    prisma.ondcOrder.aggregate({
      where: { ...where, status: { in: ['accepted', 'preparing', 'ready', 'picked_up'] } },
      _sum: { grand_total: true, items_total: true },
    }),

    prisma.ondcOrder.groupBy({
      by: ['bap_id'],
      where,
      _count: { id: true },
      _sum: { grand_total: true },
    }),
  ]);

  const statusMap = {};
  for (const s of byStatus) statusMap[s.status] = s._count.id;

  return {
    total_orders: total,
    status_breakdown: statusMap,
    total_revenue: revenue._sum.grand_total || 0,
    items_revenue: revenue._sum.items_total || 0,
    bap_breakdown: bapBreakdown.map(b => ({
      bap: b.bap_id || 'Unknown',
      orders: b._count.id,
      revenue: b._sum.grand_total || 0,
    })),
  };
}

/**
 * Simulate a test ONDC order (demo/staging only).
 */
async function simulateOrder(outletId) {
  const items = [
    { id: 'item_001', name: 'Paneer Butter Masala', quantity: 1, price: 280 },
    { id: 'item_002', name: 'Butter Naan (2 pcs)',  quantity: 1, price: 80 },
    { id: 'item_003', name: 'Mango Lassi',           quantity: 2, price: 120 },
  ];
  const grandTotal = items.reduce((s, i) => s + i.price * i.quantity, 0) + 40; // +40 delivery

  const payload = {
    context: {
      domain: 'nic2004:52110',
      action: 'confirm',
      version: '1.2.0',
      bap_id: 'paytm.ondctest.in',
      bap_uri: 'https://paytm.ondctest.in/bap',
      bpp_id: 'ondctest.msrm.in',
      transaction_id: `txn_${crypto.randomBytes(4).toString('hex')}`,
      message_id: `msg_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
    },
    message: {
      order: {
        billing: { name: 'Rahul Sharma', phone: '9876543210', email: 'rahul@example.com' },
        fulfillments: [{
          type: 'Delivery',
          end: {
            contact: { name: 'Rahul Sharma', phone: '9876543210' },
            location: { address: { door: '302, Green Park', city: 'New Delhi', state: 'Delhi', country: 'IND', area_code: '110016' }, gps: '28.5512,77.2050' },
          },
        }],
        items: items.map(i => ({
          id: i.id,
          descriptor: { name: i.name },
          quantity: { count: i.quantity },
          price: { value: `${i.price}`, currency: 'INR' },
        })),
        quote: {
          price: { value: `${grandTotal}`, currency: 'INR' },
          breakup: [
            { title: 'Delivery charges', price: { value: '40', currency: 'INR' } },
            { title: 'Tax', price: { value: '0', currency: 'INR' } },
          ],
        },
        payment: { type: 'prepaid', status: 'PAID' },
      },
    },
  };

  return await receiveOndcWebhook(payload);
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

async function sendOndcCallback(bapUri, action, data) {
  // In production: POST to bapUri with signed payload using ED25519
  // For demo: just log
  logger.info(`ONDC callback → ${action}`, { bapUri, data });
}

function defaultOperatingHours() {
  const hours = {};
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(day => {
    hours[day] = { open: '09:00', close: '22:00', closed: false };
  });
  return hours;
}

module.exports = {
  getSellerProfile, updateSellerProfile, submitForReview, toggleLive,
  receiveOndcWebhook, listOndcOrders, acceptOrder, rejectOrder, updateOrderStatus,
  getAnalytics, simulateOrder,
};
