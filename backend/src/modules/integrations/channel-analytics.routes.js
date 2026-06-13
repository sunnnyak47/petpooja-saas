/**
 * @fileoverview Per-channel analytics routes.
 * Mounted at /api/channel-analytics.
 *
 * - GET /summary    → per-channel orders / gross / AOV / cancel-rate / prep / commission / net
 * - GET /top-items  → top-selling items, optionally scoped to a single channel
 * - GET /trend      → daily gross-per-channel time series
 *
 * All endpoints are outlet-scoped: a non-superadmin caller is locked to their own
 * outlet by `enforceOutletScope`; the resolved outlet id comes from the token
 * (or an explicit `outlet_id` query for platform-level callers).
 *
 * @module modules/integrations/channel-analytics.routes
 */

const router = require('express').Router();
const service = require('./channel-analytics.service');
const { sendSuccess } = require('../../utils/response');
const { authenticate } = require('../../middleware/auth.middleware');
const { enforceOutletScope } = require('../../middleware/rbac.middleware');

/**
 * Resolve the tenant outlet for the request (token first, then query).
 * @param {import('express').Request} req
 * @returns {string|undefined}
 */
function resolveOutletId(req) {
  return req.user.outlet_id || req.query.outlet_id;
}

/**
 * GET /summary — per-channel performance summary.
 */
router.get('/summary', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = resolveOutletId(req);
    const data = await service.summary(outletId, req.query);
    return sendSuccess(res, data, 'Channel summary retrieved');
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /top-items — top-selling items, optionally filtered by channel.
 */
router.get('/top-items', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = resolveOutletId(req);
    const data = await service.topItems(outletId, req.query);
    return sendSuccess(res, data, 'Top items retrieved');
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /trend — daily gross-per-channel trend.
 */
router.get('/trend', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = resolveOutletId(req);
    const data = await service.trend(outletId, req.query);
    return sendSuccess(res, data, 'Channel trend retrieved');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
