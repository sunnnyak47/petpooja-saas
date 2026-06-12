/**
 * @fileoverview Credit Note service — the GST document layer that records a
 * refund / return / adjustment. Region-aware (India intra-state CGST+SGST split
 * vs Australia GST-in-tax-amount). Void & refund themselves live in the orders
 * module; this module ONLY issues the tax document.
 * @module modules/financial-docs/creditnote.service
 */

const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

/** Round a number to 2 decimal places, guarding against FP drift. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve the outlet's region + currency by reading its HeadOffice.
 * Falls back to India defaults for legacy outlets without a head office.
 * @param {string} outletId
 * @returns {Promise<{ region: 'IN'|'AU', currency: string, state: string }>}
 */
async function resolveOutletContext(outletId) {
  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, is_deleted: false },
    select: {
      state: true,
      currency: true,
      head_office: { select: { region: true, country_code: true, currency: true } },
    },
  });
  if (!outlet) throw new NotFoundError('Outlet not found');

  const ho = outlet.head_office;
  const region = (ho?.region || ho?.country_code) === 'AU' ? 'AU' : 'IN';
  const currency = outlet.currency || ho?.currency || (region === 'AU' ? 'AUD' : 'INR');
  return { region, currency, state: outlet.state || '' };
}

/**
 * Compute monetary fields from explicit line items.
 * India (exclusive): line_total is the taxable base; tax = base * rate/100;
 *                     total = base + tax.
 * Australia (inclusive): line_total already includes GST; tax is extracted out;
 *                        total = sum(line_total).
 * @param {Array} lines
 * @param {'IN'|'AU'} region
 * @returns {{ computedLines: Array, subtotal: number, tax_amount: number, total_amount: number }}
 */
function computeFromLines(lines, region) {
  const inclusive = region === 'AU';
  let subtotal = 0;
  let taxTotal = 0;
  let grossTotal = 0;

  const computedLines = lines.map((l) => {
    const quantity = round2(l.quantity != null ? l.quantity : 1);
    const unitPrice = round2(l.unit_price);
    const rate = Number(l.gst_rate || 0);
    const lineTotal = round2(quantity * unitPrice);

    let lineTax;
    let taxableBase;
    if (inclusive) {
      // GST is baked into lineTotal — extract it out.
      lineTax = round2(lineTotal - lineTotal / (1 + rate / 100));
      taxableBase = round2(lineTotal - lineTax);
    } else {
      taxableBase = lineTotal;
      lineTax = round2(lineTotal * (rate / 100));
    }

    subtotal += taxableBase;
    taxTotal += lineTax;
    grossTotal += inclusive ? lineTotal : round2(taxableBase + lineTax);

    return {
      description: String(l.description).slice(0, 200),
      quantity,
      unit_price: unitPrice,
      gst_rate: round2(rate),
      tax_amount: lineTax,
      line_total: round2(taxableBase + lineTax), // gross per line (base+tax)
    };
  });

  return {
    computedLines,
    subtotal: round2(subtotal),
    tax_amount: round2(taxTotal),
    total_amount: round2(grossTotal),
  };
}

/**
 * Split a total tax figure into the region-appropriate components.
 * India intra-state default: CGST = SGST = tax/2, IGST = 0.
 * Australia: GST sits entirely inside tax_amount; component columns are 0.
 * @param {number} taxAmount
 * @param {'IN'|'AU'} region
 */
function splitTax(taxAmount, region) {
  if (region === 'AU') return { cgst: 0, sgst: 0, igst: 0 };
  const half = round2(taxAmount / 2);
  // Ensure the two halves sum back exactly to the total (avoid 1-paisa drift).
  return { cgst: half, sgst: round2(taxAmount - half), igst: 0 };
}

const creditNoteService = {
  /**
   * Generate the next sequential credit-note number for an outlet within the
   * current calendar month: `CN-{YYYYMM}-{seq4}`.
   * @param {string} outletId
   * @returns {Promise<string>}
   */
  async generateNumber(outletId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const nextMonthStart = new Date(year, month + 1, 1, 0, 0, 0, 0);
    const ym = `${year}${String(month + 1).padStart(2, '0')}`;

    const count = await prisma.creditNote.count({
      where: {
        outlet_id: outletId,
        created_at: { gte: monthStart, lt: nextMonthStart },
      },
    });

    const seq = count + 1;
    return `CN-${ym}-${String(seq).padStart(4, '0')}`;
  },

  /**
   * Create (issue) a credit note. Wraps the note + its lines in a transaction.
   * @param {string} outletId
   * @param {object} data - Validated request body.
   * @param {object} user - Authenticated user (req.user).
   * @returns {Promise<object>} The created credit note with lines.
   */
  async create(outletId, data, user) {
    if (!outletId) throw new BadRequestError('outlet_id is required');

    const { region, currency: outletCurrency } = await resolveOutletContext(outletId);

    // Optional order linkage — validate ownership & capture its grand_total.
    let order = null;
    if (data.order_id) {
      order = await prisma.order.findFirst({
        where: { id: data.order_id, outlet_id: outletId, is_deleted: false },
        select: { id: true, grand_total: true, currency: true, customer_name: true, customer_phone: true },
      });
      if (!order) throw new NotFoundError('Linked order not found for this outlet');
    }

    const currency = data.currency || order?.currency || outletCurrency;

    // ── Derive monetary fields ────────────────────────────────────────────────
    let subtotal;
    let taxAmount;
    let totalAmount;
    let lineRows = [];

    if (Array.isArray(data.lines) && data.lines.length > 0) {
      const computed = computeFromLines(data.lines, region);
      subtotal = computed.subtotal;
      taxAmount = computed.tax_amount;
      totalAmount = computed.total_amount;
      lineRows = computed.computedLines;
    } else {
      // Explicit amounts path (no line items supplied).
      totalAmount = round2(data.total_amount);
      taxAmount = round2(data.tax_amount != null ? data.tax_amount : 0);
      subtotal = data.subtotal != null ? round2(data.subtotal) : round2(totalAmount - taxAmount);
    }

    // ── Guards ────────────────────────────────────────────────────────────────
    if (!(totalAmount > 0)) {
      throw new BadRequestError('Credit note total_amount must be greater than zero');
    }
    if (order && totalAmount > round2(Number(order.grand_total)) + 0.01) {
      throw new BadRequestError(
        `Credit note total (${totalAmount}) cannot exceed the linked order total (${round2(Number(order.grand_total))})`
      );
    }

    const { cgst, sgst, igst } = splitTax(taxAmount, region);

    // ── Persist (with one retry on unique-number collision) ───────────────────
    const baseData = {
      outlet_id: outletId,
      order_id: order?.id || null,
      status: 'issued',
      reason: data.reason || null,
      customer_name: data.customer_name || order?.customer_name || null,
      customer_phone: data.customer_phone || order?.customer_phone || null,
      subtotal,
      cgst,
      sgst,
      igst,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency,
      linked_payment_id: data.linked_payment_id || null,
      notes: data.notes || null,
      issued_by: user?.id || null,
      issued_at: new Date(),
    };

    let created;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const credit_note_no = await this.generateNumber(outletId);
      try {
        created = await prisma.$transaction(async (tx) => {
          return tx.creditNote.create({
            data: {
              ...baseData,
              credit_note_no,
              ...(lineRows.length > 0 ? { lines: { create: lineRows } } : {}),
            },
            include: { lines: { where: { is_deleted: false } } },
          });
        });
        break;
      } catch (err) {
        // P2002 = unique constraint violation on [outlet_id, credit_note_no].
        if (err.code === 'P2002' && attempt === 0) {
          logger.warn('Credit note number collision, retrying', { outletId, credit_note_no });
          continue;
        }
        throw err;
      }
    }

    // Best-effort audit row (never blocks issuance).
    prisma.auditLog
      .create({
        data: {
          user_id: user?.id || null,
          outlet_id: outletId,
          action: 'CREDIT_NOTE_ISSUED',
          entity_type: 'credit_note',
          entity_id: created.id,
          new_values: {
            credit_note_no: created.credit_note_no,
            total_amount: created.total_amount,
            order_id: created.order_id,
          },
        },
      })
      .catch(() => null);

    logger.info('Credit note issued', {
      outletId,
      credit_note_no: created.credit_note_no,
      total_amount: created.total_amount,
    });

    return created;
  },

  /**
   * List credit notes for an outlet with optional filters + pagination.
   * @param {string} outletId
   * @param {object} opts
   * @returns {Promise<{ rows: Array, total: number }>}
   */
  async list(outletId, { status, q, from, to, page = 1, limit = 50 } = {}) {
    if (!outletId) throw new BadRequestError('outlet_id is required');

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * take;

    const where = { outlet_id: outletId, is_deleted: false };
    if (status) where.status = status;

    if (from || to) {
      where.issued_at = {};
      if (from) where.issued_at.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.issued_at.lte = end;
      }
    }

    if (q) {
      where.OR = [
        { credit_note_no: { contains: q, mode: 'insensitive' } },
        { customer_name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        orderBy: { issued_at: 'desc' },
        skip,
        take,
        include: { lines: { where: { is_deleted: false } } },
      }),
      prisma.creditNote.count({ where }),
    ]);

    return { rows, total };
  },

  /**
   * Fetch a single credit note scoped to the outlet.
   * @param {string} id
   * @param {string} outletId
   * @returns {Promise<object>}
   */
  async getOne(id, outletId) {
    if (!outletId) throw new BadRequestError('outlet_id is required');
    const note = await prisma.creditNote.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
      include: { lines: { where: { is_deleted: false } } },
    });
    if (!note) throw new NotFoundError('Credit note not found');
    return note;
  },

  /**
   * Cancel an issued credit note. Only 'issued' notes can be cancelled.
   * @param {string} id
   * @param {string} outletId
   * @param {object} user
   * @param {string} reason
   * @returns {Promise<object>}
   */
  async cancel(id, outletId, user, reason) {
    if (!outletId) throw new BadRequestError('outlet_id is required');

    const note = await prisma.creditNote.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
      select: { id: true, status: true, reason: true, credit_note_no: true },
    });
    if (!note) throw new NotFoundError('Credit note not found');
    if (note.status !== 'issued') {
      throw new BadRequestError(`Only issued credit notes can be cancelled (current status: ${note.status})`);
    }

    const appendedReason = note.reason
      ? `${note.reason} | Cancelled: ${reason}`
      : `Cancelled: ${reason}`;

    const updated = await prisma.creditNote.update({
      where: { id: note.id },
      data: {
        status: 'cancelled',
        cancelled_by: user?.id || null,
        cancelled_at: new Date(),
        reason: appendedReason,
      },
      include: { lines: { where: { is_deleted: false } } },
    });

    prisma.auditLog
      .create({
        data: {
          user_id: user?.id || null,
          outlet_id: outletId,
          action: 'CREDIT_NOTE_CANCELLED',
          entity_type: 'credit_note',
          entity_id: updated.id,
          new_values: { credit_note_no: updated.credit_note_no, reason },
        },
      })
      .catch(() => null);

    logger.info('Credit note cancelled', { outletId, credit_note_no: updated.credit_note_no });
    return updated;
  },

  /**
   * Aggregate count + summed total of issued notes within an optional range.
   * @param {string} outletId
   * @param {object} opts
   * @returns {Promise<{ count: number, total_amount: number, currency: string }>}
   */
  async stats(outletId, { from, to } = {}) {
    if (!outletId) throw new BadRequestError('outlet_id is required');

    const where = { outlet_id: outletId, is_deleted: false, status: 'issued' };
    if (from || to) {
      where.issued_at = {};
      if (from) where.issued_at.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.issued_at.lte = end;
      }
    }

    const agg = await prisma.creditNote.aggregate({
      where,
      _count: { _all: true },
      _sum: { total_amount: true, tax_amount: true },
    });

    const { currency } = await resolveOutletContext(outletId).catch(() => ({ currency: 'INR' }));

    return {
      count: agg._count._all || 0,
      total_amount: round2(Number(agg._sum.total_amount || 0)),
      tax_amount: round2(Number(agg._sum.tax_amount || 0)),
      currency,
    };
  },
};

module.exports = creditNoteService;
