/**
 * @fileoverview Online Order routes — public endpoints for customer ordering.
 * @module modules/online-orders/online-order.routes
 */

const express = require('express');
const router = express.Router();
const onlineOrderController = require('./online-order.controller');
const { validate } = require('../../middleware/validate.middleware');
const { createOrderSchema } = require('../orders/order.validation');

/**
 * These routes are PUBLIC as they are accessed by scanning a QR code.
 * They are protected by outlet_id and table_id verification in the service.
 */

// GET /api/online-orders/menu/:outlet_id
router.get('/menu/:outlet_id', onlineOrderController.getPublicMenu);

// POST /api/online-orders/place
router.post('/place', validate(createOrderSchema), onlineOrderController.placeOrder);

module.exports = router;
