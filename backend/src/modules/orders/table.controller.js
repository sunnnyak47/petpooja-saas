/**
 * @fileoverview Table controller — HTTP handlers for table and floor management.
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

/** PATCH /api/orders/tables/:id/status */
async function updateTableStatus(req, res, next) {
  try {
    const table = await tableService.updateTableStatus(req.params.id, req.body.status);
    sendSuccess(res, table, 'Table status updated');
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

/** POST /api/orders/tables */
async function createTable(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const table = await tableService.createTable({ ...req.body, outlet_id: outletId });
    sendCreated(res, table, 'Table created successfully');
  } catch (error) { next(error); }
}

/** DELETE /api/orders/tables/:id */
async function deleteTable(req, res, next) {
  try {
    await tableService.deleteTable(req.params.id);
    sendSuccess(res, null, 'Table deleted');
  } catch (error) { next(error); }
}

module.exports = {
  listTables,
  updateTableStatus,
  listTableAreas,
  createTable,
  deleteTable,
};
