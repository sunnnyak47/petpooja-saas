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
const c = require('./performance.controller');

router.get('/health', authenticate, c.getHealth);
router.post('/refresh', authenticate, c.refresh);
router.get('/status', authenticate, c.getStatus);

module.exports = router;
