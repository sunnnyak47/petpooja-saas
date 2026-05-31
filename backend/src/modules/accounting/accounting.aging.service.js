/**
 * accounting.aging.service.js
 *
 * Receivables / payables aging reports and supplier bill payments for the
 * AU restaurant POS.
 *
 * - Receivables = unpaid customer orders, aged by order date.
 * - Payables    = received purchase orders, aged by PO date, net of any
 *                 payments already posted to Accounts Payable (account 800).
 *
 * Prisma Decimals arrive as Decimal objects / strings, so every monetary
 * value is wrapped with Number() and rounded to 2dp before use.
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const posting = require('./accounting.posting.service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function daysBetween(date, asOf) {
  const ms = asOf.getTime() - new Date(date).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function bucketFor(days) {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function emptyBuckets() {
  return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
}

/**
 * Sum debits posted to Accounts Payable (code 800) for a given PO via
 * journal entries with source='bill_payment' and source_id=poId.
 * Returns total paid (number, 2dp).
 */
async function paidAgainstPo(prisma, outletId, poId) {
  const apAccount = await prisma.chartAccount.findFirst({
    where: { outlet_id: outletId, code: '800', is_deleted: false },
    select: { id: true },
  });
  if (!apAccount) return 0;

  const entries = await prisma.journalEntry.findMany({
    where: {
      outlet_id: outletId,
      source: 'bill_payment',
      source_id: poId,
      is_deleted: false,
    },
    select: {
      lines: {
        where: { account_id: apAccount.id },
        select: { debit: true },
      },
    },
  });

  let paid = 0;
  for (const e of entries) {
    for (const ln of e.lines) {
      paid += Number(ln.debit) || 0;
    }
  }
  return round2(paid);
}

/**
 * Sum of real partial payments recorded in the billPayment table for a PO.
 * Returns total paid (number, 2dp).
 */
async function paidViaBillPayments(prisma, outletId, poId) {
  const rows = await prisma.billPayment.findMany({
    where: { outlet_id: outletId, purchase_order_id: poId, is_deleted: false },
    select: { amount: true },
  });
  let paid = 0;
  for (const r of rows) {
    paid += Number(r.amount) || 0;
  }
  return round2(paid);
}

// ---------------------------------------------------------------------------
// 1) Receivables aging — money customers owe us
// ---------------------------------------------------------------------------
async function getReceivablesAging(outletId, asOf) {
  const prisma = getDbClient();
  const ref = asOf ? new Date(asOf) : new Date();

  const orders = await prisma.order.findMany({
    where: {
      outlet_id: outletId,
      is_paid: false,
      is_deleted: false,
      status: { notIn: ['cancelled', 'voided'] },
      created_at: { lte: ref },
    },
    select: {
      order_number: true,
      customer_name: true,
      grand_total: true,
      created_at: true,
    },
    orderBy: { created_at: 'asc' },
  });

  const buckets = emptyBuckets();
  let total = 0;
  const items = [];

  for (const o of orders) {
    const amount = round2(o.grand_total);
    if (amount <= 0) continue;
    const days = daysBetween(o.created_at, ref);
    buckets[bucketFor(days)] = round2(buckets[bucketFor(days)] + amount);
    total = round2(total + amount);
    if (items.length < 100) {
      items.push({
        ref: o.order_number,
        customer: o.customer_name,
        date: o.created_at,
        amount,
        days,
      });
    }
  }

  return { as_of: ref, buckets, total, items };
}

// ---------------------------------------------------------------------------
// 2) Payables aging — money we owe suppliers
// ---------------------------------------------------------------------------
async function getPayablesAging(outletId, asOf) {
  const prisma = getDbClient();
  const ref = asOf ? new Date(asOf) : new Date();

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      outlet_id: outletId,
      status: 'received',
      is_deleted: false,
      created_at: { lte: ref },
    },
    select: {
      id: true,
      po_number: true,
      grand_total: true,
      created_at: true,
      supplier: { select: { name: true } },
    },
    orderBy: { created_at: 'asc' },
  });

  const buckets = emptyBuckets();
  let total = 0;
  const items = [];

  for (const po of pos) {
    const gross = round2(po.grand_total);
    const paid = await paidViaBillPayments(prisma, outletId, po.id);
    const outstanding = round2(gross - paid);
    if (outstanding <= 0.01) continue; // skip fully paid bills

    const days = daysBetween(po.created_at, ref);
    buckets[bucketFor(days)] = round2(buckets[bucketFor(days)] + outstanding);
    total = round2(total + outstanding);
    if (items.length < 100) {
      items.push({
        id: po.id,
        ref: po.po_number,
        supplier: (po.supplier && po.supplier.name) || '—',
        date: po.created_at,
        amount: outstanding,
        days,
      });
    }
  }

  return { as_of: ref, buckets, total, items };
}

// ---------------------------------------------------------------------------
// 3) Pay a supplier bill
// ---------------------------------------------------------------------------
async function payBill(outletId, { po_id, amount, method, date, created_by } = {}) {
  const prisma = getDbClient();

  if (!po_id) throw new Error('payBill: po_id is required');

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: po_id, outlet_id: outletId, is_deleted: false },
    select: { id: true, po_number: true, grand_total: true },
  });
  if (!po) throw new Error('Purchase order not found');

  // Net of real partial payments already recorded.
  const alreadyPaid = await paidViaBillPayments(prisma, outletId, po.id);
  const outstanding = round2(Number(po.grand_total) - alreadyPaid);

  // Determine pay amount: explicit amount, else the full outstanding balance.
  const payAmount =
    amount !== undefined && amount !== null ? round2(amount) : outstanding;
  if (payAmount <= 0) throw new Error('payBill: nothing outstanding to pay');
  if (payAmount > outstanding + 0.01) {
    throw new Error('Payment exceeds outstanding balance');
  }

  const payMethod = method || 'bank';
  const account = payMethod === 'cash' ? '090' : '091';

  // Record the real payment row first. Its unique id is used as the journal
  // source_id so every partial payment posts its own journal (no idempotency
  // clash on (source, source_id)).
  const payment = await prisma.billPayment.create({
    data: {
      outlet_id: outletId,
      purchase_order_id: po.id,
      amount: payAmount,
      method: payMethod,
      created_by,
    },
    select: { id: true },
  });

  const journalResult = await posting.postJournal(outletId, {
    entry_date: date || new Date(),
    source: 'bill_payment',
    source_id: payment.id,
    reference: po.po_number,
    memo: `Payment for ${po.po_number}`,
    created_by,
    lines: [
      { account_code: '800', debit: payAmount, credit: 0, description: 'Accounts Payable settled' },
      { account_code: account, debit: 0, credit: payAmount, description: 'Bill payment' },
    ],
  });

  if (journalResult && journalResult.id) {
    await prisma.billPayment.update({
      where: { id: payment.id },
      data: { journal_entry_id: journalResult.id },
    });
  }

  logger.info(
    `payBill: posted payment ${payAmount} for PO ${po.po_number} (outlet ${outletId}, method ${payMethod})`
  );

  return {
    success: true,
    po_number: po.po_number,
    amount: payAmount,
    outstanding_after: round2(outstanding - payAmount),
    bill_payment_id: payment.id,
  };
}

// ---------------------------------------------------------------------------
// 4) List recorded payments for a PO
// ---------------------------------------------------------------------------
async function listBillPayments(outletId, poId) {
  const prisma = getDbClient();
  return prisma.billPayment.findMany({
    where: { outlet_id: outletId, purchase_order_id: poId, is_deleted: false },
    select: { id: true, amount: true, method: true, paid_at: true },
    orderBy: { paid_at: 'desc' },
  });
}

module.exports = { getReceivablesAging, getPayablesAging, payBill, listBillPayments };
