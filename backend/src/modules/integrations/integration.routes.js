/**
 * @fileoverview Integration routes — aggregator webhooks, payment gateway, notifications.
 * @module modules/integrations/integration.routes
 */

const express = require('express');
const router = express.Router();
const aggregatorService = require('./aggregator.service');
const paymentService = require('./payment.service');
const notificationService = require('./notification.service');
const accountingRoutes = require('./accounting/accounting.routes');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { webhookLimiter } = require('../../middleware/rateLimit.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  acceptOnlineOrderSchema,
  rejectOnlineOrderSchema,
  markOrderReadySchema,
  createRazorpayOrderSchema,
  verifyRazorpayPaymentSchema,
  razorpayRefundSchema,
  sendSMSSchema,
  sendWhatsAppSchema,
  sendCampaignSchema,
  updateIntegrationConfigSchema,
} = require('./integration.validation');
const { sendSuccess, sendCreated } = require('../../utils/response');
const logger = require('../../config/logger');

/* ============================
   AGGREGATOR WEBHOOKS (public, verified by signature)
   ============================ */

/**
 * POST /api/integrations/webhook/:platform — Receive aggregator order webhook.
 * Platform: swiggy | zomato | ubereats
 */
router.post('/webhook/:platform', webhookLimiter, express.raw({ type: '*/*' }), async (req, res, next) => {
  try {
    const { platform } = req.params;
    const signature = req.headers['x-webhook-signature'] || req.headers['x-razorpay-signature'] || '';

    if (!['swiggy', 'zomato', 'ubereats'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Unsupported platform' });
    }

    // express.raw({ type: '*/*' }) on this route gives us req.body as the exact
    // raw bytes the partner signed. HMAC over those bytes — never a re-serialised
    // JSON string (key ordering / whitespace would break verification).
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : (req.rawBody || Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8'));

    const isValid = aggregatorService.verifyWebhookSignature(platform, signature, rawBody);
    if (!isValid) {
      logger.warn(`Invalid webhook signature from ${platform}`);
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    // Only parse AFTER the signature passes.
    let webhookData;
    try {
      webhookData = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8'))
        : typeof req.body === 'string' ? JSON.parse(req.body)
          : req.body;
    } catch (parseErr) {
      logger.warn(`Malformed webhook payload from ${platform}`, { error: parseErr.message });
      return res.status(400).json({ success: false, message: 'Malformed payload' });
    }
    // processIncomingOrder is idempotent: duplicate deliveries return the
    // existing order rather than double-creating.
    const order = await aggregatorService.processIncomingOrder(platform, webhookData);

    res.status(200).json({ success: true, data: { order_id: order.id }, message: 'Order received' });
  } catch (error) {
    // Transient/internal failure → 5xx so the partner RETRIES (never swallow with
    // a 200, which silently loses the order). TODO: wire to alerting.
    logger.error('Webhook processing failed — returning 502 for retry', {
      error: error.message,
      stack: error.stack,
      platform: req.params.platform,
    });
    res.status(502).json({ success: false, message: 'Webhook processing failed, please retry' });
  }
});

/** POST /api/integrations/online-orders/:id/accept */
router.post('/online-orders/:id/accept', authenticate, hasPermission('MANAGE_ORDERS'), validate(acceptOnlineOrderSchema), async (req, res, next) => {
  try {
    const order = await aggregatorService.acceptOnlineOrder(req.params.id);
    sendSuccess(res, order, 'Online order accepted');
  } catch (error) { next(error); }
});

/** POST /api/integrations/online-orders/:id/reject */
router.post('/online-orders/:id/reject', authenticate, hasPermission('MANAGE_ORDERS'), validate(rejectOnlineOrderSchema), async (req, res, next) => {
  try {
    const order = await aggregatorService.rejectOnlineOrder(req.params.id, req.body.reason);
    sendSuccess(res, order, 'Online order rejected');
  } catch (error) { next(error); }
});

/** POST /api/integrations/online-orders/:id/ready */
router.post('/online-orders/:id/ready', authenticate, hasPermission('MANAGE_ORDERS'), validate(markOrderReadySchema), async (req, res, next) => {
  try {
    const order = await aggregatorService.markOrderReady(req.params.id);
    sendSuccess(res, order, 'Online order marked ready');
  } catch (error) { next(error); }
});

/** GET /api/integrations/online-orders/active */
// BUG FIX (cross-tenant IDOR): without enforceOutletScope a restricted role could omit
// outlet_id, making Prisma drop the tenant filter (outlet_id: undefined) and return every
// outlet's online orders incl. customer PII. enforceOutletScope defaults req.query.outlet_id
// to the caller's own outlet for non-owners and rejects foreign outlet ids.
router.get('/online-orders/active', authenticate, enforceOutletScope, hasPermission('VIEW_ORDERS'), async (req, res, next) => {
  try {
    const orders = await aggregatorService.getActiveOnlineOrders(req.query.outlet_id);
    sendSuccess(res, orders);
  } catch (error) { next(error); }
});

/** GET /api/integrations/online-orders/history */
// BUG FIX (cross-tenant IDOR): see /online-orders/active — bind outlet_id to the caller.
router.get('/online-orders/history', authenticate, enforceOutletScope, hasPermission('VIEW_REPORTS'), async (req, res, next) => {
  try {
    const orders = await aggregatorService.getOnlineOrderHistory(req.query.outlet_id, req.query);
    sendSuccess(res, orders);
  } catch (error) { next(error); }
});

/** GET /api/integrations/online-orders/stats */
// BUG FIX (cross-tenant IDOR): see /online-orders/active — bind outlet_id to the caller.
router.get('/online-orders/stats', authenticate, enforceOutletScope, hasPermission('VIEW_REPORTS'), async (req, res, next) => {
  try {
    const stats = await aggregatorService.getOnlineStats(req.query.outlet_id);
    sendSuccess(res, stats);
  } catch (error) { next(error); }
});

/* ============================
   PAYMENT GATEWAY
   ============================ */

/** POST /api/integrations/razorpay/create-order */
router.post('/razorpay/create-order', authenticate, validate(createRazorpayOrderSchema), async (req, res, next) => {
  try {
    const { amount, order_id, customer_name, customer_phone } = req.body;
    const razorpayOrder = await paymentService.createRazorpayOrder(amount, order_id, customer_name, customer_phone);
    sendSuccess(res, razorpayOrder, 'Razorpay order created');
  } catch (error) { next(error); }
});

/** POST /api/integrations/razorpay/verify */
router.post('/razorpay/verify', authenticate, validate(verifyRazorpayPaymentSchema), async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const isValid = paymentService.verifyRazorpayPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
    sendSuccess(res, { verified: true, payment_id: razorpay_payment_id }, 'Payment verified');
  } catch (error) { next(error); }
});

/** POST /api/integrations/razorpay/webhook — Razorpay webhook */
router.post('/razorpay/webhook', webhookLimiter, async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    // Verify against the EXACT raw bytes Razorpay signed (captured by the
    // express.json verify hook), not a re-serialised body.
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
    const isValid = paymentService.verifyRazorpayWebhook(signature, rawBody);

    if (!isValid) {
      logger.warn('Razorpay webhook rejected — invalid signature');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    // Act on the event (capture/fail/refund → update Payment + order). Never let
    // a processing error make Razorpay retry forever — always 200.
    const result = await require('./razorpay.webhook.service').processEvent(req.body || {});
    logger.info('Razorpay webhook processed', { event: req.body?.event, handled: result?.handled });
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Razorpay webhook failed', { error: error.message });
    res.status(200).json({ success: true });
  }
});

/** POST /api/integrations/razorpay/refund */
router.post('/razorpay/refund', authenticate, hasPermission('MANAGE_PAYMENTS'), validate(razorpayRefundSchema), async (req, res, next) => {
  try {
    const { payment_id, amount, reason } = req.body;
    const refund = await paymentService.initiateRazorpayRefund(payment_id, amount, reason);
    sendSuccess(res, refund, 'Refund initiated');
  } catch (error) { next(error); }
});

/* ============================
   PUSH TOKEN REGISTRY
   Persisted in the push_tokens table (PushToken model) so tokens survive
   server restarts. The in-memory Map remains ONLY as a same-process fallback
   cache for when the DB is briefly unreachable (push.service falls back to it
   — pushes are fire-and-forget and must never fail hard).
   ============================ */

// Fallback cache: userId → { token, platform, outlet_id, registered_at }
const pushTokenRegistry = new Map();

/**
 * POST /api/integrations/push-token
 * Body: { token, platform, outlet_id? }
 * Requires: authenticated staff / owner
 */
router.post('/push-token', authenticate, async (req, res, next) => {
  try {
    const { token, platform, outlet_id } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }
    // Prefer the outlet the app is actively watching (owners' JWT outlet_id is
    // often null and they switch outlets) so outlet-scoped pushes reach them.
    const entry = {
      token: String(token).trim(),
      platform: platform || 'unknown',
      outlet_id: outlet_id || req.user.outlet_id || null,
      registered_at: new Date().toISOString(),
    };

    // Persist (token is unique — a device re-registering under a new user or
    // outlet simply moves its row). DB failure demotes to cache-only: the
    // device re-registers on next app launch anyway.
    let persisted = true;
    try {
      const prisma = require('../../config/database').getDbClient();
      await prisma.pushToken.upsert({
        where: { token: entry.token },
        update: { user_id: req.user.id, outlet_id: entry.outlet_id, platform: entry.platform },
        create: { token: entry.token, user_id: req.user.id, outlet_id: entry.outlet_id, platform: entry.platform },
      });
    } catch (dbErr) {
      persisted = false;
      logger.error('Push token DB persist failed — cached in-memory only', {
        userId: req.user.id, error: dbErr.message,
      });
    }

    pushTokenRegistry.set(req.user.id, entry);
    logger.info('Push token registered', { userId: req.user.id, platform, persisted });
    sendSuccess(res, { registered: true, persisted }, 'Push token registered');
  } catch (error) { next(error); }
});

/**
 * GET /api/integrations/push-token/:userId (internal / owner-only)
 * Returns the most recently refreshed push token for a staff member.
 */
router.get('/push-token/:userId', authenticate, hasPermission('VIEW_STAFF'), async (req, res, next) => {
  try {
    let entry = null;
    try {
      const prisma = require('../../config/database').getDbClient();
      const row = await prisma.pushToken.findFirst({
        where: { user_id: req.params.userId },
        orderBy: { updated_at: 'desc' },
      });
      if (row) {
        entry = { token: row.token, platform: row.platform, outlet_id: row.outlet_id, registered_at: row.updated_at };
      }
    } catch (dbErr) {
      logger.warn('Push token DB lookup failed — falling back to cache', { error: dbErr.message });
    }
    if (!entry) entry = pushTokenRegistry.get(req.params.userId) || null;
    if (!entry) return res.status(404).json({ success: false, message: 'Token not found' });
    sendSuccess(res, entry);
  } catch (error) { next(error); }
});

/**
 * Expose the fallback cache for push.service (DB is the source of truth;
 * this Map only bridges a DB outage within the same process).
 * Usage: const registry = require('./integration.routes').getPushTokenRegistry();
 */
router.getPushTokenRegistry = () => pushTokenRegistry;

/* ============================
   NOTIFICATIONS
   ============================ */

/** POST /api/integrations/notify/sms */
router.post('/notify/sms', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(sendSMSSchema), async (req, res, next) => {
  try {
    const { phone, message, template_id } = req.body;
    const result = await notificationService.sendSMS(phone, message, template_id);
    sendSuccess(res, result, 'SMS sent');
  } catch (error) { next(error); }
});

/** POST /api/integrations/notify/whatsapp */
router.post('/notify/whatsapp', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(sendWhatsAppSchema), async (req, res, next) => {
  try {
    const { phone, template_name, parameters } = req.body;
    const result = await notificationService.sendWhatsApp(phone, template_name, parameters);
    sendSuccess(res, result, 'WhatsApp message sent');
  } catch (error) { next(error); }
});

/** POST /api/integrations/notify/campaign */
router.post('/notify/campaign', authenticate, hasPermission('MANAGE_CAMPAIGNS'), validate(sendCampaignSchema), async (req, res, next) => {
  try {
    const { recipients, template_name, parameters } = req.body;
    const result = await notificationService.sendCampaign(recipients, template_name, parameters);
    sendSuccess(res, result, `Campaign: ${result.sent} sent, ${result.failed} failed`);
  } catch (error) { next(error); }
});

/** GET /api/integrations/config?outlet_id= */
// BUG FIX: was authenticate-only + trusted req.query.outlet_id, leaking another outlet's
// integration_* settings (incl. payment keys) to any authenticated user. enforceOutletScope
// pins non-owners to their own outlet; MANAGE_INTEGRATIONS restricts these secrets to
// privileged staff — matching the permission-gating on every sibling config route.
router.get('/config', authenticate, enforceOutletScope, hasPermission('MANAGE_INTEGRATIONS'), async (req, res, next) => {
  try {
    const { getDbClient } = require('../../config/database');
    const prisma = getDbClient();
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const settings = await prisma.outletSetting.findMany({
      where: { outlet_id: outletId, is_deleted: false, setting_key: { startsWith: 'integration_' } },
    });
    const config = {};
    for (const s of settings) config[s.setting_key] = s.setting_value;
    sendSuccess(res, config, 'Integration config retrieved');
  } catch (error) { next(error); }
});

/** PUT /api/integrations/config */
// BUG FIX: was authenticate + schema-validation only (no permission, no outlet scoping),
// so any authenticated low-priv user could upsert integration_* settings (incl. payment
// keys) onto ANY outlet via body.outlet_id. MANAGE_INTEGRATIONS restricts the write to
// privileged staff; enforceOutletScope (after validate, so its outlet_id binding survives
// stripUnknown) binds non-owners to their own outlet and blocks cross-tenant writes.
router.put('/config', authenticate, hasPermission('MANAGE_INTEGRATIONS'), validate(updateIntegrationConfigSchema), enforceOutletScope, async (req, res, next) => {
  try {
    const { getDbClient } = require('../../config/database');
    const prisma = getDbClient();
    const { outlet_id, integration, config } = req.body;
    const outletId = outlet_id || req.user.outlet_id;

    if (!integration || !config) {
      return res.status(400).json({ success: false, message: 'integration and config are required' });
    }

    const upserts = Object.entries(config).map(([key, value]) =>
      prisma.outletSetting.upsert({
        where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: `integration_${integration}_${key}` } },
        update: { setting_value: String(value) },
        create: { outlet_id: outletId, setting_key: `integration_${integration}_${key}`, setting_value: String(value) },
      })
    );
    await Promise.all(upserts);

    logger.info('Integration config saved', { outletId, integration });
    sendSuccess(res, { integration, saved: true }, 'Configuration saved');
  } catch (error) { next(error); }
});

/* ── Accounting (Tally + Xero AU) ─────────────────────────────── */
router.use('/accounting', accountingRoutes);

module.exports = router;
