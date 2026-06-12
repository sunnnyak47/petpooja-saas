/**
 * @fileoverview Routes for the monitoring module.
 *   POST /report      — frontend crash ingest (optionalAuth)
 *   GET  /errors      — list (SuperAdmin, sa.audit.view)
 *   GET  /errors/:id  — single (SuperAdmin, sa.audit.view)
 *   PATCH /errors/:id/resolve — resolve/re-open (SuperAdmin, sa.audit.view)
 *   GET  /stats       — aggregates (SuperAdmin, sa.audit.view)
 * @module modules/monitoring/monitoring.routes
 */

const router = require('express').Router();
const controller = require('./monitoring.controller');
const {
  authenticate,
  isSuperAdmin,
  requirePlatformPermission,
  optionalAuth,
} = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { reportSchema, resolveSchema } = require('./monitoring.validation');

/** Public ingest endpoint for client-side crash reports. */
router.post('/report', optionalAuth, validate(reportSchema), controller.report);

/** Admin guard chain — platform staff holding the audit-view permission. */
const adminGuard = [authenticate, isSuperAdmin, requirePlatformPermission('sa.audit.view')];

router.get('/errors', adminGuard, controller.list);
router.get('/errors/:id', adminGuard, controller.getOne);
router.patch('/errors/:id/resolve', adminGuard, validate(resolveSchema), controller.setResolved);
router.get('/stats', adminGuard, controller.stats);

module.exports = router;
