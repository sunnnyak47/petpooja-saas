/**
 * @fileoverview M11: Discounts & Promotions Routes
 * RESTful endpoints for discount management and coupon validation.
 * @module modules/discounts/discount.routes
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const discountService = require('./discount.service');
const logger = require('../../config/logger');

/**
 * GET /api/discounts — List all discounts for outlet
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const filters = {
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      type: req.query.type || undefined,
    };
    const discounts = await discountService.listDiscounts(outletId, filters);
    res.json({ success: true, data: discounts, message: 'Discounts retrieved' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/discounts — Create a new discount
 */
router.post('/', authenticate, authorize(['super_admin', 'owner', 'manager']), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const discount = await discountService.createDiscount(req.body, outletId);
    res.status(201).json({ success: true, data: discount, message: 'Discount created' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/discounts/:id — Update a discount
 */
router.put('/:id', authenticate, authorize(['super_admin', 'owner', 'manager']), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await discountService.updateDiscount(req.params.id, req.body, outletId);
    res.json({ success: true, data: result, message: 'Discount updated' });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/discounts/:id — Soft delete a discount
 */
router.delete('/:id', authenticate, authorize(['super_admin', 'owner', 'manager']), async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await discountService.deleteDiscount(req.params.id, outletId);
    res.json({ success: true, message: 'Discount deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/discounts/validate — Validate a coupon code
 */
router.post('/validate', authenticate, async (req, res, next) => {
  try {
    const { code, outlet_id, order_total, customer_id } = req.body;
    const outletId = outlet_id || req.user.outlet_id;
    const result = await discountService.validateCoupon(code, outletId, order_total, customer_id);
    res.json({ success: true, data: result, message: result.valid ? 'Coupon valid' : result.message });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/discounts/auto — Get auto-applicable discounts for cart
 */
router.get('/auto', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const orderTotal = Number(req.query.order_total) || 0;
    const channel = req.query.channel || 'pos';
    const discounts = await discountService.getAutoDiscounts(outletId, orderTotal, channel);
    res.json({ success: true, data: discounts, message: 'Auto discounts retrieved' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
