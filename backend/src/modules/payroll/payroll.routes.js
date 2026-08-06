/**
 * @fileoverview Payroll routes — Pay Runs.
 * @module modules/payroll/payroll.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./payroll.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const v = require('./payroll.validation');

const VIEW = hasPermission('VIEW_REPORTS');
// Fix 1: gate create/finalise on the finance permission MANAGE_PAYMENTS, not MANAGE_INVENTORY.
// A wages/PAYG/super journal posts to the GL, so an inventory-only principal must NOT be able
// to run/finalise payroll — this closes a cross-module authority leak (no MANAGE_PAYROLL exists;
// owners bypass, managers hold MANAGE_PAYMENTS).
const MANAGE = hasPermission('MANAGE_PAYMENTS');

/* ── Pay Runs ──────────────────────────────────── */
// Fix 2/3: enforceOutletScope on every route (matching the settlements pattern) so a scoped
// (non-owner) user cannot read/create/finalise pay runs or post journals into another outlet via
// an attacker-supplied outlet_id — the controller trusts req.query/body.outlet_id. Placed before
// validate on POST so req.body.outlet_id is checked/backfilled before the schema is applied.
router.get('/pay-runs', authenticate, enforceOutletScope, VIEW, c.list);
router.get('/pay-runs/:id', authenticate, enforceOutletScope, VIEW, c.get);
router.post('/pay-runs', authenticate, enforceOutletScope, MANAGE, validate(v.createPayRunSchema), c.create);
router.post('/pay-runs/:id/finalise', authenticate, enforceOutletScope, MANAGE, validate(v.finalisePayRunSchema), c.finalise);

module.exports = router;
