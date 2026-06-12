/**
 * @fileoverview Settlement reconciliation routes.
 * Mounted at /api/settlements.
 * @module modules/settlements/settlement.routes
 */

const express = require('express');
const router = express.Router();
const controller = require('./settlement.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkLicense, hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createSettlementSchema, addLinesSchema } = require('./settlement.validation');

router.get('/', authenticate, checkLicense, enforceOutletScope, controller.list);
router.get('/stats', authenticate, checkLicense, enforceOutletScope, controller.stats);
router.get('/:id', authenticate, checkLicense, enforceOutletScope, controller.getOne);

router.post(
  '/',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  validate(createSettlementSchema),
  controller.create
);

router.post(
  '/:id/lines',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  validate(addLinesSchema),
  controller.addLines
);

router.post(
  '/:id/reconcile',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  controller.reconcile
);

router.post(
  '/:id/close',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  controller.close
);

router.delete(
  '/:id',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  controller.remove
);

module.exports = router;
