/**
 * @fileoverview Table controller — HTTP handlers for table and floor plan management.
 * @module modules/orders/table.controller
 */

const tableService = require('./table.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

/** GET /api/orders/tables?outlet_id=&area_id=&status= */
async function listTables(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const tables = await tableService.listTables(outletId, req.query);
    sendSuccess(res, tables, 'Tables retrieved successfully');
  } catch (error) { next(error); }
}

/** POST /api/orders/tables */
async function createTable(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const table = await tableService.createTable({ ...req.body, outlet_id: outletId });
    sendCreated(res, table, 'Table created successfully');
  } catch (error) { next(error); }
}

/** PATCH /api/orders/tables/:id */
async function updateTable(req, res, next) {
  try {
    const table = await tableService.updateTable(req.params.id, req.body);
    sendSuccess(res, table, 'Table updated');
  } catch (error) { next(error); }
}

/** PATCH /api/orders/tables/:id/status */
async function updateTableStatus(req, res, next) {
  try {
    const table = await tableService.updateTableStatus(req.params.id, req.body.status);
    sendSuccess(res, table, 'Table status updated');
  } catch (error) { next(error); }
}

/** DELETE /api/orders/tables/:id */
async function deleteTable(req, res, next) {
  try {
    await tableService.deleteTable(req.params.id);
    sendSuccess(res, null, 'Table deleted');
  } catch (error) { next(error); }
}

/** POST /api/orders/tables/floor-plan — bulk save entire layout */
async function saveFloorPlan(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const tables = await tableService.saveFloorPlan(outletId, req.body.tables, req.body.areas);
    sendSuccess(res, tables, 'Floor plan saved successfully');
  } catch (error) { next(error); }
}

/** GET /api/orders/table-areas?outlet_id= */
async function listTableAreas(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const areas = await tableService.listTableAreas(outletId);
    sendSuccess(res, areas, 'Table areas retrieved');
  } catch (error) { next(error); }
}

/** POST /api/orders/table-areas */
async function createTableArea(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const area = await tableService.createTableArea({ ...req.body, outlet_id: outletId });
    sendCreated(res, area, 'Table area created');
  } catch (error) { next(error); }
}

/** PATCH /api/orders/table-areas/:id */
async function updateTableArea(req, res, next) {
  try {
    const area = await tableService.updateTableArea(req.params.id, req.body);
    sendSuccess(res, area, 'Table area updated');
  } catch (error) { next(error); }
}

/** DELETE /api/orders/table-areas/:id */
async function deleteTableArea(req, res, next) {
  try {
    await tableService.deleteTableArea(req.params.id);
    sendSuccess(res, null, 'Table area deleted');
  } catch (error) { next(error); }
}

module.exports = {
  listTables,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
  saveFloorPlan,
  listTableAreas,
  createTableArea,
  updateTableArea,
  deleteTableArea,
};
