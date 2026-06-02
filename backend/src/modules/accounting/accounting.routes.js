/**
 * @fileoverview Accounting routes — Chart of accounts, ledger, financial
 * statements, and posting (seed/backfill). Mounted at /api/accounting.
 * @module modules/accounting/accounting.routes
 */

const express = require('express');
const router = express.Router();
const c = require('./accounting.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const bankV = require('./accounting.bank.validation');
const p7 = require('./accounting.phase7.validation');

const VIEW = hasPermission('VIEW_REPORTS');
const MANAGE = hasPermission('MANAGE_INVENTORY');

/* ── Reports (read) ─────────────────────────────── */
router.get('/chart', authenticate, VIEW, c.listChart);
router.get('/ledger', authenticate, VIEW, c.ledger);
router.get('/trial-balance', authenticate, VIEW, c.trialBalance);
router.get('/profit-loss', authenticate, VIEW, c.profitAndLoss);
router.get('/balance-sheet', authenticate, VIEW, c.balanceSheet);

router.get('/bas', authenticate, VIEW, c.bas);
router.get('/bas-lodgements', authenticate, VIEW, c.listBASLodgements);
router.post('/bas-lodgements', authenticate, MANAGE, c.createBASLodgement);
router.post('/bas-lodgements/:id/lodge', authenticate, MANAGE, c.lodgeBAS);
router.get('/cash-flow', authenticate, VIEW, c.cashFlow);
router.get('/receivables-aging', authenticate, VIEW, c.receivablesAging);
router.get('/payables-aging', authenticate, VIEW, c.payablesAging);
router.get('/accounts', authenticate, VIEW, c.accountsList);
router.get('/periods', authenticate, VIEW, c.listLocks);
router.get('/bill-payments', authenticate, VIEW, c.billPayments);

/* ── Posting (write) ────────────────────────────── */
router.post('/seed', authenticate, MANAGE, c.seed);
router.post('/backfill', authenticate, MANAGE, c.backfill);
router.post('/pay-bill', authenticate, MANAGE, c.payBill);
router.post('/accounts', authenticate, MANAGE, c.createAccount);
router.patch('/accounts/:id', authenticate, MANAGE, c.updateAccount);
router.delete('/accounts/:id', authenticate, MANAGE, c.deactivateAccount);
router.post('/manual-journal', authenticate, MANAGE, c.manualJournal);
router.post('/periods/lock', authenticate, MANAGE, c.lockPeriod);
router.post('/periods/unlock', authenticate, MANAGE, c.unlockPeriod);

/* ── Bank accounts & reconciliation ─────────────── */
router.get('/bank-accounts', authenticate, VIEW, c.listBankAccounts);
router.post('/bank-accounts', authenticate, MANAGE, validate(bankV.createBankAccountSchema), c.createBankAccount);
router.patch('/bank-accounts/:id', authenticate, MANAGE, validate(bankV.updateBankAccountSchema), c.updateBankAccount);
router.delete('/bank-accounts/:id', authenticate, MANAGE, c.deactivateBankAccount);
router.post('/bank-accounts/:id/import', authenticate, MANAGE, validate(bankV.importStatementSchema), c.importStatement);
router.get('/bank-accounts/:id/statement-lines', authenticate, VIEW, c.listStatementLines);
router.get('/bank-accounts/:id/suggest-matches', authenticate, VIEW, c.suggestMatches);
router.get('/bank-accounts/:id/reconciliation', authenticate, VIEW, c.reconciliationSummary);
router.post('/bank-accounts/:id/auto-reconcile', authenticate, MANAGE, c.autoReconcile);
router.post('/reconcile', authenticate, MANAGE, validate(bankV.reconcileSchema), c.reconcileLine);
router.post('/unreconcile', authenticate, MANAGE, validate(bankV.unreconcileSchema), c.unreconcileLine);
router.post('/statement-lines/:id/adjustment', authenticate, MANAGE, validate(bankV.adjustmentSchema), c.statementAdjustment);

/* ── Budgets ────────────────────────────────────── */
router.get('/budgets', authenticate, VIEW, c.listBudgets);
router.get('/budgets/:id/vs-actual', authenticate, VIEW, c.budgetVsActual);
router.get('/budgets/:id', authenticate, VIEW, c.getBudget);
router.post('/budgets', authenticate, MANAGE, validate(p7.createBudgetSchema), c.createBudget);
router.patch('/budgets/:id', authenticate, MANAGE, validate(p7.updateBudgetSchema), c.updateBudget);
router.delete('/budgets/:id', authenticate, MANAGE, c.deleteBudget);

/* ── Invoices ───────────────────────────────────── */
router.get('/invoices', authenticate, VIEW, c.listInvoices);
router.get('/invoices/:id', authenticate, VIEW, c.getInvoice);
router.post('/invoices', authenticate, MANAGE, validate(p7.createInvoiceSchema), c.createInvoice);
router.post('/invoices/:id/issue', authenticate, MANAGE, c.issueInvoice);
router.post('/invoices/:id/mark-paid', authenticate, MANAGE, validate(p7.markPaidSchema), c.markPaidInvoice);
router.post('/invoices/:id/void', authenticate, MANAGE, c.voidInvoice);

/* ── CSV exports ────────────────────────────────── */
router.get('/export/trial-balance.csv', authenticate, VIEW, c.exportTrialBalance);
router.get('/export/profit-loss.csv', authenticate, VIEW, c.exportProfitLoss);
router.get('/export/balance-sheet.csv', authenticate, VIEW, c.exportBalanceSheet);

/* ── Reset (owner-only, requires { confirm:true }) ── */
router.post('/reset', authenticate, MANAGE, c.resetAccounting);

module.exports = router;
