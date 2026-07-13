/**
 * @fileoverview Accounting controller — HTTP handlers for chart of accounts,
 * ledger, financial statements, and posting (seed/backfill).
 * @module modules/accounting/accounting.controller
 */

const posting = require('./accounting.posting.service');
const statements = require('./accounting.statements.service');
const bas = require('./accounting.bas.service');
const aging = require('./accounting.aging.service');
const chart = require('./accounting.chart.service');
const period = require('./accounting.period.service');
const bank = require('./accounting.bank.service');
const statement = require('./accounting.statement.service');
const parser = require('./accounting.statement.parser');
const recon = require('./accounting.reconciliation.service');
const bankreport = require('./accounting.bankreport.service');
const baslodge = require('./accounting.baslodgement.service');
const budget = require('./accounting.budget.service');
const invoice = require('./accounting.invoice.service');
const owner = require('./accounting.owner.service');
const copilot = require('./accounting.copilot.service');
const xport = require('./accounting.export.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');
const { getDbClient } = require('../../config/database');
const prisma = getDbClient();

/* ── Chart of Accounts ──────────────────────────── */

async function listChart(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const accounts = await prisma.chartAccount.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      orderBy: { code: 'asc' },
    });
    sendSuccess(res, accounts, 'Chart of accounts retrieved');
  } catch (error) { next(error); }
}

/* ── Ledger ─────────────────────────────────────── */

async function ledger(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const entries = await statements.getLedger(outletId, {
      from: req.query.from,
      to: req.query.to,
      account_code: req.query.account_code,
      limit: Number(req.query.limit) || 200,
    });
    sendSuccess(res, entries, 'Ledger retrieved');
  } catch (error) { next(error); }
}

/* ── Financial Statements ───────────────────────── */

async function trialBalance(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await statements.getTrialBalance(outletId, req.query.as_of);
    sendSuccess(res, result, 'Trial balance retrieved');
  } catch (error) { next(error); }
}

async function profitAndLoss(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await statements.getProfitAndLoss(outletId, req.query.from, req.query.to);
    sendSuccess(res, result, 'Profit and loss retrieved');
  } catch (error) { next(error); }
}

/* ── Owner Mode (plain-language dashboard) ──────────── */

async function ownerDashboard(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await owner.getOwnerDashboard(outletId);
    sendSuccess(res, result, 'Owner dashboard retrieved');
  } catch (error) { next(error); }
}

/* ── "Ask your books" AI copilot ────────────────────── */

async function askBooks(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.body.outlet_id || req.user.outlet_id;
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (!question) return sendError(res, 400, 'Please type a question');
    if (question.length > 500) return sendError(res, 400, 'That question is too long (max 500 characters)');
    const result = await copilot.askBooks(outletId, question);
    sendSuccess(res, result, 'Answer generated');
  } catch (error) { next(error); }
}

async function balanceSheet(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await statements.getBalanceSheet(outletId, req.query.as_of);
    sendSuccess(res, result, 'Balance sheet retrieved');
  } catch (error) { next(error); }
}

/* ── Posting (seed / backfill) ──────────────────── */

async function seed(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await posting.seedChartOfAccounts(outletId);
    sendSuccess(res, result, 'Chart of accounts seeded');
  } catch (error) { next(error); }
}

async function backfill(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await posting.backfill(outletId);
    sendSuccess(res, result, 'Journals backfilled');
  } catch (error) { next(error); }
}

/* ── BAS & Cash Flow ────────────────────────────── */

async function basReport(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await bas.getBASReport(outletId, req.query.from, req.query.to);
    sendSuccess(res, result, 'BAS report retrieved');
  } catch (error) { next(error); }
}

async function cashFlow(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await bas.getCashFlow(outletId, req.query.from, req.query.to);
    sendSuccess(res, result, 'Cash flow retrieved');
  } catch (error) { next(error); }
}

/* ── Aging & Bill Payment ───────────────────────── */

async function receivablesAging(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await aging.getReceivablesAging(outletId, req.query.as_of);
    sendSuccess(res, result, 'Receivables aging retrieved');
  } catch (error) { next(error); }
}

async function payablesAging(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await aging.getPayablesAging(outletId, req.query.as_of);
    sendSuccess(res, result, 'Payables aging retrieved');
  } catch (error) { next(error); }
}

async function payBill(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await aging.payBill(outletId, {
      po_id: req.body.po_id,
      amount: req.body.amount,
      method: req.body.method,
      date: req.body.date,
      created_by: req.user.id,
    });
    sendSuccess(res, result, 'Bill paid');
  } catch (error) { next(error); }
}

/* ── Chart of Accounts (managed) ────────────────── */

async function accountsList(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await chart.listAccounts(outletId);
    sendSuccess(res, result, 'Accounts retrieved');
  } catch (error) { next(error); }
}

async function createAccount(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await chart.createAccount(outletId, req.body);
    sendCreated(res, result, 'Account created');
  } catch (error) { next(error); }
}

async function updateAccount(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await chart.updateAccount(outletId, req.params.id, req.body);
    sendSuccess(res, result, 'Account updated');
  } catch (error) { next(error); }
}

async function deactivateAccount(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await chart.deactivateAccount(outletId, req.params.id);
    sendSuccess(res, result, 'Account deactivated');
  } catch (error) { next(error); }
}

async function manualJournal(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await chart.postManualJournal(outletId, {
      entry_date: req.body.entry_date,
      memo: req.body.memo,
      lines: req.body.lines,
      created_by: req.user.id,
    });
    sendCreated(res, result, 'Manual journal posted');
  } catch (error) { next(error); }
}

/* ── Period Locks ───────────────────────────────── */

async function listLocks(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await period.listLocks(outletId);
    sendSuccess(res, result, 'Period locks retrieved');
  } catch (error) { next(error); }
}

async function lockPeriod(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await period.lockPeriod(outletId, req.body.period, req.user.id, req.body.note);
    sendCreated(res, result, 'Period locked');
  } catch (error) { next(error); }
}

async function unlockPeriod(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await period.unlockPeriod(outletId, req.body.period);
    sendSuccess(res, result, 'Period unlocked');
  } catch (error) { next(error); }
}

async function billPayments(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await aging.listBillPayments(outletId, req.query.po_id);
    sendSuccess(res, result, 'Bill payments retrieved');
  } catch (error) { next(error); }
}

/* ── Bank Accounts ──────────────────────────────── */

async function listBankAccounts(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await bank.listBankAccounts(outletId);
    sendSuccess(res, result, 'Bank accounts retrieved');
  } catch (error) { next(error); }
}

async function createBankAccount(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await bank.createBankAccount(outletId, req.body);
    sendCreated(res, result, 'Bank account created');
  } catch (error) { next(error); }
}

async function updateBankAccount(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await bank.updateBankAccount(outletId, req.params.id, req.body);
    sendSuccess(res, result, 'Bank account updated');
  } catch (error) { next(error); }
}

async function deactivateBankAccount(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await bank.deactivateBankAccount(outletId, req.params.id);
    sendSuccess(res, result, 'Bank account deactivated');
  } catch (error) { next(error); }
}

/* ── Bank Statements ────────────────────────────── */

async function importStatement(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const bankId = req.params.id;
    let lines;
    let errors;
    if (req.body.csv && typeof req.body.csv === 'string') {
      const parsed = parser.parseCSV(req.body.csv);
      lines = parsed.lines;
      errors = parsed.errors;
    } else {
      lines = req.body.lines || [];
    }
    const result = await statement.importStatement(outletId, bankId, lines);
    sendSuccess(res, { ...result, parse_errors: errors || [] }, 'Statement imported');
  } catch (error) { next(error); }
}

async function listStatementLines(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await statement.listStatementLines(outletId, {
      bank_account_id: req.params.id,
      reconciled: req.query.reconciled === undefined ? undefined : (req.query.reconciled === 'true'),
      limit: Number(req.query.limit) || 200,
    });
    sendSuccess(res, result, 'Statement lines retrieved');
  } catch (error) { next(error); }
}

async function statementAdjustment(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await statement.createAdjustmentJournal(outletId, req.params.id, req.body.account_code, req.user.id);
    sendSuccess(res, result, 'Adjustment journal created');
  } catch (error) { next(error); }
}

/* ── Reconciliation ─────────────────────────────── */

async function suggestMatches(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await recon.suggestMatches(outletId, req.params.id);
    sendSuccess(res, result, 'Match suggestions retrieved');
  } catch (error) { next(error); }
}

async function reconciliationSummary(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await bankreport.getReconciliationSummary(outletId, req.params.id);
    sendSuccess(res, result, 'Reconciliation summary retrieved');
  } catch (error) { next(error); }
}

async function autoReconcile(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await recon.autoReconcile(outletId, req.params.id);
    sendSuccess(res, result, 'Auto reconciliation complete');
  } catch (error) { next(error); }
}

async function reconcileLine(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await recon.reconcile(outletId, req.body.statement_line_id, req.body.journal_line_id);
    sendSuccess(res, result, 'Line reconciled');
  } catch (error) { next(error); }
}

async function unreconcileLine(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await recon.unreconcile(outletId, req.body.statement_line_id);
    sendSuccess(res, result, 'Line unreconciled');
  } catch (error) { next(error); }
}

/* ── BAS Lodgements ─────────────────────────────── */

async function listBASLodgements(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await baslodge.listLodgements(outletId);
    sendSuccess(res, result, 'BAS lodgements retrieved');
  } catch (error) { next(error); }
}

async function createBASLodgement(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await baslodge.createLodgement(outletId, {
      period_start: req.body.period_start,
      period_end: req.body.period_end,
    });
    sendCreated(res, result, 'BAS lodgement created');
  } catch (error) { next(error); }
}

async function lodgeBAS(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await baslodge.lodge(outletId, req.params.id);
    sendSuccess(res, result, 'BAS lodged');
  } catch (error) { next(error); }
}

/* ── Budgets ────────────────────────────────────── */

async function listBudgets(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await budget.listBudgets(outletId);
    sendSuccess(res, result, 'Budgets retrieved');
  } catch (error) { next(error); }
}

async function getBudget(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await budget.getBudget(outletId, req.params.id);
    sendSuccess(res, result, 'Budget retrieved');
  } catch (error) { next(error); }
}

async function createBudget(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await budget.createBudget(outletId, req.body);
    sendCreated(res, result, 'Budget created');
  } catch (error) { next(error); }
}

async function updateBudget(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await budget.updateBudget(outletId, req.params.id, req.body);
    sendSuccess(res, result, 'Budget updated');
  } catch (error) { next(error); }
}

async function deleteBudget(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await budget.deleteBudget(outletId, req.params.id);
    sendSuccess(res, result, 'Budget deleted');
  } catch (error) { next(error); }
}

async function budgetVsActual(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await budget.getBudgetVsActual(outletId, req.params.id, req.query.from, req.query.to);
    sendSuccess(res, result, 'Budget vs actual retrieved');
  } catch (error) { next(error); }
}

/* ── Invoices ───────────────────────────────────── */

async function listInvoices(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await invoice.listInvoices(outletId, { status: req.query.status, limit: Number(req.query.limit) || 100 });
    sendSuccess(res, result, 'Invoices retrieved');
  } catch (error) { next(error); }
}

async function getInvoice(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await invoice.getInvoice(outletId, req.params.id);
    sendSuccess(res, result, 'Invoice retrieved');
  } catch (error) { next(error); }
}

async function createInvoice(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await invoice.createInvoice(outletId, req.body);
    sendCreated(res, result, 'Invoice created');
  } catch (error) { next(error); }
}

async function issueInvoice(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await invoice.issueInvoice(outletId, req.params.id);
    sendSuccess(res, result, 'Invoice issued');
  } catch (error) { next(error); }
}

async function markPaidInvoice(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await invoice.markPaid(outletId, req.params.id, { method: req.body.method });
    sendSuccess(res, result, 'Invoice marked paid');
  } catch (error) { next(error); }
}

async function voidInvoice(req, res, next) {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await invoice.voidInvoice(outletId, req.params.id);
    sendSuccess(res, result, 'Invoice voided');
  } catch (error) { next(error); }
}

/* ── CSV Exports ────────────────────────────────── */

async function exportTrialBalance(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { filename, csv } = await xport.exportTrialBalanceCSV(outletId, req.query.as_of);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) { next(e); }
}

async function exportProfitLoss(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { filename, csv } = await xport.exportProfitLossCSV(outletId, req.query.from, req.query.to);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) { next(e); }
}

async function exportBalanceSheet(req, res, next) {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { filename, csv } = await xport.exportBalanceSheetCSV(outletId, req.query.as_of);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) { next(e); }
}

/* ── DANGER: reset all transactional accounting data for an outlet ─────────── */
// Clears the ledger + every Phase 1-7 transactional table for the outlet but
// KEEPS the chart of accounts (account structure is config, not test data).
// Owner/super_admin only, and requires { confirm: true } in the body.
async function resetAccounting(req, res, next) {
  try {
    const role = req.user?.role;
    if (role !== 'owner' && role !== 'super_admin') {
      return res.status(403).json({ success: false, data: null, message: 'Only an owner can reset accounting data' });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({ success: false, data: null, message: 'Pass { "confirm": true } to reset accounting data' });
    }
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const keepChart = req.body.keep_chart !== false; // default: keep chart of accounts

    // Delete children before parents to respect FKs.
    const jeIds = (await prisma.journalEntry.findMany({ where: { outlet_id: outletId }, select: { id: true } })).map(j => j.id);
    if (jeIds.length) await prisma.journalLine.deleteMany({ where: { entry_id: { in: jeIds } } });
    await prisma.journalEntry.deleteMany({ where: { outlet_id: outletId } });

    const invIds = (await prisma.customerInvoice.findMany({ where: { outlet_id: outletId }, select: { id: true } })).map(i => i.id);
    if (invIds.length) await prisma.customerInvoiceLine.deleteMany({ where: { invoice_id: { in: invIds } } });
    await prisma.customerInvoice.deleteMany({ where: { outlet_id: outletId } });

    const budIds = (await prisma.budget.findMany({ where: { outlet_id: outletId }, select: { id: true } })).map(b => b.id);
    if (budIds.length) await prisma.budgetLine.deleteMany({ where: { budget_id: { in: budIds } } });
    await prisma.budget.deleteMany({ where: { outlet_id: outletId } });

    const prIds = (await prisma.payRun.findMany({ where: { outlet_id: outletId }, select: { id: true } })).map(r => r.id);
    if (prIds.length) await prisma.payslip.deleteMany({ where: { pay_run_id: { in: prIds } } });
    await prisma.payRun.deleteMany({ where: { outlet_id: outletId } });

    await prisma.depreciationEntry.deleteMany({ where: { outlet_id: outletId } });
    await prisma.fixedAsset.deleteMany({ where: { outlet_id: outletId } });
    await prisma.bASLodgement.deleteMany({ where: { outlet_id: outletId } });
    await prisma.bankStatementLine.deleteMany({ where: { outlet_id: outletId } });
    await prisma.bankAccount.deleteMany({ where: { outlet_id: outletId } });
    await prisma.accountingPeriodLock.deleteMany({ where: { outlet_id: outletId } });
    await prisma.billPayment.deleteMany({ where: { outlet_id: outletId } });
    if (!keepChart) await prisma.chartAccount.deleteMany({ where: { outlet_id: outletId } });

    return sendSuccess(res, { reset: true, journal_entries_removed: jeIds.length, kept_chart: keepChart }, 'Accounting data reset');
  } catch (e) { next(e); }
}

module.exports = {
  resetAccounting,
  listChart,
  ledger,
  trialBalance,
  profitAndLoss,
  ownerDashboard,
  askBooks,
  balanceSheet,
  seed,
  backfill,
  bas: basReport,
  cashFlow,
  receivablesAging,
  payablesAging,
  payBill,
  accountsList,
  createAccount,
  updateAccount,
  deactivateAccount,
  manualJournal,
  listLocks,
  lockPeriod,
  unlockPeriod,
  billPayments,
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
  importStatement,
  listStatementLines,
  statementAdjustment,
  suggestMatches,
  reconciliationSummary,
  autoReconcile,
  reconcileLine,
  unreconcileLine,
  listBASLodgements,
  createBASLodgement,
  lodgeBAS,
  listBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  budgetVsActual,
  listInvoices,
  getInvoice,
  createInvoice,
  issueInvoice,
  markPaidInvoice,
  voidInvoice,
  exportTrialBalance,
  exportProfitLoss,
  exportBalanceSheet,
};
