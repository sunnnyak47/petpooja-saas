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
const { hasPermission } = require('../../middleware/rbac.middleware');
const { webhookLimiter } = require('../../middleware/rateLimit.middleware');
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
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    if (!['swiggy', 'zomato', 'ubereats'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Unsupported platform' });
    }

    const isValid = aggregatorService.verifyWebhookSignature(platform, signature, rawBody);
    if (!isValid) {
      logger.warn(`Invalid webhook signature from ${platform}`);
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const webhookData = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
    const order = await aggregatorService.processIncomingOrder(platform, webhookData);

    res.status(200).json({ success: true, data: { order_id: order.id }, message: 'Order received' });
  } catch (error) {
    logger.error('Webhook processing failed', { error: error.message, platform: req.params.platform });
    res.status(200).json({ success: true, message: 'Acknowledged' });
  }
});

/** POST /api/integrations/online-orders/:id/accept */
router.post('/online-orders/:id/accept', authenticate, hasPermission('MANAGE_ORDERS'), async (req, res, next) => {
  try {
    const order = await aggregatorService.acceptOnlineOrder(req.params.id);
    sendSuccess(res, order, 'Online order accepted');
  } catch (error) { next(error); }
});

/** POST /api/integrations/online-orders/:id/reject */
router.post('/online-orders/:id/reject', authenticate, hasPermission('MANAGE_ORDERS'), async (req, res, next) => {
  try {
    const order = await aggregatorService.rejectOnlineOrder(req.params.id, req.body.reason);
    sendSuccess(res, order, 'Online order rejected');
  } catch (error) { next(error); }
});

/** POST /api/integrations/online-orders/:id/ready */
router.post('/online-orders/:id/ready', authenticate, hasPermission('MANAGE_ORDERS'), async (req, res, next) => {
  try {
    const order = await aggregatorService.markOrderReady(req.params.id);
    sendSuccess(res, order, 'Online order marked ready');
  } catch (error) { next(error); }
});

/** GET /api/integrations/online-orders/active */
router.get('/online-orders/active', authenticate, hasPermission('VIEW_ORDERS'), async (req, res, next) => {
  try {
    const orders = await aggregatorService.getActiveOnlineOrders(req.query.outlet_id);
    sendSuccess(res, orders);
  } catch (error) { next(error); }
});

/** GET /api/integrations/online-orders/history */
router.get('/online-orders/history', authenticate, hasPermission('VIEW_REPORTS'), async (req, res, next) => {
  try {
    const orders = await aggregatorService.getOnlineOrderHistory(req.query.outlet_id, req.query);
    sendSuccess(res, orders);
  } catch (error) { next(error); }
});

/** GET /api/integrations/online-orders/stats */
router.get('/online-orders/stats', authenticate, hasPermission('VIEW_REPORTS'), async (req, res, next) => {
  try {
    const stats = await aggregatorService.getOnlineStats(req.query.outlet_id);
    sendSuccess(res, stats);
  } catch (error) { next(error); }
});

/* ============================
   PAYMENT GATEWAY
   ============================ */

/** POST /api/integrations/razorpay/create-order */
router.post('/razorpay/create-order', authenticate, async (req, res, next) => {
  try {
    const { amount, order_id, customer_name, customer_phone } = req.body;
    const razorpayOrder = await paymentService.createRazorpayOrder(amount, order_id, customer_name, customer_phone);
    sendSuccess(res, razorpayOrder, 'Razorpay order created');
  } catch (error) { next(error); }
});

/** POST /api/integrations/razorpay/verify */
router.post('/razorpay/verify', authenticate, async (req, res, next) => {
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
router.post('/razorpay/webhook', webhookLimiter, async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    const rawBody = JSON.stringify(req.body);
    const isValid = paymentService.verifyRazorpayWebhook(signature, rawBody);

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;
    logger.info('Razorpay webhook received', { event: event.event });

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Razorpay webhook failed', { error: error.message });
    res.status(200).json({ success: true });
  }
});

/** POST /api/integrations/razorpay/refund */
router.post('/razorpay/refund', authenticate, hasPermission('MANAGE_PAYMENTS'), async (req, res, next) => {
  try {
    const { payment_id, amount, reason } = req.body;
    const refund = await paymentService.initiateRazorpayRefund(payment_id, amount, reason);
    sendSuccess(res, refund, 'Refund initiated');
  } catch (error) { next(error); }
});

/* ============================
   NOTIFICATIONS
   ============================ */

/** POST /api/integrations/notify/sms */
router.post('/notify/sms', authenticate, hasPermission('MANAGE_CUSTOMERS'), async (req, res, next) => {
  try {
    const { phone, message, template_id } = req.body;
    const result = await notificationService.sendSMS(phone, message, template_id);
    sendSuccess(res, result, 'SMS sent');
  } catch (error) { next(error); }
});

/** POST /api/integrations/notify/whatsapp */
router.post('/notify/whatsapp', authenticate, hasPermission('MANAGE_CUSTOMERS'), async (req, res, next) => {
  try {
    const { phone, template_name, parameters } = req.body;
    const result = await notificationService.sendWhatsApp(phone, template_name, parameters);
    sendSuccess(res, result, 'WhatsApp message sent');
  } catch (error) { next(error); }
});

/** POST /api/integrations/notify/campaign */
router.post('/notify/campaign', authenticate, hasPermission('MANAGE_CAMPAIGNS'), async (req, res, next) => {
  try {
    const { recipients, template_name, parameters } = req.body;
    const result = await notificationService.sendCampaign(recipients, template_name, parameters);
    sendSuccess(res, result, `Campaign: ${result.sent} sent, ${result.failed} failed`);
  } catch (error) { next(error); }
});

/** GET /api/integrations/config?outlet_id= */
router.get('/config', authenticate, async (req, res, next) => {
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
router.put('/config', authenticate, async (req, res, next) => {
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

module.exports = router;
