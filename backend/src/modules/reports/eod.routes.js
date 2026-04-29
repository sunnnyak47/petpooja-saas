/**
 * @fileoverview EOD (Close-of-Day) report routes.
 * @module modules/reports/eod.routes
 */

const express = require('express');
const router  = express.Router();
const eod     = require('./eod.service');
const { authenticate }     = require('../../middleware/auth.middleware');
const { hasPermission }    = require('../../middleware/rbac.middleware');
const { sendSuccess }      = require('../../utils/response');

/* ── GET /api/reports/eod/preview — live snapshot of today (no save) ── */
router.get('/preview', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const date     = req.query.date || new Date().toISOString().slice(0, 10);
    const data     = await eod.generateSnapshot(outletId, date);
    sendSuccess(res, data, 'EOD preview generated');
  } catch (e) { next(e); }
});

/* ── GET /api/reports/eod/history — past EOD reports ── */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const limit    = Number(req.query.limit) || 30;
    const data     = await eod.getHistory(outletId, limit);
    sendSuccess(res, data, 'EOD history retrieved');
  } catch (e) { next(e); }
});

/* ── GET /api/reports/eod/:date — get report for a specific date ── */
router.get('/:date', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data     = await eod.getReportByDate(outletId, req.params.date);
    sendSuccess(res, data, 'EOD report retrieved');
  } catch (e) { next(e); }
});

/* ── POST /api/reports/eod/save — save / update draft ── */
router.post('/save', authenticate, hasPermission('MANAGE_POS'), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
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
router.post('/lock', authenticate, hasPermission('MANAGE_POS'), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { report_id } = req.body;
    if (!report_id) return res.status(400).json({ success: false, message: 'report_id required' });
    const report = await eod.lockEOD(outletId, report_id, req.user.id);
    sendSuccess(res, report, 'EOD report locked successfully');
  } catch (e) { next(e); }
});

module.exports = router;
