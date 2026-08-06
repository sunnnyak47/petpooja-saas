/**
 * @fileoverview e-invoice routes — India GSTN IRN generation, status and
 * cancellation for B2B customer invoices. Mounted at /api/einvoice.
 * @module modules/accounting/einvoice.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./einvoice.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');

// Mirror accounting.routes.js: VIEW_REPORTS for reads, MANAGE_INVENTORY for writes.
const VIEW = hasPermission('VIEW_REPORTS');
const MANAGE = hasPermission('MANAGE_INVENTORY');

// einvoice.controller resolves outletId from body/query/JWT, so without outlet
// scoping a manager could target another tenant's invoice via outlet_id. Pin it
// (authenticate first to set req.user; the per-route authenticate re-runs safely).
router.use(authenticate, enforceOutletScope);

router.post('/generate', authenticate, MANAGE, c.generate);
router.get('/:id', authenticate, VIEW, c.status);
router.post('/cancel', authenticate, MANAGE, c.cancel);

module.exports = router;
