/**
 * @fileoverview Payroll routes — Pay Runs.
 * @module modules/payroll/payroll.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./payroll.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const v = require('./payroll.validation');

const VIEW = hasPermission('VIEW_REPORTS');
const MANAGE = hasPermission('MANAGE_INVENTORY');

/* ── Pay Runs ──────────────────────────────────── */
router.get('/pay-runs', authenticate, VIEW, c.list);
router.get('/pay-runs/:id', authenticate, VIEW, c.get);
router.post('/pay-runs', authenticate, MANAGE, validate(v.createPayRunSchema), c.create);
router.post('/pay-runs/:id/finalise', authenticate, MANAGE, validate(v.finalisePayRunSchema), c.finalise);

module.exports = router;
