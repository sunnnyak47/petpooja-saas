/**
 * @fileoverview Dashboard routes.
 * @module modules/dashboard/dashboard.routes
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { enforceOutletScope, checkLicense } = require('../../middleware/rbac.middleware');

/** GET /api/dashboard/summary */
router.get('/summary', authenticate, checkLicense, enforceOutletScope, dashboardController.getSummary);

/** GET /api/dashboard/live — real-time stats (polled every 30s) */
router.get('/live', authenticate, enforceOutletScope, dashboardController.getLive);

module.exports = router;
