/**
 * @fileoverview Notification service — SMS, WhatsApp, Email, Push notifications.
 * @module modules/integrations/notification.service
 */

const logger = require('../../config/logger');

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || '';
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'PETPJA';
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || '';
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';

/**
 * Sends an SMS via MSG91 API.
 * @param {string} phone - 10-digit Indian phone number
 * @param {string} message - SMS content
 * @param {string} [templateId] - DLT registered template ID
 * @returns {Promise<object>} Send result
 */
async function sendSMS(phone, message, templateId) {
  try {
    if (!MSG91_AUTH_KEY) {
      logger.info(`[DEV] SMS to ${phone}: ${message}`);
      return { success: true, mode: 'dev', phone };
    }

    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: MSG91_AUTH_KEY,
      },
      body: JSON.stringify({
        template_id: templateId || MSG91_TEMPLATE_ID,
        sender: MSG91_SENDER_ID,
        short_url: '0',
        mobiles: `91${phone}`,
        message,
      }),
    });

    const data = await response.json();
    logger.info('SMS sent', { phone, templateId });
    return data;
  } catch (error) {
    logger.error('SMS send failed', { error: error.message, phone });
    throw error;
  }
}

/**
 * Sends OTP via MSG91.
 * @param {string} phone - Phone number
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<object>}
 */
async function sendOTP(phone, otp) {
  return sendSMS(phone, `Your Petpooja verification OTP is: ${otp}. Valid for 5 minutes.`, process.env.MSG91_OTP_TEMPLATE || '');
}

/**
 * Sends a WhatsApp message via Meta Business API.
 * @param {string} phone - Phone with country code (919XXXXXXXXX)
 * @param {string} templateName - Approved template name
 * @param {Array} [parameters] - Template parameters
 * @returns {Promise<object>} Send result
 */
async function sendWhatsApp(phone, templateName, parameters = []) {
  try {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      logger.info(`[DEV] WhatsApp to ${phone}: template=${templateName}`, { parameters });
      return { success: true, mode: 'dev', phone };
    }

    const body = {
      messaging_product: 'whatsapp',
      to: phone.startsWith('91') ? phone : `91${phone}`,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: parameters.length > 0 ? [{
          type: 'body',
          parameters: parameters.map((p) => ({ type: 'text', text: String(p) })),
        }] : [],
      },
    };

    const response = await fetch(`${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    logger.info('WhatsApp sent', { phone, templateName });
    return data;
  } catch (error) {
    logger.error('WhatsApp send failed', { error: error.message, phone });
    throw error;
  }
}

/**
 * Sends order confirmation via WhatsApp.
 * @param {string} phone - Customer phone
 * @param {string} orderNumber - Order number
 * @param {number} amount - Order total
 * @param {string} outletName - Restaurant name
 * @returns {Promise<object>}
 */
async function sendOrderConfirmation(phone, orderNumber, amount, outletName) {
  return sendWhatsApp(phone, 'order_confirmation', [
    outletName, orderNumber, `₹${amount}`,
  ]);
}

/**
 * Sends order ready notification.
 * @param {string} phone - Customer phone
 * @param {string} orderNumber - Order number
 * @returns {Promise<object>}
 */
async function sendOrderReady(phone, orderNumber) {
  return sendWhatsApp(phone, 'order_ready', [orderNumber]);
}

/**
 * Sends invoice/bill via WhatsApp.
 * @param {string} phone - Customer phone
 * @param {string} orderNumber - Order number
 * @param {string} invoiceUrl - PDF/HTML invoice URL
 * @returns {Promise<object>}
 */
async function sendInvoice(phone, orderNumber, invoiceUrl) {
  return sendWhatsApp(phone, 'invoice_share', [orderNumber, invoiceUrl]);
}

/**
 * Sends loyalty points earned notification.
 * @param {string} phone - Customer phone
 * @param {number} pointsEarned - Points earned
 * @param {number} totalBalance - New total balance
 * @returns {Promise<object>}
 */
async function sendLoyaltyNotification(phone, pointsEarned, totalBalance) {
  return sendWhatsApp(phone, 'loyalty_points', [
    String(pointsEarned), String(totalBalance),
  ]);
}

/**
 * Sends a promotional campaign message.
 * @param {Array<{phone: string}>} recipients - Array of customer objects
 * @param {string} templateName - Campaign template
 * @param {Array} parameters - Template params
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendCampaign(recipients, templateName, parameters = []) {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      await sendWhatsApp(recipient.phone, templateName, parameters);
      sent++;
      await new Promise((r) => setTimeout(r, 100));
    } catch (error) {
      failed++;
      logger.error('Campaign message failed', { phone: recipient.phone, error: error.message });
    }
  }

  logger.info('Campaign completed', { templateName, sent, failed, total: recipients.length });
  return { sent, failed };
}

module.exports = {
  sendSMS, sendOTP, sendWhatsApp,
  sendOrderConfirmation, sendOrderReady, sendInvoice,
  sendLoyaltyNotification, sendCampaign,
};
