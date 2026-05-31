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

/* ── Posting (write) ────────────────────────────── */
router.post('/seed', authenticate, MANAGE, c.seed);
router.post('/backfill', authenticate, MANAGE, c.backfill);

module.exports = router;
