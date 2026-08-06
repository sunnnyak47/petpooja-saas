/**
 * @fileoverview GST return controllers — thin handlers that resolve the outlet
 * and date range, then delegate to the GSTR service.
 * @module modules/reports/gstr.controller
 */

const gstrService = require('./gstr.service');
const { sendSuccess } = require('../../utils/response');
const { getDbClient } = require('../../config/database');
const { BadRequestError, ForbiddenError } = require('../../utils/errors');

/**
 * Resolve and tenant-verify the outlet to scope a GST return to. Mirrors the
 * helper in reports.routes.js. enforceOutletScope already blocks non-owners from
 * passing a foreign outlet_id, but owners/super_admins bypass it — so a raw
 * ?outlet_id let an owner read another CHAIN's GST returns (cross-tenant IDOR).
 * An explicit outlet_id must belong to the caller's head office (super_admin
 * excepted); otherwise fall back to the caller's own/first outlet.
 * @param {import('express').Request} req
 * @returns {Promise<string>} outlet UUID
 */
async function resolveOutletId(req) {
  const prisma = getDbClient();
  const explicit = req.query.outlet_id;
  if (explicit) {
    if (req.user.role !== 'super_admin') {
      const owned = await prisma.outlet.findFirst({
        where: { id: explicit, head_office_id: req.user.head_office_id, is_deleted: false },
        select: { id: true },
      });
      if (!owned) throw new ForbiddenError('Access denied: that outlet is not in your account.');
    }
    return explicit;
  }
  let outletId = req.user.outlet_id;
  if (!outletId && req.user.head_office_id) {
    const first = await prisma.outlet.findFirst({
      where: { head_office_id: req.user.head_office_id, is_deleted: false },
      orderBy: { created_at: 'asc' },
      select: { id: true },
    });
    outletId = first?.id;
  }
  if (!outletId) throw new BadRequestError('No outlet found for this account. Create an outlet or pass outlet_id.');
  return outletId;
}

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
    const outletId = await resolveOutletId(req);
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
    const outletId = await resolveOutletId(req);
    const { from, to } = resolveRange(req);
    const data = await gstrService.getGstr3b(outletId, from, to, req.query.tz);
    sendSuccess(res, data, 'GSTR-3B');
  } catch (error) {
    next(error);
  }
}

module.exports = { getGstr1, getGstr3b };
