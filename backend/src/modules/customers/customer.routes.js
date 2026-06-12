/**
 * @fileoverview Customer + Loyalty + CRM routes.
 * @module modules/customers/customer.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./customer.controller');
const customerService = require('./customer.service');
const { sendSuccess, sendPaginated } = require('../../utils/response');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createCustomerSchema, updateCustomerSchema, addAddressSchema, redeemPointsSchema, adjustPointsSchema, createCampaignSchema, birthdayCampaignSchema } = require('./customer.validation');

/**
 * Tenant-scoped read handlers. These thread the caller's identity
 * (role + head_office_id) from req.user into the service so customer reads
 * are restricted to the caller's tenant (super_admin bypasses). Defined here
 * rather than in the controller because the controller's bare handlers do not
 * pass req.user, which is the root cause of IDOR/PII leakage (H1).
 */
async function getCustomerScoped(req, res, next) {
  try {
    sendSuccess(res, await customerService.getCustomer(req.params.id, req.user), 'Customer retrieved');
  } catch (e) { next(e); }
}

async function findByPhoneScoped(req, res, next) {
  try {
    const found = await customerService.findByPhone(req.params.phone, req.user);
    sendSuccess(res, found, found ? 'Customer found' : 'Customer not found');
  } catch (e) { next(e); }
}

async function listCustomersScoped(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user?.outlet_id;
    const { customers, total, page, limit } = await customerService.listCustomers(outletId, req.query, req.user);
    sendPaginated(res, customers, total, page, limit, 'Customers retrieved');
  } catch (e) { next(e); }
}

async function updateCustomerScoped(req, res, next) {
  try {
    sendSuccess(res, await customerService.updateCustomer(req.params.id, req.body, req.user), 'Customer updated');
  } catch (e) { next(e); }
}

async function deleteCustomerScoped(req, res, next) {
  try {
    await customerService.deleteCustomer(req.params.id, req.user);
    sendSuccess(res, null, 'Customer deleted');
  } catch (e) { next(e); }
}

/** CRM Dashboard */
router.get('/crm/dashboard', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getCRMDashboard);

/** Birthday customers */
router.get('/crm/birthdays', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getBirthdayCustomers);

/** Send birthday campaign */
router.post('/crm/birthday-campaign', authenticate, hasPermission('MANAGE_CAMPAIGNS'), validate(birthdayCampaignSchema), c.sendBirthdayCampaign);

/** Campaigns */
router.get('/campaigns', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getCampaigns);
router.post('/campaigns', authenticate, hasPermission('MANAGE_CAMPAIGNS'), validate(createCampaignSchema), c.createCampaign);
router.get('/campaigns/:id', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getCampaignDetail);

/** Search by phone (POS lookup) */
router.get('/phone/:phone', authenticate, findByPhoneScoped);

/** Loyalty programme config (must be declared BEFORE the `/:id` routes below
    so a literal 'loyalty' isn't mistaken for a customer UUID). */
router.get('/loyalty/config', authenticate, hasPermission('VIEW_CUSTOMERS'),    c.getLoyaltyConfig);
router.put('/loyalty/config', authenticate, hasPermission('MANAGE_CUSTOMERS'),  c.updateLoyaltyConfig);

/** Customer CRUD */
router.post('/', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(createCustomerSchema), c.createCustomer);
router.get('/', authenticate, hasPermission('VIEW_CUSTOMERS'), listCustomersScoped);
router.get('/:id', authenticate, hasPermission('VIEW_CUSTOMERS'), getCustomerScoped);
router.patch('/:id', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(updateCustomerSchema), updateCustomerScoped);
router.delete('/:id', authenticate, hasPermission('MANAGE_CUSTOMERS'), deleteCustomerScoped);

/** Addresses */
router.post('/:id/addresses', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(addAddressSchema), c.addAddress);

/** Loyalty */
router.get('/:id/loyalty/history', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getLoyaltyHistory);
router.post('/:id/loyalty/redeem', authenticate, hasPermission('MANAGE_ORDERS'), validate(redeemPointsSchema), c.redeemPoints);
router.post('/:id/loyalty/adjust', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(adjustPointsSchema), c.adjustPoints);

module.exports = router;
