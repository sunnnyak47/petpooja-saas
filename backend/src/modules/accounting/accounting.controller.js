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
const { sendSuccess, sendCreated } = require('../../utils/response');
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

module.exports = {
  listChart,
  ledger,
  trialBalance,
  profitAndLoss,
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
};
