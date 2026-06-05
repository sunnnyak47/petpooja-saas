/**
 * @fileoverview Razorpay webhook event processor.
 *
 * Consumes verified Razorpay webhook payloads and reconciles them against our
 * internal `Payment` / `Order` records. Designed to be safe to call repeatedly
 * for the same event (idempotent) and to NEVER throw — the HTTP webhook handler
 * must always respond 200 so Razorpay does not endlessly retry.
 *
 * How we link a webhook back to our data
 * --------------------------------------
 * When `payment.service.createRazorpayOrder()` creates the Razorpay order it
 * stamps our internal order id into `notes.order_id`. Razorpay echoes those
 * notes onto the payment entity, so for payment events we resolve our order id
 * from `event.payload.payment.entity.notes.order_id` and then locate the
 * pending `Payment` row for that order. For refund events the payment entity is
 * not present, so we match on `Payment.transaction_id === refund.payment_id`
 * (the Razorpay payment id we stored when the payment first succeeded).
 *
 * IMPORTANT: All Razorpay monetary amounts are integers in PAISE. We divide by
 * 100 to get rupees before comparing/storing against our Decimal columns.
 *
 * @module modules/integrations/razorpay.webhook.service
 */

const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');

/** Payment methods that represent an online/gateway collection. */
const GATEWAY_METHODS = ['razorpay', 'online', 'upi', 'card', 'gateway'];

/**
 * Converts a Razorpay paise amount to rupees.
 * @param {number} paise - Integer amount in paise.
 * @returns {number} Amount in rupees.
 */
function toRupees(paise) {
  return Number(paise || 0) / 100;
}

/**
 * Merges new gateway data into an existing gateway_response JSON blob without
 * losing what the synchronous verify flow already stored.
 * @param {*} existing - Current gateway_response value (may be null/object).
 * @param {object} incoming - New data to merge in.
 * @returns {object} Merged object.
 */
function mergeGatewayResponse(existing, incoming) {
  const base = existing && typeof existing === 'object' ? existing : {};
  return { ...base, ...incoming };
}

/**
 * Finds the best-matching `Payment` row for one of our internal order ids.
 *
 * Match strategy (most specific first):
 *   1. All non-deleted Payments for `order_id`, newest first.
 *   2. Prefer a gateway-method payment whose `transaction_id` is empty or
 *      already equals this Razorpay payment id (i.e. the row the verify flow
 *      created/stubbed for this online collection).
 *   3. Otherwise fall back to the most recent payment for the order.
 *
 * @param {string} orderId - Our internal order UUID.
 * @param {string} [razorpayPaymentId] - Razorpay payment id from the entity.
 * @returns {Promise<object|null>} The matched Payment row or null.
 */
async function findPaymentForOrder(orderId, razorpayPaymentId) {
  const payments = await prisma.payment.findMany({
    where: { order_id: orderId, is_deleted: false },
    orderBy: { created_at: 'desc' },
  });

  if (payments.length === 0) return null;
  if (payments.length === 1) return payments[0];

  // Prefer a gateway payment already tied to (or awaiting) this payment id.
  const preferred = payments.find((p) => {
    const isGateway = GATEWAY_METHODS.includes(String(p.method || '').toLowerCase());
    const txnMatches =
      !p.transaction_id ||
      p.transaction_id === '' ||
      (razorpayPaymentId && p.transaction_id === razorpayPaymentId);
    return isGateway && txnMatches;
  });
  if (preferred) return preferred;

  // Next best: any gateway-method payment.
  const gateway = payments.find((p) =>
    GATEWAY_METHODS.includes(String(p.method || '').toLowerCase())
  );
  if (gateway) return gateway;

  // Fall back to the most recent payment.
  return payments[0];
}

/**
 * Handles `payment.captured` / `payment.authorized`.
 * @param {object} entity - Razorpay payment entity.
 * @param {string} eventType - The webhook event name.
 * @returns {Promise<object>} Result object.
 */
async function handlePaymentSuccess(entity, eventType) {
  const ourOrderId = entity && entity.notes ? entity.notes.order_id : undefined;
  if (!ourOrderId) {
    logger.warn('Razorpay webhook: payment success without notes.order_id', {
      event: eventType,
      razorpayPaymentId: entity && entity.id,
    });
    return { handled: false, event: eventType, reason: 'no_order_id_in_notes' };
  }

  const payment = await findPaymentForOrder(ourOrderId, entity.id);

  // Webhook beat the synchronous verify call — do NOT create a duplicate row.
  if (!payment) {
    logger.info('Razorpay webhook arrived before payment row existed', {
      event: eventType,
      orderId: ourOrderId,
      razorpayPaymentId: entity.id,
    });
    return { handled: false, event: eventType, reason: 'no_payment_row', orderId: ourOrderId };
  }

  if (payment.status === 'success') {
    logger.info('Razorpay webhook: payment already marked success', {
      event: eventType,
      paymentId: payment.id,
      orderId: ourOrderId,
    });
    return { handled: true, idempotent: true, event: eventType, paymentId: payment.id };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'success',
      transaction_id: entity.id,
      gateway_response: mergeGatewayResponse(payment.gateway_response, {
        webhook_event: eventType,
        razorpay_payment_id: entity.id,
        razorpay_order_id: entity.order_id,
        amount: toRupees(entity.amount),
        method: entity.method,
        captured_at: new Date().toISOString(),
        entity,
      }),
    },
  });

  // Mark the order paid if it is not already.
  const order = await prisma.order.findUnique({
    where: { id: ourOrderId },
    select: { id: true, is_paid: true },
  });
  if (order && !order.is_paid) {
    await prisma.order.update({
      where: { id: ourOrderId },
      data: { is_paid: true, paid_at: new Date() },
    });
  }

  logger.info('Razorpay webhook: payment reconciled to success', {
    event: eventType,
    paymentId: payment.id,
    orderId: ourOrderId,
    razorpayPaymentId: entity.id,
  });

  return {
    handled: true,
    event: eventType,
    paymentId: payment.id,
    orderId: ourOrderId,
    transactionId: entity.id,
  };
}

/**
 * Handles `payment.failed`.
 * @param {object} entity - Razorpay payment entity.
 * @param {string} eventType - The webhook event name.
 * @returns {Promise<object>} Result object.
 */
async function handlePaymentFailed(entity, eventType) {
  const ourOrderId = entity && entity.notes ? entity.notes.order_id : undefined;
  if (!ourOrderId) {
    return { handled: false, event: eventType, reason: 'no_order_id_in_notes' };
  }

  const payment = await findPaymentForOrder(ourOrderId, entity.id);
  if (!payment) {
    logger.info('Razorpay webhook: failed event with no payment row', {
      event: eventType,
      orderId: ourOrderId,
      razorpayPaymentId: entity && entity.id,
    });
    return { handled: false, event: eventType, reason: 'no_payment_row', orderId: ourOrderId };
  }

  // Never override a payment that already succeeded (e.g. retried/late failure).
  if (payment.status === 'success' || payment.status === 'refunded') {
    return {
      handled: true,
      idempotent: true,
      event: eventType,
      paymentId: payment.id,
      reason: `already_${payment.status}`,
    };
  }

  if (payment.status === 'failed') {
    return { handled: true, idempotent: true, event: eventType, paymentId: payment.id };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'failed',
      transaction_id: entity.id || payment.transaction_id,
      gateway_response: mergeGatewayResponse(payment.gateway_response, {
        webhook_event: eventType,
        razorpay_payment_id: entity && entity.id,
        error_code: entity && entity.error_code,
        error_description: entity && entity.error_description,
        failed_at: new Date().toISOString(),
        entity,
      }),
    },
  });

  logger.info('Razorpay webhook: payment marked failed', {
    event: eventType,
    paymentId: payment.id,
    orderId: ourOrderId,
  });

  return { handled: true, event: eventType, paymentId: payment.id, orderId: ourOrderId };
}

/**
 * Handles `refund.processed` / `refund.created`.
 * @param {object} entity - Razorpay refund entity ({ id, payment_id, amount }).
 * @param {string} eventType - The webhook event name.
 * @returns {Promise<object>} Result object.
 */
async function handleRefund(entity, eventType) {
  const razorpayPaymentId = entity && entity.payment_id;
  if (!razorpayPaymentId) {
    logger.warn('Razorpay webhook: refund without payment_id', { event: eventType });
    return { handled: false, event: eventType, reason: 'no_payment_id' };
  }

  // Refund entities carry no notes.order_id, so match on the stored Razorpay
  // payment id we saved as transaction_id when the payment succeeded.
  const payment = await prisma.payment.findFirst({
    where: { transaction_id: razorpayPaymentId, is_deleted: false },
    orderBy: { created_at: 'desc' },
  });

  if (!payment) {
    logger.info('Razorpay webhook: refund for unknown payment', {
      event: eventType,
      razorpayPaymentId,
      refundId: entity && entity.id,
    });
    return { handled: false, event: eventType, reason: 'no_payment_row' };
  }

  const refundRupees = toRupees(entity.amount);
  const alreadyRefunded = Number(payment.refund_amount || 0);

  // Idempotency: if this exact refund id was already recorded, no-op.
  const prevResponse =
    payment.gateway_response && typeof payment.gateway_response === 'object'
      ? payment.gateway_response
      : {};
  const seenRefundIds = Array.isArray(prevResponse.refund_ids) ? prevResponse.refund_ids : [];
  if (entity.id && seenRefundIds.includes(entity.id)) {
    return {
      handled: true,
      idempotent: true,
      event: eventType,
      paymentId: payment.id,
      refundId: entity.id,
    };
  }

  const newRefundTotal = alreadyRefunded + refundRupees;
  const paymentAmount = Number(payment.amount || 0);
  const fullyRefunded = newRefundTotal >= paymentAmount - 0.001; // float tolerance

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refund_amount: newRefundTotal,
      refund_id: entity.id || payment.refund_id,
      ...(fullyRefunded ? { status: 'refunded' } : {}),
      gateway_response: mergeGatewayResponse(payment.gateway_response, {
        refund_ids: entity.id ? [...seenRefundIds, entity.id] : seenRefundIds,
        last_refund_event: eventType,
        last_refund_amount: refundRupees,
        total_refunded: newRefundTotal,
        refunded_at: new Date().toISOString(),
      }),
    },
  });

  logger.info('Razorpay webhook: refund recorded', {
    event: eventType,
    paymentId: payment.id,
    refundId: entity.id,
    amount: refundRupees,
    totalRefunded: newRefundTotal,
    fullyRefunded,
  });

  return {
    handled: true,
    event: eventType,
    paymentId: payment.id,
    refundId: entity.id,
    refundAmount: refundRupees,
    fullyRefunded,
  };
}

/**
 * Processes a single parsed Razorpay webhook event idempotently.
 *
 * Never throws: every branch is wrapped so the caller can always respond 200.
 * On an unexpected error it returns `{ handled: false, error }`.
 *
 * @param {object} event - Parsed Razorpay webhook body.
 * @param {string} event.event - Event type (e.g. "payment.captured").
 * @param {object} event.payload - Event payload container.
 * @returns {Promise<object>} Result object, always including `handled` + `event`.
 */
async function processEvent(event) {
  const eventType = event && event.event;

  if (!eventType || !event.payload) {
    logger.warn('Razorpay webhook: malformed event (missing event/payload)');
    return { handled: false, event: eventType, reason: 'malformed_event' };
  }

  try {
    switch (eventType) {
      case 'payment.captured':
      case 'payment.authorized': {
        const entity = event.payload.payment && event.payload.payment.entity;
        if (!entity) return { handled: false, event: eventType, reason: 'no_payment_entity' };
        return await handlePaymentSuccess(entity, eventType);
      }

      case 'payment.failed': {
        const entity = event.payload.payment && event.payload.payment.entity;
        if (!entity) return { handled: false, event: eventType, reason: 'no_payment_entity' };
        return await handlePaymentFailed(entity, eventType);
      }

      case 'refund.processed':
      case 'refund.created': {
        const entity = event.payload.refund && event.payload.refund.entity;
        if (!entity) return { handled: false, event: eventType, reason: 'no_refund_entity' };
        return await handleRefund(entity, eventType);
      }

      default:
        logger.info('Razorpay webhook: ignored event type', { event: eventType });
        return { handled: false, event: eventType, reason: 'unhandled_event_type' };
    }
  } catch (error) {
    // Swallow the error so the webhook endpoint can still return 200.
    logger.error('Razorpay webhook processing failed', {
      event: eventType,
      error: error && error.message,
      stack: error && error.stack,
    });
    return { handled: false, event: eventType, error: error && error.message };
  }
}

module.exports = { processEvent };
