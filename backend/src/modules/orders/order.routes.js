/**
 * @fileoverview Order routes — maps endpoints to controllers with auth + validation.
 * @module modules/orders/order.routes
 */

const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope, checkLicense } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createOrderSchema, addItemsSchema, processPaymentSchema, voidOrderSchema, cancelOrderSchema } = require('./order.validation');

router.post('/', authenticate, checkLicense, hasPermission('CREATE_ORDER'), validate(createOrderSchema), orderController.createOrder);
router.get('/', authenticate, checkLicense, enforceOutletScope, orderController.listOrders);
router.get('/:id', authenticate, orderController.getOrder);
router.post('/:id/items', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(addItemsSchema), orderController.addItems);
router.post('/:id/kot', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), orderController.generateKOT);
router.patch('/:id/status', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), orderController.updateStatus);
router.post('/:id/payment', authenticate, checkLicense, hasPermission('MANAGE_PAYMENTS'), validate(processPaymentSchema), orderController.processPayment);
router.post('/:id/bill', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), orderController.generateBill);
router.post('/:id/cancel', authenticate, checkLicense, hasPermission('MANAGE_ORDERS'), validate(cancelOrderSchema), orderController.cancelOrder);
router.post('/:id/void', authenticate, checkLicense, hasPermission('VOID_ORDER'), validate(voidOrderSchema), orderController.voidOrder);

module.exports = router;
