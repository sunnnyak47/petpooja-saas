/**
 * @fileoverview Accounting routes for Tally and other ERP integrations.
 */

const express = require('express');
const router = express.Router();
const accountingController = require('./accounting.controller');
const { authenticate } = require('../../../middleware/auth.middleware');
const { hasPermission } = require('../../../middleware/rbac.middleware');

/**
 * Tally Mapping Routes
 */
router.get('/tally/mappings', authenticate, hasPermission('VIEW_SETTINGS'), accountingController.getTallyMappings);
router.post('/tally/mappings', authenticate, hasPermission('MANAGE_SETTINGS'), accountingController.updateTallyMapping);

/**
 * Tally Export Routes
 */
router.get('/tally/export/sales', authenticate, hasPermission('VIEW_REPORTS'), accountingController.exportTallySales);

module.exports = router;
