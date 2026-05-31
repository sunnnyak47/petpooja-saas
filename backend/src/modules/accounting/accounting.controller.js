/**
 * @fileoverview Accounting controller — HTTP handlers for chart of accounts,
 * ledger, financial statements, and posting (seed/backfill).
 * @module modules/accounting/accounting.controller
 */

const posting = require('./accounting.posting.service');
const statements = require('./accounting.statements.service');
const { sendSuccess } = require('../../utils/response');
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

module.exports = {
  listChart,
  ledger,
  trialBalance,
  profitAndLoss,
  balanceSheet,
  seed,
  backfill,
};
