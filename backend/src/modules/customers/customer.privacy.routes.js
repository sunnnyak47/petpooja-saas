/**
 * @fileoverview India DPDP Act 2023 data-rights routes.
 * Mounted at `/api/privacy` (wired in app.js).
 * @module modules/customers/customer.privacy.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./customer.privacy.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');

/** Record / withdraw marketing consent. */
router.patch('/customers/:id/consent', authenticate, hasPermission('MANAGE_CUSTOMERS'), c.setConsent);

/** Export all data held about a customer (right to access / portability). */
router.get('/customers/:id/export', authenticate, hasPermission('VIEW_CUSTOMERS'), c.exportData);

/** Erase a customer's PII in place (right to erasure). */
router.post('/customers/:id/erase', authenticate, hasPermission('MANAGE_CUSTOMERS'), c.eraseCustomer);

module.exports = router;
