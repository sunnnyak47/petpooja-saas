const { randomUUID } = require('crypto');

/**
 * Simulates Razorpay payment success or failure.
 * @param {object} payload - Request payload.
 * @returns {object} Mock Razorpay response.
 */
function simulatePayment(payload = {}) {
  const failed = payload.forceFailure || payload.status === 'failed';
  return {
    success: !failed,
    provider: 'razorpay',
    payment: {
      id: `pay_${randomUUID()}`,
      order_id: payload.order_id || null,
      amount: payload.amount || 0,
      currency: 'INR',
      method: payload.method || 'upi',
      status: failed ? 'failed' : 'success',
      failure_reason: failed ? 'Mock payment declined' : null,
      processed_at: new Date().toISOString(),
    },
  };
}

module.exports = { simulatePayment };
