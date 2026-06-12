/**
 * @fileoverview Settlement reconciliation service.
 *
 * Reconciles an EXTERNAL payment-provider settlement batch (what actually hit
 * the bank) line-by-line against recorded `Payment` rows. Every query is scoped
 * by outlet_id + is_deleted:false for strict tenant isolation.
 *
 * @module modules/settlements/settlement.service
 */

const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

/**
 * Round a numeric value to 2 decimal places, returning a Number.
 * @param {*} v - Any numeric-ish value
 * @returns {number}
 */
function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Normalise a raw line payload into a SettlementLine create object, deriving
 * net = amount - fee when net is not supplied.
 * @param {object} line
 * @returns {object}
 */
function normaliseLine(line) {
  const amount = round2(line.amount);
  const fee = round2(line.fee || 0);
  const net = line.net != null ? round2(line.net) : round2(amount - fee);
  const type = line.type || 'payment';
  return {
    transaction_id: line.transaction_id ? String(line.transaction_id).slice(0, 100) : null,
    order_ref: line.order_ref ? String(line.order_ref).slice(0, 100) : null,
    type,
    amount,
    fee,
    net,
    match_status: 'unmatched',
    variance: 0,
    raw: line.raw != null ? line.raw : null,
  };
}

/**
 * Derive header totals (gross/fees/net + line_count) from a set of lines.
 * gross_amount sums only positive 'payment' line amounts; fees sums all fees;
 * net_amount sums all line nets.
 * @param {Array<{type:string,amount:number,fee:number,net:number}>} lines
 * @returns {{gross_amount:number, fees:number, net_amount:number, line_count:number}}
 */
function deriveTotals(lines) {
  let gross = 0;
  let fees = 0;
  let net = 0;
  for (const l of lines) {
    if (l.type === 'payment') gross += Number(l.amount);
    fees += Number(l.fee);
    net += Number(l.net);
  }
  return {
    gross_amount: round2(gross),
    fees: round2(fees),
    net_amount: round2(net),
    line_count: lines.length,
  };
}

const settlementService = {
  round2,

  /**
   * List settlement headers (no lines, just counts) for an outlet.
   * @param {string} outletId
   * @param {object} [opts]
   * @returns {Promise<{rows:Array, total:number}>}
   */
  async list(outletId, { provider, status, from, to, page = 1, limit = 50 } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const where = { outlet_id: outletId, is_deleted: false };
    if (provider) where.provider = provider;
    if (status) where.status = status;
    if (from || to) {
      where.settlement_date = {};
      if (from) where.settlement_date.gte = new Date(from);
      if (to) where.settlement_date.lte = new Date(to);
    }

    const [rows, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        orderBy: { settlement_date: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.settlement.count({ where }),
    ]);

    return { rows, total };
  },

  /**
   * Fetch a single settlement with its (non-deleted) lines.
   * @param {string} id
   * @param {string} outletId
   * @returns {Promise<object>}
   */
  async getOne(id, outletId) {
    const settlement = await prisma.settlement.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
      include: {
        lines: {
          where: { is_deleted: false },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!settlement) throw new NotFoundError('Settlement not found');
    return settlement;
  },

  /**
   * Create a settlement header (optionally with nested lines).
   * @param {string} outletId
   * @param {object} data
   * @param {object} user
   * @returns {Promise<object>}
   */
  async create(outletId, data, user) {
    const rawLines = Array.isArray(data.lines) ? data.lines : [];
    const lines = rawLines.map(normaliseLine);

    const derived = deriveTotals(lines);

    const gross_amount = data.gross_amount != null ? round2(data.gross_amount) : derived.gross_amount;
    const fees = data.fees != null ? round2(data.fees) : derived.fees;
    const tax_on_fees = data.tax_on_fees != null ? round2(data.tax_on_fees) : 0;
    const net_amount = data.net_amount != null ? round2(data.net_amount) : derived.net_amount;

    const created = await prisma.settlement.create({
      data: {
        outlet_id: outletId,
        provider: data.provider,
        reference: data.reference || null,
        settlement_date: new Date(data.settlement_date),
        currency: data.currency || 'INR',
        gross_amount,
        fees,
        tax_on_fees,
        net_amount,
        status: 'open',
        matched_amount: 0,
        variance_amount: 0,
        line_count: lines.length,
        matched_count: 0,
        unmatched_count: lines.length,
        notes: data.notes || null,
        imported_by: user.id,
        ...(lines.length ? { lines: { create: lines } } : {}),
      },
      include: {
        lines: { where: { is_deleted: false }, orderBy: { created_at: 'asc' } },
      },
    });

    await prisma.auditLog
      .create({
        data: {
          user_id: user.id,
          outlet_id: outletId,
          action: 'SETTLEMENT_IMPORTED',
          entity_type: 'settlement',
          entity_id: created.id,
          new_values: {
            provider: created.provider,
            reference: created.reference,
            net_amount: Number(created.net_amount),
          },
        },
      })
      .catch(() => null);

    return created;
  },

  /**
   * Append lines to an existing OPEN settlement and recompute header totals.
   * @param {string} id
   * @param {string} outletId
   * @param {Array} rawLines
   * @param {object} user
   * @returns {Promise<object>}
   */
  async addLines(id, outletId, rawLines, user) {
    const settlement = await prisma.settlement.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
    });
    if (!settlement) throw new NotFoundError('Settlement not found');
    if (settlement.status === 'closed') {
      throw new BadRequestError('Cannot add lines to a closed settlement');
    }

    const newLines = (rawLines || []).map(normaliseLine);
    if (!newLines.length) throw new BadRequestError('No lines provided');

    await prisma.settlementLine.createMany({
      data: newLines.map((l) => ({ ...l, settlement_id: id })),
    });

    // Recompute totals from the full, surviving line set.
    const allLines = await prisma.settlementLine.findMany({
      where: { settlement_id: id, is_deleted: false },
    });
    const derived = deriveTotals(allLines);

    const updated = await prisma.settlement.update({
      where: { id },
      data: {
        gross_amount: derived.gross_amount,
        fees: derived.fees,
        net_amount: derived.net_amount,
        line_count: derived.line_count,
        unmatched_count: derived.line_count,
        matched_count: 0,
        matched_amount: 0,
        variance_amount: 0,
        status: 'open',
        reconciled_by: null,
        reconciled_at: null,
      },
      include: {
        lines: { where: { is_deleted: false }, orderBy: { created_at: 'asc' } },
      },
    });

    logger.info(`Settlement ${id} received ${newLines.length} new line(s) (user ${user.id})`);
    return updated;
  },

  /**
   * Reconcile a settlement against recorded Payment rows.
   *
   * For each line with a transaction_id we look up a Payment by the same
   * transaction_id (outlet-scoped). Refund/chargeback lines represent outflows;
   * Payment rows for refunds carry a negative amount, so we compare on absolute
   * values when the signs differ but always record variance = lineAmount -
   * paymentAmount.
   *
   * @param {string} id
   * @param {string} outletId
   * @param {object} user
   * @returns {Promise<object>} reconciled settlement with lines + summary
   */
  async reconcile(id, outletId, user) {
    const settlement = await prisma.settlement.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
      include: { lines: { where: { is_deleted: false }, orderBy: { created_at: 'asc' } } },
    });
    if (!settlement) throw new NotFoundError('Settlement not found');
    if (settlement.status === 'closed') {
      throw new BadRequestError('Cannot reconcile a closed settlement');
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    let matchedAmount = 0;
    let matchedPaymentsTotal = 0;
    let lineVarianceTotal = 0;

    const lineUpdates = [];

    for (const line of settlement.lines) {
      const lineAmount = Number(line.amount);
      const isOutflow = line.type === 'refund' || line.type === 'chargeback';

      let match = null;
      if (line.transaction_id) {
        match = await prisma.payment.findFirst({
          where: {
            outlet_id: outletId,
            is_deleted: false,
            transaction_id: line.transaction_id,
          },
        });
      }

      let update;
      if (match) {
        const paymentAmount = Number(match.amount);
        // Compare on absolute values when the provider line and the recorded
        // payment disagree on sign (refund line positive vs negative payment).
        const lineForCompare = isOutflow ? -Math.abs(lineAmount) : lineAmount;
        const diff =
          Math.sign(lineForCompare) !== Math.sign(paymentAmount) && paymentAmount !== 0
            ? Math.abs(Math.abs(lineForCompare) - Math.abs(paymentAmount))
            : Math.abs(lineForCompare - paymentAmount);

        if (diff <= 0.01) {
          update = {
            match_status: 'matched',
            matched_payment_id: match.id,
            variance: 0,
          };
          matchedCount += 1;
          matchedAmount += lineAmount;
          matchedPaymentsTotal += paymentAmount;
        } else {
          const variance = round2(lineAmount - paymentAmount);
          update = {
            match_status: 'mismatch',
            matched_payment_id: match.id,
            variance,
          };
          unmatchedCount += 1;
          lineVarianceTotal += Math.abs(variance);
          matchedPaymentsTotal += paymentAmount;
        }
      } else {
        const variance = round2(lineAmount);
        update = {
          match_status: 'unmatched',
          matched_payment_id: null,
          variance,
        };
        unmatchedCount += 1;
        lineVarianceTotal += Math.abs(variance);
      }

      lineUpdates.push({ id: line.id, data: update });
    }

    // Persist every line update plus the header in a single transaction.
    await prisma.$transaction(
      lineUpdates.map((u) =>
        prisma.settlementLine.update({ where: { id: u.id }, data: u.data })
      )
    );

    const netAmount = Number(settlement.net_amount);
    const varianceAmount =
      netAmount > 0
        ? round2(netAmount - round2(matchedPaymentsTotal))
        : round2(lineVarianceTotal);

    const status =
      unmatchedCount === 0 && Math.abs(varianceAmount) <= 0.01 ? 'matched' : 'variance';

    const updated = await prisma.settlement.update({
      where: { id },
      data: {
        matched_count: matchedCount,
        unmatched_count: unmatchedCount,
        matched_amount: round2(matchedAmount),
        variance_amount: varianceAmount,
        status,
        reconciled_by: user.id,
        reconciled_at: new Date(),
      },
      include: {
        lines: { where: { is_deleted: false }, orderBy: { created_at: 'asc' } },
      },
    });

    await prisma.auditLog
      .create({
        data: {
          user_id: user.id,
          outlet_id: outletId,
          action: 'SETTLEMENT_RECONCILED',
          entity_type: 'settlement',
          entity_id: id,
          new_values: {
            status,
            matched_count: matchedCount,
            unmatched_count: unmatchedCount,
            variance_amount: varianceAmount,
          },
        },
      })
      .catch(() => null);

    return {
      ...updated,
      summary: {
        matched_count: matchedCount,
        unmatched_count: unmatchedCount,
        matched_amount: round2(matchedAmount),
        variance_amount: varianceAmount,
      },
    };
  },

  /**
   * Close a reconciled settlement (only valid from 'matched' or 'variance').
   * @param {string} id
   * @param {string} outletId
   * @param {object} user
   * @returns {Promise<object>}
   */
  async close(id, outletId, user) {
    const settlement = await prisma.settlement.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
    });
    if (!settlement) throw new NotFoundError('Settlement not found');
    if (!['matched', 'variance'].includes(settlement.status)) {
      throw new BadRequestError('Only a reconciled settlement (matched/variance) can be closed');
    }

    const updated = await prisma.settlement.update({
      where: { id },
      data: { status: 'closed' },
      include: {
        lines: { where: { is_deleted: false }, orderBy: { created_at: 'asc' } },
      },
    });

    await prisma.auditLog
      .create({
        data: {
          user_id: user.id,
          outlet_id: outletId,
          action: 'SETTLEMENT_CLOSED',
          entity_type: 'settlement',
          entity_id: id,
          new_values: { status: 'closed' },
        },
      })
      .catch(() => null);

    return updated;
  },

  /**
   * Soft-delete a settlement and its lines (not allowed when closed).
   * @param {string} id
   * @param {string} outletId
   * @param {object} user
   * @returns {Promise<{id:string}>}
   */
  async remove(id, outletId, user) {
    const settlement = await prisma.settlement.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
    });
    if (!settlement) throw new NotFoundError('Settlement not found');
    if (settlement.status === 'closed') {
      throw new BadRequestError('Cannot delete a closed settlement');
    }

    await prisma.$transaction([
      prisma.settlementLine.updateMany({
        where: { settlement_id: id, is_deleted: false },
        data: { is_deleted: true },
      }),
      prisma.settlement.update({
        where: { id },
        data: { is_deleted: true },
      }),
    ]);

    logger.info(`Settlement ${id} soft-deleted by user ${user.id}`);
    return { id };
  },

  /**
   * Aggregate counts by status + total net for an outlet in a date range.
   * @param {string} outletId
   * @param {object} [opts]
   * @returns {Promise<object>}
   */
  async stats(outletId, { from, to } = {}) {
    const where = { outlet_id: outletId, is_deleted: false };
    if (from || to) {
      where.settlement_date = {};
      if (from) where.settlement_date.gte = new Date(from);
      if (to) where.settlement_date.lte = new Date(to);
    }

    const [grouped, agg] = await Promise.all([
      prisma.settlement.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      prisma.settlement.aggregate({
        where,
        _sum: { net_amount: true, variance_amount: true },
        _count: { _all: true },
      }),
    ]);

    const byStatus = { open: 0, matched: 0, variance: 0, closed: 0 };
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
    }

    return {
      total: agg._count._all,
      by_status: byStatus,
      total_net: round2(agg._sum.net_amount || 0),
      total_variance: round2(agg._sum.variance_amount || 0),
    };
  },
};

module.exports = settlementService;
