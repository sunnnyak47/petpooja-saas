const { randomUUID } = require('crypto');

/**
 * Simulates pushing an invoice to Tally.
 * @param {object} payload - Request payload.
 * @returns {object} Mock Tally response.
 */
function simulateInvoicePush(payload = {}) {
  const failed = payload.forceFailure || !payload.order_id;
  return {
    success: !failed,
    provider: 'tally',
    invoice: {
      voucher_id: failed ? null : `tally_${randomUUID()}`,
      order_id: payload.order_id || null,
      invoice_number: payload.invoice_number || `FY-OUTLET-${Date.now()}`,
      amount: payload.amount || 0,
      gst_amount: payload.gst_amount || 0,
      status: failed ? 'failed' : 'pushed',
      failure_reason: failed ? 'Missing order_id or forced failure' : null,
      pushed_at: failed ? null : new Date().toISOString(),
    },
  };
}

module.exports = { simulateInvoicePush };
