/**
 * @fileoverview Customer + Loyalty + CRM routes.
 * @module modules/customers/customer.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./customer.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');

/** CRM Dashboard */
router.get('/crm/dashboard', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getCRMDashboard);

/** Birthday customers */
router.get('/crm/birthdays', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getBirthdayCustomers);

/** Send birthday campaign */
router.post('/crm/birthday-campaign', authenticate, hasPermission('MANAGE_CAMPAIGNS'), c.sendBirthdayCampaign);

/** Campaigns */
router.get('/campaigns', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getCampaigns);
router.post('/campaigns', authenticate, hasPermission('MANAGE_CAMPAIGNS'), c.createCampaign);
router.get('/campaigns/:id', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getCampaignDetail);

/** Search by phone (POS lookup) */
router.get('/phone/:phone', authenticate, c.findByPhone);

/** Customer CRUD */
router.post('/', authenticate, hasPermission('MANAGE_CUSTOMERS'), c.createCustomer);
router.get('/', authenticate, hasPermission('VIEW_CUSTOMERS'), c.listCustomers);
router.get('/:id', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getCustomer);
router.patch('/:id', authenticate, hasPermission('MANAGE_CUSTOMERS'), c.updateCustomer);
router.delete('/:id', authenticate, hasPermission('MANAGE_CUSTOMERS'), c.deleteCustomer);

/** Addresses */
router.post('/:id/addresses', authenticate, hasPermission('MANAGE_CUSTOMERS'), c.addAddress);

/** Loyalty */
router.get('/:id/loyalty/history', authenticate, hasPermission('VIEW_CUSTOMERS'), c.getLoyaltyHistory);
router.post('/:id/loyalty/redeem', authenticate, hasPermission('MANAGE_ORDERS'), c.redeemPoints);
router.post('/:id/loyalty/adjust', authenticate, hasPermission('MANAGE_CUSTOMERS'), c.adjustPoints);

module.exports = router;
