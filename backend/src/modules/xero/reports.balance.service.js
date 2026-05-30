/**
 * @fileoverview Xero analytics — balance sheet and invoice/payment status
 * report builders. Read-only over xeroBalanceSheetLine and xeroInvoice.
 * @module modules/xero/reports.balance.service
 */

const { getDbClient } = require('../../config/database');
const { SHORT_MONTH_NAMES, round, getConnection, getDateCutoff } = require('./xero.query');

/**
 * Balance sheet report: assets, liabilities, equity at latest available date or by range.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<object>}
 */
async function getBalanceSheet(outletId, range = 'all') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { snapshot: null, trend: [], ratios: null };

  // Get the latest balance sheet date
  const latestLine = await prisma.xeroBalanceSheetLine.findFirst({
    where: { connection_id: conn.id },
    orderBy: { as_at_date: 'desc' },
  });
  if (!latestLine) return { snapshot: null, trend: [], ratios: null };

  const latestDate = latestLine.as_at_date;

  // Snapshot: latest month's balance sheet
  const latestLines = await prisma.xeroBalanceSheetLine.findMany({
    where: { connection_id: conn.id, as_at_date: latestDate },
    orderBy: { account_code: 'asc' },
  });

  const assets = [];
  const liabilities = [];
  const equity = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let currentAssets = 0;
  let currentLiabilities = 0;

  for (const l of latestLines) {
    const item = {
      account_code: l.account_code,
      account_name: l.account_name,
      sub_type: l.sub_type,
      balance: round(Number(l.balance)),
    };
    if (l.account_type === 'ASSET') {
      assets.push(item);
      totalAssets += Number(l.balance);
      if (l.sub_type === 'CURRENT') currentAssets += Number(l.balance);
    } else if (l.account_type === 'LIABILITY') {
      liabilities.push(item);
      totalLiabilities += Number(l.balance);
      if (l.sub_type === 'CURRENT') currentLiabilities += Number(l.balance);
    } else if (l.account_type === 'EQUITY') {
      equity.push(item);
      totalEquity += Number(l.balance);
    }
  }

  const snapshot = {
    as_at_date: latestDate,
    assets,
    liabilities,
    equity,
    total_assets: round(totalAssets),
    total_liabilities: round(totalLiabilities),
    total_equity: round(totalEquity),
    net_assets: round(totalAssets - totalLiabilities),
  };

  // Ratios
  const currentRatio = currentLiabilities > 0 ? round(currentAssets / currentLiabilities) : 0;
  const debtToEquity = totalEquity > 0 ? round(totalLiabilities / totalEquity) : 0;
  const workingCapital = round(currentAssets - currentLiabilities);

  let currentRatioStatus = 'healthy';
  if (currentRatio < 1.0) currentRatioStatus = 'critical';
  else if (currentRatio < 1.5) currentRatioStatus = 'caution';

  const ratios = {
    current_ratio: currentRatio,
    current_ratio_status: currentRatioStatus,
    debt_to_equity: debtToEquity,
    working_capital: workingCapital,
  };

  // Trend: monthly total assets, total liabilities, net equity
  const allLines = await prisma.xeroBalanceSheetLine.findMany({
    where: { connection_id: conn.id },
    orderBy: { as_at_date: 'asc' },
  });

  const trendMap = {};
  for (const l of allLines) {
    const d = new Date(l.as_at_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!trendMap[key]) {
      trendMap[key] = { month: `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, assets: 0, liabilities: 0, equity: 0 };
    }
    const bal = Number(l.balance);
    if (l.account_type === 'ASSET') trendMap[key].assets += bal;
    else if (l.account_type === 'LIABILITY') trendMap[key].liabilities += bal;
    else if (l.account_type === 'EQUITY') trendMap[key].equity += bal;
  }

  const cutoff = getDateCutoff(range);
  const trend = Object.keys(trendMap)
    .sort()
    .filter((key) => {
      if (!cutoff) return true;
      const [yr, mo] = key.split('-').map(Number);
      return new Date(yr, mo - 1, 1) >= cutoff;
    })
    .map((key) => ({
      month: trendMap[key].month,
      total_assets: round(trendMap[key].assets),
      total_liabilities: round(trendMap[key].liabilities),
      net_equity: round(trendMap[key].assets - trendMap[key].liabilities),
    }));

  return { snapshot, trend, ratios };
}

/**
 * Invoice & payment status analysis with aging buckets.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<object>}
 */
async function getInvoiceStatus(outletId, range = 'all') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { summary: null, aging: [], status_breakdown: [], top_debtors: [] };

  const where = { connection_id: conn.id };
  const cutoff = getDateCutoff(range);
  if (cutoff) where.date = { gte: cutoff };

  const invoices = await prisma.xeroInvoice.findMany({ where, orderBy: { date: 'desc' } });

  // Summary
  const receivables = invoices.filter(i => i.type === 'ACCREC');
  const payables = invoices.filter(i => i.type === 'ACCPAY');

  let totalOutstandingAR = 0;
  let totalOverdueAR = 0;
  let paidOnTimeCount = 0;
  let totalPaidCount = 0;
  let totalDaysToPay = 0;

  for (const inv of receivables) {
    totalOutstandingAR += Number(inv.amount_due);
    if (inv.status === 'OVERDUE') totalOverdueAR += Number(inv.amount_due);
    if (inv.status === 'PAID') {
      paidOnTimeCount += 1;
      totalPaidCount += 1;
      // Estimate days to pay (date to due_date, assume paid on due_date for simplicity)
      const daysDiff = Math.round((new Date(inv.due_date) - new Date(inv.date)) / 86400000);
      totalDaysToPay += daysDiff;
    }
  }

  const dso = totalPaidCount > 0 ? round(totalDaysToPay / totalPaidCount) : 0;
  const collectionRate = receivables.length > 0 ? round((paidOnTimeCount / receivables.length) * 100) : 0;

  const summary = {
    total_receivables: receivables.length,
    total_payables: payables.length,
    total_outstanding_ar: round(totalOutstandingAR),
    total_overdue_ar: round(totalOverdueAR),
    days_sales_outstanding: dso,
    collection_rate: collectionRate,
  };

  // Status breakdown
  const statusCounts = { PAID: 0, AUTHORISED: 0, OVERDUE: 0, DRAFT: 0 };
  const statusAmounts = { PAID: 0, AUTHORISED: 0, OVERDUE: 0, DRAFT: 0 };
  for (const inv of invoices) {
    statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;
    statusAmounts[inv.status] = (statusAmounts[inv.status] || 0) + Number(inv.total);
  }

  const status_breakdown = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
    amount: round(statusAmounts[status] || 0),
    pct: invoices.length > 0 ? round((count / invoices.length) * 100) : 0,
  }));

  // Aging buckets (receivables only)
  const refDate = new Date('2024-12-31');
  const agingBuckets = {
    current: { label: 'Current', count: 0, amount: 0 },
    '1_30': { label: '1-30 Days', count: 0, amount: 0 },
    '31_60': { label: '31-60 Days', count: 0, amount: 0 },
    '61_90': { label: '61-90 Days', count: 0, amount: 0 },
    '90_plus': { label: '90+ Days', count: 0, amount: 0 },
  };

  for (const inv of receivables) {
    if (inv.status === 'PAID') continue;
    const daysOverdue = Math.max(0, Math.round((refDate - new Date(inv.due_date)) / 86400000));
    const amtDue = Number(inv.amount_due);
    if (daysOverdue <= 0) {
      agingBuckets.current.count += 1;
      agingBuckets.current.amount += amtDue;
    } else if (daysOverdue <= 30) {
      agingBuckets['1_30'].count += 1;
      agingBuckets['1_30'].amount += amtDue;
    } else if (daysOverdue <= 60) {
      agingBuckets['31_60'].count += 1;
      agingBuckets['31_60'].amount += amtDue;
    } else if (daysOverdue <= 90) {
      agingBuckets['61_90'].count += 1;
      agingBuckets['61_90'].amount += amtDue;
    } else {
      agingBuckets['90_plus'].count += 1;
      agingBuckets['90_plus'].amount += amtDue;
    }
  }

  const aging = Object.values(agingBuckets).map(b => ({
    ...b,
    amount: round(b.amount),
  }));

  // Top debtors (outstanding receivables)
  const debtorMap = {};
  for (const inv of receivables) {
    if (inv.status === 'PAID') continue;
    if (!debtorMap[inv.contact]) debtorMap[inv.contact] = { amount_due: 0, invoice_count: 0 };
    debtorMap[inv.contact].amount_due += Number(inv.amount_due);
    debtorMap[inv.contact].invoice_count += 1;
  }

  const top_debtors = Object.entries(debtorMap)
    .map(([contact, data]) => ({
      contact,
      amount_due: round(data.amount_due),
      invoice_count: data.invoice_count,
    }))
    .sort((a, b) => b.amount_due - a.amount_due)
    .slice(0, 10);

  return { summary, aging, status_breakdown, top_debtors };
}

module.exports = { getBalanceSheet, getInvoiceStatus };
