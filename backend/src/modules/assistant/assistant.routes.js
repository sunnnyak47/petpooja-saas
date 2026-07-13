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
router.post('/ask', authenticate, uploadLimiter, c.ask);

module.exports = router;
