/**
 * @fileoverview Aggregator routes — Swiggy, Zomato (IN) + DoorDash AU, Menulog AU.
 * Covers: platform config, menu push, availability, webhooks, order management, sync logs.
 * @module modules/integrations/aggregator.routes
 */

const express = require('express');
const router = express.Router();
const agg = require('./aggregator.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { webhookLimiter } = require('../../middleware/rateLimit.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  updateAggregatorConfigSchema,
  pushMenuSchema,
  setItemAvailabilitySchema,
  simulateOrderSchema,
  acceptAggOrderSchema,
  rejectAggOrderSchema,
} = require('./aggregator.validation');
const { sendSuccess, sendCreated } = require('../../utils/response');
const logger = require('../../config/logger');

/* ══════════════════════════════════════════════════════
   PLATFORM CONFIG
══════════════════════════════════════════════════════ */

/** GET /api/aggregators/platforms — list platform definitions */
router.get('/platforms', authenticate, (req, res) => {
  const platforms = Object.entries(agg.PLATFORMS).map(([id, p]) => ({
    id, name: p.name, region: p.region, color: p.color, commission: p.commission,
  }));
  sendSuccess(res, platforms, 'Platforms retrieved');
});

/** GET /api/aggregators/config?outlet_id= — all platform configs for outlet */
router.get('/config', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const configs = await agg.getAllPlatformConfigs(outletId);
    sendSuccess(res, configs, 'Aggregator configs retrieved');
  } catch (e) { next(e); }
});

/** PUT /api/aggregators/config/:platform — save platform config */
router.put('/config/:platform', authenticate, hasPermission('MANAGE_POS'), validate(updateAggregatorConfigSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { platform } = req.params;
    const { store_id, api_key, webhook_secret, enabled } = req.body;

    const fields = {};
    if (store_id   !== undefined) fields.store_id       = store_id;
    if (api_key    !== undefined) fields.api_key         = api_key;
    if (webhook_secret !== undefined) fields.webhook_secret = webhook_secret;
    if (enabled    !== undefined) fields.enabled         = String(enabled);

    await agg.setPlatformConfig(outletId, platform, fields);
    const updated = await agg.getAllPlatformConfigs(outletId);
    sendSuccess(res, updated[platform], `${platform} config saved`);
  } catch (e) { next(e); }
});

/* ══════════════════════════════════════════════════════
   MENU PUSH
══════════════════════════════════════════════════════ */

/** POST /api/aggregators/menu/push/:platform — push menu to one platform */
router.post('/menu/push/:platform', authenticate, hasPermission('MANAGE_POS'), validate(pushMenuSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await agg.pushMenuToPlatform(outletId, req.params.platform);
    sendSuccess(res, result, `Menu pushed to ${result.platform}`);
  } catch (e) { next(e); }
});

/** POST /api/aggregators/menu/push-all — push menu to all enabled platforms */
router.post('/menu/push-all', authenticate, hasPermission('MANAGE_POS'), validate(pushMenuSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const results = await agg.pushMenuToAllPlatforms(outletId);
    sendSuccess(res, results, 'Menu push completed');
  } catch (e) { next(e); }
});

/** GET /api/aggregators/menu/preview — preview what would be pushed */
router.get('/menu/preview', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const menu = await agg.buildMenuPayload(outletId);
    const totalItems = menu.reduce((s, c) => s + c.items.length, 0);
    sendSuccess(res, { categories: menu.length, total_items: totalItems, menu }, 'Menu preview');
  } catch (e) { next(e); }
});

/* ══════════════════════════════════════════════════════
   ITEM AVAILABILITY
══════════════════════════════════════════════════════ */

/** POST /api/aggregators/availability/:platform — toggle items on one platform */
router.post('/availability/:platform', authenticate, hasPermission('MANAGE_POS'), validate(setItemAvailabilitySchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { item_ids, is_available } = req.body;
    if (!item_ids?.length) return res.status(400).json({ success: false, message: 'item_ids required' });
    const result = await agg.setItemAvailability(outletId, req.params.platform, item_ids, is_available);
    sendSuccess(res, result, 'Availability updated');
  } catch (e) { next(e); }
});

/** POST /api/aggregators/availability/all — toggle items on all platforms */
router.post('/availability/all', authenticate, hasPermission('MANAGE_POS'), validate(setItemAvailabilitySchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { item_ids, is_available } = req.body;
    if (!item_ids?.length) return res.status(400).json({ success: false, message: 'item_ids required' });
    const results = await agg.setItemAvailabilityAllPlatforms(outletId, item_ids, is_available);
    sendSuccess(res, results, 'Availability updated on all platforms');
  } catch (e) { next(e); }
});

/* ══════════════════════════════════════════════════════
   WEBHOOKS (public — verified by HMAC signature)
══════════════════════════════════════════════════════ */

/** POST /api/aggregators/webhook/:platform — receive aggregator order webhook */
router.post('/webhook/:platform', webhookLimiter, express.raw({ type: '*/*' }), async (req, res) => {
  const { platform } = req.params;

  if (!agg.PLATFORMS[platform]) {
    return res.status(400).json({ success: false, message: 'Unknown platform' });
  }

  // express.raw({ type: '*/*' }) gives req.body as the exact bytes the partner
  // signed. HMAC over those raw bytes — not a re-serialised JSON string.
  const signature = req.headers['x-webhook-signature']
    || req.headers['x-swiggy-signature']
    || req.headers['x-zomato-hmac']
    || req.headers['x-doordash-signature']
    || req.headers['x-menulog-signature']
    || '';

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : (req.rawBody || Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8'));

  // Invalid signature → 401 (NOT 200). A forged/unsigned request must be rejected
  // and must not be silently acknowledged.
  const isValid = agg.verifyWebhookSignature(platform, signature, rawBody);
  if (!isValid) {
    logger.warn(`Invalid ${platform} webhook signature`);
    return res.status(401).json({ success: false, message: 'Invalid signature' });
  }

  // Parse only after the signature passes. A malformed payload is a client error.
  let webhookData;
  try {
    webhookData = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8'))
      : typeof req.body === 'string' ? JSON.parse(req.body)
        : req.body;
  } catch (parseErr) {
    logger.warn(`Malformed ${platform} webhook payload`, { error: parseErr.message });
    return res.status(400).json({ success: false, message: 'Malformed payload' });
  }

  try {
    // processIncomingOrder is idempotent: a duplicate delivery returns the
    // existing order rather than creating a second one.
    const order = await agg.processIncomingOrder(platform, webhookData);
    return res.status(200).json({ success: true, data: { order_id: order.id }, message: 'Order received' });
  } catch (error) {
    // Transient/internal failure → 5xx so the platform RETRIES (don't silently
    // drop the order with a 200). TODO: wire to alerting (PagerDuty/Sentry).
    logger.error(`${platform} webhook ingestion failed — returning 502 for retry`, {
      error: error.message,
      stack: error.stack,
      platform,
    });
    return res.status(502).json({ success: false, message: 'Webhook processing failed, please retry' });
  }
});

/* ══════════════════════════════════════════════════════
   SIMULATE (dev/testing — no real platform needed)
══════════════════════════════════════════════════════ */

/** POST /api/aggregators/simulate/:platform — fire a fake inbound order */
router.post('/simulate/:platform', authenticate, validate(simulateOrderSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const order = await agg.simulateIncomingOrder(outletId, req.params.platform, req.body);
    sendCreated(res, { order_id: order.id, order_number: order.order_number }, `Simulated ${req.params.platform} order created`);
  } catch (e) { next(e); }
});

/* ══════════════════════════════════════════════════════
   ORDER MANAGEMENT
══════════════════════════════════════════════════════ */

/** GET /api/aggregators/orders/active */
router.get('/orders/active', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const orders = await agg.getActiveOnlineOrders(outletId);
    sendSuccess(res, orders);
  } catch (e) { next(e); }
});

/** GET /api/aggregators/orders/history */
router.get('/orders/history', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const orders = await agg.getOnlineOrderHistory(outletId, req.query);
    sendSuccess(res, orders);
  } catch (e) { next(e); }
});

/** GET /api/aggregators/orders/stats */
router.get('/orders/stats', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const stats = await agg.getOnlineStats(outletId);
    sendSuccess(res, stats);
  } catch (e) { next(e); }
});

/** POST /api/aggregators/orders/:id/accept */
router.post('/orders/:id/accept', authenticate, hasPermission('MANAGE_ORDERS'), validate(acceptAggOrderSchema), async (req, res, next) => {
  try {
    const order = await agg.acceptOnlineOrder(req.params.id, req.body.prep_time);
    sendSuccess(res, order, 'Order accepted');
  } catch (e) { next(e); }
});

/** POST /api/aggregators/orders/:id/reject */
router.post('/orders/:id/reject', authenticate, hasPermission('MANAGE_ORDERS'), validate(rejectAggOrderSchema), async (req, res, next) => {
  try {
    const order = await agg.rejectOnlineOrder(req.params.id, req.body.reason || 'Rejected by restaurant');
    sendSuccess(res, order, 'Order rejected');
  } catch (e) { next(e); }
});

/** POST /api/aggregators/orders/:id/ready */
router.post('/orders/:id/ready', authenticate, hasPermission('MANAGE_ORDERS'), async (req, res, next) => {
  try {
    const order = await agg.markOrderReady(req.params.id);
    sendSuccess(res, order, 'Order marked ready');
  } catch (e) { next(e); }
});

/* ══════════════════════════════════════════════════════
   SYNC LOGS
══════════════════════════════════════════════════════ */

/** GET /api/aggregators/logs?outlet_id=&platform=&limit= */
router.get('/logs', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const logs = await agg.getSyncLogs(outletId, req.query);
    sendSuccess(res, logs, 'Sync logs retrieved');
  } catch (e) { next(e); }
});

module.exports = router;
