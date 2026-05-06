/**
 * @fileoverview SMS service — sends transactional SMS via MSG91.
 * Falls back to mock logging when MSG91_AUTH_KEY is not configured.
 * @module utils/sms.service
 */

const logger = require('../config/logger');

const AUTH_KEY   = process.env.MSG91_AUTH_KEY;
const SENDER_ID  = process.env.MSG91_SENDER_ID  || 'PETPJA';
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || '';

/**
 * Sends an SMS via MSG91.
 * If MSG91_AUTH_KEY is not set, logs the message instead (dev/staging mock).
 *
 * @param {string} phone  - E.164 or local format phone number
 * @param {string} message - SMS body text
 * @returns {Promise<void>}
 */
async function sendSms(phone, message) {
  if (!phone) return; // no-op if no phone captured

  if (!AUTH_KEY) {
    // Mock mode — log to console for local dev / staging
    logger.info('📱 MOCK SMS SENT:', { to: phone, message });
    console.log(`\n================================================`);
    console.log(`📱  SMS TO: ${phone}`);
    console.log(`💬  MESSAGE: ${message}`);
    console.log(`================================================\n`);
    return;
  }

  try {
    // Normalise phone — MSG91 requires mobile number without leading +
    const mobile = phone.replace(/^\+/, '');

    const payload = {
      sender:    SENDER_ID,
      route:     '4',          // transactional route
      country:   '91',
      sms: [{ message, to: [mobile] }],
    };

    if (TEMPLATE_ID) payload.template_id = TEMPLATE_ID;

    const res = await fetch('https://api.msg91.com/api/sendhttp.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: AUTH_KEY,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`MSG91 error: ${text}`);
    logger.info('SMS sent', { to: phone, status: text });
  } catch (error) {
    // SMS failure must never crash the main order flow — log and continue
    logger.error('SMS send failed', { to: phone, error: error.message });
  }
}

/**
 * Notifies a customer that their order is ready for pickup/collection.
 *
 * @param {string} phone       - Customer phone
 * @param {string} orderNumber - Human-readable order number (e.g. "ORD-0042")
 * @param {string} outletName  - Restaurant outlet name
 */
async function sendOrderReadySms(phone, orderNumber, outletName = 'our kitchen') {
  const message = `Your order #${orderNumber} from ${outletName} is ready! Please collect your order. Thank you for dining with us.`;
  return sendSms(phone, message);
}

module.exports = {
  sendSms,
  sendOrderReadySms,
};
