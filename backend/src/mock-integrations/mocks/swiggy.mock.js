const { randomUUID } = require('crypto');

/**
 * Simulates a Swiggy order webhook payload.
 * @param {object} payload - Request payload.
 * @returns {object} Mock Swiggy response.
 */
function simulateSwiggyOrder(payload = {}) {
  if (payload.forceFailure) {
    return {
      success: false,
      platform: 'swiggy',
      error: { code: 'SWIGGY_WEBHOOK_FAILED', message: 'Swiggy could not deliver the webhook' },
    };
  }

  const orderId = payload.order_id || `swiggy_${randomUUID()}`;
  return {
    success: true,
    platform: 'swiggy',
    order: {
      id: orderId,
      external_order_id: orderId,
      outlet_id: payload.outlet_id || 'mock-outlet-001',
      status: 'received',
      customer: {
        name: payload.customer_name || 'Priya Mehta',
        phone: payload.customer_phone || '+919812345678',
      },
      items: payload.items || [
        { name: 'Veg Biryani', quantity: 1, unit_price: 199 },
        { name: 'Masala Chaas', quantity: 1, unit_price: 49 },
      ],
      total_amount: payload.total_amount || 248,
      payment_status: payload.payment_status || 'pending',
      created_at: new Date().toISOString(),
    },
  };
}

module.exports = { simulateSwiggyOrder };
