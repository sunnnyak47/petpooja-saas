/**
 * @fileoverview Own-delivery dispatch routes — delivery-as-a-service.
 * Mounted at /api/delivery. A restaurant requests/tracks/cancels a courier
 * (Uber Direct / DoorDash Drive) for its OWN orders.
 * @module modules/delivery/dispatch.routes
 */

const express = require('express');
const router = express.Router();

const controller = require('./dispatch.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkLicense, hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { quoteSchema, createSchema } = require('./dispatch.validation');

/* ── Provider webhook (public, no auth) ──────────────────────────────────────
   Registered first so the body parser (raw) applies before any JSON middleware
   added below. Providers POST status updates here; we always ack with 200. */
router.post('/webhook/:provider', express.raw({ type: '*/*' }), controller.webhook);

/* ── Quote: get a courier price/ETA (not persisted) ── */
router.post(
  '/quote',
  authenticate,
  checkLicense,
  enforceOutletScope,
  validate(quoteSchema),
  controller.quote,
);

/* ── Create: book a courier delivery ── */
router.post(
  '/',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  validate(createSchema),
  controller.create,
);

/* ── List dispatches for the outlet ── */
router.get('/', authenticate, checkLicense, enforceOutletScope, controller.list);

/* ── Get a single dispatch ── */
router.get('/:id', authenticate, checkLicense, enforceOutletScope, controller.getOne);

/* ── Cancel a dispatch ── */
router.post(
  '/:id/cancel',
  authenticate,
  checkLicense,
  enforceOutletScope,
  hasPermission('MANAGE_PAYMENTS'),
  controller.cancel,
);

module.exports = router;
