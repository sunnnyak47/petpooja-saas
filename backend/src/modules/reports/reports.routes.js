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
const { getDbClient } = require('../../config/database');
const { BadRequestError } = require('../../utils/errors');

/**
 * Resolve the outlet to scope a report to. Falls back to the caller's first
 * outlet for head-office owners/super_admins who have no outlet bound to their
 * token and did not pass ?outlet_id — preventing the Prisma "outlet_id must not
 * be null" 500. Throws a clean 400 if no outlet can be resolved.
 * @param {import('express').Request} req
 * @returns {Promise<string>} outlet UUID
 */
async function resolveOutletId(req) {
  let outletId = req.query.outlet_id || req.user.outlet_id;
  if (!outletId && req.user.head_office_id) {
    const prisma = getDbClient();
    const first = await prisma.outlet.findFirst({
      where: { head_office_id: req.user.head_office_id, is_deleted: false },
      orderBy: { created_at: 'asc' },
      select: { id: true },
    });
    outletId = first?.id;
  }
  if (!outletId) throw new BadRequestError('No outlet found for this account. Create an outlet or pass outlet_id.');
  return outletId;
}

/** GET /api/reports/dashboard */
router.get('/dashboard', authenticate, hasPermission('VIEW_DASHBOARD'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = await resolveOutletId(req);
    const data = await reportsService.getDashboard(outletId);
    sendSuccess(res, data, 'Dashboard data retrieved');
  } catch (error) { next(error); }
});

/** GET /api/reports/topSellingItems?limit=5 */
router.get('/topSellingItems', authenticate, hasPermission('VIEW_DASHBOARD'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = await resolveOutletId(req);
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

router.get('/bas-report', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const { sendSuccess } = require('../../utils/response');
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = req.query;
    const data = await reportsService.getBASReport(outletId, from, to);
    sendSuccess(res, data, 'BAS report');
  } catch (error) { next(error); }
});

/**
 * GET /api/reports/advanced?range=today|week|month|quarter
 * Comprehensive analytics: hourly heatmap, category breakdown, P&L, daily revenue.
 */
router.get('/advanced', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const range = req.query.range || 'week';
    const data = await reportsService.getAdvancedReport(outletId, range);
    sendSuccess(res, data, 'Advanced report retrieved');
  } catch (error) { next(error); }
});

/**
 * GET /api/reports/forecast
 * AI demand forecast for tomorrow — predicted revenue, orders, top items.
 * Uses weighted moving average on DailySummary + OrderItem history.
 */
router.get('/forecast', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const { getDemandForecast } = require('./forecast.service');
    const outletId = req.query.outlet_id || req.user.outlet_id;
    if (!outletId) return res.status(400).json({ success: false, message: 'Outlet ID required' });
    const data = await getDemandForecast(outletId);
    sendSuccess(res, data, 'Demand forecast');
  } catch (error) { next(error); }
});

/** GET /api/reports/payment-breakdown?outlet_id=&from=&to= */
router.get('/payment-breakdown', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) return res.status(400).json({ success: false, message: 'from and to date params required' });
    const data = await reportsService.getPaymentBreakdown(outletId, from, to);
    sendSuccess(res, data, 'Payment breakdown retrieved');
  } catch (error) { next(error); }
});

/**
 * GET /api/reports/summary?range=7d
 * Mobile app alias — aggregates revenue, orders and top items for the given range.
 * Delegates to existing report services so no new DB queries are needed.
 */
router.get('/summary', authenticate, hasPermission('VIEW_REPORTS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const range = req.query.range || '7d';

    // Map range string to a day count used by the existing services
    const rangeMap = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
    const days = rangeMap[range] || 7;

    // Gather data from existing services (each has its own try/catch so a
    // partial failure still returns a useful payload)
    let dailyRevenue = [];
    let topItems = [];
    let totalRevenue = 0;
    let totalOrders = 0;

    try {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      const trend = await reportsService.getRevenueTrend(outletId, from, to);
      if (Array.isArray(trend)) {
        dailyRevenue = trend;
        totalRevenue = trend.reduce((sum, d) => sum + (d.revenue || d.total || 0), 0);
      }
    } catch (_) { /* non-fatal */ }

    try {
      const top = await reportsService.getTopSellingItems(outletId, 5);
      if (Array.isArray(top)) topItems = top;
    } catch (_) { /* non-fatal */ }

    try {
      const dash = await reportsService.getDashboard(outletId);
      if (dash && typeof dash === 'object') {
        totalOrders = dash.total_orders || dash.orders || totalOrders;
      }
    } catch (_) { /* non-fatal */ }

    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    sendSuccess(res, {
      range,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_order_value: avgOrderValue,
      top_items: topItems,
      daily_revenue: dailyRevenue,
    }, 'Reports summary retrieved');
  } catch (error) { next(error); }
});

module.exports = router;
