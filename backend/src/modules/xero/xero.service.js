/**
 * @fileoverview Xero Analytics Service — facade.
 * Provides financial analytics derived from synced Xero accounting data.
 * All monetary values use net_amount (GST-exclusive).
 * Revenue amounts are positive in the DB; expense/COGS amounts are negative.
 *
 * NOTE: this is the READ-ONLY analytics service over the `xeroTransaction`
 * table — NOT the OAuth integration (that lives in
 * `integrations/accounting/xero.service.js`).
 *
 * The implementation was split into focused modules; this file re-exports the
 * full surface so existing imports of `./xero.service` keep working unchanged:
 *   - ./xero.query            — shared helpers (getConnection, date/where, round)
 *   - ./xero.reports.service  — the read-only report builders
 *   - ./xero.predictions.service — predictive analytics
 *   - ./xero.demo.service     — demo data seeder
 *
 * @module modules/xero/xero.service
 */

const { getConnection } = require('./xero.query');
const reports = require('./xero.reports.service');
const predictions = require('./xero.predictions.service');
const demo = require('./xero.demo.service');

module.exports = {
  getConnection,
  ...reports,      // getOverview, getProfitLoss, getExpenseAnalysis, getLabourAnalysis,
                   // getSeasonalInsights, getBankCashFlow, getBalanceSheet, getInvoiceStatus,
                   // getBASReturns, getContactsAnalysis, getTrackingAnalysis
  ...predictions,  // getPredictions (also getRecommendation, BENCHMARKS)
  ...demo,         // seedDemoData, clearDemoData
};
