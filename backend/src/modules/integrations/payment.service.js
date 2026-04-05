/**
 * @fileoverview Payment gateway integration service — Razorpay, Pine Labs.
 * @module modules/integrations/payment.service
 */

const crypto = require('crypto');
const logger = require('../../config/logger');
const { BadRequestError } = require('../../utils/errors');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

/**
 * Creates a Razorpay order for online payment collection.
 * @param {number} amount - Amount in INR (will be sent as paise)
 * @param {string} orderId - Internal order ID for receipt
 * @param {string} customerName - Customer name
 * @param {string} customerPhone - Customer phone
 * @returns {Promise<object>} Razorpay order object with id, amount, currency
 */
async function createRazorpayOrder(amount, orderId, customerName, customerPhone) {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      logger.warn('Razorpay not configured, returning mock order');
      return {
        id: `order_mock_${Date.now()}`,
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: orderId,
        status: 'created',
        key: RAZORPAY_KEY_ID || 'rzp_test_mock',
        prefill: { name: customerName, contact: customerPhone },
      };
    }

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: orderId,
        notes: { order_id: orderId, source: 'petpooja_erp' },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new BadRequestError(`Razorpay error: ${error.error?.description || 'Unknown'}`);
    }

    const data = await response.json();
    logger.info('Razorpay order created', { razorpayOrderId: data.id, amount });

    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
      key: RAZORPAY_KEY_ID,
      prefill: { name: customerName, contact: customerPhone },
    };
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    logger.error('Create Razorpay order failed', { error: error.message });
    throw error;
  }
}

/**
 * Verifies Razorpay payment signature after checkout.
 * @param {string} razorpayOrderId - Razorpay order ID
 * @param {string} razorpayPaymentId - Razorpay payment ID
 * @param {string} razorpaySignature - Razorpay signature
 * @returns {boolean} Whether payment is verified
 */
function verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  if (!RAZORPAY_KEY_SECRET) {
    logger.warn('Razorpay secret not set, skipping verification');
    return true;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  return expected === razorpaySignature;
}

/**
 * Verifies Razorpay webhook signature.
 * @param {string} signature - X-Razorpay-Signature header
 * @param {string} payload - Raw body
 * @returns {boolean}
 */
function verifyRazorpayWebhook(signature, payload) {
  if (!RAZORPAY_WEBHOOK_SECRET) return process.env.NODE_ENV === 'development';

  const expected = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return expected === signature;
}

/**
 * Initiates a refund through Razorpay.
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Refund amount in INR
 * @param {string} reason - Refund reason
 * @returns {Promise<object>} Refund details
 */
async function initiateRazorpayRefund(paymentId, amount, reason) {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return { id: `rfnd_mock_${Date.now()}`, amount: amount * 100, status: 'processed' };
    }

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        notes: { reason, source: 'petpooja_erp' },
      }),
    });

    const data = await response.json();
    logger.info('Razorpay refund initiated', { refundId: data.id, paymentId, amount });
    return data;
  } catch (error) {
    logger.error('Razorpay refund failed', { error: error.message });
    throw error;
  }
}

/**
 * Pine Labs POS terminal integration — formats transaction request.
 * @param {number} amount - Amount in INR
 * @param {string} orderId - Order reference
 * @returns {object} Pine Labs transaction request payload
 */
function formatPineLabsRequest(amount, orderId) {
  return {
    TransactionNumber: Date.now(),
    SequenceNumber: 1,
    AllowedPaymentMode: '1,2,3,4,5,6,7',
    TransactionType: 4001,
    BillingRefNo: orderId,
    PaymentAmount: Math.round(amount * 100),
    MerchantId: process.env.PINELABS_MERCHANT_ID || '',
    SecurityToken: process.env.PINELABS_SECURITY_TOKEN || '',
    StoreId: process.env.PINELABS_STORE_ID || '',
  };
}

module.exports = {
  createRazorpayOrder, verifyRazorpayPayment, verifyRazorpayWebhook,
  initiateRazorpayRefund, formatPineLabsRequest,
};
