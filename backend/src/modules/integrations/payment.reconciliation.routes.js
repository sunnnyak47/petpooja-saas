/**
 * @fileoverview Payment reconciliation routes — read-only reporting endpoint
 * that reconciles recorded/gateway payments against orders for an outlet.
 * Mounted at /api/payment-reconciliation.
 * @module modules/integrations/payment.reconciliation.routes
 */

const express = require('express');
const router = express.Router();
const { reconcile } = require('./payment.reconciliation.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { sendSuccess } = require('../../utils/response');

/**
 * GET /api/payment-reconciliation
 * Query: outlet_id? (defaults to req.user.outlet_id), from?, to?
 * Auth: authenticated + VIEW_REPORTS permission.
 * Returns the reconciliation summary for the outlet over [from, to].
 */
router.get('/', authenticate, hasPermission('VIEW_REPORTS'), async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = req.query;
    const data = await reconcile(outletId, from, to);
    sendSuccess(res, data, 'Payment reconciliation');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
