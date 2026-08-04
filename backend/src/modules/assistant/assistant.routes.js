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
router.get('/shortcuts', authenticate, c.getShortcuts);
router.get('/schedules', authenticate, c.getSchedules);
router.post('/schedules', authenticate, c.addSchedule);
router.delete('/schedules/:id', authenticate, c.removeSchedule);
router.get('/docs', authenticate, c.getDocs);
router.post('/docs', authenticate, uploadLimiter, c.addDoc);
// Ingest an already-uploaded file (PDF/DOCX/TXT/image) into RAG knowledge.
router.post('/docs/ingest', authenticate, uploadLimiter, c.ingestDoc);
router.delete('/docs/:id', authenticate, c.removeDoc);
router.post('/ask', authenticate, uploadLimiter, c.ask);
// Confirm + execute a previewed write action. Permission is re-checked inside
// the service against the signed token; rate-limited like /ask.
router.post('/act', authenticate, uploadLimiter, c.act);
// Public by design — the signed, short-lived, outlet-scoped token in ?t= is the
// authorisation, so a plain browser download (no bearer header) works.
router.get('/report', c.downloadReport);

module.exports = router;
