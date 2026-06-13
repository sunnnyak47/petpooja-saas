/**
 * @fileoverview Split-bill & multi-tender settlement.
 *
 * Adds two capabilities on top of the single-shot full payment in
 * order.service.processPayment:
 *
 *  1. Progressive multi-tender — settle one bill with several payments over time
 *     (e.g. $30 cash now, $20 card later). Each non-closing tender is recorded as
 *     its own successful Payment row; the order stays in its current lifecycle
 *     status (kitchen flow untouched) until the cumulative tenders cover the
 *     grand total, at which point the closing tender is delegated to
 *     processPayment so ALL finalisation (inventory deduction, table free, loyalty
 *     earn, ledger posting, usage metering, sockets) runs in exactly one place.
 *
 *  2. Split the check — divide a bill equally or by custom amounts so each guest
 *     pays their portion as an independent tender.
 *
 * Partial state is derived from the payments themselves (sum vs grand_total), so
 * order.status is never mutated here — an order can be half-paid while the kitchen
 * still shows it "preparing".
 *
 * @module modules/orders/order.split.service
 */

const { getDbClient } = require('../../config/database');
const { getIO } = require('../../socket/index');
const logger = require('../../config/logger');
const { round2 } = require('../../utils/money');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

const TOLERANCE = 0.01;

/** Loads an order for billing, scoped to the outlet when provided. */
async function _loadOrder(prisma, orderId, outletId) {
  const where = { id: orderId, is_deleted: false };
  if (outletId) where.outlet_id = outletId;
  const order = await prisma.order.findFirst({ where });
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

/** Sum of successful, non-deleted tenders for an order. */
async function _sumPaid(prisma, orderId) {
  const agg = await prisma.payment.aggregate({
    where: { order_id: orderId, status: 'success', is_deleted: false },
    _sum: { amount: true },
  });
  return round2(Number(agg._sum.amount) || 0);
}

/**
 * Returns the live bill state for an order: total, what has been tendered so far,
 * the outstanding balance, and the individual tenders.
 *
 * @param {string} orderId
 * @param {string} [outletId]
 * @returns {Promise<object>}
 */
async function getBillSummary(orderId, outletId = null) {
  const prisma = getDbClient();
  const order = await _loadOrder(prisma, orderId, outletId);

  const grandTotal = round2(Number(order.grand_total));
  const amountPaid = await _sumPaid(prisma, orderId);
  const balanceDue = round2(Math.max(grandTotal - amountPaid, 0));

  const payments = await prisma.payment.findMany({
    where: { order_id: orderId, is_deleted: false },
    select: { id: true, method: true, amount: true, status: true, transaction_id: true, processed_at: true, created_at: true },
    orderBy: { created_at: 'asc' },
  });

  return {
    order_id: orderId,
    grand_total: grandTotal,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    is_paid: order.is_paid || balanceDue <= TOLERANCE,
    is_partially_paid: amountPaid > TOLERANCE && balanceDue > TOLERANCE,
    payment_count: payments.length,
    payments,
  };
}

/**
 * Computes split portions for a bill. Pure arithmetic — does not touch the DB.
 *
 * @param {number} grandTotal
 * @param {object} opts
 * @param {'equal'|'amount'} opts.mode
 * @param {number} [opts.count]    number of equal portions (mode 'equal')
 * @param {number[]} [opts.amounts] custom portion amounts (mode 'amount')
 * @returns {{mode:string, total:number, portions:{label:string, amount:number}[]}}
 */
function computeSplit(grandTotal, opts = {}) {
  const total = round2(Number(grandTotal) || 0);
  if (total <= 0) throw new BadRequestError('Order total must be positive to split');
  const mode = opts.mode || 'equal';

  if (mode === 'equal') {
    const count = parseInt(opts.count, 10);
    if (!Number.isInteger(count) || count < 2 || count > 50) {
      throw new BadRequestError('Equal split requires a count between 2 and 50');
    }
    // Floor each portion to 2dp; the last portion absorbs the rounding remainder
    // so the portions always sum exactly to the total.
    const base = Math.floor((total / count) * 100) / 100;
    const portions = Array.from({ length: count }, (_, i) => ({
      label: `Guest ${i + 1}`,
      amount: i === count - 1 ? round2(total - base * (count - 1)) : base,
    }));
    return { mode, total, portions };
  }

  if (mode === 'amount') {
    const amounts = Array.isArray(opts.amounts) ? opts.amounts.map((a) => round2(Number(a) || 0)) : [];
    if (amounts.length < 2) throw new BadRequestError('Custom split requires at least 2 amounts');
    if (amounts.some((a) => a < 0)) throw new BadRequestError('Split amounts cannot be negative');
    const sum = round2(amounts.reduce((s, a) => s + a, 0));
    if (Math.abs(sum - total) > TOLERANCE) {
      throw new BadRequestError(`Split amounts (${sum}) must sum to the order total (${total})`);
    }
    return { mode, total, portions: amounts.map((amount, i) => ({ label: `Guest ${i + 1}`, amount })) };
  }

  throw new BadRequestError(`Unknown split mode: ${mode}`);
}

/**
 * Records a single tender against an order.
 *
 * If the tender covers the remaining balance it is delegated to
 * order.service.processPayment, which finalises the order. Otherwise it is stored
 * as a partial tender and the order stays open with a reduced balance.
 *
 * Cash overpayment is allowed (change returned); card/other methods may not exceed
 * the balance.
 *
 * @param {string} orderId
 * @param {object} paymentData  { method, amount, transaction_id?, splits?, loyalty_points_redeem? }
 * @param {string} staffId
 * @param {string} [outletId]
 * @returns {Promise<object>}
 */
async function recordTender(orderId, paymentData, staffId, outletId = null) {
  const prisma = getDbClient();
  const order = await _loadOrder(prisma, orderId, outletId);

  if (order.is_paid) throw new BadRequestError('Order is already paid');
  if (['cancelled', 'voided'].includes(order.status)) {
    throw new BadRequestError(`Cannot tender against a ${order.status} order`);
  }

  const method = paymentData.method;
  const amount = round2(Number(paymentData.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BadRequestError('Tender amount must be greater than zero');
  }

  const grandTotal = round2(Number(order.grand_total));
  const alreadyPaid = await _sumPaid(prisma, orderId);
  const balanceDue = round2(grandTotal - alreadyPaid);

  // A loyalty redemption can only be reconciled at finalisation (processPayment
  // decrements the balance), so any tender carrying points must be a closing one.
  const redeemingPoints = Number(paymentData.loyalty_points_redeem) > 0;

  // Decide change handling for overpayment.
  let change = 0;
  let closingAmount = amount;
  if (amount > balanceDue + TOLERANCE) {
    if (method === 'cash') {
      change = round2(amount - balanceDue);
      closingAmount = balanceDue; // record only what was owed; rest is change
    } else {
      throw new BadRequestError(
        `Tender ${amount} exceeds the balance due ${balanceDue}. Overpayment is only allowed for cash.`,
      );
    }
  }

  const isClosing = redeemingPoints || amount >= balanceDue - TOLERANCE;

  if (isClosing) {
    // Delegate to the single finalisation path. For a capped cash overpayment we
    // pass the balance as the amount so processPayment's reconciliation matches.
    const orderService = require('./order.service');
    const finalizeData = { ...paymentData, amount: redeemingPoints ? amount : closingAmount };
    const result = await orderService.processPayment(orderId, finalizeData, staffId, outletId);
    return {
      closed: true,
      change_due: change,
      grand_total: grandTotal,
      amount_paid: grandTotal,
      balance_due: 0,
      payment: result.payment,
    };
  }

  // ── Partial tender — record and keep the order open ──
  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        outlet_id: order.outlet_id, order_id: orderId,
        method, amount: closingAmount,
        transaction_id: paymentData.transaction_id || null,
        status: 'success', processed_by: staffId, processed_at: new Date(),
      },
    });
    if (Array.isArray(paymentData.splits) && paymentData.splits.length) {
      for (const s of paymentData.splits) {
        await tx.paymentSplit.create({
          data: { payment_id: p.id, method: s.method, amount: round2(Number(s.amount) || 0), transaction_id: s.transaction_id || null },
        });
      }
    }
    return p;
  });

  const newPaid = round2(alreadyPaid + closingAmount);
  const newBalance = round2(grandTotal - newPaid);

  const io = getIO();
  if (io) {
    io.of('/orders').to(`outlet:${order.outlet_id}`).emit('order_partial_payment', {
      order_id: orderId, amount_paid: newPaid, balance_due: newBalance,
    });
  }

  logger.info('Partial tender recorded', { orderId, method, amount: closingAmount, balance_due: newBalance });

  return {
    closed: false,
    change_due: 0,
    grand_total: grandTotal,
    amount_paid: newPaid,
    balance_due: newBalance,
    payment,
  };
}

module.exports = {
  getBillSummary,
  computeSplit,
  recordTender,
};
