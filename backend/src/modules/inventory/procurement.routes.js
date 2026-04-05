/**
 * @fileoverview Procurement routes.
 */

const express = require('express');
const router = express.Router();
const controller = require('./procurement.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');

router.get('/suppliers', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, controller.listSuppliers);

router.get('/purchase-orders', authenticate, hasPermission('VIEW_INVENTORY'), enforceOutletScope, controller.listPurchaseOrders);
router.post('/purchase-orders', authenticate, hasPermission('MANAGE_INVENTORY'), enforceOutletScope, controller.createPurchaseOrder);
router.post('/purchase-orders/:id/receive', authenticate, hasPermission('MANAGE_INVENTORY'), enforceOutletScope, controller.receivePurchaseOrder);

module.exports = router;
