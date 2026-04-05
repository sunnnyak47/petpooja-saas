/**
 * @fileoverview Reports routes.
 * @module modules/reports/reports.routes
 */

const express = require('express');
const router = express.Router();
const reportsService = require('./reports.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { sendSuccess } = require('../../utils/response');

/** GET /api/reports/dashboard */
router.get('/dashboard', authenticate, hasPermission('VIEW_DASHBOARD'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getDashboard(outletId);
    sendSuccess(res, data, 'Dashboard data retrieved');
  } catch (error) { next(error); }
});

/** GET /api/reports/topSellingItems?limit=5 */
router.get('/topSellingItems', authenticate, hasPermission('VIEW_DASHBOARD'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const limit = parseInt(req.query.limit) || 5;
    const data = await reportsService.getTopSellingItems(outletId, limit);
    sendSuccess(res, data, 'Top selling items retrieved');
  } catch (error) { next(error); }
});

/** GET /api/reports/daily-sales?date=YYYY-MM-DD */
router.get('/daily-sales', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const data = await reportsService.getDailySales(outletId, date);
    sendSuccess(res, data, 'Daily sales report');
  } catch (error) { next(error); }
});

/** GET /api/reports/item-wise?from=&to=&top= */
router.get('/item-wise', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getItemWiseSales(
      outletId, req.query.from, req.query.to, parseInt(req.query.top) || 20
    );
    sendSuccess(res, data, 'Item-wise sales report');
  } catch (error) { next(error); }
});

/** GET /api/reports/revenue-trend?from=&to= */
router.get('/revenue-trend', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getRevenueTrend(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'Revenue trend report');
  } catch (error) { next(error); }
});

/** GET /api/reports/hourly?date= */
router.get('/hourly', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const data = await reportsService.getHourlyBreakdown(outletId, date);
    sendSuccess(res, data, 'Hourly breakdown report');
  } catch (error) { next(error); }
});

/** GET /api/reports/categoryWiseSales?from=&to= */
router.get('/categoryWiseSales', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getCategoryWiseSales(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'Category wise sales');
  } catch (error) { next(error); }
});

/** GET /api/reports/gstReport?from=&to= */
router.get('/gstReport', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getGstReport(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'GST report');
  } catch (error) { next(error); }
});

/** GET /api/reports/staffPerformance?from=&to= */
router.get('/staffPerformance', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getStaffPerformance(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'Staff performance');
  } catch (error) { next(error); }
});

/** GET /api/reports/export */
router.get('/export', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    // Stub CSV export response
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=report_${req.query.type}.csv`);
    res.send(`Date,Value\n${new Date().toISOString()},100`);
  } catch (error) { next(error); }
});

module.exports = router;
