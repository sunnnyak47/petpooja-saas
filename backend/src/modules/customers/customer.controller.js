/**
 * @fileoverview Customer controller — HTTP handlers for customer + loyalty endpoints.
 * @module modules/customers/customer.controller
 */

const customerService = require('./customer.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

/** POST /api/customers */
async function createCustomer(req, res, next) {
  try {
    const customer = await customerService.createCustomer(req.body);
    sendCreated(res, customer, 'Customer created');
  } catch (error) { next(error); }
}

/** GET /api/customers */
async function listCustomers(req, res, next) {
  try {
    const { customers, total, page, limit } = await customerService.listCustomers(req.query);
    sendPaginated(res, customers, total, page, limit, 'Customers retrieved');
  } catch (error) { next(error); }
}

/** GET /api/customers/:id */
async function getCustomer(req, res, next) {
  try {
    const customer = await customerService.getCustomer(req.params.id);
    sendSuccess(res, customer, 'Customer retrieved');
  } catch (error) { next(error); }
}

/** GET /api/customers/phone/:phone */
async function findByPhone(req, res, next) {
  try {
    const customer = await customerService.findByPhone(req.params.phone);
    sendSuccess(res, customer, customer ? 'Customer found' : 'Customer not found');
  } catch (error) { next(error); }
}

/** PATCH /api/customers/:id */
async function updateCustomer(req, res, next) {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    sendSuccess(res, customer, 'Customer updated');
  } catch (error) { next(error); }
}

/** DELETE /api/customers/:id */
async function deleteCustomer(req, res, next) {
  try {
    await customerService.deleteCustomer(req.params.id);
    sendSuccess(res, null, 'Customer deleted');
  } catch (error) { next(error); }
}

/** POST /api/customers/:id/addresses */
async function addAddress(req, res, next) {
  try {
    const address = await customerService.addAddress(req.params.id, req.body);
    sendCreated(res, address, 'Address added');
  } catch (error) { next(error); }
}

/** POST /api/customers/:id/loyalty/redeem */
async function redeemPoints(req, res, next) {
  try {
    const result = await customerService.redeemPoints(
      req.params.id, req.body.outlet_id, req.body.order_id, req.body.points
    );
    sendSuccess(res, result, 'Points redeemed successfully');
  } catch (error) { next(error); }
}

/** GET /api/customers/:id/loyalty/history */
async function getLoyaltyHistory(req, res, next) {
  try {
    const result = await customerService.getLoyaltyHistory(req.params.id, req.query);
    sendPaginated(res, result.transactions, result.total, result.page, result.limit, 'Loyalty history retrieved');
  } catch (error) { next(error); }
}

/** POST /api/customers/campaigns */
async function createCampaign(req, res, next) {
  try {
    const campaign = await customerService.createCampaign(req.query.outlet_id, req.body);
    sendCreated(res, campaign, 'Marketing campaign triggered');
  } catch (error) { next(error); }
}

/** GET /api/customers/campaigns */
async function getCampaigns(req, res, next) {
  try {
    const campaigns = await customerService.getCampaigns(req.query.outlet_id);
    sendSuccess(res, campaigns, 'Campaigns retrieved');
  } catch (error) { next(error); }
}

module.exports = {
  createCustomer, listCustomers, getCustomer, findByPhone,
  updateCustomer, deleteCustomer, addAddress, redeemPoints, getLoyaltyHistory,
  createCampaign, getCampaigns
};
