/**
 * @fileoverview Customer controller.
 * @module modules/customers/customer.controller
 */

const customerService = require('./customer.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');

async function createCustomer(req, res, next) {
  try { sendCreated(res, await customerService.createCustomer(req.body), 'Customer created'); }
  catch (e) { next(e); }
}

async function listCustomers(req, res, next) {
  try {
    const { customers, total, page, limit } = await customerService.listCustomers(req.query);
    sendPaginated(res, customers, total, page, limit, 'Customers retrieved');
  } catch (e) { next(e); }
}

async function getCustomer(req, res, next) {
  try { sendSuccess(res, await customerService.getCustomer(req.params.id), 'Customer retrieved'); }
  catch (e) { next(e); }
}

async function findByPhone(req, res, next) {
  try {
    const c = await customerService.findByPhone(req.params.phone);
    sendSuccess(res, c, c ? 'Customer found' : 'Customer not found');
  } catch (e) { next(e); }
}

async function updateCustomer(req, res, next) {
  try { sendSuccess(res, await customerService.updateCustomer(req.params.id, req.body), 'Customer updated'); }
  catch (e) { next(e); }
}

async function deleteCustomer(req, res, next) {
  try { await customerService.deleteCustomer(req.params.id); sendSuccess(res, null, 'Customer deleted'); }
  catch (e) { next(e); }
}

async function addAddress(req, res, next) {
  try { sendCreated(res, await customerService.addAddress(req.params.id, req.body), 'Address added'); }
  catch (e) { next(e); }
}

async function redeemPoints(req, res, next) {
  try {
    const result = await customerService.redeemPoints(
      req.params.id, req.body.outlet_id, req.body.order_id, req.body.points
    );
    sendSuccess(res, result, 'Points redeemed');
  } catch (e) { next(e); }
}

async function adjustPoints(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await customerService.adjustPoints(req.params.id, outletId, req.body.points, req.body.reason);
    sendSuccess(res, result, 'Points adjusted');
  } catch (e) { next(e); }
}

async function getLoyaltyHistory(req, res, next) {
  try {
    const result = await customerService.getLoyaltyHistory(req.params.id, req.query);
    sendPaginated(res, result.transactions, result.total, result.page, result.limit, 'Loyalty history retrieved');
  } catch (e) { next(e); }
}

async function getCRMDashboard(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await customerService.getCRMDashboard(outletId), 'CRM dashboard retrieved');
  } catch (e) { next(e); }
}

async function getBirthdayCustomers(req, res, next) {
  try {
    const days = parseInt(req.query.days || '7');
    sendSuccess(res, await customerService.getBirthdayCustomers(days), 'Birthday customers retrieved');
  } catch (e) { next(e); }
}

async function createCampaign(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendCreated(res, await customerService.createCampaign(outletId, req.body), 'Campaign created');
  } catch (e) { next(e); }
}

async function getCampaigns(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await customerService.getCampaigns(outletId, req.query);
    sendPaginated(res, result.campaigns, result.total, result.page, result.limit, 'Campaigns retrieved');
  } catch (e) { next(e); }
}

async function getCampaignDetail(req, res, next) {
  try { sendSuccess(res, await customerService.getCampaignDetail(req.params.id), 'Campaign retrieved'); }
  catch (e) { next(e); }
}

async function sendBirthdayCampaign(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await customerService.sendBirthdayCampaign(outletId, req.body.message_template), 'Birthday campaign sent');
  } catch (e) { next(e); }
}

module.exports = {
  createCustomer, listCustomers, getCustomer, findByPhone,
  updateCustomer, deleteCustomer, addAddress,
  redeemPoints, adjustPoints, getLoyaltyHistory,
  getCRMDashboard, getBirthdayCustomers,
  createCampaign, getCampaigns, getCampaignDetail, sendBirthdayCampaign,
};
