/**
 * @fileoverview GST return routes — GSTR-1 and GSTR-3B exports.
 * Mounted at /api/gst in app.js.
 * @module modules/reports/gstr.routes
 */

const express = require('express');
const router = express.Router();
const gstrController = require('./gstr.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');

/** GET /api/gst/gstr1?outlet_id=&from=&to= — outward supplies (B2CS + HSN). */
router.get('/gstr1', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, gstrController.getGstr1);

/** GET /api/gst/gstr3b?outlet_id=&from=&to= — monthly GST summary return. */
router.get('/gstr3b', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, gstrController.getGstr3b);

module.exports = router;
