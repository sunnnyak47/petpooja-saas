/**
 * accounting.posting.service.js
 *
 * Double-entry ledger posting service for the AU restaurant POS.
 *
 * Posts JournalEntry + JournalLine rows for orders, purchase orders and
 * expenses. Event builders are defensive: they never throw to the caller so
 * that POS / inventory / expense flows continue even if posting fails.
 *
 * Money is handled in integer cents internally so that debits == credits
 * exactly and we avoid float drift. Prisma Decimals arrive as strings/Decimal
 * objects, so we always wrap with Number() before use.
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const period = require('./accounting.period.service');

// ---------------------------------------------------------------------------
// Standard AU restaurant chart of accounts
// ---------------------------------------------------------------------------
const STANDARD_CHART = [
  // Assets
  { code: '090', name: 'Cash on Hand', type: 'ASSET', subtype: 'current_asset', gst: false },
  { code: '091', name: 'Bank Account', type: 'ASSET', subtype: 'current_asset', gst: false },
  { code: '610', name: 'Accounts Receivable', type: 'ASSET', subtype: 'current_asset', gst: false },
  { code: '630', name: 'Inventory', type: 'ASSET', subtype: 'current_asset', gst: false },

  // Liabilities
  { code: '800', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'current_liability', gst: false },
  { code: '820', name: 'GST Collected', type: 'LIABILITY', subtype: 'gst', gst: true },
  { code: '821', name: 'GST Paid', type: 'LIABILITY', subtype: 'gst', gst: true },

  // Equity
  { code: '960', name: 'Retained Earnings', type: 'EQUITY', subtype: 'equity', gst: false },
  { code: '970', name: 'Owner Capital', type: 'EQUITY', subtype: 'equity', gst: false },

  // Revenue
  { code: '200', name: 'Food & Beverage Sales', type: 'REVENUE', subtype: 'sales', gst: true },
  { code: '201', name: 'Other Revenue', type: 'REVENUE', subtype: 'sales', gst: true },

  // Expenses
  { code: '300', name: 'Cost of Goods Sold', type: 'EXPENSE', subtype: 'cogs', gst: true },
  { code: '400', name: 'Wages & Salaries', type: 'EXPENSE', subtype: 'operating', gst: false },
  { code: '450', name: 'Rent', type: 'EXPENSE', subtype: 'operating', gst: false },
  { code: '460', name: 'Utilities', type: 'EXPENSE', subtype: 'operating', gst: false },
  { code: '500', name: 'Marketing', type: 'EXPENSE', subtype: 'operating', gst: false },
  { code: '600', name: 'Operating Expenses', type: 'EXPENSE', subtype: 'operating', gst: true },
  { code: '700', name: 'General/Admin', type: 'EXPENSE', subtype: 'operating', gst: false },
];

// ---------------------------------------------------------------------------
// Money helpers (integer cents)
// ---------------------------------------------------------------------------
function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fromCents(cents) {
  // Return a number rounded to 2 dp for Prisma Decimal(14,2).
  return Math.round(cents) / 100;
}

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date();
  // Normalise to midnight UTC so it maps cleanly onto a @db.Date column.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------
async function seedChartOfAccounts(outletId) {
  const prisma = getDbClient();
  let seeded = 0;
  for (const acct of STANDARD_CHART) {
    await prisma.chartAccount.upsert({
      where: { outlet_id_code: { outlet_id: outletId, code: acct.code } },
      update: {
        name: acct.name,
        type: acct.type,
        subtype: acct.subtype,
        gst: acct.gst,
        is_active: true,
        is_deleted: false,
      },
      create: {
        outlet_id: outletId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        subtype: acct.subtype,
        gst: acct.gst,
      },
    });
    seeded += 1;
  }
  return { seeded };
}

async function getAccountMap(outletId) {
  const prisma = getDbClient();

  let accounts = await prisma.chartAccount.findMany({
    where: { outlet_id: outletId, is_deleted: false },
  });

  if (accounts.length === 0) {
    await seedChartOfAccounts(outletId);
    accounts = await prisma.chartAccount.findMany({
      where: { outlet_id: outletId, is_deleted: false },
    });
  }

  const map = new Map();
  for (const a of accounts) {
    map.set(a.code, a);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Core posting
// ---------------------------------------------------------------------------
async function postJournal(
  outletId,
  { entry_date, source, source_id, reference, memo, created_by, lines } = {}
) {
  const prisma = getDbClient();

  if (await period.isPeriodLocked(outletId, entry_date)) {
    throw new Error('Accounting period is locked for ' + (entry_date || ''));
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('postJournal: at least one line is required');
  }

  const accountMap = await getAccountMap(outletId);

  // Resolve codes -> account ids and build line data in cents.
  let debitCents = 0;
  let creditCents = 0;
  const lineData = lines.map((ln) => {
    const account = accountMap.get(ln.account_code);
    if (!account) {
      throw new Error(
        `postJournal: unknown account code "${ln.account_code}" for outlet ${outletId}`
      );
    }
    const dC = toCents(ln.debit || 0);
    const cC = toCents(ln.credit || 0);
    debitCents += dC;
    creditCents += cC;
    return {
      account_id: account.id,
      debit: fromCents(dC),
      credit: fromCents(cC),
      description: ln.description || null,
    };
  });

  // Validate balanced (compare in cents; allow <0.005 i.e. <1 cent tolerance).
  if (Math.abs(debitCents - creditCents) > 0) {
    // Within rounding tolerance of half a cent => treat as balanced only if 0.
    if (Math.abs(fromCents(debitCents) - fromCents(creditCents)) > 0.005) {
      throw new Error(
        `postJournal: entry not balanced — debit ${fromCents(debitCents)} != credit ${fromCents(
          creditCents
        )} (source=${source} source_id=${source_id})`
      );
    }
  }

  // Idempotency for system-generated sources.
  if (source && source !== 'manual' && source_id) {
    const existing = await prisma.journalEntry.findFirst({
      where: {
        outlet_id: outletId,
        source,
        source_id,
        is_deleted: false,
      },
      select: { id: true },
    });
    if (existing) {
      return { skipped: true, reason: 'already posted', id: existing.id };
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    return tx.journalEntry.create({
      data: {
        outlet_id: outletId,
        entry_date: toDateOnly(entry_date),
        source: source || 'manual',
        source_id: source_id || null,
        reference: reference || null,
        memo: memo || null,
        created_by: created_by || null,
        lines: { create: lineData },
      },
      select: { id: true },
    });
  });

  return { id: created.id, balanced: true, lines: lineData.length };
}

// ---------------------------------------------------------------------------
// Event builders (defensive — never throw to caller)
// ---------------------------------------------------------------------------
async function postOrderPaid(order) {
  try {
    if (!order || !order.outlet_id || !order.id) {
      return { posted: false, error: 'invalid order' };
    }

    const grandTotalCents = toCents(order.grand_total);
    const taxCents = toCents(order.total_tax);
    const salesCents = grandTotalCents - taxCents;

    const lines = [];

    // Debit cash/bank per payment method. Fall back to a single bank line for
    // the grand total if no usable payment rows exist.
    const payments = Array.isArray(order.payments) ? order.payments : [];
    let paidCents = 0;
    const byAccount = new Map(); // account_code -> cents
    for (const p of payments) {
      const amtCents = toCents(p && p.amount);
      if (amtCents === 0) continue;
      const method = String((p && p.method) || '').toLowerCase();
      const code = method === 'cash' ? '090' : '091';
      byAccount.set(code, (byAccount.get(code) || 0) + amtCents);
      paidCents += amtCents;
    }

    if (byAccount.size === 0 || paidCents !== grandTotalCents) {
      // No payment detail (or mismatch) — book the whole grand total to bank.
      byAccount.clear();
      byAccount.set('091', grandTotalCents);
    }

    for (const [code, cents] of byAccount.entries()) {
      lines.push({
        account_code: code,
        debit: fromCents(cents),
        credit: 0,
        description: code === '090' ? 'Cash received' : 'Bank/card received',
      });
    }

    lines.push({
      account_code: '200',
      debit: 0,
      credit: fromCents(salesCents),
      description: 'Food & beverage sales',
    });

    if (taxCents !== 0) {
      lines.push({
        account_code: '820',
        debit: 0,
        credit: fromCents(taxCents),
        description: 'GST collected',
      });
    }

    const result = await postJournal(order.outlet_id, {
      entry_date: order.paid_at || order.created_at,
      source: 'order',
      source_id: order.id,
      reference: order.order_number,
      memo: `Order ${order.order_number || order.id} paid`,
      created_by: order.staff_id || null,
      lines,
    });

    return { posted: !result.skipped, ...result };
  } catch (err) {
    logger.error(`postOrderPaid failed for order ${order && order.id}: ${err.message}`);
    return { posted: false, error: err.message };
  }
}

async function postPurchaseOrderReceived(po) {
  try {
    if (!po || !po.outlet_id || !po.id) {
      return { posted: false, error: 'invalid purchase order' };
    }

    const grandTotalCents = toCents(po.grand_total);
    const taxCents = toCents(po.tax_amount);
    const cogsCents = grandTotalCents - taxCents;

    const lines = [
      {
        account_code: '300',
        debit: fromCents(cogsCents),
        credit: 0,
        description: 'Cost of goods purchased',
      },
    ];

    if (taxCents !== 0) {
      lines.push({
        account_code: '821',
        debit: fromCents(taxCents),
        credit: 0,
        description: 'GST paid on purchase',
      });
    }

    lines.push({
      account_code: '800',
      debit: 0,
      credit: fromCents(grandTotalCents),
      description: 'Accounts payable',
    });

    const result = await postJournal(po.outlet_id, {
      entry_date: po.created_at,
      source: 'purchase_order',
      source_id: po.id,
      reference: po.po_number,
      memo: `Purchase order ${po.po_number || po.id} received`,
      created_by: po.created_by || null,
      lines,
    });

    return { posted: !result.skipped, ...result };
  } catch (err) {
    logger.error(
      `postPurchaseOrderReceived failed for po ${po && po.id}: ${err.message}`
    );
    return { posted: false, error: err.message };
  }
}

function expenseAccountForCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('rent')) return '450';
  if (c.includes('utilit')) return '460';
  if (c.includes('market')) return '500';
  if (c.includes('wage') || c.includes('salary') || c.includes('payroll')) return '400';
  return '700';
}

async function postExpense(expense) {
  try {
    if (!expense || !expense.outlet_id || !expense.id) {
      return { posted: false, error: 'invalid expense' };
    }

    const amountCents = toCents(expense.amount);
    const expenseCode = expenseAccountForCategory(expense.category);

    const lines = [
      {
        account_code: expenseCode,
        debit: fromCents(amountCents),
        credit: 0,
        description: expense.description || expense.category || 'Expense',
      },
      {
        account_code: '090',
        debit: 0,
        credit: fromCents(amountCents),
        description: 'Cash paid',
      },
    ];

    const result = await postJournal(expense.outlet_id, {
      entry_date: expense.expense_date || expense.created_at,
      source: 'expense',
      source_id: expense.id,
      reference: null,
      memo: expense.description || expense.title || 'Expense',
      created_by: expense.created_by || null,
      lines,
    });

    return { posted: !result.skipped, ...result };
  } catch (err) {
    logger.error(`postExpense failed for expense ${expense && expense.id}: ${err.message}`);
    return { posted: false, error: err.message };
  }
}

async function reverseOrderRefund(order, refundAmount) {
  try {
    if (!order || !order.outlet_id || !order.id) {
      return { posted: false, error: 'invalid order' };
    }

    const grandTotalCents = toCents(order.grand_total);
    const totalTaxCents = toCents(order.total_tax);

    let refundCents = refundAmount == null ? grandTotalCents : toCents(refundAmount);
    if (refundCents <= 0) {
      return { posted: false, error: 'invalid refund amount' };
    }
    if (refundCents > grandTotalCents) refundCents = grandTotalCents;

    let refundTaxCents;
    let refundNetCents;
    if (refundCents < grandTotalCents && grandTotalCents > 0) {
      refundTaxCents = Math.round((totalTaxCents * refundCents) / grandTotalCents);
      refundNetCents = refundCents - refundTaxCents;
    } else {
      refundTaxCents = totalTaxCents;
      refundNetCents = grandTotalCents - totalTaxCents;
    }

    const payments = Array.isArray(order.payments) ? order.payments : [];
    const firstMethod = String((payments[0] && payments[0].method) || '').toLowerCase();
    const cashCode = firstMethod === 'cash' ? '090' : '091';

    const lines = [
      {
        account_code: '200',
        debit: fromCents(refundNetCents),
        credit: 0,
        description: 'Reverse food & beverage sales (refund)',
      },
    ];

    if (refundTaxCents !== 0) {
      lines.push({
        account_code: '820',
        debit: fromCents(refundTaxCents),
        credit: 0,
        description: 'Reverse GST collected (refund)',
      });
    }

    lines.push({
      account_code: cashCode,
      debit: 0,
      credit: fromCents(refundCents),
      description: cashCode === '090' ? 'Cash refunded' : 'Bank/card refunded',
    });

    const result = await postJournal(order.outlet_id, {
      entry_date: order.paid_at || order.created_at,
      source: 'refund',
      source_id: order.id,
      reference: order.order_number,
      memo: 'Refund for ' + order.order_number,
      created_by: order.staff_id || null,
      lines,
    });

    return { posted: !result.skipped, ...result };
  } catch (err) {
    logger.error(`reverseOrderRefund failed for order ${order && order.id}: ${err.message}`);
    return { posted: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Backfill historical data
// ---------------------------------------------------------------------------
async function backfill(outletId) {
  const prisma = getDbClient();
  const counts = { orders: 0, purchase_orders: 0, expenses: 0 };

  // Ensure chart exists before posting anything.
  await getAccountMap(outletId);

  // --- Paid orders ---
  try {
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        is_paid: true,
        is_deleted: false,
        status: { notIn: ['cancelled', 'voided'] },
      },
      include: {
        payments: { where: { status: 'success' } },
      },
    });
    for (const order of orders) {
      try {
        const res = await postOrderPaid(order);
        if (res.posted) counts.orders += 1;
      } catch (err) {
        logger.error(`backfill order ${order.id} failed: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`backfill orders query failed for outlet ${outletId}: ${err.message}`);
  }

  // --- Received purchase orders ---
  try {
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        outlet_id: outletId,
        status: 'received',
        is_deleted: false,
      },
    });
    for (const po of pos) {
      try {
        const res = await postPurchaseOrderReceived(po);
        if (res.posted) counts.purchase_orders += 1;
      } catch (err) {
        logger.error(`backfill po ${po.id} failed: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`backfill purchase orders query failed for outlet ${outletId}: ${err.message}`);
  }

  // --- Expenses ---
  try {
    const expenses = await prisma.expense.findMany({
      where: {
        outlet_id: outletId,
        is_deleted: false,
      },
    });
    for (const expense of expenses) {
      try {
        const res = await postExpense(expense);
        if (res.posted) counts.expenses += 1;
      } catch (err) {
        logger.error(`backfill expense ${expense.id} failed: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`backfill expenses query failed for outlet ${outletId}: ${err.message}`);
  }

  return counts;
}

module.exports = {
  STANDARD_CHART,
  seedChartOfAccounts,
  getAccountMap,
  postJournal,
  postOrderPaid,
  postPurchaseOrderReceived,
  postExpense,
  reverseOrderRefund,
  backfill,
};
