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
const { validate } = require('../../middleware/validate.middleware');
const { updateKOTStatusSchema, markItemReadySchema } = require('./kot.validation');
const { sendSuccess } = require('../../utils/response');
const { pushStatusForKot } = require('../integrations/aggregator.status.service');

/* ══════════════════════════════════════════════════════
   KOT ENDPOINTS — used by Kitchen Display System (KDS)
══════════════════════════════════════════════════════ */

// GET /api/kitchen/kots  ← KDS frontend calls this
router.get(['/kots', '/kot/pending', '/', '/pending'], authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const kots = await kotService.listPendingKOTs(outletId, req.query);
    sendSuccess(res, kots, 'KOTs retrieved');
  } catch (error) { next(error); }
});

// PUT /api/kitchen/kots/:id/status  ← KDS bump button (pending→preparing→ready→served)
router.put('/kots/:id/status', authenticate, enforceOutletScope, validate(updateKOTStatusSchema), async (req, res, next) => {
  try {
    const { status, outlet_id } = req.body;
    const kotId = req.params.id;
    const prisma = require('../../config/database').getDbClient();

    // Tenant isolation: non-privileged callers can only touch KOTs in their own
    // outlet. Without this, any outlet could bump/serve another outlet's tickets by ID.
    const isPrivileged = ['super_admin', 'owner'].includes(req.user.role);
    const kotWhere = isPrivileged ? { id: kotId } : { id: kotId, outlet_id: req.user.outlet_id };

    const kot = await prisma.kOT.findFirst({ where: kotWhere, include: { order: true } });
    if (!kot) return next(Object.assign(new Error('KOT not found'), { status: 404 }));

    const updated = await prisma.kOT.update({
      where: { id: kotId },
      data: {
        status,
        ...(status === 'preparing' && !kot.started_at ? { started_at: new Date() } : {}),
        ...(status === 'served' || status === 'completed' ? { completed_at: new Date() } : {}),
      },
    });

    // Whenever this KOT reaches a done state (ready/served/completed) — even when
    // the KDS bumps it straight to 'served'/'completed', skipping 'ready' — roll
    // the parent order up to 'ready', record the transition, and trigger auto-free.
    // Shared with completeKOT so both paths behave identically. The helper only
    // advances an order still in the kitchen stage (created/confirmed), so a
    // prepaid/paid order is never clobbered back to 'ready'.
    let rolledUp = false;
    if (['ready', 'served', 'completed'].includes(status)) {
      rolledUp = await kotService.rollUpOrderIfKitchenDone(prisma, kot.order_id, kotId, kot.order.status);
    }

    const { getIO } = require('../../socket/index');
    const io = getIO();
    if (io) {
      const outId = outlet_id || kot.outlet_id;
      io.of('/kitchen').to(`outlet:${outId}`).emit('kot_complete', { kot_id: kotId, status });
      io.of('/orders').to(`outlet:${outId}`).emit('order_status_change', {
        order_id: kot.order_id, status: rolledUp ? 'ready' : kot.order.status,
      });
    }

    // Push the new status back to the delivery aggregator (if this is an
    // aggregator order). Fire-and-forget — never blocks/fails the KDS update.
    Promise.resolve().then(() => pushStatusForKot(kotId, status)).catch(() => {});

    sendSuccess(res, updated, 'KOT status updated');
  } catch (error) { next(error); }
});

// Helper: non-privileged callers are scoped to their own outlet; super_admin/owner are not.
function scopedOutlet(req) {
  return ['super_admin', 'owner'].includes(req.user.role) ? null : req.user.outlet_id;
}

// PUT /api/kitchen/kots/:kotId/items/:itemId/ready  ← KDS item tick
router.put('/kots/:kotId/items/:itemId/ready', authenticate, async (req, res, next) => {
  try {
    const result = await kotService.markItemReady(req.params.kotId, req.params.itemId, scopedOutlet(req));
    sendSuccess(res, result, 'Item marked as ready');
  } catch (error) { next(error); }
});

// PUT /api/kitchen/orders/:orderId/serve  ← expo "serve whole order" (all ready station tickets at once)
router.put('/orders/:orderId/serve', authenticate, async (req, res, next) => {
  try {
    const result = await kotService.serveOrder(req.params.orderId, scopedOutlet(req));
    sendSuccess(res, result, 'Order served');
  } catch (error) { next(error); }
});

// Legacy routes (kept for backwards compat)
router.patch('/kot/:id/item-ready', authenticate, validate(markItemReadySchema), async (req, res, next) => {
  try {
    const result = await kotService.markItemReady(req.params.id, req.body.kot_item_id, scopedOutlet(req));
    sendSuccess(res, result, 'Item marked as ready');
  } catch (error) { next(error); }
});

router.patch('/kot/:id/complete', authenticate, async (req, res, next) => {
  try {
    const result = await kotService.completeKOT(req.params.id, scopedOutlet(req));
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

// Bulk-create multiple tables with different configs in one call.
router.post('/tables/bulk', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await tableService.bulkCreateTables(outletId, req.body.tables || req.body.rows);
    sendSuccess(res, result, `${result.created} table(s) created`, 201);
  } catch (error) { next(error); }
});

router.delete('/tables/:id', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    await tableService.deleteTable(req.params.id);
    sendSuccess(res, null, 'Table deleted successfully');
  } catch (error) { next(error); }
});

// Bulk status update — tick-select multiple tables → mark free / change status.
// Defined BEFORE /tables/:id/status so 'bulk-status' isn't captured as an :id.
router.patch('/tables/bulk-status', authenticate, async (req, res, next) => {
  try {
    const { table_ids, status } = req.body;
    if (!Array.isArray(table_ids) || table_ids.length === 0) {
      return res.status(400).json({ success: false, data: null, message: 'table_ids is required' });
    }
    const valid = ['available', 'occupied', 'dirty', 'reserved', 'blocked'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid status' });
    }
    const result = await tableService.bulkUpdateTableStatus(table_ids, status);
    sendSuccess(res, result, `${result.updated} table(s) updated`);
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
