/**
 * @fileoverview Joi validation schemas for order endpoints.
 * @module modules/orders/order.validation
 */

const Joi = require('joi');
const { phoneOptional } = require('../../utils/validators');

const createOrderSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  order_type: Joi.string().valid('dine_in', 'takeaway', 'delivery', 'online', 'qr_order').default('dine_in'),
  table_id: Joi.string().uuid().allow(null),
  customer_id: Joi.string().uuid().allow(null),
  source: Joi.string().valid('pos', 'qr', 'online', 'kiosk', 'app').default('pos'),
  // 'held' lets the POS create a truly held (parked) order; default 'created' goes live.
  status: Joi.string().valid('created', 'held').default('created'),
  // Cart-level discount the POS attaches to the order (BOGO / manager / coupon).
  // Field names mirror the POSPage payload and applyDiscountSchema so createOrder
  // can apply them to the totals via the shared pricing helpers.
  discount_type: Joi.string().valid('percentage', 'flat').allow(null),
  discount_value: Joi.when('discount_type', {
    is: 'percentage',
    then: Joi.number().min(0).max(100).default(0),
    otherwise: Joi.number().min(0).default(0),
  }),
  discount_reason: Joi.string().max(200).allow('', null),
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
  // Percentage discounts are capped at 100% so a value like 150 cannot drive
  // the grand_total negative (free-money bug). Flat discounts are clamped to the
  // bill subtotal in the controller.
  discount_value: Joi.when('discount_type', {
    is: 'percentage',
    then: Joi.number().min(0).max(100).required(),
    otherwise: Joi.number().min(0).required(),
  }),
  discount_reason: Joi.string().max(200).allow('', null),
  coupon_code: Joi.string().max(50).allow('', null),
});

const updateNotesSchema = Joi.object({
  notes: Joi.string().max(500).allow('', null).required(),
});

// Gratuity / tip added to the bill. A flat money amount (>= 0). Sending 0
// clears any previously applied tip. Capped at 2 decimals to match currency.
const addTipSchema = Joi.object({
  amount: Joi.number().precision(2).min(0).required(),
});

const assignStaffSchema = Joi.object({
  staff_id: Joi.string().uuid().allow(null).required(),
});

const processPaymentSchema = Joi.object({
  method: Joi.string().valid('cash', 'card', 'card_pine_labs', 'eftpos', 'upi', 'upi_razorpay', 'paytm', 'wallet', 'loyalty_points', 'split', 'online_prepaid', 'due').required(),
  amount: Joi.number().precision(2).min(0).required(),
  transaction_id: Joi.string().max(100).allow('', null),
  customer_phone: phoneOptional,
  loyalty_points_redeem: Joi.number().integer().min(0).default(0),
  splits: Joi.array().items(Joi.object({
    method: Joi.string().required(),
    amount: Joi.number().precision(2).min(0).required(),
    transaction_id: Joi.string().allow('', null),
  })).when('method', { is: 'split', then: Joi.required() })
    // For split payments, the split amounts must sum to the payment amount.
    // Tolerance of 0.01 absorbs decimal rounding; the service re-asserts this
    // and also reconciles against the order grand_total.
    .custom((splits, helpers) => {
      const amount = Number(helpers.state.ancestors[0]?.amount);
      if (Array.isArray(splits) && Number.isFinite(amount)) {
        const sum = splits.reduce((acc, s) => acc + Number(s.amount || 0), 0);
        if (Math.abs(sum - amount) > 0.01) {
          return helpers.error('any.invalid', {
            message: `Split amounts (${sum}) must sum to payment amount (${amount})`,
          });
        }
      }
      return splits;
    }, 'split-sum-equals-amount'),
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

const voidItemSchema = Joi.object({
  item_id: Joi.string().uuid().required(),
  manager_pin: Joi.string().min(4).max(10).required(),
  reason: Joi.string().max(200).required(),
  void_type: Joi.string().valid('void', 'comp').default('void'),
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
  // Field name aligned with the frontend payload and controller (both use
  // target_order_id). Previously this required `merge_order_id`, so every merge
  // request was rejected at validation before reaching the handler. 'auto' is a
  // sentinel used by the POS table-merge flow.
  target_order_id: Joi.alternatives()
    .try(Joi.string().uuid(), Joi.string().valid('auto'))
    .required(),
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
  updateNotesSchema,
  addTipSchema,
  assignStaffSchema,
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
  voidItemSchema,
};
