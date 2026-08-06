/**
 * @fileoverview ONDC routes — seller onboarding + order management.
 * @module modules/ondc/ondc.routes
 */

const express = require('express');
const router = express.Router();
const ondcService = require('./ondc.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  updateSellerProfileSchema,
  submitForReviewSchema,
  toggleLiveSchema,
  acceptOndcOrderSchema,
  rejectOndcOrderSchema,
  updateOndcOrderStatusSchema,
  simulateOndcOrderSchema,
} = require('./ondc.validation');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

/** GET /api/ondc/profile — get seller profile (creates draft if not exists) */
// enforceOutletScope: rejects a foreign outlet_id for non-owner roles so a scoped user
// can't read another tenant's ONDC profile (bank_account_number, bank_ifsc, pan, gstin).
router.get('/profile', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const profile = await ondcService.getSellerProfile(outletId);
    sendSuccess(res, profile, 'ONDC seller profile retrieved');
  } catch (e) { next(e); }
});

/** PATCH /api/ondc/profile — update seller profile fields */
router.patch('/profile', authenticate, enforceOutletScope, validate(updateSellerProfileSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const profile = await ondcService.updateSellerProfile(outletId, req.body);
    sendSuccess(res, profile, 'ONDC seller profile updated');
  } catch (e) { next(e); }
});

/** POST /api/ondc/profile/submit — submit for review */
router.post('/profile/submit', authenticate, enforceOutletScope, validate(submitForReviewSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await ondcService.submitForReview(outletId);
    sendSuccess(res, result, 'Submitted for ONDC review');
  } catch (e) { next(e); }
});

/** POST /api/ondc/profile/toggle-live — go live or take offline */
router.post('/profile/toggle-live', authenticate, enforceOutletScope, validate(toggleLiveSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await ondcService.toggleLive(outletId, req.body.live);
    sendSuccess(res, result, req.body.live ? 'Store is now LIVE on ONDC!' : 'Store taken offline');
  } catch (e) { next(e); }
});

/** GET /api/ondc/orders — list ONDC orders */
router.get('/orders', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { orders, total, page, limit } = await ondcService.listOndcOrders(outletId, req.query);
    sendPaginated(res, orders, total, page, limit, 'ONDC orders retrieved');
  } catch (e) { next(e); }
});

/** POST /api/ondc/orders/:id/accept — accept order */
// enforceOutletScope + role-derived scope: closes a cross-tenant IDOR where any authenticated
// user could mutate another outlet's ONDC order (owner/super_admin stay unscoped).
router.post('/orders/:id/accept', authenticate, enforceOutletScope, validate(acceptOndcOrderSchema), async (req, res, next) => {
  try {
    const scopedOutletId = ['super_admin', 'owner'].includes(req.user.role) ? undefined : req.user.outlet_id;
    const result = await ondcService.acceptOrder(req.params.id, req.body.prep_time_minutes, scopedOutletId);
    sendSuccess(res, result, 'Order accepted');
  } catch (e) { next(e); }
});

/** POST /api/ondc/orders/:id/reject — reject order */
router.post('/orders/:id/reject', authenticate, enforceOutletScope, validate(rejectOndcOrderSchema), async (req, res, next) => {
  try {
    const scopedOutletId = ['super_admin', 'owner'].includes(req.user.role) ? undefined : req.user.outlet_id;
    const result = await ondcService.rejectOrder(req.params.id, req.body.reason, scopedOutletId);
    sendSuccess(res, result, 'Order rejected');
  } catch (e) { next(e); }
});

/** PATCH /api/ondc/orders/:id/status — update order status */
router.patch('/orders/:id/status', authenticate, enforceOutletScope, validate(updateOndcOrderStatusSchema), async (req, res, next) => {
  try {
    const scopedOutletId = ['super_admin', 'owner'].includes(req.user.role) ? undefined : req.user.outlet_id;
    const result = await ondcService.updateOrderStatus(req.params.id, req.body.status, scopedOutletId);
    sendSuccess(res, result, 'Order status updated');
  } catch (e) { next(e); }
});

/** GET /api/ondc/analytics — order analytics */
router.get('/analytics', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await ondcService.getAnalytics(outletId, req.query.from, req.query.to);
    sendSuccess(res, result, 'ONDC analytics retrieved');
  } catch (e) { next(e); }
});

/**
 * POST /api/ondc/webhook — public ONDC network webhook (no auth — signed by network key)
 * In production, verify ED25519 signature from Authorization header.
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const result = await ondcService.receiveOndcWebhook(req.body);
    res.json(result);
  } catch (e) { next(e); }
});

/** POST /api/ondc/simulate-order — test order simulation (dev/staging) */
// enforceOutletScope validates/auto-fills outlet_id per role so a scoped user can't simulate
// against another tenant's outlet.
router.post('/simulate-order', authenticate, enforceOutletScope, validate(simulateOndcOrderSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const profile = await ondcService.getSellerProfile(outletId);
    const { getDbClient } = require('../../config/database');
    // Bug fix: simulation must NOT permanently flip a draft profile to 'live' — that bypassed the
    // verify→toggle-live gate and left an unverified store live on ONDC forever. Capture the
    // original {status, bpp_id} and restore it in `finally` so the live flip is temporary.
    let originalState = null;
    if (!['live', 'verified', 'under_review'].includes(profile.status)) {
      originalState = { status: profile.status, bpp_id: profile.bpp_id };
      await getDbClient().ondcSellerProfile.update({ where: { id: profile.id }, data: { status: 'live', bpp_id: 'ondctest.msrm.in' } });
    }
    let result;
    try {
      result = await ondcService.simulateOrder(outletId);
    } finally {
      if (originalState) {
        await getDbClient().ondcSellerProfile.update({ where: { id: profile.id }, data: originalState });
      }
    }
    sendSuccess(res, result, 'Test ONDC order simulated');
  } catch (e) { next(e); }
});

module.exports = router;
