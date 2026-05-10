/**
 * @fileoverview Joi validation schemas for discount endpoints.
 * @module modules/discounts/discount.validation
 */

const Joi = require('joi');

const createDiscountSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  type: Joi.string().valid('percentage', 'flat', 'bogo', 'buy_x_get_y').required(),
  code: Joi.string().max(20).uppercase(),
  value: Joi.number().min(0).required(),
  min_order_value: Joi.number().min(0),
  max_discount: Joi.number().min(0),
  applicable_on: Joi.string().valid('all', 'category', 'item'),
  applicable_ids: Joi.array().items(Joi.string().uuid()),
  channels: Joi.array().items(Joi.string().valid('pos', 'qr', 'online', 'kiosk', 'app')),
  start_date: Joi.date(),
  end_date: Joi.date(),
  is_active: Joi.boolean(),
  auto_apply: Joi.boolean(),
  max_uses: Joi.number().integer().min(0),
  max_uses_per_customer: Joi.number().integer().min(0),
  priority: Joi.number().integer().min(0),
  outlet_id: Joi.string().uuid().required(),
});

const updateDiscountSchema = Joi.object({
  name: Joi.string().trim().max(100),
  type: Joi.string().valid('percentage', 'flat', 'bogo', 'buy_x_get_y'),
  code: Joi.string().max(20).uppercase(),
  value: Joi.number().min(0),
  min_order_value: Joi.number().min(0),
  max_discount: Joi.number().min(0),
  applicable_on: Joi.string().valid('all', 'category', 'item'),
  applicable_ids: Joi.array().items(Joi.string().uuid()),
  channels: Joi.array().items(Joi.string().valid('pos', 'qr', 'online', 'kiosk', 'app')),
  start_date: Joi.date(),
  end_date: Joi.date(),
  is_active: Joi.boolean(),
  auto_apply: Joi.boolean(),
  max_uses: Joi.number().integer().min(0),
  max_uses_per_customer: Joi.number().integer().min(0),
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
