/**
 * @fileoverview Usage-based SaaS billing — HTTP routes.
 *
 * Two surfaces:
 *   /api/billing/admin/*  — SuperAdmin: overview, invoices, plan CRUD, manual
 *                           rollup / dunning triggers.
 *   /api/billing/me/*     — Restaurant self-serve (owner/manager): usage meter,
 *                           own invoices, subscription, pay an invoice.
 *   /api/billing/webhook  — Razorpay billing webhook (signature-verified).
 *
 * @module modules/headoffice/billing.routes
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');

const { authenticate } = require('../../middleware/auth.middleware');
const { hasRole } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { webhookLimiter } = require('../../middleware/rateLimit.middleware');
const { sendSuccess, sendCreated } = require('../../utils/response');
const logger = require('../../config/logger');

const apiService = require('./billing.api.service');
const rollupService = require('./billing.service');
const collectionService = require('./billing.collection.service');
const dunningService = require('./billing.dunning.service');

const PERIOD_RE = /^\d{4}-\d{2}$/;

const planSchema = Joi.object({
  code: Joi.string().max(50).required(),
  name: Joi.string().max(100).required(),
  description: Joi.string().allow('', null),
  region: Joi.string().max(5).default('IN'),
  currency: Joi.string().max(5).default('INR'),
  txn_fee_percent: Joi.number().min(0).max(100).default(0),
  flat_fee_per_txn: Joi.number().min(0).default(0),
  channels: Joi.array().items(Joi.string()).default([]),
  free_txns_monthly: Joi.number().integer().min(0).default(0),
  base_monthly_fee: Joi.number().min(0).default(0),
  monthly_min_fee: Joi.number().min(0).default(0),
  monthly_cap_fee: Joi.number().min(0).allow(null),
  rate_rules: Joi.object().default({}),
  tax_percent: Joi.number().min(0).max(100).default(0),
  tax_label: Joi.string().max(20).allow('', null),
  max_outlets: Joi.number().integer().min(0).allow(null),
  max_users: Joi.number().integer().min(0).allow(null),
  features: Joi.object().default({}),
  is_active: Joi.boolean().default(true),
  sort_order: Joi.number().integer().default(0),
});

const planUpdateSchema = planSchema.fork(Object.keys(planSchema.describe().keys), (s) => s.optional());

// ---------------------------------------------------------------------------
// SuperAdmin
// ---------------------------------------------------------------------------

/** GET /api/billing/admin/overview?period=YYYY-MM */
router.get('/admin/overview', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    const period = PERIOD_RE.test(req.query.period || '') ? req.query.period : undefined;
    const data = await apiService.getAdminOverview({ period });
    sendSuccess(res, data, 'Billing overview');
  } catch (err) { next(err); }
});

/** GET /api/billing/admin/invoices?status=&period=&headOfficeId=&limit= */
router.get('/admin/invoices', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    const data = await apiService.listAdminInvoices({
      status: req.query.status,
      period: PERIOD_RE.test(req.query.period || '') ? req.query.period : undefined,
      headOfficeId: req.query.headOfficeId,
      limit: req.query.limit,
    });
    sendSuccess(res, data, 'Invoices');
  } catch (err) { next(err); }
});

/** POST /api/billing/admin/generate { period? } — run the monthly rollup. */
router.post('/admin/generate', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    const period = PERIOD_RE.test(req.body?.period || '') ? req.body.period : undefined;
    const result = await rollupService.generateInvoicesForPeriod(period);
    sendSuccess(res, result, `Generated ${result.generated} invoice(s) for ${result.period}`);
  } catch (err) { next(err); }
});

/** POST /api/billing/admin/dunning/run — run a dunning pass now. */
router.post('/admin/dunning/run', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    const result = await dunningService.runDunningCycle();
    sendSuccess(res, result, 'Dunning cycle complete');
  } catch (err) { next(err); }
});

/** GET /api/billing/admin/plans */
router.get('/admin/plans', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    sendSuccess(res, await apiService.listPlans(), 'Billing plans');
  } catch (err) { next(err); }
});

/** POST /api/billing/admin/plans */
router.post('/admin/plans', authenticate, hasRole('super_admin'), validate(planSchema), async (req, res, next) => {
  try {
    sendCreated(res, await apiService.createPlan(req.body), 'Plan created');
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'A plan with that code already exists' });
    next(err);
  }
});

/** PATCH /api/billing/admin/plans/:id */
router.patch('/admin/plans/:id', authenticate, hasRole('super_admin'), validate(planUpdateSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await apiService.updatePlan(req.params.id, req.body), 'Plan updated');
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Restaurant self-serve
// ---------------------------------------------------------------------------

/** GET /api/billing/me/usage?period=YYYY-MM */
router.get('/me/usage', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const period = PERIOD_RE.test(req.query.period || '') ? req.query.period : undefined;
    const data = await apiService.getMyUsage(req.user.head_office_id, period);
    sendSuccess(res, data, 'Current usage');
  } catch (err) { next(err); }
});

/** GET /api/billing/me/subscription */
router.get('/me/subscription', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const data = await apiService.getMySubscription(req.user.head_office_id);
    sendSuccess(res, data, 'Subscription');
  } catch (err) { next(err); }
});

/** GET /api/billing/me/invoices */
router.get('/me/invoices', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const data = await apiService.listMyInvoices(req.user.head_office_id);
    sendSuccess(res, data, 'Invoices');
  } catch (err) { next(err); }
});

/** POST /api/billing/me/invoices/:id/pay — create a Razorpay payment link. */
router.post('/me/invoices/:id/pay', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    await apiService.assertInvoiceOwnership(req.params.id, req.user.head_office_id);
    const result = await collectionService.createPaymentLink(req.params.id);
    sendSuccess(res, {
      payment_link_url: result.payment_link_url,
      razorpay_order_id: result.razorpay_order_id,
      invoice: result.invoice,
    }, 'Payment link ready');
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Webhook (no auth — verified by signature)
// ---------------------------------------------------------------------------

/** POST /api/billing/webhook — Razorpay billing webhook. */
router.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
    if (!collectionService.verifyWebhookSignature(signature, rawBody)) {
      logger.warn('Billing webhook rejected — invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    const result = await collectionService.handleWebhookEvent(req.body || {});
    logger.info('Billing webhook processed', { event: req.body?.event, handled: result?.handled });
    return res.json({ success: true, handled: result.handled });
  } catch (error) {
    logger.error('Billing webhook failed', { error: error.message });
    return res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

module.exports = router;
