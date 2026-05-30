/**
 * @fileoverview Xero analytics — labour cost analysis, seasonal insights, and
 * bank balance / cash flow report builders. Read-only over xeroTransaction
 * (+ xeroBankAccount for cash flow).
 * @module modules/xero/reports.labour.service
 */

const { getDbClient } = require('../../config/database');
const { MONTH_NAMES, SHORT_MONTH_NAMES, round, getConnection, buildWhere } = require('./xero.query');

/**
 * Labour cost analysis with breakdown, monthly trend, and industry benchmark.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<object>}
 */
async function getLabourAnalysis(outletId, range = 'year') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) {
    return {
      summary: { total_labour: 0, labour_pct_of_revenue: 0, avg_monthly_labour: 0 },
      breakdown: [],
      monthly_trend: [],
      benchmark: { industry_target: 30, current: 0, status: 'under' },
    };
  }

  const where = buildWhere(conn.id, range);
  const allTxns = await prisma.xeroTransaction.findMany({ where });

  // Total revenue for ratio calculations
  let totalRevenue = 0;
  for (const t of allTxns) {
    if (t.account_type === 'REVENUE') totalRevenue += Number(t.net_amount);
  }

  // Filter labour transactions
  const labourTxns = allTxns.filter((t) => t.category === 'Labour');

  // --- Summary ---
  let total_labour = 0;
  for (const t of labourTxns) {
    total_labour += Math.abs(Number(t.net_amount));
  }

  const monthsSet = new Set();
  for (const t of labourTxns) {
    const d = new Date(t.date);
    monthsSet.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  const numMonths = monthsSet.size || 1;

  const labour_pct_of_revenue = totalRevenue > 0 ? round((total_labour / totalRevenue) * 100) : 0;
  const avg_monthly_labour = round(total_labour / numMonths);

  const summary = {
    total_labour: round(total_labour),
    labour_pct_of_revenue,
    avg_monthly_labour,
  };

  // --- Breakdown by account_name ---
  const acctMap = {};
  for (const t of labourTxns) {
    const name = t.account_name || 'Other Labour';
    if (!acctMap[name]) acctMap[name] = 0;
    acctMap[name] += Math.abs(Number(t.net_amount));
  }
  const breakdown = Object.entries(acctMap)
    .map(([account_name, amount]) => ({
      account_name,
      amount: round(amount),
      pct: total_labour > 0 ? round((amount / total_labour) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // --- Monthly trend ---
  const monthMap = {};
  const revByMonth = {};
  for (const t of allTxns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (t.account_type === 'REVENUE') {
      if (!revByMonth[key]) revByMonth[key] = 0;
      revByMonth[key] += Number(t.net_amount);
    }
    if (t.category === 'Labour') {
      if (!monthMap[key]) monthMap[key] = { month: `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, labour_cost: 0 };
      monthMap[key].labour_cost += Math.abs(Number(t.net_amount));
    }
  }
  const monthly_trend = Object.keys(monthMap)
    .sort()
    .map((key) => {
      const revenue = revByMonth[key] || 0;
      const labour_cost = round(monthMap[key].labour_cost);
      return {
        month: monthMap[key].month,
        labour_cost,
        revenue: round(revenue),
        labour_pct: revenue > 0 ? round((monthMap[key].labour_cost / revenue) * 100) : 0,
      };
    });

  // --- Benchmark ---
  const current = labour_pct_of_revenue;
  let status = 'on_target';
  if (current > 32) status = 'over';
  else if (current < 28) status = 'under';

  const benchmark = { industry_target: 30, current: round(current), status };

  return { summary, breakdown, monthly_trend, benchmark };
}

/**
 * Seasonal insights using all historical data (ignores range).
 * @param {string} outletId
 * @returns {Promise<object>}
 */
async function getSeasonalInsights(outletId) {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) {
    return { by_month: [], best_month: null, worst_month: null, quarterly: [] };
  }

  const txns = await prisma.xeroTransaction.findMany({
    where: { connection_id: conn.id },
  });

  // Group by calendar month (1-12) and year to compute averages
  // Structure: { month -> { year -> { revenue, profit, expenses } } }
  const monthYearData = {};
  for (let m = 1; m <= 12; m++) {
    monthYearData[m] = {};
  }

  for (const t of txns) {
    const d = new Date(t.date);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const amt = Number(t.net_amount);

    if (!monthYearData[m][y]) {
      monthYearData[m][y] = { revenue: 0, expenses: 0 };
    }

    if (t.account_type === 'REVENUE') {
      monthYearData[m][y].revenue += amt;
    } else if (t.account_type === 'EXPENSE' || t.account_type === 'DIRECTCOSTS' || t.account_type === 'OVERHEADS') {
      monthYearData[m][y].expenses += Math.abs(amt);
    }
  }

  const by_month = [];
  for (let m = 1; m <= 12; m++) {
    const years = Object.values(monthYearData[m]);
    if (years.length === 0) {
      by_month.push({
        month: m,
        month_name: MONTH_NAMES[m - 1],
        avg_revenue: 0,
        avg_profit: 0,
        avg_margin: 0,
      });
      continue;
    }

    const totalRevenue = years.reduce((s, y) => s + y.revenue, 0);
    const totalExpenses = years.reduce((s, y) => s + y.expenses, 0);
    const yearCount = years.length;

    const avg_revenue = round(totalRevenue / yearCount);
    const avg_profit = round((totalRevenue - totalExpenses) / yearCount);
    const avg_margin = avg_revenue > 0 ? round((avg_profit / avg_revenue) * 100) : 0;

    by_month.push({
      month: m,
      month_name: MONTH_NAMES[m - 1],
      avg_revenue,
      avg_profit,
      avg_margin,
    });
  }

  // Best and worst months (by avg_revenue, excluding months with 0 data)
  const activeMonths = by_month.filter((m) => m.avg_revenue > 0);
  let best_month = null;
  let worst_month = null;
  if (activeMonths.length > 0) {
    const sorted = [...activeMonths].sort((a, b) => b.avg_revenue - a.avg_revenue);
    best_month = { month_name: sorted[0].month_name, avg_revenue: sorted[0].avg_revenue };
    worst_month = { month_name: sorted[sorted.length - 1].month_name, avg_revenue: sorted[sorted.length - 1].avg_revenue };
  }

  // Quarterly averages
  const quarterly = [];
  for (let q = 0; q < 4; q++) {
    const qMonths = by_month.slice(q * 3, q * 3 + 3);
    const qActive = qMonths.filter((m) => m.avg_revenue > 0);
    const avg_revenue = qActive.length > 0
      ? round(qActive.reduce((s, m) => s + m.avg_revenue, 0) / qActive.length)
      : 0;
    const avg_profit = qActive.length > 0
      ? round(qActive.reduce((s, m) => s + m.avg_profit, 0) / qActive.length)
      : 0;

    quarterly.push({
      quarter: `Q${q + 1}`,
      avg_revenue,
      avg_profit,
    });
  }

  return { by_month, best_month, worst_month, quarterly };
}

/**
 * Bank balance & cash flow analysis.
 * Computes running balance from opening + transactions, monthly cash flow.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<object>}
 */
async function getBankCashFlow(outletId, range = 'all') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { bank_account: null, monthly_cash_flow: [], running_balance: [], summary: null };

  // Get bank account
  const bankAcct = await prisma.xeroBankAccount.findFirst({
    where: { connection_id: conn.id, is_active: true },
  });
  if (!bankAcct) return { bank_account: null, monthly_cash_flow: [], running_balance: [], summary: null };

  const where = buildWhere(conn.id, range);
  const txns = await prisma.xeroTransaction.findMany({ where, orderBy: { date: 'asc' } });

  // Monthly cash flow: inflows vs outflows
  const monthMap = {};
  for (const t of txns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) {
      monthMap[key] = {
        month: `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        inflows: 0,
        outflows: 0,
      };
    }
    const amt = Number(t.net_amount);
    if (amt >= 0) {
      monthMap[key].inflows += amt;
    } else {
      monthMap[key].outflows += Math.abs(amt);
    }
  }

  const monthly_cash_flow = Object.keys(monthMap)
    .sort()
    .map((key) => {
      const m = monthMap[key];
      return {
        month: m.month,
        inflows: round(m.inflows),
        outflows: round(m.outflows),
        net_flow: round(m.inflows - m.outflows),
      };
    });

  // Running balance by month
  // Get ALL transactions (not range-filtered) for accurate running balance
  const allTxns = await prisma.xeroTransaction.findMany({
    where: { connection_id: conn.id },
    orderBy: { date: 'asc' },
  });

  const balanceMap = {};
  let runBal = Number(bankAcct.opening_balance);
  for (const t of allTxns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!balanceMap[key]) {
      balanceMap[key] = { month: `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, balance: 0 };
    }
    runBal += Number(t.net_amount);
    balanceMap[key].balance = runBal;
  }

  const running_balance = Object.keys(balanceMap)
    .sort()
    .map((key) => ({
      month: balanceMap[key].month,
      balance: round(balanceMap[key].balance),
    }));

  // Summary
  const totalInflows = monthly_cash_flow.reduce((s, m) => s + m.inflows, 0);
  const totalOutflows = monthly_cash_flow.reduce((s, m) => s + m.outflows, 0);
  const avgMonthlyNet = monthly_cash_flow.length > 0
    ? round((totalInflows - totalOutflows) / monthly_cash_flow.length)
    : 0;

  // Find best and worst months
  let bestMonth = null;
  let worstMonth = null;
  for (const m of monthly_cash_flow) {
    if (!bestMonth || m.net_flow > bestMonth.net_flow) bestMonth = m;
    if (!worstMonth || m.net_flow < worstMonth.net_flow) worstMonth = m;
  }

  const summary = {
    current_balance: round(Number(bankAcct.current_balance)),
    opening_balance: round(Number(bankAcct.opening_balance)),
    account_name: bankAcct.account_name,
    bsb: bankAcct.bsb,
    account_number: bankAcct.account_number,
    total_inflows: round(totalInflows),
    total_outflows: round(totalOutflows),
    net_cash_flow: round(totalInflows - totalOutflows),
    avg_monthly_net: avgMonthlyNet,
    best_month: bestMonth ? { month: bestMonth.month, net_flow: bestMonth.net_flow } : null,
    worst_month: worstMonth ? { month: worstMonth.month, net_flow: worstMonth.net_flow } : null,
  };

  return {
    bank_account: {
      account_name: bankAcct.account_name,
      account_number: bankAcct.account_number,
      bsb: bankAcct.bsb,
      opening_balance: round(Number(bankAcct.opening_balance)),
      current_balance: round(Number(bankAcct.current_balance)),
    },
    monthly_cash_flow,
    running_balance,
    summary,
  };
}

module.exports = { getLabourAnalysis, getSeasonalInsights, getBankCashFlow };
