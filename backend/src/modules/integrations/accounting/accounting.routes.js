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

// OAuth2 flow
router.get('/xero/auth-url', authenticate, hasPermission('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const outletId = req.user.outlet_id;
    const state = `${outletId}:${Date.now()}`;
    const url = xeroService.getAuthorizationUrl(outletId, state);
    sendSuccess(res, { url, state }, 'Xero authorization URL');
  } catch (err) { next(err); }
});

router.post('/xero/callback', authenticate, hasPermission('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const { code } = req.body;
    const outletId = req.user.outlet_id;
    const result = await xeroService.exchangeCodeForTokens(outletId, code);
    sendSuccess(res, result, 'Connected to Xero');
  } catch (err) { next(err); }
});

// Connection management
router.get('/xero/status', authenticate, hasPermission('VIEW_SETTINGS'), async (req, res, next) => {
  try {
    const outletId = req.user.outlet_id;
    const result = await xeroService.getConnectionStatus(outletId);
    sendSuccess(res, result, 'Xero connection status');
  } catch (err) { next(err); }
});

router.post('/xero/disconnect', authenticate, hasPermission('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const outletId = req.user.outlet_id;
    const result = await xeroService.disconnect(outletId);
    sendSuccess(res, result, 'Disconnected from Xero');
  } catch (err) { next(err); }
});

// Sync operations
router.post('/xero/sync-daily', authenticate, hasPermission('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const { date } = req.body;
    const outletId = req.user.outlet_id;
    const result = await xeroService.syncDailySales(outletId, date);
    sendSuccess(res, result, 'Synced to Xero');
  } catch (err) { next(err); }
});

router.post('/xero/sync-po', authenticate, hasPermission('MANAGE_SETTINGS'), async (req, res, next) => {
  try {
    const { purchase_order_id } = req.body;
    const outletId = req.user.outlet_id;
    const result = await xeroService.syncPurchaseOrder(outletId, { id: purchase_order_id });
    sendSuccess(res, result, 'PO synced as Bill in Xero');
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
