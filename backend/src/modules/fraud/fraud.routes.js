/**
 * @fileoverview Staff Fraud Detection routes.
 * @module modules/fraud/fraud.routes
 */

const express = require('express');
const router  = express.Router();
const svc     = require('./fraud.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess }  = require('../../utils/response');

/** POST /api/fraud/detect — trigger fraud detection scan */
router.post('/detect', authenticate, async (req, res, next) => {
  try {
    const outletId   = req.body.outlet_id || req.user.outlet_id;
    const thresholds = req.body.thresholds || {};
    sendSuccess(res, await svc.runDetection(outletId, thresholds), 'Fraud detection complete');
  } catch (e) { next(e); }
});

/** GET /api/fraud/alerts — list alerts (paginated, filterable) */
router.get('/alerts', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const opts = {
      page:       +req.query.page  || 1,
      limit:      +req.query.limit || 20,
      severity:   req.query.severity   || undefined,
      alert_type: req.query.alert_type || undefined,
      staff_id:   req.query.staff_id   || undefined,
      unread_only: req.query.unread === 'true',
    };
    sendSuccess(res, await svc.listAlerts(outletId, opts), 'Fraud alerts retrieved');
  } catch (e) { next(e); }
});

/** GET /api/fraud/stats — summary stats */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.getAlertStats(outletId), 'Fraud stats retrieved');
  } catch (e) { next(e); }
});

/** GET /api/fraud/staff-risks — risk profiles for all staff */
router.get('/staff-risks', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.getStaffRiskProfiles(outletId), 'Staff risk profiles retrieved');
  } catch (e) { next(e); }
});

/** PATCH /api/fraud/alerts/:id/read */
router.patch('/alerts/:id/read', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.markRead(outletId, req.params.id), 'Alert marked read');
  } catch (e) { next(e); }
});

/** POST /api/fraud/alerts/read-all */
router.post('/alerts/read-all', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.markAllRead(outletId), 'All alerts marked read');
  } catch (e) { next(e); }
});

/** PATCH /api/fraud/alerts/:id/dismiss */
router.patch('/alerts/:id/dismiss', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.dismissAlert(outletId, req.params.id), 'Alert dismissed');
  } catch (e) { next(e); }
});

/** PATCH /api/fraud/alerts/:id/resolve */
router.patch('/alerts/:id/resolve', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.resolveAlert(outletId, req.params.id, req.body.note), 'Alert resolved');
  } catch (e) { next(e); }
});

module.exports = router;
