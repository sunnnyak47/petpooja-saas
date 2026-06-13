/**
 * @fileoverview Aggregator commission & payout reconciliation routes.
 * Mounted at /api/aggregator-reconciliation.
 *
 * - GET  /commission-report     → per-platform gross / commission / net payout
 * - POST /payout-to-settlement  → turn an aggregator payout into a Settlement
 *
 * @module modules/integrations/aggregator-reconciliation.routes
 */

const router = require('express').Router();
const service = require('./aggregator.reconciliation.service');
const { sendSuccess, sendError } = require('../../utils/response');
const { authenticate } = require('../../middleware/auth.middleware');
const {
  checkLicense,
  hasPermission,
  enforceOutletScope,
} = require('../../middleware/rbac.middleware');

/**
 * Resolve the tenant outlet from body/query/token, requiring it to be present.
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveOutletId(req) {
  return req.body.outlet_id || req.query.outlet_id || req.user.outlet_id;
}

/**
 * GET /commission-report
 * Per-platform commission report for the scoped outlet.
 */
router.get(
  '/commission-report',
  authenticate,
  checkLicense,
  enforceOutletScope,
  async (req, res) => {
    try {
      const outletId = resolveOutletId(req);
      if (!outletId) return sendError(res, 400, 'outlet_id is required');

      const { from, to, platform } = req.query;
      const report = await service.commissionReport(outletId, { from, to, platform });
      return sendSuccess(res, report, 'Commission report generated');
    } catch (err) {
      return sendError(res, err.statusCode || 500, err.message || 'Failed to build commission report');
    }
  }
);

/**
 * POST /payout-to-settlement
 * Create a reconcilable Settlement from an aggregator payout.
 */
router.post(
  '/payout-to-settlement',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  async (req, res) => {
    try {
      const outletId = resolveOutletId(req);
      if (!outletId) return sendError(res, 400, 'outlet_id is required');

      const { platform, from, to, reference } = req.body;
      const settlement = await service.payoutToSettlement(
        outletId,
        platform,
        { from, to, reference },
        req.user
      );
      return sendSuccess(res, settlement, 'Settlement created from payout');
    } catch (err) {
      return sendError(res, err.statusCode || 500, err.message || 'Failed to create settlement');
    }
  }
);

module.exports = router;
