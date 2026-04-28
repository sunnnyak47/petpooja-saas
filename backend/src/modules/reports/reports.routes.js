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

/** GET /api/reports/gstDetailed?from=&to= */
router.get('/gstDetailed', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getGstDetailedReport(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'GST detailed report');
  } catch (error) { next(error); }
});

/** GET /api/reports/exportGst?from=&to=&type=gstr1|gstr3b|hsn|rate_wise */
router.get('/exportGst', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to, type = 'gstr1' } = req.query;
    const csv = await reportsService.exportGstCsv(outletId, from, to, type);
    const filename = `GST_${type}_${from}_to_${to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM for Excel compatibility
  } catch (error) { next(error); }
});

/** GET /api/reports/export */
router.get('/export', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const { type = 'full', outlet_id, from, to } = req.query;
    const outletId = outlet_id || req.user.outlet_id;

    if (['gstr1', 'gstr3b', 'hsn', 'rate_wise'].includes(type)) {
      const csv = await reportsService.exportGstCsv(outletId, from, to, type);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="GST_${type}_${from}_to_${to}.csv"`);
      return res.send('﻿' + csv);
    }

    // General report CSV
    const salesData = await reportsService.getDailySales(outletId, from || new Date().toISOString().split('T')[0]);
    let csv = 'Report Type,Date,Total Revenue,Total Orders,Total Tax,Total Discount\n';
    csv += `${type},${salesData.date},${salesData.total_revenue},${salesData.total_orders},${salesData.total_tax},${salesData.total_discount}\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report_${type}.csv"`);
    res.send('﻿' + csv);
  } catch (error) { next(error); }
});

/** GET /api/reports/franchise-kpis?from=&to= */
router.get('/franchise-kpis', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const { sendSuccess } = require('../../utils/response');
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getFranchiseKPIs(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'Franchise KPIs');
  } catch (error) { next(error); }
});

/** GET /api/reports/inventory-valuation */
router.get('/inventory-valuation', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const { sendSuccess } = require('../../utils/response');
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getInventoryValuation(outletId);
    sendSuccess(res, data, 'Inventory valuation');
  } catch (error) { next(error); }
});

/** GET /api/reports/revenue-trend-range?from=&to= */
router.get('/revenue-trend-range', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const { sendSuccess } = require('../../utils/response');
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const data = await reportsService.getRevenueTrendRange(outletId, req.query.from, req.query.to);
    sendSuccess(res, data, 'Revenue trend');
  } catch (error) { next(error); }
});

module.exports = router;
