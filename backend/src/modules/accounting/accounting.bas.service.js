/**
 * @fileoverview Australian BAS / GST and cash-flow reporting derived from the
 * double-entry ledger. All figures are computed by aggregating journal lines
 * over a date range; nothing is persisted.
 *
 * Sign conventions (normal balances):
 *  - ASSET, EXPENSE            => debit-positive  (balance = debit - credit)
 *  - LIABILITY, EQUITY, REVENUE => credit-positive (balance = credit - debit)
 *
 * @module modules/accounting/accounting.bas.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/** Round a number to 2 decimal places. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Normalise a 'YYYY-MM-DD' string (or undefined) into a UTC Date range.
 * @param {string|undefined} from Inclusive start date string.
 * @param {string|undefined} to Inclusive end date string.
 * @returns {{ startDate: Date, endDate: Date }}
 */
function normaliseRange(from, to) {
  const startDate = from ? new Date(`${from}T00:00:00Z`) : new Date(0);
  const endDate = to ? new Date(`${to}T23:59:59Z`) : new Date();
  return { startDate, endDate };
}

/** Build a human-readable period label for a range. */
function periodLabel(from, to) {
  return `${from || 'beginning'} to ${to || 'now'}`;
}

/**
 * Fetch ledger lines (with their account) for an outlet within a date range.
 * @param {number} outletId Outlet id.
 * @param {Date} startDate Inclusive start.
 * @param {Date} endDate Inclusive end.
 * @returns {Promise<Array>}
 */
function fetchLines(prisma, outletId, startDate, endDate) {
  return prisma.journalLine.findMany({
    where: {
      entry: {
        outlet_id: outletId,
        is_deleted: false,
        entry_date: { gte: startDate, lte: endDate },
      },
    },
    include: { account: true },
  });
}

/**
 * Compute an Australian BAS / GST summary from the ledger over [from, to].
 *
 * @param {number} outletId Outlet id.
 * @param {string} [from] Inclusive start date 'YYYY-MM-DD'.
 * @param {string} [to] Inclusive end date 'YYYY-MM-DD'.
 * @returns {Promise<object>} BAS summary figures.
 */
async function getBASReport(outletId, from, to) {
  const prisma = getDbClient();
  const { startDate, endDate } = normaliseRange(from, to);

  const lines = await fetchLines(prisma, outletId, startDate, endDate);
  logger.debug(
    `[BAS] outlet=${outletId} lines=${lines.length} range=${periodLabel(from, to)}`
  );

  // Net amounts keyed by what we need.
  let gst820Credit = 0; // GST Collected (820): net credit
  let gst821Debit = 0; // GST Paid (821): net debit
  let revenueNetCredit = 0; // REVENUE accounts: net credit (ex-GST)
  let expenseNetDebit = 0; // EXPENSE accounts (incl. COGS): net debit (ex-GST)

  for (const line of lines) {
    const account = line.account;
    if (!account) continue;
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;

    if (account.code === '820') {
      gst820Credit += credit - debit;
    } else if (account.code === '821') {
      gst821Debit += debit - credit;
    } else if (account.type === 'REVENUE') {
      revenueNetCredit += credit - debit;
    } else if (account.type === 'EXPENSE') {
      expenseNetDebit += debit - credit;
    }
  }

  const gstOnSales1A = round2(gst820Credit);
  const gstOnPurchases1B = round2(gst821Debit);
  // G1/G11 are GST-inclusive totals.
  const g1TotalSales = round2(revenueNetCredit + gstOnSales1A);
  const g11Purchases = round2(expenseNetDebit + gstOnPurchases1B);
  const netGst = round2(gstOnSales1A - gstOnPurchases1B);

  return {
    from,
    to,
    G1_total_sales: g1TotalSales,
    G11_purchases: g11Purchases,
    gst_on_sales_1A: gstOnSales1A,
    gst_on_purchases_1B: gstOnPurchases1B,
    net_gst: netGst,
    payable: netGst >= 0,
    period_label: periodLabel(from, to),
  };
}

/** Map a journal entry source to a cash-flow classification label. */
function sourceLabel(source) {
  switch (source) {
    case 'order':
      return 'Sales receipts';
    case 'purchase_order':
      return 'Supplier payments';
    case 'expense':
      return 'Operating expenses';
    default:
      return 'Other';
  }
}

/**
 * Compute cash movement from Cash (090) and Bank (091) accounts over a range.
 * For each journal entry that touches 090/091 the net cash delta is bucketed
 * by the entry's source (inflow when delta > 0, outflow when delta < 0).
 *
 * @param {number} outletId Outlet id.
 * @param {string} [from] Inclusive start date 'YYYY-MM-DD'.
 * @param {string} [to] Inclusive end date 'YYYY-MM-DD'.
 * @returns {Promise<object>} Cash-flow summary.
 */
async function getCashFlow(outletId, from, to) {
  const prisma = getDbClient();
  const { startDate, endDate } = normaliseRange(from, to);

  const entries = await prisma.journalEntry.findMany({
    where: {
      outlet_id: outletId,
      is_deleted: false,
      entry_date: { gte: startDate, lte: endDate },
    },
    include: { lines: { include: { account: true } } },
  });

  const CASH_CODES = new Set(['090', '091']);
  const inflowBuckets = new Map(); // label -> amount
  const outflowBuckets = new Map(); // label -> amount

  for (const entry of entries) {
    // Net cash delta: assets increase on debit.
    let cashDelta = 0;
    let touchesCash = false;
    for (const line of entry.lines || []) {
      const code = line.account ? line.account.code : null;
      if (code && CASH_CODES.has(code)) {
        touchesCash = true;
        cashDelta += (Number(line.debit) || 0) - (Number(line.credit) || 0);
      }
    }
    if (!touchesCash || cashDelta === 0) continue;

    const label = sourceLabel(entry.source);
    if (cashDelta > 0) {
      inflowBuckets.set(label, (inflowBuckets.get(label) || 0) + cashDelta);
    } else {
      outflowBuckets.set(
        label,
        (outflowBuckets.get(label) || 0) + Math.abs(cashDelta)
      );
    }
  }

  const inflows = Array.from(inflowBuckets, ([label, amount]) => ({
    label,
    amount: round2(amount),
  }));
  const outflows = Array.from(outflowBuckets, ([label, amount]) => ({
    label,
    amount: round2(amount),
  }));

  const totalIn = round2(inflows.reduce((s, i) => s + i.amount, 0));
  const totalOut = round2(outflows.reduce((s, o) => s + o.amount, 0));

  return {
    from,
    to,
    opening_note: 'computed from ledger',
    inflows,
    outflows,
    total_in: totalIn,
    total_out: totalOut,
    net_change: round2(totalIn - totalOut),
  };
}

module.exports = { getBASReport, getCashFlow };
