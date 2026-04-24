const { randomUUID } = require('crypto');

/**
 * Simulates WhatsApp Business message delivery.
 * @param {object} payload - Request payload.
 * @returns {object} Mock WhatsApp response.
 */
function simulateMessageSend(payload = {}) {
  const failed = payload.forceFailure || !payload.phone;
  return {
    success: !failed,
    provider: 'whatsapp',
    message: {
      id: `wamid_${randomUUID()}`,
      phone: payload.phone || null,
      template: payload.template || 'order_confirmation',
      body: payload.body || 'Your order has been confirmed.',
      status: failed ? 'failed' : 'sent',
      failure_reason: failed ? 'Missing phone number or forced failure' : null,
      sent_at: failed ? null : new Date().toISOString(),
    },
  };
}

module.exports = { simulateMessageSend };
