/**
 * @fileoverview SMS service — sends transactional SMS via MSG91.
 * Falls back to mock logging when MSG91_AUTH_KEY is not configured.
 *
 * India TRAI DLT compliance: every transactional SMS must use a
 * PRE-REGISTERED DLT template, identified to MSG91 by its own `template_id`.
 * A single global template id is therefore not sufficient — each message TYPE
 * needs its own approved template. Register one MSG91/DLT template per type and
 * expose its id through the env var listed below (these env vars hold the
 * DLT-approved template IDs, NOT message text):
 *   - MSG91_TEMPLATE_ORDER_READY  → "order is ready for pickup" template
 *   - MSG91_TEMPLATE_ORDER_PLACED → "order placed / confirmed" template
 *   - MSG91_TEMPLATE_OTP          → one-time-password template
 *   - MSG91_TEMPLATE_PAYMENT      → "payment received" template
 * If a type-specific env var is unset, the service degrades gracefully to the
 * legacy MSG91_TEMPLATE_ID. The build(vars) wording on each registry entry must
 * match the merchant's DLT-approved template text for that template id.
 *
 * @module utils/sms.service
 */

const logger = require('../config/logger');

const AUTH_KEY   = process.env.MSG91_AUTH_KEY;
const SENDER_ID  = process.env.MSG91_SENDER_ID  || 'PETPJA';
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || '';

/**
 * Registry of DLT-approved transactional SMS templates.
 *
 * Each entry maps a logical template key to:
 *   - {string} env        Name of the env var holding that template's MSG91/DLT template id.
 *   - {function} build    (vars) => human-readable message matching the registered DLT wording.
 *
 * @type {Object.<string, {env: string, build: (vars: Object) => string}>}
 */
const TEMPLATES = {
  ORDER_READY: {
    env: 'MSG91_TEMPLATE_ORDER_READY',
    build: ({ orderNumber, outletName }) =>
      `Your order #${orderNumber} from ${outletName} is ready for pickup.`,
  },
  ORDER_PLACED: {
    env: 'MSG91_TEMPLATE_ORDER_PLACED',
    build: ({ orderNumber, outletName }) =>
      `Your order #${orderNumber} at ${outletName} has been placed and confirmed. Thank you!`,
  },
  OTP: {
    env: 'MSG91_TEMPLATE_OTP',
    build: ({ otp }) =>
      `${otp} is your PetPooja verification code. Do not share it with anyone.`,
  },
  PAYMENT_RECEIVED: {
    env: 'MSG91_TEMPLATE_PAYMENT',
    build: ({ amount, orderNumber }) =>
      `We have received your payment of ${amount} for order #${orderNumber}. Thank you!`,
  },
};

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
    logger.info(`\n================================================`);
    logger.info(`📱  SMS TO: ${phone}`);
    logger.info(`💬  MESSAGE: ${message}`);
    logger.info(`================================================\n`);
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
 * Sends a DLT-compliant transactional SMS using a pre-registered template.
 *
 * Resolves the per-type MSG91/DLT template id from the registry entry's env var
 * (falling back to the legacy MSG91_TEMPLATE_ID when unset), builds the message
 * body from the template's build(vars), and dispatches it via the same MSG91
 * mechanism used by sendSms — including phone normalisation and the
 * "no auth key → mock log" path.
 *
 * @param {string} phone        - E.164 or local format phone number
 * @param {string} templateKey  - Key into TEMPLATES (e.g. 'ORDER_READY')
 * @param {Object} [vars={}]     - Variables for the template's build()
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendTemplatedSms(phone, templateKey, vars = {}) {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) {
    logger.warn('Unknown SMS template key — skipping send', { templateKey });
    return { sent: false, reason: 'unknown_template' };
  }

  if (!phone) return { sent: false, reason: 'no_phone' };

  // Per-type DLT template id; degrade gracefully to legacy global id.
  const templateId = process.env[tpl.env] || TEMPLATE_ID;
  const message = tpl.build(vars);

  if (!AUTH_KEY) {
    // Mock mode — log to console for local dev / staging
    logger.info('📱 MOCK SMS SENT:', { to: phone, templateKey, templateId, message });
    logger.info(`\n================================================`);
    logger.info(`📱  SMS TO: ${phone}`);
    logger.info(`🧾  TEMPLATE: ${templateKey} (${templateId || 'no-id'})`);
    logger.info(`💬  MESSAGE: ${message}`);
    logger.info(`================================================\n`);
    return { sent: false, reason: 'mock' };
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

    // DLT-compliant: use the per-type registered template id for this message.
    if (templateId) payload.template_id = templateId;

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
    logger.info('SMS sent', { to: phone, templateKey, status: text });
    return { sent: true };
  } catch (error) {
    // SMS failure must never crash the main order flow — log and continue
    logger.error('SMS send failed', { to: phone, templateKey, error: error.message });
    return { sent: false, reason: 'error' };
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
  return sendTemplatedSms(phone, 'ORDER_READY', { orderNumber, outletName });
}

module.exports = {
  sendSms,
  sendOrderReadySms,
  sendTemplatedSms,
  TEMPLATES,
};
