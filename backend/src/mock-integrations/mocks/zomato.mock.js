const { randomUUID } = require('crypto');

/**
 * Simulates a Zomato order webhook payload.
 * @param {object} payload - Request payload.
 * @returns {object} Mock Zomato response.
 */
function simulateZomatoOrder(payload = {}) {
  if (payload.forceFailure) {
    return {
      success: false,
      platform: 'zomato',
      error: { code: 'ZOMATO_WEBHOOK_FAILED', message: 'Zomato rejected the order webhook' },
    };
  }

  const orderId = payload.order_id || `zomato_${randomUUID()}`;
  return {
    success: true,
    platform: 'zomato',
    order: {
      id: orderId,
      external_order_id: orderId,
      outlet_id: payload.outlet_id || 'mock-outlet-001',
      status: 'received',
      customer: {
        name: payload.customer_name || 'Rahul Sharma',
        phone: payload.customer_phone || '+919876543210',
      },
      items: payload.items || [
        { name: 'Paneer Tikka', quantity: 1, unit_price: 249 },
        { name: 'Butter Naan', quantity: 2, unit_price: 59 },
      ],
      total_amount: payload.total_amount || 367,
      payment_status: payload.payment_status || 'pending',
      created_at: new Date().toISOString(),
    },
  };
}

module.exports = { simulateZomatoOrder };
