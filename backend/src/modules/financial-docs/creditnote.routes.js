/**
 * @fileoverview Credit Note routes — GST document layer for refunds/returns/adjustments.
 * Mounted at /api/credit-notes.
 * @module modules/financial-docs/creditnote.routes
 */

const express = require('express');
const router = express.Router();

const creditNoteController = require('./creditnote.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope, checkLicense } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { auditLog } = require('../../middleware/audit.middleware');
const { createCreditNoteSchema, cancelCreditNoteSchema } = require('./creditnote.validation');

router.get('/', authenticate, checkLicense, enforceOutletScope, creditNoteController.list);
router.get('/stats', authenticate, checkLicense, enforceOutletScope, creditNoteController.stats);
router.get('/:id', authenticate, checkLicense, enforceOutletScope, creditNoteController.getOne);

router.post(
  '/',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  validate(createCreditNoteSchema),
  auditLog('credit_note'),
  creditNoteController.create
);

router.post(
  '/:id/cancel',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  validate(cancelCreditNoteSchema),
  auditLog('credit_note'),
  creditNoteController.cancel
);

module.exports = router;
