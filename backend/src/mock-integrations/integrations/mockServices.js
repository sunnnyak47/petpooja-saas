const { simulateZomatoOrder } = require('../mocks/zomato.mock');
const { simulateSwiggyOrder } = require('../mocks/swiggy.mock');
const { simulatePayment } = require('../mocks/razorpay.mock');
const { simulateMessageSend } = require('../mocks/whatsapp.mock');
const { simulateInvoicePush } = require('../mocks/tally.mock');

/**
 * Returns whether mock mode is active.
 * @returns {boolean} Mock mode status.
 */
function isMockMode() {
  return (process.env.MODE || 'mock') === 'mock';
}

/**
 * Runs a mock service or returns a real API placeholder.
 * @param {Function} mockHandler - Mock handler.
 * @param {object} payload - Request payload.
 * @param {string} service - Service name.
 * @returns {object} Service response.
 */
function runService(mockHandler, payload, service) {
  if (!isMockMode()) {
    return {
      success: false,
      service,
      error: { code: 'REAL_API_NOT_CONFIGURED', message: `${service} real API placeholder` },
    };
  }
  return mockHandler(payload);
}

module.exports = {
  isMockMode,
  runService,
  simulateZomatoOrder,
  simulateSwiggyOrder,
  simulatePayment,
  simulateMessageSend,
  simulateInvoicePush,
};
