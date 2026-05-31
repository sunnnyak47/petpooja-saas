/**
 * accounting.invoice.service.js
 *
 * Customer (sales) invoice service for the AU restaurant POS.
 *
 * Handles the invoice lifecycle: draft -> sent (issued) -> paid, plus void.
 * Issuing posts an Accounts Receivable journal; marking paid posts a receipt
 * journal that clears the receivable. All money is GST-exclusive on entry:
 * gst = subtotal * 10%, total = subtotal + gst.
 *
 * Prisma Decimals arrive as strings/Decimal objects, so we always wrap with
 * Number() and round to 2dp before use.
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const posting = require('./accounting.posting.service');

const GST_RATE = 0.1;

// Chart of accounts codes used here.
const ACC_AR = '610'; // Accounts Receivable
const ACC_SALES = '200'; // Food & Beverage Sales
const ACC_GST = '820'; // GST Collected
const ACC_CASH = '090'; // Cash on Hand
const ACC_BANK = '091'; // Bank Account

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------
function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function padNumber(n) {
  return String(n).padStart(5, '0');
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------
async function listInvoices(outletId, { status, limit = 100 } = {}) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId, is_deleted: false };
  if (status) where.status = status;

  return prisma.customerInvoice.findMany({
    where,
    orderBy: { issue_date: 'desc' },
    take: Number(limit) || 100,
    include: { lines: true },
  });
}

async function getInvoice(outletId, id) {
  const prisma = getDbClient();
  const invoice = await prisma.customerInvoice.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
    include: { lines: true },
  });
  if (!invoice) throw new Error('Invoice not found');
  return invoice;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
async function createInvoice(
  outletId,
  { customer_name, customer_id, issue_date, due_date, notes, lines } = {}
) {
  const prisma = getDbClient();

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Invoice must have at least one line');
  }

  // Compute line amounts and subtotal.
  let subtotal = 0;
  const lineData = lines.map((ln) => {
    const quantity = round2(ln.quantity);
    const unit_price = round2(ln.unit_price);
    const amount = round2(quantity * unit_price);
    subtotal = round2(subtotal + amount);
    return {
      description: ln.description || null,
      quantity,
      unit_price,
      amount,
    };
  });

  const gst = round2(subtotal * GST_RATE);
  const total = round2(subtotal + gst);

  // Generate per-outlet invoice number.
  let invoice_number;
  try {
    const count = await prisma.customerInvoice.count({
      where: { outlet_id: outletId },
    });
    invoice_number = 'INV-' + padNumber(count + 1);
  } catch (err) {
    logger.warn(
      `createInvoice: failed to count invoices for outlet ${outletId}: ${err.message}`
    );
    invoice_number = 'INV-' + Date.now().toString(36);
  }

  const issueDate = issue_date ? new Date(issue_date) : new Date();
  const dueDate = due_date ? new Date(due_date) : null;

  return prisma.customerInvoice.create({
    data: {
      outlet_id: outletId,
      invoice_number,
      customer_id: customer_id || null,
      customer_name: customer_name || null,
      issue_date: issueDate,
      due_date: dueDate,
      status: 'draft',
      subtotal,
      gst,
      total,
      notes: notes || null,
      lines: { create: lineData },
    },
    include: { lines: true },
  });
}

// ---------------------------------------------------------------------------
// Issue (draft -> sent): post AR journal
// ---------------------------------------------------------------------------
async function issueInvoice(outletId, id) {
  const prisma = getDbClient();

  const invoice = await prisma.customerInvoice.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'draft') {
    throw new Error('Only draft invoices can be issued');
  }

  const total = round2(invoice.total);
  const subtotal = round2(invoice.subtotal);
  const gst = round2(invoice.gst);

  const journal = await posting.postJournal(outletId, {
    entry_date: invoice.issue_date,
    source: 'customer_invoice',
    source_id: id,
    reference: invoice.invoice_number,
    memo: `Customer invoice ${invoice.invoice_number}`,
    lines: [
      { account_code: ACC_AR, debit: total, credit: 0, description: 'Accounts Receivable' },
      { account_code: ACC_SALES, debit: 0, credit: subtotal, description: 'Sales' },
      { account_code: ACC_GST, debit: 0, credit: gst, description: 'GST Collected' },
    ],
  });

  return prisma.customerInvoice.update({
    where: { id },
    data: {
      status: 'sent',
      journal_entry_id: journal && journal.id ? journal.id : invoice.journal_entry_id,
    },
    include: { lines: true },
  });
}

// ---------------------------------------------------------------------------
// Mark paid: post receipt journal clearing AR
// ---------------------------------------------------------------------------
async function markPaid(outletId, id, { method } = {}) {
  const prisma = getDbClient();

  const invoice = await prisma.customerInvoice.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'paid') {
    throw new Error('Invoice is already paid');
  }
  if (invoice.status === 'void') {
    throw new Error('Cannot mark a void invoice as paid');
  }

  const total = round2(invoice.total);
  const cashAccount = method === 'cash' ? ACC_CASH : ACC_BANK;

  await posting.postJournal(outletId, {
    entry_date: new Date(),
    source: 'invoice_payment',
    source_id: id,
    reference: invoice.invoice_number,
    memo: `Payment for invoice ${invoice.invoice_number}`,
    lines: [
      { account_code: cashAccount, debit: total, credit: 0, description: 'Receipt' },
      { account_code: ACC_AR, debit: 0, credit: total, description: 'Accounts Receivable' },
    ],
  });

  return prisma.customerInvoice.update({
    where: { id },
    data: { status: 'paid' },
    include: { lines: true },
  });
}

// ---------------------------------------------------------------------------
// Void (do not delete)
// ---------------------------------------------------------------------------
async function voidInvoice(outletId, id) {
  const prisma = getDbClient();

  const invoice = await prisma.customerInvoice.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'void') {
    throw new Error('Invoice is already void');
  }

  return prisma.customerInvoice.update({
    where: { id },
    data: { status: 'void' },
    include: { lines: true },
  });
}

module.exports = {
  listInvoices,
  getInvoice,
  createInvoice,
  issueInvoice,
  markPaid,
  voidInvoice,
};
