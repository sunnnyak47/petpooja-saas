/**
 * @fileoverview Performance controller — business health analytics backed by
 * Square + Xero integrations. Exposes health snapshot, manual refresh, and
 * integration status.
 * @module modules/performance/performance.controller
 */

const performanceService = require('./performance.service');
const { sendSuccess } = require('../../utils/response');

/** GET /api/performance/health */
async function getHealth(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await performanceService.getBusinessHealth(outletId, {
      from: req.query.from,
      to: req.query.to,
    });
    sendSuccess(res, data, 'Business health');
  } catch (e) {
    next(e);
  }
}

/** POST /api/performance/refresh */
async function refresh(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await performanceService.refresh(outletId);
    sendSuccess(
      res,
      result,
      result.ok ? 'Square data refreshed' : (result.message || 'Refresh failed')
    );
  } catch (e) {
    next(e);
  }
}

/** GET /api/performance/status */
async function getStatus(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await performanceService.getStatus(outletId), 'Performance status');
  } catch (e) {
    next(e);
  }
}

module.exports = { getHealth, refresh, getStatus };
