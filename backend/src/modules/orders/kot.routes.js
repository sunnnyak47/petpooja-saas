/**
 * @fileoverview KOT and Table routes.
 * @module modules/orders/kot.routes
 */

const express = require('express');
const router = express.Router();
const kotService = require('./kot.service');
const tableService = require('./table.service');
const prepAnalytics = require('./prep-analytics.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { enforceOutletScope } = require('../../middleware/rbac.middleware');
const { sendSuccess } = require('../../utils/response');

/* -- KOT Endpoints -- */
router.get(['/kot/pending', '/', '/pending'], authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const kots = await kotService.listPendingKOTs(outletId, req.query);
    sendSuccess(res, kots, 'Pending KOTs retrieved');
  } catch (error) { next(error); }
});

router.patch('/kot/:id/item-ready', authenticate, async (req, res, next) => {
  try {
    const result = await kotService.markItemReady(req.params.id, req.body.kot_item_id);
    sendSuccess(res, result, 'Item marked as ready');
  } catch (error) { next(error); }
});

router.patch('/kot/:id/complete', authenticate, async (req, res, next) => {
  try {
    const result = await kotService.completeKOT(req.params.id);
    sendSuccess(res, result, 'KOT completed');
  } catch (error) { next(error); }
});

/* -- Table Endpoints -- */
router.get('/tables', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const tables = await tableService.listTables(outletId, req.query);
    sendSuccess(res, tables, 'Tables retrieved');
  } catch (error) { next(error); }
});

router.post('/tables', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const data = { ...req.body, outlet_id: req.user.outlet_id };
    const table = await tableService.createTable(data);
    sendSuccess(res, table, 'Table created successfully', 201);
  } catch (error) { next(error); }
});

router.delete('/tables/:id', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    await tableService.deleteTable(req.params.id);
    sendSuccess(res, null, 'Table deleted successfully');
  } catch (error) { next(error); }
});

router.patch('/tables/:id/status', authenticate, async (req, res, next) => {
  try {
    const table = await tableService.updateTableStatus(req.params.id, req.body.status);
    sendSuccess(res, table, 'Table status updated');
  } catch (error) { next(error); }
});

router.get('/table-areas', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const areas = await tableService.listTableAreas(outletId);
    sendSuccess(res, areas, 'Table areas retrieved');
  } catch (error) { next(error); }
});

router.post('/table-areas', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const area = await tableService.createTableArea({ ...req.body, outlet_id: req.user.outlet_id });
    sendSuccess(res, area, 'Table area created', 201);
  } catch (error) { next(error); }
});

router.patch('/table-areas/:id', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const area = await tableService.updateTableArea(req.params.id, req.body);
    sendSuccess(res, area, 'Table area updated');
  } catch (error) { next(error); }
});

router.delete('/table-areas/:id', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    await tableService.deleteTableArea(req.params.id);
    sendSuccess(res, null, 'Table area deleted');
  } catch (error) { next(error); }
});

router.patch('/tables/:id', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const table = await tableService.updateTable(req.params.id, req.body);
    sendSuccess(res, table, 'Table updated');
  } catch (error) { next(error); }
});

router.post('/floor-plan', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const tables = await tableService.saveFloorPlan(outletId, req.body.tables, req.body.areas);
    sendSuccess(res, tables, 'Floor plan saved successfully');
  } catch (error) { next(error); }
});

/* ══════════════════════════════════════════════════════
   PREP TIME ANALYTICS
══════════════════════════════════════════════════════ */

function getDateRange(query) {
  return { from: query.from, to: query.to };
}

/** GET /api/kitchen/analytics/summary */
router.get('/analytics/summary', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = getDateRange(req.query);
    const data = await prepAnalytics.getSummary(outletId, from, to);
    sendSuccess(res, data, 'Prep time summary');
  } catch (err) { next(err); }
});

/** GET /api/kitchen/analytics/stations */
router.get('/analytics/stations', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = getDateRange(req.query);
    const data = await prepAnalytics.getStationStats(outletId, from, to);
    sendSuccess(res, data, 'Station prep stats');
  } catch (err) { next(err); }
});

/** GET /api/kitchen/analytics/items */
router.get('/analytics/items', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = getDateRange(req.query);
    const data = await prepAnalytics.getItemStats(outletId, from, to);
    sendSuccess(res, data, 'Item prep stats');
  } catch (err) { next(err); }
});

/** GET /api/kitchen/analytics/sla */
router.get('/analytics/sla', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = getDateRange(req.query);
    const data = await prepAnalytics.getSLACompliance(outletId, from, to);
    sendSuccess(res, data, 'SLA compliance');
  } catch (err) { next(err); }
});

/** GET /api/kitchen/analytics/heatmap */
router.get('/analytics/heatmap', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = getDateRange(req.query);
    const data = await prepAnalytics.getHourlyHeatmap(outletId, from, to);
    sendSuccess(res, data, 'Hourly heatmap');
  } catch (err) { next(err); }
});

/** GET /api/kitchen/analytics/trend */
router.get('/analytics/trend', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = getDateRange(req.query);
    const data = await prepAnalytics.getDailyTrend(outletId, from, to);
    sendSuccess(res, data, 'Daily prep time trend');
  } catch (err) { next(err); }
});

/** GET /api/kitchen/analytics/full — all-in-one for dashboard */
router.get('/analytics/full', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from, to } = getDateRange(req.query);
    const [summary, stations, items, sla, heatmap, trend] = await Promise.all([
      prepAnalytics.getSummary(outletId, from, to),
      prepAnalytics.getStationStats(outletId, from, to),
      prepAnalytics.getItemStats(outletId, from, to),
      prepAnalytics.getSLACompliance(outletId, from, to),
      prepAnalytics.getHourlyHeatmap(outletId, from, to),
      prepAnalytics.getDailyTrend(outletId, from, to),
    ]);
    sendSuccess(res, { summary, stations, items, sla, heatmap, trend }, 'Full prep analytics');
  } catch (err) { next(err); }
});

module.exports = router;
