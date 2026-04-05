/**
 * @fileoverview Customer routes.
 * @module modules/customers/customer.routes
 */

const express = require('express');
const router = express.Router();
const customerController = require('./customer.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createCustomerSchema, updateCustomerSchema, addAddressSchema, redeemPointsSchema } = require('./customer.validation');

router.post('/', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(createCustomerSchema), customerController.createCustomer);
router.get('/', authenticate, hasPermission('VIEW_CUSTOMERS'), customerController.listCustomers);
router.get('/phone/:phone', authenticate, hasPermission('VIEW_CUSTOMERS'), customerController.findByPhone);
router.get('/:id', authenticate, hasPermission('VIEW_CUSTOMERS'), customerController.getCustomer);
router.patch('/:id', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(updateCustomerSchema), customerController.updateCustomer);
router.delete('/:id', authenticate, hasPermission('MANAGE_CUSTOMERS'), customerController.deleteCustomer);
router.post('/:id/addresses', authenticate, hasPermission('MANAGE_CUSTOMERS'), validate(addAddressSchema), customerController.addAddress);
router.post('/:id/loyalty/redeem', authenticate, hasPermission('MANAGE_ORDERS'), validate(redeemPointsSchema), customerController.redeemPoints);
router.get('/:id/loyalty/history', authenticate, hasPermission('VIEW_CUSTOMERS'), customerController.getLoyaltyHistory);

router.post('/campaigns', authenticate, hasPermission('MANAGE_CAMPAIGNS'), customerController.createCampaign);
router.get('/campaigns', authenticate, hasPermission('VIEW_CUSTOMERS'), customerController.getCampaigns);

module.exports = router;
