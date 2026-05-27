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
  method: Joi.string().valid('cash', 'card', 'card_pine_labs', 'upi', 'upi_razorpay', 'paytm', 'wallet', 'loyalty_points', 'split', 'online_prepaid', 'due').required(),
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

// outlet_id is already known from req.user (authentication middleware),
// so it's optional in the body — but accepted for legacy clients.
const generateKOTSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'preparing', 'ready', 'served', 'delivered', 'completed', 'cancelled').required(),
});

const generateBillSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
});

const transferTableSchema = Joi.object({
  target_table_id: Joi.string().uuid().required(),
});

const mergeOrderSchema = Joi.object({
  merge_order_id: Joi.string().uuid().required(),
});

const syncOfflineOrdersSchema = Joi.object({
  orders: Joi.array().items(Joi.object({
    id: Joi.string(),
    outlet_id: Joi.string().uuid().required(),
    order_type: Joi.string().valid('dine_in', 'takeaway', 'delivery', 'online', 'qr_order'),
    table_id: Joi.string().uuid().allow(null),
    customer_id: Joi.string().uuid().allow(null),
    source: Joi.string().valid('pos', 'qr', 'online', 'kiosk', 'app'),
    notes: Joi.string().max(500).allow(''),
    items: Joi.array().items(Joi.object({
      menu_item_id: Joi.string().uuid().required(),
      item_name: Joi.string(),
      variant_id: Joi.string().uuid().allow(null),
      variant_name: Joi.string().allow('', null),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().min(0).required(),
      total_price: Joi.number().min(0),
      notes: Joi.string().max(200).allow('', null),
      addons: Joi.array().default([]),
    })).min(1).required(),
    created_at: Joi.string(),
    created_by: Joi.string().uuid(),
  })).min(1).required(),
});

module.exports = {
  createOrderSchema,
  addItemsSchema,
  applyDiscountSchema,
  processPaymentSchema,
  voidOrderSchema,
  refundOrderSchema,
  cancelOrderSchema,
  generateKOTSchema,
  updateOrderStatusSchema,
  generateBillSchema,
  transferTableSchema,
  mergeOrderSchema,
  syncOfflineOrdersSchema,
};
