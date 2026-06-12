/**
 * @fileoverview Joi validation schemas for discount endpoints.
 * @module modules/discounts/discount.validation
 */

const Joi = require('joi');

// Percentage discounts are capped at 100% (M31); flat/bogo/buy_x_get_y values are
// currency amounts with no upper bound. value is keyed off the sibling `type`.
const valueSchema = Joi.when('type', {
  is: 'percentage',
  then: Joi.number().min(0).max(100),
  otherwise: Joi.number().min(0),
});

const createDiscountSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  type: Joi.string().valid('percentage', 'flat', 'bogo', 'buy_x_get_y').required(),
  // C6: auto-apply / happy-hour discounts have no coupon code — allow empty/null.
  code: Joi.string().max(20).uppercase().allow('', null),
  value: valueSchema.required(),
  min_order_value: Joi.number().min(0),
  max_discount: Joi.number().min(0).allow(null),
  applicable_on: Joi.string().valid('all', 'category', 'item'),
  applicable_ids: Joi.array().items(Joi.string().uuid()),
  channels: Joi.array().items(Joi.string().valid('pos', 'qr', 'online', 'kiosk', 'app')),
  // C5: an always-on discount has no start/end — allow empty/null.
  start_date: Joi.date().allow('', null),
  end_date: Joi.date().allow('', null),
  is_active: Joi.boolean(),
  auto_apply: Joi.boolean(),
  max_uses: Joi.number().integer().min(0).allow(null),
  max_uses_per_customer: Joi.number().integer().min(0).allow(null),
  priority: Joi.number().integer().min(0),
  outlet_id: Joi.string().uuid().required(),
});

const updateDiscountSchema = Joi.object({
  name: Joi.string().trim().max(100),
  type: Joi.string().valid('percentage', 'flat', 'bogo', 'buy_x_get_y'),
  code: Joi.string().max(20).uppercase().allow('', null),
  value: valueSchema,
  min_order_value: Joi.number().min(0),
  max_discount: Joi.number().min(0).allow(null),
  applicable_on: Joi.string().valid('all', 'category', 'item'),
  applicable_ids: Joi.array().items(Joi.string().uuid()),
  channels: Joi.array().items(Joi.string().valid('pos', 'qr', 'online', 'kiosk', 'app')),
  start_date: Joi.date().allow('', null),
  end_date: Joi.date().allow('', null),
  is_active: Joi.boolean(),
  auto_apply: Joi.boolean(),
  max_uses: Joi.number().integer().min(0).allow(null),
  max_uses_per_customer: Joi.number().integer().min(0).allow(null),
  priority: Joi.number().integer().min(0),
  outlet_id: Joi.string().uuid(),
});

const validateCouponSchema = Joi.object({
  code: Joi.string().required(),
  outlet_id: Joi.string().uuid().required(),
  order_total: Joi.number().min(0),
  customer_id: Joi.string().uuid().allow(null),
});

module.exports = {
  createDiscountSchema,
  updateDiscountSchema,
  validateCouponSchema,
};
