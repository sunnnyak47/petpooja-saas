/**
 * @fileoverview Xero Analytics routes.
 * Provides financial analytics endpoints derived from synced Xero accounting data.
 * @module modules/xero/xero.routes
 */

const express = require('express');
const router = express.Router();
const xeroService = require('./xero.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess, sendError } = require('../../utils/response');

/** GET /api/xero/connection */
router.get('/connection', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const data = await xeroService.getConnection(outletId);
    sendSuccess(res, data, 'Xero connection retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/overview?range=month|quarter|year|all */
router.get('/overview', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'year';
    const data = await xeroService.getOverview(outletId, range);
    sendSuccess(res, data, 'Xero overview retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/profit-loss?range=month|quarter|year|all */
router.get('/profit-loss', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'year';
    const data = await xeroService.getProfitLoss(outletId, range);
    sendSuccess(res, data, 'Profit & loss retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/expenses?range=month|quarter|year|all */
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'year';
    const data = await xeroService.getExpenseAnalysis(outletId, range);
    sendSuccess(res, data, 'Expense analysis retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/labour?range=month|quarter|year|all */
router.get('/labour', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'year';
    const data = await xeroService.getLabourAnalysis(outletId, range);
    sendSuccess(res, data, 'Labour analysis retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/seasonal */
router.get('/seasonal', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const data = await xeroService.getSeasonalInsights(outletId);
    sendSuccess(res, data, 'Seasonal insights retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/bank-cashflow?range=month|quarter|year|all */
router.get('/bank-cashflow', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'all';
    const data = await xeroService.getBankCashFlow(outletId, range);
    sendSuccess(res, data, 'Bank & cash flow retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/balance-sheet?range=month|quarter|year|all */
router.get('/balance-sheet', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'all';
    const data = await xeroService.getBalanceSheet(outletId, range);
    sendSuccess(res, data, 'Balance sheet retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/invoices?range=month|quarter|year|all */
router.get('/invoices', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'all';
    const data = await xeroService.getInvoiceStatus(outletId, range);
    sendSuccess(res, data, 'Invoice status retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/bas-returns */
router.get('/bas-returns', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const data = await xeroService.getBASReturns(outletId);
    sendSuccess(res, data, 'BAS returns retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/contacts */
router.get('/contacts', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const data = await xeroService.getContactsAnalysis(outletId);
    sendSuccess(res, data, 'Contacts analysis retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/tracking?range=month|quarter|year|all */
router.get('/tracking', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const range = req.query.range || 'all';
    const data = await xeroService.getTrackingAnalysis(outletId, range);
    sendSuccess(res, data, 'Tracking analysis retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

/** GET /api/xero/predictions */
router.get('/predictions', authenticate, async (req, res) => {
  try {
    const outletId = req.user.outlet_id;
    const data = await xeroService.getPredictions(outletId);
    sendSuccess(res, data, 'Predictions retrieved');
  } catch (error) {
    sendError(res, 500, error.message);
  }
});

module.exports = router;
