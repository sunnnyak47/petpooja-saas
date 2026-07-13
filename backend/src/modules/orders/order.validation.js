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

// Offline-sync contract (v2) — the desktop POS replays orders captured while
// offline. The client's numbers are authoritative (price-at-sale wins), so the
// schema accepts the full financial snapshot instead of re-deriving anything.
// Permissive by design: unknown-but-harmless fields are stripped (the validate
// middleware runs with stripUnknown:true; .options here makes it explicit).
const syncOfflineOrdersSchema = Joi.object({
  orders: Joi.array().items(Joi.object({
    // Client-generated UUID — the idempotency key. The cloud order is created
    // WITH this id so retries dedupe on the primary key.
    id: Joi.string().uuid().required(),
    outlet_id: Joi.string().uuid().required(),
    // Offline device order number (e.g. SIL9SW-20260711-DA1B2-003) — recorded
    // in notes; the cloud allocates its own order_number.
    order_number: Joi.string().max(60).allow('', null),
    // Widened to the full source set: the offline POS may replay a recalled
    // online/QR/kiosk ticket. Keep permissive so a well-formed offline order
    // never 400s wholesale on order_type alone.
    order_type: Joi.string()
      .valid('dine_in', 'takeaway', 'delivery', 'online', 'qr_order', 'kiosk')
      .default('dine_in'),
    table_id: Joi.string().uuid().allow(null),
    table_number: Joi.alternatives().try(Joi.string().max(20), Joi.number()).allow(null),
    source: Joi.string().valid('pos').default('pos'),
    // The offline POS also emits 'created'/'held' (parked) and may replay
    // 'ready'/'completed'. 'merged' is stamped on a source ticket the offline
    // split/merge emptied (its items moved onto another order). Accept the full
    // lifecycle so a well-formed offline batch NEVER 400s wholesale on an
    // unexpected-but-valid status (a missing 'merged' dead-lettered the batch).
    status: Joi.string()
      .valid('created', 'active', 'held', 'confirmed', 'ready', 'billed', 'paid', 'cancelled', 'completed', 'merged')
      .default('confirmed'),
    customer_id: Joi.string().uuid().allow(null),
    customer_name: Joi.string().max(150).allow('', null),
    customer_phone: Joi.string().max(30).allow('', null),
    covers: Joi.number().integer().min(0).allow(null),
    notes: Joi.string().max(500).allow('', null),
    subtotal: Joi.number().min(0).required(),
    tax_amount: Joi.number().min(0).default(0),
    cgst_amount: Joi.number().min(0).default(0),
    sgst_amount: Joi.number().min(0).default(0),
    // Full offline discount snapshot (db-apply-discount replays type/value/reason
    // alongside the derived discount_amount). All optional so a plain order — or a
    // legacy client that only sends discount_amount — still validates.
    discount_type: Joi.string().valid('percentage', 'flat').allow('', null),
    discount_value: Joi.number().min(0).allow(null),
    discount_reason: Joi.string().max(200).allow('', null),
    discount_amount: Joi.number().min(0).default(0),
    service_charge: Joi.number().min(0).default(0),
    // Rounding adjustment captured on the device (may be negative when the bill
    // was rounded down). Persisted verbatim — see syncOfflineOrders.
    round_off: Joi.number().allow(null).default(0),
    total_amount: Joi.number().min(0).required(),
    payment_method: Joi.string().max(30).allow('', null),
    payment_note: Joi.string().max(500).allow('', null),
    invoice_number: Joi.string().max(50).allow('', null),
    // Void snapshot (db-void-order) — the cancellation reason/time replayed on the
    // whole-order sync so the forward-merge can stamp cancel_reason/cancelled_at.
    cancel_reason: Joi.string().max(500).allow('', null),
    cancelled_at: Joi.date().iso().allow(null),
    created_at: Joi.date().iso(),
    billed_at: Joi.date().iso().allow(null),
    paid_at: Joi.date().iso().allow(null),
    // Optional KOT snapshot — the offline KDS marks tickets ready/served locally;
    // the sync reconciles each cloud KOT's status by kot_number (see syncOfflineOrders).
    kots: Joi.array().items(Joi.object({
      kot_number: Joi.string().max(20).allow('', null),
      station: Joi.string().max(30).allow('', null),
      status: Joi.string().max(20).allow('', null),
      items_count: Joi.number().integer().min(0).allow(null),
    }).options({ stripUnknown: true })).optional(),
    items: Joi.array().items(Joi.object({
      // Local order_items.id (client UUID) — the per-item idempotency key. When
      // supplied the cloud OrderItem is created WITH this id so a retried batch
      // dedupes on the primary key (a lost 2xx no longer duplicates items).
      id: Joi.string().uuid().optional(),
      // Relaxed off .uuid(): custom/open items may carry a non-uuid or empty id
      // (the service treats the menu lookup as best-effort and never re-prices).
      // Keep permissive so a well-formed offline order never 400s.
      menu_item_id: Joi.string().allow('', null),
      item_name: Joi.string().max(200).required(),
      variant_id: Joi.string().uuid().allow(null),
      variant_name: Joi.string().max(100).allow('', null),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().min(0).required(),
      addon_total: Joi.number().min(0).default(0),
      total_price: Joi.number().min(0).required(),
      notes: Joi.string().max(200).allow('', null),
    // Allow an EMPTY items array: a merged/split-emptied SOURCE order legitimately
    // carries zero items (every line moved to the target/new order). Requiring
    // min(1) here 400'd the whole batch so the merged source never reconciled and
    // its cloud table stayed occupied. The service tolerates [] (create loop
    // no-ops; the reconcile clears the source's cloud items).
    }).options({ stripUnknown: true })).default([]),
  }).options({ stripUnknown: true })).min(1).required(),
});

// Split bill & multi-tender — record one tender against an order. Mirrors
// processPaymentSchema's method/splits shape; the service decides partial vs close.
const tenderSchema = Joi.object({
  method: Joi.string().valid('cash', 'card', 'card_pine_labs', 'eftpos', 'upi', 'upi_razorpay', 'paytm', 'wallet', 'loyalty_points', 'split', 'online_prepaid', 'due').required(),
  amount: Joi.number().precision(2).greater(0).required(),
  transaction_id: Joi.string().max(100).allow('', null),
  loyalty_points_redeem: Joi.number().integer().min(0).default(0),
  splits: Joi.array().items(Joi.object({
    method: Joi.string().required(),
    amount: Joi.number().precision(2).min(0).required(),
    transaction_id: Joi.string().allow('', null),
  })),
});

const splitPreviewSchema = Joi.object({
  mode: Joi.string().valid('equal', 'amount').default('equal'),
  count: Joi.number().integer().min(2).max(50).when('mode', { is: 'equal', then: Joi.required() }),
  amounts: Joi.array().items(Joi.number().precision(2).min(0)).min(2).when('mode', { is: 'amount', then: Joi.required() }),
});

module.exports = {
  createOrderSchema,
  addItemsSchema,
  tenderSchema,
  splitPreviewSchema,
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
