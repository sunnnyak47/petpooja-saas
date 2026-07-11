/**
 * @fileoverview Documents routes — Licenses & files (per outlet).
 * Mounted at /api/documents by app.js, so paths here are relative:
 *   GET    /api/documents        POST /api/documents        DELETE /api/documents/:id
 * @module modules/documents/documents.routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const c = require('./documents.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const v = require('./documents.validation');

// Same in-memory multer approach as the head-office logo upload. 10MB cap —
// licenses/contracts are usually PDFs or images.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const VIEW = hasPermission('VIEW_SETTINGS');
const MANAGE = hasPermission('MANAGE_SETTINGS');

// enforceOutletScope: super_admin/owner keep multi-outlet access; a non-owner
// manager is pinned to their own outlet_id and cannot read/write another outlet's
// documents (closes the cross-tenant IDOR gap).

/** GET /api/documents?outlet_id= — list outlet-scoped documents */
router.get('/', authenticate, VIEW, enforceOutletScope, validate(v.listQuerySchema, 'query'), c.list);

/** POST /api/documents — multipart: file + name + category + expires_at */
router.post(
  '/',
  authenticate,
  MANAGE,
  upload.single('file'),          // must run FIRST so req.body (incl. outlet_id) is populated
  enforceOutletScope,             // ...then scope-check the now-parsed outlet_id
  validate(v.createDocumentSchema),
  c.create
);

/** DELETE /api/documents/:id — soft delete */
router.delete('/:id', authenticate, MANAGE, enforceOutletScope, c.remove);

module.exports = router;
