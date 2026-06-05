/**
 * @fileoverview GST return controllers — thin handlers that resolve the outlet
 * and date range, then delegate to the GSTR service.
 * @module modules/reports/gstr.controller
 */

const gstrService = require('./gstr.service');
const { sendSuccess } = require('../../utils/response');

/**
 * Resolves the reporting date range from the request query.
 * Defaults: `from` = first day of the current month, `to` = today (both YYYY-MM-DD).
 * @param {import('express').Request} req
 * @returns {{from: string, to: string}}
 */
function resolveRange(req) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = req.query.from || monthStart.toISOString().split('T')[0];
  const to = req.query.to || now.toISOString().split('T')[0];
  return { from, to };
}

/**
 * GET /api/gst/gstr1 — outward supplies (B2CS + HSN) summary.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getGstr1(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = resolveRange(req);
    const data = await gstrService.getGstr1(outletId, from, to, req.query.tz);
    sendSuccess(res, data, 'GSTR-1');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/gst/gstr3b — monthly GST summary return.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getGstr3b(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = resolveRange(req);
    const data = await gstrService.getGstr3b(outletId, from, to, req.query.tz);
    sendSuccess(res, data, 'GSTR-3B');
  } catch (error) {
    next(error);
  }
}

module.exports = { getGstr1, getGstr3b };
