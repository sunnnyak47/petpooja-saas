/**
 * @fileoverview CSV export of financial statements (trial balance, P&L,
 * balance sheet). Pulls computed figures from the statements service and
 * renders them as CSV strings. No PDF/binary dependencies.
 *
 * @module modules/accounting/accounting.export.service
 */

const stmts = require('./accounting.statements.service');
const logger = require('../../config/logger');

/**
 * Escape a single CSV field. Wraps the value in double quotes when it
 * contains a comma, quote, or newline, and doubles any internal quotes.
 * @param {*} v
 * @returns {string}
 */
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from an array of row arrays using \n line endings. */
function buildCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

/** Format a numeric value for CSV output (2dp). */
function num(n) {
  return Number(n || 0).toFixed(2);
}

/**
 * Export the trial balance as CSV.
 * @param {string} outletId
 * @param {string|Date} [asOf]
 * @returns {Promise<{filename:string, csv:string}>}
 */
async function exportTrialBalanceCSV(outletId, asOf) {
  logger.info('Exporting trial balance CSV', { outletId, asOf });
  const tb = await stmts.getTrialBalance(outletId, asOf);

  const rows = [['Code', 'Account', 'Type', 'Debit', 'Credit']];
  for (const a of tb.accounts || []) {
    rows.push([a.code, a.name, a.type, num(a.debit), num(a.credit)]);
  }
  const totals = tb.totals || {};
  rows.push(['', 'TOTAL', '', num(totals.debit), num(totals.credit)]);

  return {
    filename: `trial-balance-${asOf || 'today'}.csv`,
    csv: buildCsv(rows),
  };
}

/**
 * Export the profit & loss statement as CSV.
 * @param {string} outletId
 * @param {string|Date} [from]
 * @param {string|Date} [to]
 * @returns {Promise<{filename:string, csv:string}>}
 */
async function exportProfitLossCSV(outletId, from, to) {
  logger.info('Exporting profit & loss CSV', { outletId, from, to });
  const pl = await stmts.getProfitAndLoss(outletId, from, to);

  const revenue = pl.revenue || { accounts: [], total: 0 };
  const expenses = pl.expenses || { accounts: [], total: 0 };

  const rows = [];
  rows.push(['Revenue']);
  for (const a of revenue.accounts || []) {
    rows.push([a.code, a.name, num(a.balance)]);
  }
  rows.push(['Total Revenue', '', num(revenue.total)]);
  rows.push([]);
  rows.push(['Expenses']);
  for (const a of expenses.accounts || []) {
    rows.push([a.code, a.name, num(a.balance)]);
  }
  rows.push(['Total Expenses', '', num(expenses.total)]);
  rows.push(['COGS', '', num(pl.cogs_total)]);
  rows.push(['Gross Profit', '', num(pl.gross_profit)]);
  rows.push(['Net Profit', '', num(pl.net_profit)]);

  return {
    filename: `profit-loss-${from || 'start'}-to-${to || 'today'}.csv`,
    csv: buildCsv(rows),
  };
}

/**
 * Export the balance sheet as CSV.
 * @param {string} outletId
 * @param {string|Date} [asOf]
 * @returns {Promise<{filename:string, csv:string}>}
 */
async function exportBalanceSheetCSV(outletId, asOf) {
  logger.info('Exporting balance sheet CSV', { outletId, asOf });
  const bs = await stmts.getBalanceSheet(outletId, asOf);

  const section = (rows, label, group) => {
    const g = group || { accounts: [], total: 0 };
    rows.push([label]);
    for (const a of g.accounts || []) {
      rows.push([a.code, a.name, num(a.balance)]);
    }
    rows.push([`Total ${label}`, '', num(g.total)]);
  };

  const rows = [];
  section(rows, 'Assets', bs.assets);
  rows.push([]);
  section(rows, 'Liabilities', bs.liabilities);
  rows.push([]);
  section(rows, 'Equity', bs.equity);

  return {
    filename: `balance-sheet-${asOf || 'today'}.csv`,
    csv: buildCsv(rows),
  };
}

module.exports = { exportTrialBalanceCSV, exportProfitLossCSV, exportBalanceSheetCSV };
