/**
 * @fileoverview Joi validation schemas for order endpoints.
 * @module modules/orders/order.validation
 */

const Joi = require('joi');

const createOrderSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  order_type: Joi.string().valid('dine_in', 'takeaway', 'delivery', 'online', 'qr_order').default('dine_in'),
  table_id: Joi.string().uuid().allow(null),
  customer_id: Joi.string().uuid().allow(null),
  source: Joi.string().valid('pos', 'qr', 'online', 'kiosk', 'app').default('pos'),
  notes: Joi.string().max(500).allow('', null),
  items: Joi.array().items(Joi.object({
    menu_item_id: Joi.string().uuid().required(),
    variant_id: Joi.string().uuid().allow(null),
    quantity: Joi.number().integer().min(1).required(),
    notes: Joi.string().max(200).allow('', null),
    addons: Joi.array().items(Joi.object({
      addon_id: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).default(1),
    })).default([]),
  })).min(1).required(),
});

const addItemsSchema = Joi.object({
  items: Joi.array().items(Joi.object({
    menu_item_id: Joi.string().uuid().required(),
    variant_id: Joi.string().uuid().allow(null),
    quantity: Joi.number().integer().min(1).required(),
    notes: Joi.string().max(200).allow('', null),
    addons: Joi.array().items(Joi.object({
      addon_id: Joi.string().uuid().required(),
      quantity: Joi.number().integer().min(1).default(1),
    })).default([]),
  })).min(1).required(),
});

const applyDiscountSchema = Joi.object({
  discount_type: Joi.string().valid('percentage', 'flat').required(),
  discount_value: Joi.number().min(0).required(),
  discount_reason: Joi.string().max(200).allow('', null),
  manager_pin: Joi.string().max(10).allow('', null),
});

const processPaymentSchema = Joi.object({
  method: Joi.string().valid('cash', 'card_pine_labs', 'upi_razorpay', 'paytm', 'wallet', 'loyalty_points', 'split', 'online_prepaid').required(),
  amount: Joi.number().precision(2).min(0).required(),
  transaction_id: Joi.string().max(100).allow('', null),
  customer_phone: Joi.string().max(15).allow('', null),
  loyalty_points_redeem: Joi.number().integer().min(0).default(0),
  splits: Joi.array().items(Joi.object({
    method: Joi.string().required(),
    amount: Joi.number().precision(2).min(0).required(),
    transaction_id: Joi.string().allow('', null),
  })).when('method', { is: 'split', then: Joi.required() }),
});

const voidOrderSchema = Joi.object({
  manager_pin: Joi.string().required(),
  reason: Joi.string().min(3).max(500).required(),
});

const refundOrderSchema = Joi.object({
  manager_pin: Joi.string().required(),
  reason: Joi.string().min(3).max(500).required(),
  refund_amount: Joi.number().precision(2).min(0).required(),
});

const cancelOrderSchema = Joi.object({
  reason: Joi.string().min(3).max(500).required(),
});

module.exports = {
  createOrderSchema,
  addItemsSchema,
  applyDiscountSchema,
  processPaymentSchema,
  voidOrderSchema,
  refundOrderSchema,
  cancelOrderSchema,
};
