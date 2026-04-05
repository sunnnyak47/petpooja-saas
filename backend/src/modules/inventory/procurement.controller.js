/**
 * @fileoverview Procurement controller — HTTP handlers for POs and Suppliers.
 * @module modules/inventory/procurement.controller
 */

const procurementService = require('./procurement.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

/** GET /api/suppliers */
async function listSuppliers(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const suppliers = await procurementService.listSuppliers(outletId, req.query);
    sendSuccess(res, suppliers, 'Suppliers retrieved');
  } catch (error) { next(error); }
}

/** GET /api/purchase-orders */
async function listPurchaseOrders(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await procurementService.listPurchaseOrders(outletId, req.query);
    sendPaginated(res, result.items, result.total, 'Purchase orders retrieved');
  } catch (error) { next(error); }
}

/** POST /api/purchase-orders */
async function createPurchaseOrder(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const po = await procurementService.createPurchaseOrder(outletId, req.body, req.user.id);
    sendCreated(res, po, 'Purchase Order created');
  } catch (error) { next(error); }
}

/** POST /api/purchase-orders/:id/receive */
async function receivePurchaseOrder(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const grn = await procurementService.receivePurchaseOrder(outletId, req.params.id, req.body, req.user.id);
    sendSuccess(res, grn, 'Goods Received Note created and stock updated');
  } catch (error) { next(error); }
}

module.exports = {
  listSuppliers, listPurchaseOrders, createPurchaseOrder, receivePurchaseOrder
};
