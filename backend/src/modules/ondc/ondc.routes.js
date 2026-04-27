/**
 * @fileoverview ONDC routes — seller onboarding + order management.
 * @module modules/ondc/ondc.routes
 */

const express = require('express');
const router = express.Router();
const ondcService = require('./ondc.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

/** GET /api/ondc/profile — get seller profile (creates draft if not exists) */
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const profile = await ondcService.getSellerProfile(outletId);
    sendSuccess(res, profile, 'ONDC seller profile retrieved');
  } catch (e) { next(e); }
});

/** PATCH /api/ondc/profile — update seller profile fields */
router.patch('/profile', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const profile = await ondcService.updateSellerProfile(outletId, req.body);
    sendSuccess(res, profile, 'ONDC seller profile updated');
  } catch (e) { next(e); }
});

/** POST /api/ondc/profile/submit — submit for review */
router.post('/profile/submit', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await ondcService.submitForReview(outletId);
    sendSuccess(res, result, 'Submitted for ONDC review');
  } catch (e) { next(e); }
});

/** POST /api/ondc/profile/toggle-live — go live or take offline */
router.post('/profile/toggle-live', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await ondcService.toggleLive(outletId, req.body.live);
    sendSuccess(res, result, req.body.live ? 'Store is now LIVE on ONDC!' : 'Store taken offline');
  } catch (e) { next(e); }
});

/** GET /api/ondc/orders — list ONDC orders */
router.get('/orders', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { orders, total, page, limit } = await ondcService.listOndcOrders(outletId, req.query);
    sendPaginated(res, orders, total, page, limit, 'ONDC orders retrieved');
  } catch (e) { next(e); }
});

/** POST /api/ondc/orders/:id/accept — accept order */
router.post('/orders/:id/accept', authenticate, async (req, res, next) => {
  try {
    const result = await ondcService.acceptOrder(req.params.id, req.body.prep_time_minutes);
    sendSuccess(res, result, 'Order accepted');
  } catch (e) { next(e); }
});

/** POST /api/ondc/orders/:id/reject — reject order */
router.post('/orders/:id/reject', authenticate, async (req, res, next) => {
  try {
    const result = await ondcService.rejectOrder(req.params.id, req.body.reason);
    sendSuccess(res, result, 'Order rejected');
  } catch (e) { next(e); }
});

/** PATCH /api/ondc/orders/:id/status — update order status */
router.patch('/orders/:id/status', authenticate, async (req, res, next) => {
  try {
    const result = await ondcService.updateOrderStatus(req.params.id, req.body.status);
    sendSuccess(res, result, 'Order status updated');
  } catch (e) { next(e); }
});

/** GET /api/ondc/analytics — order analytics */
router.get('/analytics', authenticate, async (req, res, next) => {
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
router.post('/simulate-order', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    // Temporarily set outlet as live for simulation
    const profile = await ondcService.getSellerProfile(outletId);
    if (!['live', 'verified', 'under_review'].includes(profile.status)) {
      // For simulation, temporarily mark as live
      const { getDbClient } = require('../../config/database');
      await getDbClient().ondcSellerProfile.update({ where: { id: profile.id }, data: { status: 'live', bpp_id: 'ondctest.msrm.in' } });
    }
    const result = await ondcService.simulateOrder(outletId);
    sendSuccess(res, result, 'Test ONDC order simulated');
  } catch (e) { next(e); }
});

module.exports = router;
