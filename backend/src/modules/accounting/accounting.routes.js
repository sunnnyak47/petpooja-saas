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

const VIEW = hasPermission('VIEW_REPORTS');
const MANAGE = hasPermission('MANAGE_INVENTORY');

/* ── Reports (read) ─────────────────────────────── */
router.get('/chart', authenticate, VIEW, c.listChart);
router.get('/ledger', authenticate, VIEW, c.ledger);
router.get('/trial-balance', authenticate, VIEW, c.trialBalance);
router.get('/profit-loss', authenticate, VIEW, c.profitAndLoss);
router.get('/balance-sheet', authenticate, VIEW, c.balanceSheet);

router.get('/bas', authenticate, VIEW, c.bas);
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

module.exports = router;
