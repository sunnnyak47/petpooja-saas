/**
 * @fileoverview Online Order controller — manages public customer ordering.
 * @module modules/online-orders/online-order.controller
 */

const onlineOrderService = require('./online-order.service');
const menuService = require('../menu/menu.service');
const { sendSuccess } = require('../../utils/response');
const { UnauthorizedError } = require('../../utils/errors');

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
    sendSuccess(res, order, 'Order submitted! Please wait for staff to accept.', 201);
  } catch (error) { next(error); }
}

/**
 * Accepts a pending online order.
 */
async function acceptOrder(req, res, next) {
  try {
    const { id } = req.params;
    
    if (!req.user || !req.user.outlet_id) {
      throw new UnauthorizedError('Staff authentication session is incomplete. Please re-login.');
    }
    
    const { outlet_id } = req.user;
    const order = await onlineOrderService.acceptCustomerOrder(id, outlet_id, req.user.id);
    sendSuccess(res, order, 'Order accepted and sent to kitchen');
  } catch (error) { next(error); }
}

/**
 * Rejects an online order.
 */
async function rejectOrder(req, res, next) {
  try {
    const { id } = req.params;
    
    if (!req.user || !req.user.outlet_id) {
       throw new UnauthorizedError('Staff authentication session is incomplete. Please re-login.');
    }
    
    const { outlet_id } = req.user;
    await onlineOrderService.rejectCustomerOrder(id, outlet_id, req.user.id);
    sendSuccess(res, null, 'Order rejected and table released');
  } catch (error) { next(error); }
}

module.exports = {
  getPublicMenu,
  placeOrder,
  acceptOrder,
  rejectOrder,
};
