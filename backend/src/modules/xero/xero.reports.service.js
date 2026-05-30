/**
 * @fileoverview Xero analytics report builders aggregator.
 * Re-exports the ~11 read-only report builders from their focused group files
 * so callers can import the full report surface from one place.
 * @module modules/xero/xero.reports.service
 */

const pnl = require('./reports.pnl.service');
const labour = require('./reports.labour.service');
const balance = require('./reports.balance.service');
const tax = require('./reports.tax.service');

module.exports = {
  ...pnl,      // getOverview, getProfitLoss, getExpenseAnalysis
  ...labour,   // getLabourAnalysis, getSeasonalInsights, getBankCashFlow
  ...balance,  // getBalanceSheet, getInvoiceStatus
  ...tax,      // getBASReturns, getContactsAnalysis, getTrackingAnalysis
};
