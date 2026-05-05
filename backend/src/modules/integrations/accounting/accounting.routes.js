/**
 * @fileoverview Accounting routes for Tally and other ERP integrations.
 */

const express = require('express');
const router = express.Router();
const accountingController = require('./accounting.controller');
const { authenticate } = require('../../../middleware/auth.middleware');
const { hasPermission } = require('../../../middleware/rbac.middleware');
const xeroService = require('./xero.service');
const { sendSuccess } = require('../../../utils/response');

/**
 * Tally Mapping Routes
 */
router.get('/tally/mappings', authenticate, hasPermission('VIEW_SETTINGS'), accountingController.getTallyMappings);
router.post('/tally/mappings', authenticate, hasPermission('MANAGE_SETTINGS'), accountingController.updateTallyMapping);

/**
 * Tally Export Routes
 */
router.get('/tally/export/sales', authenticate, hasPermission('VIEW_REPORTS'), accountingController.exportTallySales);

/**
 * Xero Integration Routes (AU)
 */
router.post('/xero/sync-daily', authenticate, hasPermission('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const { date, summary } = req.body;
    const outletId = req.user.outlet_id;
    const result = await xeroService.syncDailySales(outletId, date, summary);
    sendSuccess(res, result, 'Synced to Xero');
  } catch (err) { next(err); }
});

router.get('/xero/gst-summary', authenticate, hasPermission('VIEW_REPORTS'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const outletId = req.user.outlet_id;
    const result = await xeroService.getGSTSummary(outletId, from, to);
    sendSuccess(res, result, 'Xero GST summary');
  } catch (err) { next(err); }
});

module.exports = router;
