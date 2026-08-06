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
const { enforceOutletScope } = require('../../middleware/rbac.middleware');
const { uploadLimiter } = require('../../middleware/rateLimit.middleware');

// enforceOutletScope (the codebase-standard cross-tenant guard) rejects a
// mismatched client outlet_id for non-owner roles and defaults them to their own
// outlet, while owners/super_admins keep multi-outlet access. Without it a
// non-owner could pass an arbitrary outlet_id and read/act on another tenant.
router.get('/capabilities', authenticate, c.capabilities);
router.get('/alerts', authenticate, enforceOutletScope, c.getAlerts);
router.get('/insights', authenticate, enforceOutletScope, c.getInsights);
router.get('/shortcuts', authenticate, enforceOutletScope, c.getShortcuts);
router.get('/schedules', authenticate, enforceOutletScope, c.getSchedules);
router.post('/schedules', authenticate, enforceOutletScope, c.addSchedule);
router.delete('/schedules/:id', authenticate, enforceOutletScope, c.removeSchedule);
router.get('/docs', authenticate, enforceOutletScope, c.getDocs);
router.post('/docs', authenticate, enforceOutletScope, uploadLimiter, c.addDoc);
// Ingest an already-uploaded file (PDF/DOCX/TXT/image) into RAG knowledge.
router.post('/docs/ingest', authenticate, enforceOutletScope, uploadLimiter, c.ingestDoc);
router.delete('/docs/:id', authenticate, enforceOutletScope, c.removeDoc);
router.post('/ask', authenticate, enforceOutletScope, uploadLimiter, c.ask);
// Confirm + execute a previewed write action. Permission is re-checked inside
// the service against the signed token; rate-limited like /ask.
router.post('/act', authenticate, enforceOutletScope, uploadLimiter, c.act);
// Public by design — the signed, short-lived, outlet-scoped token in ?t= is the
// authorisation, so a plain browser download (no bearer header) works.
router.get('/report', c.downloadReport);

module.exports = router;
