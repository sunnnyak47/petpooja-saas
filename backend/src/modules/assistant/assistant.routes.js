/**
 * @fileoverview Assistant routes. Mounted at /api/assistant.
 * Read-only AI assistant — authenticated, rate-limited. Every tool it can run
 * is permission-gated inside the service, scoped to the user's outlet.
 * @module modules/assistant/assistant.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./assistant.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { uploadLimiter } = require('../../middleware/rateLimit.middleware');

router.get('/capabilities', authenticate, c.capabilities);
router.get('/alerts', authenticate, c.getAlerts);
router.get('/insights', authenticate, c.getInsights);
router.post('/ask', authenticate, uploadLimiter, c.ask);
// Confirm + execute a previewed write action. Permission is re-checked inside
// the service against the signed token; rate-limited like /ask.
router.post('/act', authenticate, uploadLimiter, c.act);
// Public by design — the signed, short-lived, outlet-scoped token in ?t= is the
// authorisation, so a plain browser download (no bearer header) works.
router.get('/report', c.downloadReport);

module.exports = router;
