const orders = [];
const payments = [];
const notifications = [];
const invoices = [];

/**
 * Saves an order in memory.
 * @param {object} order - Mock order.
 * @returns {object} Saved order.
 */
function saveOrder(order) {
  const savedOrder = { ...order, internal_id: `mock_order_${orders.length + 1}` };
  orders.push(savedOrder);
  return savedOrder;
}

/**
 * Updates an in-memory order status.
 * @param {string} orderId - Order id.
 * @param {string} status - New status.
 * @returns {object|null} Updated order.
 */
function updateOrderStatus(orderId, status) {
  const order = orders.find((item) => item.id === orderId || item.internal_id === orderId);
  if (!order) return null;
  order.status = status;
  order.updated_at = new Date().toISOString();
  return order;
}

/**
 * Saves a payment and links it to an order.
 * @param {object} payment - Mock payment.
 * @returns {object} Saved payment.
 */
function savePayment(payment) {
  payments.push(payment);
  if (payment.order_id && payment.status === 'success') {
    const order = updateOrderStatus(payment.order_id, 'paid');
    if (order) order.payment_id = payment.id;
  }
  return payment;
}

/**
 * Saves a notification in memory.
 * @param {object} notification - Mock notification.
 * @returns {object} Saved notification.
 */
function saveNotification(notification) {
  notifications.push(notification);
  return notification;
}

/**
 * Saves an invoice in memory.
 * @param {object} invoice - Mock invoice.
 * @returns {object} Saved invoice.
 */
function saveInvoice(invoice) {
  invoices.push(invoice);
  return invoice;
}

/**
 * Returns current in-memory mock data.
 * @returns {object} Store snapshot.
 */
function getSnapshot() {
  return { orders, payments, notifications, invoices };
}

module.exports = {
  saveOrder,
  updateOrderStatus,
  savePayment,
  saveNotification,
  saveInvoice,
  getSnapshot,
};
