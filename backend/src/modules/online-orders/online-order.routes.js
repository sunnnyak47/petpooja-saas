/**
 * @fileoverview Online Order routes — public endpoints for customer ordering.
 * @module modules/online-orders/online-order.routes
 */

const express = require('express');
const router = express.Router();
const onlineOrderController = require('./online-order.controller');
const { validate } = require('../../middleware/validate.middleware');
const { createOrderSchema } = require('../orders/order.validation');

const { authenticate, authorize } = require('../../middleware/auth.middleware');

/**
 * These routes are PUBLIC as they are accessed by scanning a QR code.
 */

// GET /api/online-orders/menu/:outlet_id
router.get('/menu/:outlet_id', onlineOrderController.getPublicMenu);

// POST /api/online-orders/place
router.post('/place', validate(createOrderSchema), onlineOrderController.placeOrder);

/**
 * These routes are PROTECTED (Staff/POS actions).
 */

// PUT /api/online-orders/:id/accept
router.put('/:id/accept', authenticate, authorize(['owner', 'manager', 'cashier']), onlineOrderController.acceptOrder);

// PUT /api/online-orders/:id/reject
router.put('/:id/reject', authenticate, authorize(['owner', 'manager', 'cashier']), onlineOrderController.rejectOrder);

module.exports = router;
