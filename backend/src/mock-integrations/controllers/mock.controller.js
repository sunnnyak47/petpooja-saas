const Joi = require('joi');
const services = require('../integrations/mockServices');
const store = require('../integrations/mockStore');

const orderSchema = Joi.object({
  order_id: Joi.string().optional(),
  outlet_id: Joi.string().default('mock-outlet-001'),
  customer_name: Joi.string().default('Mock Customer'),
  customer_phone: Joi.string().default('+919999999999'),
  total_amount: Joi.number().min(0).optional(),
  payment_status: Joi.string().valid('pending', 'paid', 'failed').optional(),
  items: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required(),
    unit_price: Joi.number().min(0).required(),
  })).optional(),
  forceFailure: Joi.boolean().default(false),
});

const paymentSchema = Joi.object({
  order_id: Joi.string().required(),
  amount: Joi.number().min(0).required(),
  method: Joi.string().valid('upi', 'card', 'cash', 'wallet').default('upi'),
  status: Joi.string().valid('success', 'failed').optional(),
  forceFailure: Joi.boolean().default(false),
});

const whatsappSchema = Joi.object({
  phone: Joi.string().optional(),
  template: Joi.string().default('order_confirmation'),
  body: Joi.string().default('Your order has been confirmed.'),
  forceFailure: Joi.boolean().default(false),
});

const tallySchema = Joi.object({
  order_id: Joi.string().required(),
  invoice_number: Joi.string().optional(),
  amount: Joi.number().min(0).required(),
  gst_amount: Joi.number().min(0).default(0),
  forceFailure: Joi.boolean().default(false),
});

/**
 * Sends a consistent JSON response.
 * @param {object} res - Express response.
 * @param {number} status - HTTP status.
 * @param {object} data - Response data.
 * @param {string} message - Response message.
 * @returns {object} Express response.
 */
function send(res, status, data, message) {
  return res.status(status).json({ success: status < 400, data, message, meta: { mode: process.env.MODE || 'mock' } });
}

/**
 * Validates request body with Joi.
 * @param {object} schema - Joi schema.
 * @param {object} body - Request body.
 * @returns {object} Validated value.
 */
function validate(schema, body) {
  const { error, value } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const err = new Error(error.details.map((detail) => detail.message).join(', '));
    err.statusCode = 400;
    throw err;
  }
  return value;
}

/**
 * Handles Zomato mock order webhook.
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<object>} JSON response.
 */
async function zomatoOrder(req, res) {
  try {
    const payload = validate(orderSchema, req.body);
    const result = services.runService(services.simulateZomatoOrder, payload, 'zomato');
    if (!result.success) return send(res, 400, result, 'Zomato mock failed');
    const order = store.saveOrder(result.order);
    return send(res, 201, { platform: result.platform, order }, 'Zomato order saved');
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message }, 'Zomato order error');
  }
}

/**
 * Handles Swiggy mock order webhook.
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<object>} JSON response.
 */
async function swiggyOrder(req, res) {
  try {
    const payload = validate(orderSchema, req.body);
    const result = services.runService(services.simulateSwiggyOrder, payload, 'swiggy');
    if (!result.success) return send(res, 400, result, 'Swiggy mock failed');
    const order = store.saveOrder(result.order);
    return send(res, 201, { platform: result.platform, order }, 'Swiggy order saved');
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message }, 'Swiggy order error');
  }
}

/**
 * Handles Razorpay mock payment and links it to an order.
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<object>} JSON response.
 */
async function payment(req, res) {
  try {
    const payload = validate(paymentSchema, req.body);
    const result = services.runService(services.simulatePayment, payload, 'razorpay');
    if (!result.payment) return send(res, 501, result, 'Razorpay real API placeholder');
    const savedPayment = store.savePayment(result.payment);
    const order = payload.order_id ? store.updateOrderStatus(payload.order_id, savedPayment.status === 'success' ? 'paid' : 'payment_failed') : null;
    return send(res, result.success ? 200 : 400, { payment: savedPayment, order }, result.success ? 'Payment linked' : 'Payment failed');
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message }, 'Payment error');
  }
}

/**
 * Handles WhatsApp mock message send.
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<object>} JSON response.
 */
async function whatsapp(req, res) {
  try {
    const payload = validate(whatsappSchema, req.body);
    const result = services.runService(services.simulateMessageSend, payload, 'whatsapp');
    if (!result.message) return send(res, 501, result, 'WhatsApp real API placeholder');
    const message = store.saveNotification(result.message);
    return send(res, result.success ? 200 : 400, { message }, result.success ? 'WhatsApp message sent' : 'WhatsApp message failed');
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message }, 'WhatsApp error');
  }
}

/**
 * Handles Tally mock invoice push.
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<object>} JSON response.
 */
async function tally(req, res) {
  try {
    const payload = validate(tallySchema, req.body);
    const result = services.runService(services.simulateInvoicePush, payload, 'tally');
    if (!result.invoice) return send(res, 501, result, 'Tally real API placeholder');
    const invoice = store.saveInvoice(result.invoice);
    return send(res, result.success ? 200 : 400, { invoice }, result.success ? 'Invoice pushed to Tally' : 'Tally invoice failed');
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message }, 'Tally error');
  }
}

/**
 * Simulates full mock order flow.
 * @param {object} req - Express request.
 * @param {object} res - Express response.
 * @returns {Promise<object>} JSON response.
 */
async function orderFlow(req, res) {
  try {
    const orderResult = services.runService(services.simulateZomatoOrder, {}, 'zomato');
    if (!orderResult.success) return send(res, 400, orderResult, 'Order flow failed');

    const order = store.saveOrder(orderResult.order);
    store.updateOrderStatus(order.id, 'accepted');

    const paymentResult = services.runService(services.simulatePayment, {
      order_id: order.id,
      amount: order.total_amount,
      method: 'upi',
    }, 'razorpay');
    if (!paymentResult.payment) return send(res, 501, paymentResult, 'Payment placeholder');
    const savedPayment = store.savePayment(paymentResult.payment);

    const notificationResult = services.runService(services.simulateMessageSend, {
      phone: order.customer.phone,
      body: `Order ${order.id} confirmed. Payment ${savedPayment.status}.`,
    }, 'whatsapp');
    if (!notificationResult.message) return send(res, 501, notificationResult, 'Notification placeholder');
    const notification = store.saveNotification(notificationResult.message);

    const tallyResult = services.runService(services.simulateInvoicePush, {
      order_id: order.id,
      amount: order.total_amount,
      gst_amount: Math.round(order.total_amount * 0.05 * 100) / 100,
    }, 'tally');
    if (!tallyResult.invoice) return send(res, 501, tallyResult, 'Accounting placeholder');
    const invoice = store.saveInvoice(tallyResult.invoice);

    return send(res, 200, { order, payment: savedPayment, notification, invoice, store: store.getSnapshot() }, 'Mock order flow completed');
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message }, 'Order flow error');
  }
}

module.exports = {
  zomatoOrder,
  swiggyOrder,
  payment,
  whatsapp,
  tally,
  orderFlow,
};
