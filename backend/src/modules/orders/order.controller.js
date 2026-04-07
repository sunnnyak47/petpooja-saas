/**
 * @fileoverview Order controller — HTTP handlers for order endpoints.
 * @module modules/orders/order.controller
 */

const orderService = require('./order.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

/** POST /api/orders */
async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.body, req.user.id);
    sendCreated(res, order, 'Order created successfully');
  } catch (error) { next(error); }
}

/** GET /api/orders */
async function listOrders(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { orders, total, page, limit } = await orderService.listOrders(outletId, req.query);
    sendPaginated(res, orders, total, page, limit, 'Orders retrieved');
  } catch (error) { next(error); }
}

/** GET /api/orders/:id */
async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrderById(req.params.id);
    sendSuccess(res, order, 'Order retrieved');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/items */
async function addItems(req, res, next) {
  try {
    const order = await orderService.addItemsToOrder(req.params.id, req.body.items, req.user.id);
    sendSuccess(res, order, 'Items added to order');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/kot */
async function generateKOT(req, res, next) {
  try {
    const kots = await orderService.generateKOT(req.params.id);
    sendCreated(res, kots, `${kots.length} KOT(s) generated`);
  } catch (error) { next(error); }
}

/** PATCH /api/orders/:id/status */
async function updateStatus(req, res, next) {
  try {
    const order = await orderService.updateOrderStatus(req.params.id, req.body.status, req.user.id);
    sendSuccess(res, order, 'Order status updated');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/payment */
async function processPayment(req, res, next) {
  try {
    const result = await orderService.processPayment(req.params.id, req.body, req.user.id);
    sendSuccess(res, result, 'Payment processed successfully');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/bill */
async function generateBill(req, res, next) {
  try {
    const order = await orderService.generateBill(req.params.id, req.user.id);
    sendSuccess(res, order, 'Bill generated successfully');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/cancel */
async function cancelOrder(req, res, next) {
  try {
    const order = await orderService.cancelOrder(req.params.id, req.body.reason, req.user.id);
    sendSuccess(res, order, 'Order cancelled');
  } catch (error) { next(error); }
}

/** POST /api/orders/:id/void */
async function voidOrder(req, res, next) {
  try {
    const order = await orderService.voidOrder(req.params.id, req.body.manager_pin, req.body.reason, req.user.id);
    sendSuccess(res, order, 'Order voided');
  } catch (error) { next(error); }
}

module.exports = { 
  createOrder, listOrders, getOrder, addItems, 
  generateKOT, generateBill, updateStatus, processPayment, 
  cancelOrder, voidOrder 
};
