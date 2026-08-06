/**
 * @fileoverview Performance routes — business health analytics endpoints.
 * Mounted at /api/performance in app.js.
 *
 * Endpoints:
 *   GET  /api/performance/health   - Business health snapshot (optional from/to query, defaults to last 30 days).
 *   POST /api/performance/refresh  - Force-refresh Square data for the outlet.
 *   GET  /api/performance/status   - Integration status (Square, Xero, last snapshot, configured).
 *
 * All endpoints require authentication. Outlet is resolved from
 * `req.query.outlet_id` or the authenticated user's `outlet_id`.
 * @module modules/performance/performance.routes
 */

const express = require('express');
const router = express.Router();

const { authenticate } = require('../../middleware/auth.middleware');
const { enforceOutletScope } = require('../../middleware/rbac.middleware');
const c = require('./performance.controller');

// enforceOutletScope prevents a non-owner from reading/refreshing another
// outlet's financials via an attacker-supplied ?outlet_id (owner/super_admin
// bypass keeps multi-outlet access; a mismatched outlet_id is rejected, and a
// non-owner with no outlet_id defaults to their own — matching the controller).
router.get('/health', authenticate, enforceOutletScope, c.getHealth);
router.post('/refresh', authenticate, enforceOutletScope, c.refresh);
router.get('/status', authenticate, enforceOutletScope, c.getStatus);

module.exports = router;
