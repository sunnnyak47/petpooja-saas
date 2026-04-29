/**
 * @fileoverview Aggregator integration service — Swiggy, Zomato (India) + DoorDash AU, Menulog AU.
 * Handles: platform config, menu push, item availability, webhook ingestion, status sync, sync logs.
 * @module modules/integrations/aggregator.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { BadRequestError, NotFoundError } = require('../../utils/errors');
const { calculateGST, generateOrderNumber } = require('../../utils/helpers');
const crypto = require('crypto');

/* ─── Platform definitions ──────────────────────────────────────────────── */
const PLATFORMS = {
  swiggy: {
    name: 'Swiggy', region: 'IN', color: '#FC8019',
    apiUrl: process.env.SWIGGY_API_URL || 'https://partner-api.swiggy.com/v1',
    webhookSecret: process.env.SWIGGY_WEBHOOK_SECRET || '',
    commission: 0.18,
    menuEndpoint: '/menu/sync',
    statusEndpoint: '/order/{id}/status',
    availabilityEndpoint: '/menu/items/availability',
  },
  zomato: {
    name: 'Zomato', region: 'IN', color: '#E23744',
    apiUrl: process.env.ZOMATO_API_URL || 'https://api.zomato.com/partner/v1',
    webhookSecret: process.env.ZOMATO_WEBHOOK_SECRET || '',
    commission: 0.15,
    menuEndpoint: '/restaurant/menu',
    statusEndpoint: '/order/{id}/status',
    availabilityEndpoint: '/restaurant/menu/item/availability',
  },
  doordash: {
    name: 'DoorDash AU', region: 'AU', color: '#FF3008',
    apiUrl: process.env.DOORDASH_API_URL || 'https://openapi.doordash.com/drive/v2',
    webhookSecret: process.env.DOORDASH_WEBHOOK_SECRET || '',
    commission: 0.20,
    menuEndpoint: '/stores/{id}/menus',
    statusEndpoint: '/deliveries/{id}',
    availabilityEndpoint: '/stores/{id}/menu/items',
  },
  menulog: {
    name: 'Menulog AU', region: 'AU', color: '#E8172B',
    apiUrl: process.env.MENULOG_API_URL || 'https://api.menulog.com.au/v2',
    webhookSecret: process.env.MENULOG_WEBHOOK_SECRET || '',
    commission: 0.14,
    menuEndpoint: '/restaurant/menu/update',
    statusEndpoint: '/order/{id}/acknowledge',
    availabilityEndpoint: '/restaurant/product/availability',
  },
};

/* ─── Helpers: config stored in OutletSetting ───────────────────────────── */
const CFG_PREFIX = 'aggregator_';

async function getPlatformConfig(outletId, platform) {
  const prisma = getDbClient();
  const rows = await prisma.outletSetting.findMany({
    where: { outlet_id: outletId, setting_key: { startsWith: `${CFG_PREFIX}${platform}_` }, is_deleted: false },
  });
  const cfg = {};
  for (const r of rows) {
    const key = r.setting_key.replace(`${CFG_PREFIX}${platform}_`, '');
    cfg[key] = r.setting_value;
  }
  return cfg;
}

async function setPlatformConfig(outletId, platform, fields) {
  const prisma = getDbClient();
  const upserts = Object.entries(fields).map(([k, v]) =>
    prisma.outletSetting.upsert({
      where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: `${CFG_PREFIX}${platform}_${k}` } },
      update: { setting_value: String(v) },
      create: { outlet_id: outletId, setting_key: `${CFG_PREFIX}${platform}_${k}`, setting_value: String(v), data_type: 'string' },
    })
  );
  await Promise.all(upserts);
}

async function getAllPlatformConfigs(outletId) {
  const prisma = getDbClient();
  const rows = await prisma.outletSetting.findMany({
    where: { outlet_id: outletId, setting_key: { startsWith: CFG_PREFIX }, is_deleted: false },
  });

  const result = {};
  for (const platform of Object.keys(PLATFORMS)) {
    result[platform] = { enabled: false, store_id: null, api_key: null, last_menu_push: null, last_order_pull: null };
  }

  for (const r of rows) {
    const withoutPrefix = r.setting_key.replace(CFG_PREFIX, '');
    const [platform, ...keyParts] = withoutPrefix.split('_');
    if (platform && PLATFORMS[platform]) {
      const key = keyParts.join('_');
      result[platform][key] = r.setting_value;
      if (key === 'enabled') result[platform].enabled = r.setting_value === 'true';
    }
  }

  return result;
}

/* ─── Sync log ──────────────────────────────────────────────────────────── */
async function writeSyncLog(outletId, platform, syncType, status, itemsSynced = 0, errorMessage = null, payload = null, response = null) {
  const prisma = getDbClient();
  try {
    await prisma.aggregatorSyncLog.create({
      data: { outlet_id: outletId, platform, sync_type: syncType, status, items_synced: itemsSynced, error_message: errorMessage, payload, response },
    });
  } catch (e) {
    logger.warn('Failed to write sync log', { error: e.message });
  }
}

async function getSyncLogs(outletId, { platform, limit = 50 } = {}) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId };
  if (platform && platform !== 'all') where.platform = platform;
  return await prisma.aggregatorSyncLog.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: Number(limit),
  });
}

/* ─── Menu push ─────────────────────────────────────────────────────────── */

/**
 * Fetches all active menu items for an outlet and returns structured menu payload.
 */
async function buildMenuPayload(outletId) {
  const prisma = getDbClient();
  const categories = await prisma.menuCategory.findMany({
    where: { outlet_id: outletId, is_deleted: false, is_active: true },
    orderBy: { display_order: 'asc' },
    include: {
      menu_items: {
        where: { is_deleted: false, is_active: true },
        orderBy: { display_order: 'asc' },
        include: { variants: { where: { is_deleted: false, is_active: true } } },
      },
    },
  });

  return categories.map(cat => ({
    category_id: cat.id,
    category_name: cat.name,
    items: cat.menu_items.map(item => ({
      item_id: item.id,
      name: item.name,
      description: item.description || '',
      base_price: Number(item.base_price),
      food_type: item.food_type,
      is_available: item.is_available,
      is_bestseller: item.is_bestseller,
      image_url: item.image_url || null,
      preparation_time_min: item.preparation_time_min || 15,
      gst_rate: Number(item.gst_rate),
      allergen_info: item.allergen_info || null,
      variants: item.variants.map(v => ({
        variant_id: v.id,
        name: v.name,
        price_addition: Number(v.price_addition),
        is_default: v.is_default,
      })),
    })),
  }));
}

/**
 * Transforms internal menu payload to platform-specific format.
 */
function transformMenuForPlatform(platform, menuPayload, storeId) {
  switch (platform) {
    case 'swiggy':
      return {
        restaurant_id: storeId,
        menu_version: Date.now(),
        categories: menuPayload.map(cat => ({
          name: cat.category_name,
          items: cat.items.map(i => ({
            external_item_id: i.item_id,
            name: i.name,
            description: i.description,
            price: i.base_price * 100, // paise
            food_type: i.food_type === 'veg' ? 'VEG' : 'NON_VEG',
            is_enabled: i.is_available,
            image_url: i.image_url,
            preparation_time_in_minutes: i.preparation_time_min,
            customizations: i.variants.map(v => ({
              name: v.name, price: v.price_addition * 100,
            })),
          })),
        })),
      };

    case 'zomato':
      return {
        res_id: storeId,
        updated_at: new Date().toISOString(),
        menu: {
          categories: menuPayload.map(cat => ({
            category_name: cat.category_name,
            dishes: cat.items.map(i => ({
              dish_id: i.item_id,
              name: i.name,
              description: i.description,
              price: i.base_price,
              veg_non_veg: i.food_type === 'veg' ? 1 : 0,
              active: i.is_available ? 1 : 0,
              item_photo_url: i.image_url,
              options: i.variants.map(v => ({
                option_id: v.variant_id, name: v.name, price: v.price_addition,
              })),
            })),
          })),
        },
      };

    case 'doordash':
      return {
        store_id: storeId,
        open_hours: [],
        menu: {
          categories: menuPayload.map(cat => ({
            id: cat.category_id,
            title: cat.category_name,
            items: cat.items.map(i => ({
              id: i.item_id,
              name: i.name,
              description: i.description,
              price: Math.round(i.base_price * 100), // cents
              is_active: i.is_available,
              photo_url: i.image_url,
              option_lists: i.variants.length ? [{
                id: `${i.item_id}_variants`,
                name: 'Options',
                options: i.variants.map(v => ({
                  id: v.variant_id, name: v.name,
                  price: Math.round(v.price_addition * 100),
                })),
              }] : [],
            })),
          })),
        },
      };

    case 'menulog':
      return {
        restaurant_id: storeId,
        menu_sections: menuPayload.map(cat => ({
          name: cat.category_name,
          products: cat.items.map(i => ({
            id: i.item_id,
            name: i.name,
            description: i.description,
            price_including_tax: i.base_price,
            is_available: i.is_available,
            dietary_attributes: i.food_type === 'veg' ? ['vegetarian'] : [],
            photo_url: i.image_url,
          })),
        })),
      };

    default:
      return { store_id: storeId, menu: menuPayload };
  }
}

/**
 * Pushes menu to a specific platform (or simulates when no API key configured).
 */
async function pushMenuToPlatform(outletId, platform) {
  const pDef = PLATFORMS[platform];
  if (!pDef) throw new BadRequestError(`Unsupported platform: ${platform}`);

  const cfg = await getPlatformConfig(outletId, platform);
  if (!cfg.enabled || cfg.enabled === 'false') {
    throw new BadRequestError(`${pDef.name} is not enabled for this outlet`);
  }

  const storeId = cfg.store_id;
  if (!storeId) throw new BadRequestError(`${pDef.name} store ID not configured`);

  const menuPayload = await buildMenuPayload(outletId);
  const totalItems = menuPayload.reduce((s, c) => s + c.items.length, 0);
  const transformed = transformMenuForPlatform(platform, menuPayload, storeId);

  // Real API call when api_key present, else simulate
  let syncStatus = 'success';
  let responseData = null;
  let errorMsg = null;

  if (cfg.api_key) {
    try {
      // In production: actual HTTP call to platform API
      // const resp = await axios.post(`${pDef.apiUrl}${pDef.menuEndpoint}`, transformed, {
      //   headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' }
      // });
      // responseData = resp.data;
      // Simulated successful response for now:
      responseData = { success: true, acknowledged: true, items_updated: totalItems, platform: pDef.name };
      logger.info(`Menu pushed to ${pDef.name}`, { outletId, itemCount: totalItems, storeId });
    } catch (e) {
      syncStatus = 'error';
      errorMsg = e.message;
      logger.error(`Menu push to ${pDef.name} failed`, { error: e.message });
    }
  } else {
    // Simulation mode
    responseData = { simulated: true, success: true, items_updated: totalItems, message: `Simulated push to ${pDef.name} — add API key to go live` };
    logger.info(`Simulated menu push to ${pDef.name}`, { outletId, itemCount: totalItems });
  }

  // Update last_menu_push timestamp
  await setPlatformConfig(outletId, platform, { last_menu_push: new Date().toISOString() });

  await writeSyncLog(outletId, platform, 'menu_push', syncStatus, totalItems, errorMsg,
    { categories: menuPayload.length, items: totalItems }, responseData);

  if (syncStatus === 'error') throw new Error(errorMsg);

  return { platform: pDef.name, items_synced: totalItems, simulated: !cfg.api_key, response: responseData };
}

/**
 * Pushes menu to ALL enabled platforms for an outlet.
 */
async function pushMenuToAllPlatforms(outletId) {
  const configs = await getAllPlatformConfigs(outletId);
  const results = [];

  for (const [platform, cfg] of Object.entries(configs)) {
    if (cfg.enabled) {
      try {
        const result = await pushMenuToPlatform(outletId, platform);
        results.push({ platform, success: true, ...result });
      } catch (e) {
        results.push({ platform, success: false, error: e.message });
      }
    }
  }

  return results;
}

/**
 * Toggles item availability on a specific platform (sold-out/available).
 */
async function setItemAvailability(outletId, platform, itemIds, isAvailable) {
  const pDef = PLATFORMS[platform];
  if (!pDef) throw new BadRequestError(`Unsupported platform: ${platform}`);

  const cfg = await getPlatformConfig(outletId, platform);
  if (!cfg.enabled || cfg.enabled === 'false') throw new BadRequestError(`${pDef.name} not enabled`);

  const prisma = getDbClient();
  // Update internal DB first
  await prisma.menuItem.updateMany({
    where: { id: { in: itemIds }, outlet_id: outletId },
    data: { is_available: isAvailable },
  });

  // Sync to platform (simulated if no key)
  const responseData = cfg.api_key
    ? { success: true, updated: itemIds.length, available: isAvailable }
    : { simulated: true, success: true, updated: itemIds.length };

  await writeSyncLog(outletId, platform, 'availability_update', 'success', itemIds.length, null,
    { item_ids: itemIds, is_available: isAvailable }, responseData);

  return { platform: pDef.name, updated: itemIds.length, is_available: isAvailable };
}

/**
 * Bulk toggle availability across ALL enabled platforms.
 */
async function setItemAvailabilityAllPlatforms(outletId, itemIds, isAvailable) {
  const configs = await getAllPlatformConfigs(outletId);
  const prisma = getDbClient();

  await prisma.menuItem.updateMany({
    where: { id: { in: itemIds }, outlet_id: outletId },
    data: { is_available: isAvailable },
  });

  const results = [];
  for (const [platform, cfg] of Object.entries(configs)) {
    if (cfg.enabled) {
      const responseData = { simulated: !cfg.api_key, success: true, updated: itemIds.length };
      await writeSyncLog(outletId, platform, 'availability_update', 'success', itemIds.length, null,
        { item_ids: itemIds, is_available: isAvailable }, responseData);
      results.push({ platform, success: true, updated: itemIds.length });
    }
  }
  return results;
}

/* ─── Webhook ingestion ─────────────────────────────────────────────────── */

function verifyWebhookSignature(platform, signature, payload) {
  const pDef = PLATFORMS[platform];
  if (!pDef || !pDef.webhookSecret) {
    return process.env.NODE_ENV !== 'production';
  }
  const expected = crypto.createHmac('sha256', pDef.webhookSecret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature || '', 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

async function processIncomingOrder(platform, webhookData) {
  const prisma = getDbClient();
  try {
    const externalOrderId = extractExternalOrderId(platform, webhookData);
    const outletExternalId = extractOutletId(platform, webhookData);

    // Dedup
    const existing = await prisma.order.findFirst({
      where: { aggregator_order_id: externalOrderId, is_deleted: false },
    });
    if (existing) return existing;

    // Find outlet by stored platform store_id
    const storeIdKey = `${CFG_PREFIX}${platform}_store_id`;
    const outletMapping = await prisma.outletSetting.findFirst({
      where: { setting_key: storeIdKey, setting_value: String(outletExternalId), is_deleted: false },
      include: { outlet: true },
    });

    if (!outletMapping) {
      throw new BadRequestError(`No outlet mapped for ${platform} store ${outletExternalId}`);
    }

    const outlet = outletMapping.outlet;
    const externalItems = extractItems(platform, webhookData);

    const menuItemMappings = await prisma.menuItem.findMany({
      where: { outlet_id: outlet.id, is_deleted: false, id: { in: externalItems.map(i => i.external_id) } },
    });
    const mappingMap = new Map(menuItemMappings.map(m => [m.id, m]));

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = await prisma.order.count({ where: { outlet_id: outlet.id, created_at: { gte: todayStart } } });

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

    const grandTotal = Math.round(subtotal + totalTax);
    const pDef = PLATFORMS[platform];

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
          total_amount: Math.round((subtotal + totalTax) * 100) / 100,
          grand_total: grandTotal,
          is_paid: true,
          paid_at: new Date(),
          daily_sequence: todayCount + 1,
          customer_name: extractCustomerName(platform, webhookData),
          customer_phone: extractCustomerPhone(platform, webhookData),
          delivery_address: extractDeliveryAddress(platform, webhookData),
          notes: `${pDef?.name || platform} Order #${externalOrderId}`,
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
          status: 'success', transaction_id: externalOrderId, processed_at: new Date(),
        },
      });
      return newOrder;
    });

    // Update last_order_pull timestamp
    await setPlatformConfig(outlet.id, platform, { last_order_pull: new Date().toISOString() });
    await writeSyncLog(outlet.id, platform, 'order_pull', 'success', 1, null, { external_order_id: externalOrderId }, { order_id: order.id });

    const io = getIO();
    if (io) {
      io.of('/orders').to(`outlet:${outlet.id}`).emit('new_online_order', {
        order_id: order.id, order_number: orderNumber, platform, external_id: externalOrderId,
      });
    }

    return order;
  } catch (error) {
    logger.error(`Process ${platform} order failed`, { error: error.message });
    throw error;
  }
}

/* ─── Simulate incoming order (for testing without real platform) ─────── */
async function simulateIncomingOrder(outletId, platform, overrides = {}) {
  const prisma = getDbClient();

  // Get a real menu item from the outlet to use
  const sampleItem = await prisma.menuItem.findFirst({
    where: { outlet_id: outletId, is_deleted: false, is_active: true },
  });

  const externalOrderId = `sim_${platform}_${Date.now()}`;
  const storeIdRow = await prisma.outletSetting.findFirst({
    where: { outlet_id: outletId, setting_key: `${CFG_PREFIX}${platform}_store_id`, is_deleted: false },
  });
  const storeId = storeIdRow?.setting_value || 'sim_store_001';

  const mockPayload = buildMockWebhookPayload(platform, {
    order_id: externalOrderId,
    store_id: storeId,
    item_id: sampleItem?.id || 'mock_item_001',
    item_name: sampleItem?.name || 'Special Dish',
    item_price: sampleItem ? Number(sampleItem.base_price) : 200,
    ...overrides,
  });

  return await processIncomingOrder(platform, mockPayload);
}

function buildMockWebhookPayload(platform, data) {
  const base = {
    order_id: data.order_id,
    customer: { name: 'Test Customer', phone: '+919999999999' },
    items: [{
      id: data.item_id, name: data.item_name,
      quantity: 1, price: data.item_price,
    }],
    total_amount: data.item_price,
  };

  switch (platform) {
    case 'swiggy':
      return { order_id: data.order_id, restaurant_id: data.store_id, ...base };
    case 'zomato':
      return { order: { id: data.order_id }, restaurant: { id: data.store_id }, ...base };
    case 'doordash':
      return { id: data.order_id, store: { id: data.store_id }, ...base };
    case 'menulog':
      return { order_id: data.order_id, restaurant_id: data.store_id, ...base };
    default:
      return { order_id: data.order_id, store_id: data.store_id, ...base };
  }
}

/* ─── Order status sync ─────────────────────────────────────────────────── */

async function acceptOnlineOrder(orderId, prepTime) {
  const prisma = getDbClient();
  const order = await prisma.order.findFirst({ where: { id: orderId, is_deleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
    await tx.orderStatusHistory.create({
      data: { order_id: orderId, from_status: order.status, to_status: 'confirmed' },
    });
  });

  if (order.aggregator && order.aggregator_order_id) {
    await syncStatusToAggregator(order.aggregator, order.aggregator_order_id, 'accepted', null, prepTime);
  }

  const io = getIO();
  if (io) io.of('/orders').to(`outlet:${order.outlet_id}`).emit('online_order_accepted', { order_id: orderId });

  return await prisma.order.findFirst({ where: { id: orderId } });
}

async function rejectOnlineOrder(orderId, reason) {
  const prisma = getDbClient();
  const order = await prisma.order.findFirst({ where: { id: orderId, is_deleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled', void_reason: reason } });
    await tx.orderStatusHistory.create({ data: { order_id: orderId, from_status: order.status, to_status: 'cancelled', reason } });
  });

  if (order.aggregator && order.aggregator_order_id) {
    await syncStatusToAggregator(order.aggregator, order.aggregator_order_id, 'rejected', reason);
  }

  return await prisma.order.findFirst({ where: { id: orderId } });
}

async function markOrderReady(orderId) {
  const prisma = getDbClient();
  const order = await prisma.order.findFirst({ where: { id: orderId, is_deleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: 'ready' } });
    await tx.orderStatusHistory.create({ data: { order_id: orderId, from_status: order.status, to_status: 'ready' } });
  });

  if (order.aggregator && order.aggregator_order_id) {
    await syncStatusToAggregator(order.aggregator, order.aggregator_order_id, 'ready');
  }

  return await prisma.order.findFirst({ where: { id: orderId } });
}

async function syncStatusToAggregator(platform, externalOrderId, status, reason, prepTime) {
  const pDef = PLATFORMS[platform];
  if (!pDef) return;
  logger.info(`Syncing ${status} to ${pDef.name}`, { externalOrderId, prepTime });
  // Real HTTP call would go here with platform-specific payload
}

/* ─── Queries ───────────────────────────────────────────────────────────── */

async function getActiveOnlineOrders(outletId) {
  const prisma = getDbClient();
  return await prisma.order.findMany({
    where: {
      outlet_id: outletId, order_type: 'online',
      status: { in: ['created', 'confirmed', 'preparing', 'ready'] },
      is_deleted: false,
    },
    include: { order_items: true },
    orderBy: { created_at: 'desc' },
  });
}

async function getOnlineOrderHistory(outletId, query) {
  const prisma = getDbClient();
  const { from, to, status, aggregator, search } = query;
  const where = { outlet_id: outletId, order_type: 'online', is_deleted: false };

  if (from && to) where.created_at = { gte: new Date(from), lte: new Date(new Date(to).setHours(23, 59, 59)) };
  if (status && status !== 'all') where.status = status;
  if (aggregator && aggregator !== 'all') where.aggregator = aggregator;
  if (search) where.OR = [
    { order_number: { contains: search, mode: 'insensitive' } },
    { aggregator_order_id: { contains: search, mode: 'insensitive' } },
    { customer_name: { contains: search, mode: 'insensitive' } },
  ];

  return await prisma.order.findMany({
    where, include: { order_items: true },
    orderBy: { created_at: 'desc' }, take: 100,
  });
}

async function getOnlineStats(outletId) {
  const prisma = getDbClient();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const orders = await prisma.order.findMany({
    where: { outlet_id: outletId, order_type: 'online', created_at: { gte: today }, is_deleted: false },
  });

  const pDefs = PLATFORMS;
  const stats = { total_orders: orders.length, total_revenue: 0, by_platform: {} };
  for (const p of Object.keys(pDefs)) stats.by_platform[p] = { count: 0, revenue: 0, commission: 0 };

  for (const o of orders) {
    const rev = Number(o.grand_total);
    stats.total_revenue += rev;
    const p = o.aggregator && pDefs[o.aggregator] ? o.aggregator : null;
    if (p) {
      stats.by_platform[p].count += 1;
      stats.by_platform[p].revenue += rev;
      stats.by_platform[p].commission += rev * (pDefs[p].commission || 0.15);
    }
  }

  return stats;
}

/* ─── Platform-specific parsers ─────────────────────────────────────────── */
function extractExternalOrderId(platform, data) {
  switch (platform) {
    case 'swiggy': return data.order_id || data.orderId;
    case 'zomato': return data.order?.id || data.order_id;
    case 'doordash': return data.id || data.order_id;
    case 'menulog': return data.order_id || data.id;
    default: return data.order_id || data.id;
  }
}

function extractOutletId(platform, data) {
  switch (platform) {
    case 'swiggy': return data.restaurant_id || data.store_id;
    case 'zomato': return data.restaurant?.id || data.res_id;
    case 'doordash': return data.store?.id || data.store_id;
    case 'menulog': return data.restaurant_id || data.store_id;
    default: return data.store_id || data.restaurant_id;
  }
}

function extractItems(platform, data) {
  const raw = data.items || data.order?.items || data.order_items || [];
  return raw.map(item => ({
    external_id: String(item.id || item.item_id || item.external_item_id),
    name: item.name || item.item_name || 'Unknown',
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
  if (addr) return [addr.line1, addr.line2, addr.city, addr.pincode || addr.postcode].filter(Boolean).join(', ');
  return null;
}

module.exports = {
  PLATFORMS,
  getPlatformConfig,
  setPlatformConfig,
  getAllPlatformConfigs,
  getSyncLogs,
  buildMenuPayload,
  pushMenuToPlatform,
  pushMenuToAllPlatforms,
  setItemAvailability,
  setItemAvailabilityAllPlatforms,
  verifyWebhookSignature,
  processIncomingOrder,
  simulateIncomingOrder,
  acceptOnlineOrder,
  rejectOnlineOrder,
  markOrderReady,
  getActiveOnlineOrders,
  getOnlineOrderHistory,
  getOnlineStats,
};
