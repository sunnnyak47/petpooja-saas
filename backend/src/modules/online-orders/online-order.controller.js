/**
 * @fileoverview Online Order controller — manages public customer ordering.
 * @module modules/online-orders/online-order.controller
 */

const onlineOrderService = require('./online-order.service');
const menuService = require('../menu/menu.service');
const { sendSuccess } = require('../../utils/response');

/**
 * Retrieves the full menu for an outlet (publicly accessible via QR).
 */
async function getPublicMenu(req, res, next) {
  try {
    const { outlet_id } = req.params;
    // We reuse the existing menu service
    const menu = await menuService.getOutletMenu(outlet_id);
    sendSuccess(res, menu, 'Menu retrieved successfully');
  } catch (error) { next(error); }
}

/**
 * Places a customer order via QR code.
 */
async function placeOrder(req, res, next) {
  try {
    const order = await onlineOrderService.placeCustomerOrder(req.body);
    sendSuccess(res, order, 'Order placed successfully! 🎉', 201);
  } catch (error) { next(error); }
}

module.exports = {
  getPublicMenu,
  placeOrder,
};
