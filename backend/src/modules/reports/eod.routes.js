/**
 * @fileoverview EOD (Close-of-Day) report routes.
 * @module modules/reports/eod.routes
 */

const express = require('express');
const router  = express.Router();
const eod     = require('./eod.service');
const { authenticate }     = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate }         = require('../../middleware/validate.middleware');
const { saveDraftSchema, lockEODSchema } = require('./eod.validation');
const { sendSuccess }      = require('../../utils/response');
const { BadRequestError, ForbiddenError } = require('../../utils/errors');
const { getDbClient }      = require('../../config/database');

/** M9: reject malformed date params before they reach new Date()/Prisma. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function assertValidDate(date) {
  if (date != null && !DATE_RE.test(String(date))) {
    throw new BadRequestError('Invalid date format; expected YYYY-MM-DD');
  }
}

/**
 * Resolve and tenant-verify the outlet to scope an EOD report to. Mirrors the
 * helper in reports.routes.js. Closes an IDOR: the EOD GET routes previously ran
 * only `authenticate`, so any authed user could read another outlet's financial
 * EOD via ?outlet_id, and an owner could read/lock another CHAIN's EOD by
 * guessing an outlet UUID. An explicit outlet_id (query or body) must belong to
 * the caller's head office (super_admin excepted); otherwise fall back to the
 * caller's own/first outlet.
 * @param {import('express').Request} req
 * @returns {Promise<string>} outlet UUID
 */
async function resolveOutletId(req) {
  const prisma = getDbClient();
  const explicit = req.query.outlet_id || (req.body && req.body.outlet_id);
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

/* ── GET /api/reports/eod/preview — live snapshot of today (no save) ── */
router.get('/preview', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = await resolveOutletId(req);
    assertValidDate(req.query.date);
    const date     = req.query.date || new Date().toISOString().slice(0, 10);
    const data     = await eod.generateSnapshot(outletId, date);
    sendSuccess(res, data, 'EOD preview generated');
  } catch (e) { next(e); }
});

/* ── GET /api/reports/eod/history — past EOD reports ── */
router.get('/history', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = await resolveOutletId(req);
    const limit    = Number(req.query.limit) || 30;
    const data     = await eod.getHistory(outletId, limit);
    sendSuccess(res, data, 'EOD history retrieved');
  } catch (e) { next(e); }
});

/* ── GET /api/reports/eod/:date — get report for a specific date ── */
router.get('/:date', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = await resolveOutletId(req);
    assertValidDate(req.params.date);
    const data     = await eod.getReportByDate(outletId, req.params.date);
    sendSuccess(res, data, 'EOD report retrieved');
  } catch (e) { next(e); }
});

/* ── POST /api/reports/eod/save — save / update draft ── */
router.post('/save', authenticate, hasPermission('MANAGE_POS'), enforceOutletScope, validate(saveDraftSchema), async (req, res, next) => {
  try {
    const outletId = await resolveOutletId(req);
    const {
      date = new Date().toISOString().slice(0, 10),
      opening_cash       = 0,
      denomination_count = {},
      notes,
      discrepancy_reason,
    } = req.body;

    const report = await eod.saveDraft(outletId, req.user.id, {
      date,
      openingCash:        opening_cash,
      denominationCount:  denomination_count,
      notes,
      discrepancyReason:  discrepancy_reason,
    });
    sendSuccess(res, report, 'EOD draft saved');
  } catch (e) { next(e); }
});

/* ── POST /api/reports/eod/lock — finalise & lock ── */
router.post('/lock', authenticate, hasPermission('MANAGE_POS'), enforceOutletScope, validate(lockEODSchema), async (req, res, next) => {
  try {
    const outletId = await resolveOutletId(req);
    const { report_id } = req.body;
    if (!report_id) return res.status(400).json({ success: false, message: 'report_id required' });
    const report = await eod.lockEOD(outletId, report_id, req.user.id);
    sendSuccess(res, report, 'EOD report locked successfully');
  } catch (e) { next(e); }
});

module.exports = router;
