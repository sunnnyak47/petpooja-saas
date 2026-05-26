/**
 * @fileoverview Xero Analytics Service.
 * Provides financial analytics derived from synced Xero accounting data.
 * All monetary values use net_amount (GST-exclusive).
 * Revenue amounts are positive in the DB; expense/COGS amounts are negative.
 * @module modules/xero/xero.service
 */

const { getDbClient } = require('../../config/database');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const round = (x) => Math.round(x * 100) / 100;

/**
 * Compute the date cutoff for a given range string.
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Date|null} cutoff date, or null for 'all'
 */
function getDateCutoff(range) {
  if (range === 'all') return null;
  const now = new Date();
  switch (range) {
    case 'month':
      now.setMonth(now.getMonth() - 1);
      break;
    case 'quarter':
      now.setMonth(now.getMonth() - 3);
      break;
    case 'year':
      now.setMonth(now.getMonth() - 12);
      break;
    default:
      return null;
  }
  return now;
}

/**
 * Build a Prisma where clause scoped to a connection + optional date range.
 * @param {string} connectionId
 * @param {string} range
 * @returns {object}
 */
function buildWhere(connectionId, range) {
  const where = { connection_id: connectionId };
  const cutoff = getDateCutoff(range);
  if (cutoff) {
    where.date = { gte: cutoff };
  }
  return where;
}

/**
 * Find the Xero connection for an outlet.
 * @param {string} outletId
 * @returns {Promise<object|null>}
 */
async function getConnection(outletId) {
  const prisma = getDbClient();
  const conn = await prisma.xeroConnection.findFirst({
    where: { outlet_id: outletId, is_deleted: false },
    include: {
      accounts: { where: { is_active: true }, orderBy: { code: 'asc' } },
    },
  });
  return conn || null;
}

/**
 * High-level financial overview with summary, trends, expense breakdown, and YoY comparison.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<object>}
 */
async function getOverview(outletId, range = 'year') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { summary: null, revenue_trend: [], expense_breakdown: [], yoy_comparison: null };

  const where = buildWhere(conn.id, range);
  const txns = await prisma.xeroTransaction.findMany({ where });

  // --- Summary ---
  let total_revenue = 0;
  let total_cogs = 0;
  let total_labour = 0;
  let total_expenses = 0;
  let total_orders = 0;

  for (const t of txns) {
    const amt = Number(t.net_amount);
    if (t.account_type === 'REVENUE') {
      total_revenue += amt;
    } else if (t.category === 'Cost of Sales' || t.account_type === 'DIRECTCOSTS') {
      total_cogs += Math.abs(amt);
    }
    if (t.category === 'Labour') {
      total_labour += Math.abs(amt);
    }
    if (t.account_type === 'EXPENSE' || t.account_type === 'DIRECTCOSTS' || t.account_type === 'OVERHEADS') {
      total_expenses += Math.abs(amt);
    }
    if (t.type === 'Sales Invoice') {
      total_orders += 1;
    }
  }

  const gross_profit = total_revenue - total_cogs;
  const gross_margin_pct = total_revenue > 0 ? round((gross_profit / total_revenue) * 100) : 0;
  const net_profit = total_revenue - total_expenses;
  const net_margin_pct = total_revenue > 0 ? round((net_profit / total_revenue) * 100) : 0;

  const summary = {
    total_revenue: round(total_revenue),
    total_cogs: round(total_cogs),
    gross_profit: round(gross_profit),
    gross_margin_pct,
    total_labour: round(total_labour),
    total_expenses: round(total_expenses),
    net_profit: round(net_profit),
    net_margin_pct,
    total_orders,
  };

  // --- Revenue trend (monthly) ---
  const monthBuckets = {};
  for (const t of txns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthBuckets[key]) {
      monthBuckets[key] = { period: `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, revenue: 0, cogs: 0, expenses: 0 };
    }
    const amt = Number(t.net_amount);
    if (t.account_type === 'REVENUE') {
      monthBuckets[key].revenue += amt;
    }
    if (t.category === 'Cost of Sales' || t.account_type === 'DIRECTCOSTS') {
      monthBuckets[key].cogs += Math.abs(amt);
    }
    if (t.account_type === 'EXPENSE' || t.account_type === 'DIRECTCOSTS' || t.account_type === 'OVERHEADS') {
      monthBuckets[key].expenses += Math.abs(amt);
    }
  }
  const revenue_trend = Object.keys(monthBuckets)
    .sort()
    .map((key) => {
      const b = monthBuckets[key];
      return {
        period: b.period,
        revenue: round(b.revenue),
        cogs: round(b.cogs),
        net_profit: round(b.revenue - b.expenses),
      };
    });

  // --- Expense breakdown by category ---
  const catMap = {};
  for (const t of txns) {
    if (t.account_type === 'EXPENSE' || t.account_type === 'DIRECTCOSTS' || t.account_type === 'OVERHEADS') {
      const cat = t.category || 'Other';
      if (!catMap[cat]) catMap[cat] = 0;
      catMap[cat] += Math.abs(Number(t.net_amount));
    }
  }
  const expense_breakdown = Object.entries(catMap)
    .map(([category, amount]) => ({ category, amount: round(amount), pct: 0 }))
    .sort((a, b) => b.amount - a.amount);
  const expTotal = expense_breakdown.reduce((s, e) => s + e.amount, 0);
  for (const e of expense_breakdown) {
    e.pct = expTotal > 0 ? round((e.amount / expTotal) * 100) : 0;
  }

  // --- YoY comparison ---
  // Use the latest year in the data (not current calendar year) to handle demo/historical data
  let latestYear = new Date().getFullYear();
  for (const t of txns) {
    if (t.account_type === 'REVENUE') {
      const y = new Date(t.date).getFullYear();
      if (y > latestYear || latestYear === new Date().getFullYear()) latestYear = y;
    }
  }
  // If we found data years, use the latest; otherwise fall back to current year
  const currentYearStart = new Date(latestYear, 0, 1);
  const prevYearStart = new Date(latestYear - 1, 0, 1);
  const prevYearEnd = new Date(latestYear - 1, 11, 31);

  let current_year_revenue = 0;
  let previous_year_revenue = 0;
  for (const t of txns) {
    if (t.account_type !== 'REVENUE') continue;
    const d = new Date(t.date);
    if (d >= currentYearStart) {
      current_year_revenue += Number(t.net_amount);
    } else if (d >= prevYearStart && d <= prevYearEnd) {
      previous_year_revenue += Number(t.net_amount);
    }
  }

  // If current range didn't include previous year data, fetch it separately
  if (previous_year_revenue === 0 && range !== 'all') {
    const prevYearTxns = await prisma.xeroTransaction.findMany({
      where: {
        connection_id: conn.id,
        account_type: 'REVENUE',
        date: { gte: prevYearStart, lte: prevYearEnd },
      },
    });
    for (const t of prevYearTxns) {
      previous_year_revenue += Number(t.net_amount);
    }
  }

  const growth_pct = previous_year_revenue > 0
    ? round(((current_year_revenue - previous_year_revenue) / previous_year_revenue) * 100)
    : 0;

  const yoy_comparison = {
    current_year_revenue: round(current_year_revenue),
    previous_year_revenue: round(previous_year_revenue),
    growth_pct,
  };

  return { summary, revenue_trend, expense_breakdown, yoy_comparison };
}

/**
 * Monthly P&L table.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<Array>}
 */
async function getProfitLoss(outletId, range = 'year') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return [];

  const where = buildWhere(conn.id, range);
  const txns = await prisma.xeroTransaction.findMany({ where });

  const buckets = {};
  for (const t of txns) {
    const d = new Date(t.date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;

    if (!buckets[key]) {
      buckets[key] = {
        year,
        month,
        month_label: `${SHORT_MONTH_NAMES[month - 1]} ${year}`,
        revenue: 0,
        cogs: 0,
        labour: 0,
        other_expenses: 0,
      };
    }

    const amt = Number(t.net_amount);
    if (t.account_type === 'REVENUE') {
      buckets[key].revenue += amt;
    } else if (t.category === 'Cost of Sales' || t.account_type === 'DIRECTCOSTS') {
      buckets[key].cogs += Math.abs(amt);
    } else if (t.category === 'Labour') {
      buckets[key].labour += Math.abs(amt);
    } else if (t.account_type === 'EXPENSE' || t.account_type === 'OVERHEADS') {
      buckets[key].other_expenses += Math.abs(amt);
    }
  }

  return Object.keys(buckets)
    .sort()
    .map((key) => {
      const b = buckets[key];
      const gross_profit = b.revenue - b.cogs;
      const gross_margin_pct = b.revenue > 0 ? round((gross_profit / b.revenue) * 100) : 0;
      const net_profit = b.revenue - b.cogs - b.labour - b.other_expenses;
      const net_margin_pct = b.revenue > 0 ? round((net_profit / b.revenue) * 100) : 0;

      return {
        year: b.year,
        month: b.month,
        month_label: b.month_label,
        revenue: round(b.revenue),
        cogs: round(b.cogs),
        gross_profit: round(gross_profit),
        gross_margin_pct,
        labour: round(b.labour),
        other_expenses: round(b.other_expenses),
        net_profit: round(net_profit),
        net_margin_pct,
      };
    });
}

/**
 * Expense analysis: by category, by supplier, and category trend over months.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<object>}
 */
async function getExpenseAnalysis(outletId, range = 'year') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { by_category: [], by_supplier: [], category_trend: [] };

  const where = {
    ...buildWhere(conn.id, range),
    account_type: { in: ['EXPENSE', 'DIRECTCOSTS', 'OVERHEADS'] },
  };
  const txns = await prisma.xeroTransaction.findMany({ where });

  // --- By category ---
  const catMap = {};
  for (const t of txns) {
    const cat = t.category || 'Other';
    if (!catMap[cat]) catMap[cat] = 0;
    catMap[cat] += Math.abs(Number(t.net_amount));
  }
  const totalExp = Object.values(catMap).reduce((s, v) => s + v, 0);
  const by_category = Object.entries(catMap)
    .map(([category, amount]) => ({
      category,
      amount: round(amount),
      pct: totalExp > 0 ? round((amount / totalExp) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // --- By supplier (top 15) ---
  const supplierMap = {};
  for (const t of txns) {
    const contact = t.contact || 'Unknown';
    if (!supplierMap[contact]) {
      supplierMap[contact] = { total_spend: 0, transaction_count: 0, categorySet: new Set() };
    }
    supplierMap[contact].total_spend += Math.abs(Number(t.net_amount));
    supplierMap[contact].transaction_count += 1;
    supplierMap[contact].categorySet.add(t.category || 'Other');
  }
  const by_supplier = Object.entries(supplierMap)
    .map(([contact, data]) => ({
      contact,
      total_spend: round(data.total_spend),
      transaction_count: data.transaction_count,
      categories: Array.from(data.categorySet),
    }))
    .sort((a, b) => b.total_spend - a.total_spend)
    .slice(0, 15);

  // --- Category trend (monthly) ---
  const trendMap = {};
  const allCategories = new Set();
  for (const t of txns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cat = (t.category || 'Other').replace(/\s+/g, '_');
    allCategories.add(cat);
    if (!trendMap[key]) trendMap[key] = { month: `${SHORT_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` };
    if (!trendMap[key][cat]) trendMap[key][cat] = 0;
    trendMap[key][cat] += Math.abs(Number(t.net_amount));
  }
  const category_trend = Object.keys(trendMap)
    .sort()
    .map((key) => {
      const row = { month: trendMap[key].month };
      for (const cat of allCategories) {
        row[cat] = round(trendMap[key][cat] || 0);
      }
      return row;
    });

  return { by_category, by_supplier, category_trend };
}

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

/**
 * BAS / Tax return analysis.
 * @param {string} outletId
 * @returns {Promise<object>}
 */
async function getBASReturns(outletId) {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { returns: [], summary: null, trend: [] };

  const returns = await prisma.xeroBASReturn.findMany({
    where: { connection_id: conn.id },
    orderBy: [{ year: 'asc' }, { quarter: 'asc' }],
  });

  if (returns.length === 0) return { returns: [], summary: null, trend: [] };

  // Format returns
  const formattedReturns = returns.map(r => ({
    quarter: `Q${r.quarter} ${r.year}`,
    year: r.year,
    quarter_num: r.quarter,
    period_start: r.period_start,
    period_end: r.period_end,
    gst_collected: round(Number(r.gst_collected)),
    gst_paid: round(Number(r.gst_paid)),
    net_gst: round(Number(r.net_gst)),
    payg_withheld: round(Number(r.payg_withheld)),
    total_payable: round(Number(r.total_payable)),
    status: r.status,
    lodged_date: r.lodged_date,
    due_date: r.due_date,
  }));

  // YTD summary (latest year)
  const latestYear = Math.max(...returns.map(r => r.year));
  const ytdReturns = returns.filter(r => r.year === latestYear);

  let ytdGstCollected = 0;
  let ytdGstPaid = 0;
  let ytdPayg = 0;
  let ytdTotal = 0;

  for (const r of ytdReturns) {
    ytdGstCollected += Number(r.gst_collected);
    ytdGstPaid += Number(r.gst_paid);
    ytdPayg += Number(r.payg_withheld);
    ytdTotal += Number(r.total_payable);
  }

  // Find next due
  const dueReturns = returns.filter(r => r.status === 'DUE');
  const nextDue = dueReturns.length > 0 ? dueReturns[0] : null;

  // Annual totals for trend
  const annualMap = {};
  for (const r of returns) {
    if (!annualMap[r.year]) annualMap[r.year] = { gst_collected: 0, gst_paid: 0, net_gst: 0, payg: 0, total: 0 };
    annualMap[r.year].gst_collected += Number(r.gst_collected);
    annualMap[r.year].gst_paid += Number(r.gst_paid);
    annualMap[r.year].net_gst += Number(r.net_gst);
    annualMap[r.year].payg += Number(r.payg_withheld);
    annualMap[r.year].total += Number(r.total_payable);
  }

  // Total revenue for effective tax rate
  const allTxns = await prisma.xeroTransaction.findMany({
    where: { connection_id: conn.id, account_type: 'REVENUE' },
  });
  let totalRevenue = 0;
  let latestYearRevenue = 0;
  for (const t of allTxns) {
    totalRevenue += Number(t.net_amount);
    if (new Date(t.date).getFullYear() === latestYear) {
      latestYearRevenue += Number(t.net_amount);
    }
  }

  const effectiveTaxRate = latestYearRevenue > 0 ? round((ytdTotal / latestYearRevenue) * 100) : 0;

  const summary = {
    ytd_gst_collected: round(ytdGstCollected),
    ytd_gst_paid: round(ytdGstPaid),
    ytd_net_gst: round(ytdGstCollected - ytdGstPaid),
    ytd_payg: round(ytdPayg),
    ytd_total: round(ytdTotal),
    effective_tax_rate: effectiveTaxRate,
    next_due: nextDue ? {
      quarter: `Q${nextDue.quarter} ${nextDue.year}`,
      due_date: nextDue.due_date,
      estimated_amount: round(Number(nextDue.total_payable)),
    } : null,
  };

  const trend = Object.entries(annualMap).map(([year, data]) => ({
    year: Number(year),
    gst_collected: round(data.gst_collected),
    gst_paid: round(data.gst_paid),
    net_gst: round(data.net_gst),
    payg_withheld: round(data.payg),
    total_payable: round(data.total),
  }));

  return { returns: formattedReturns, summary, trend };
}

/**
 * Contacts analysis: supplier ranking, concentration, categories.
 * @param {string} outletId
 * @returns {Promise<object>}
 */
async function getContactsAnalysis(outletId) {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { suppliers: [], customers: [], summary: null, concentration: null };

  const contacts = await prisma.xeroContact.findMany({
    where: { connection_id: conn.id, is_active: true },
    orderBy: { total_spend: 'desc' },
  });

  const suppliers = contacts
    .filter(c => c.contact_type === 'SUPPLIER')
    .map(c => ({
      name: c.name,
      abn: c.abn,
      email: c.email,
      phone: c.phone,
      city: c.city,
      state: c.state,
      total_spend: round(Number(c.total_spend)),
      transaction_count: c.transaction_count,
      first_transaction: c.first_transaction,
      last_transaction: c.last_transaction,
    }));

  const customers = contacts
    .filter(c => c.contact_type === 'CUSTOMER')
    .map(c => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.city,
      state: c.state,
      total_revenue: round(Number(c.total_revenue)),
      transaction_count: c.transaction_count,
      first_transaction: c.first_transaction,
      last_transaction: c.last_transaction,
    }))
    .sort((a, b) => b.total_revenue - a.total_revenue);

  // Concentration: top 3 suppliers as % of total spend
  const totalSupplierSpend = suppliers.reduce((s, c) => s + c.total_spend, 0);
  const top3Spend = suppliers.slice(0, 3).reduce((s, c) => s + c.total_spend, 0);
  const concentrationPct = totalSupplierSpend > 0 ? round((top3Spend / totalSupplierSpend) * 100) : 0;

  // HHI (Herfindahl-Hirschman Index) for diversity
  let hhi = 0;
  for (const s of suppliers) {
    const share = totalSupplierSpend > 0 ? (s.total_spend / totalSupplierSpend) * 100 : 0;
    hhi += share * share;
  }
  const diversityScore = round(Math.max(0, 100 - (hhi / 100)));

  const concentration = {
    top_3_pct: concentrationPct,
    top_3_names: suppliers.slice(0, 3).map(s => s.name),
    hhi: round(hhi),
    diversity_score: diversityScore,
  };

  const summary = {
    total_suppliers: suppliers.length,
    total_customers: customers.length,
    total_supplier_spend: round(totalSupplierSpend),
    total_customer_revenue: round(customers.reduce((s, c) => s + c.total_revenue, 0)),
    largest_supplier: suppliers[0] ? { name: suppliers[0].name, spend: suppliers[0].total_spend } : null,
    avg_transaction_size: suppliers.length > 0
      ? round(totalSupplierSpend / suppliers.reduce((s, c) => s + c.transaction_count, 0))
      : 0,
  };

  return { suppliers, customers, summary, concentration };
}

/**
 * Tracking categories analysis: revenue by service type and meal period.
 * @param {string} outletId
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Promise<object>}
 */
async function getTrackingAnalysis(outletId, range = 'all') {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { categories: [], monthly_breakdown: [], summary: null };

  const categories = await prisma.xeroTrackingCategory.findMany({
    where: { connection_id: conn.id },
    include: {
      options: {
        include: {
          summaries: {
            where: { connection_id: conn.id },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
          },
        },
      },
    },
  });

  const cutoff = getDateCutoff(range);

  const result = [];
  for (const cat of categories) {
    const optionData = [];
    for (const opt of cat.options) {
      let totalRev = 0;
      let totalCost = 0;
      let totalTxns = 0;
      const monthly = [];

      for (const s of opt.summaries) {
        // Apply range filter
        if (cutoff) {
          const sDate = new Date(s.year, s.month - 1, 1);
          if (sDate < cutoff) continue;
        }
        totalRev += Number(s.revenue);
        totalCost += Number(s.cost);
        totalTxns += s.transaction_count;
        monthly.push({
          month: `${SHORT_MONTH_NAMES[s.month - 1]} ${s.year}`,
          year: s.year,
          month_num: s.month,
          revenue: round(Number(s.revenue)),
          cost: round(Number(s.cost)),
          transaction_count: s.transaction_count,
        });
      }

      optionData.push({
        name: opt.name,
        total_revenue: round(totalRev),
        total_cost: round(totalCost),
        margin: totalRev > 0 ? round(((totalRev - totalCost) / totalRev) * 100) : 0,
        transaction_count: totalTxns,
        monthly,
      });
    }

    // Calculate percentages
    const catTotalRev = optionData.reduce((s, o) => s + o.total_revenue, 0);
    for (const o of optionData) {
      o.revenue_pct = catTotalRev > 0 ? round((o.total_revenue / catTotalRev) * 100) : 0;
    }

    // YoY growth per option
    for (const opt of optionData) {
      const byYear = {};
      for (const m of opt.monthly) {
        if (!byYear[m.year]) byYear[m.year] = 0;
        byYear[m.year] += m.revenue;
      }
      const years = Object.keys(byYear).map(Number).sort();
      if (years.length >= 2) {
        const latest = years[years.length - 1];
        const prev = years[years.length - 2];
        opt.yoy_growth = byYear[prev] > 0
          ? round(((byYear[latest] - byYear[prev]) / byYear[prev]) * 100)
          : 0;
      } else {
        opt.yoy_growth = 0;
      }
    }

    result.push({
      category_name: cat.name,
      options: optionData.sort((a, b) => b.total_revenue - a.total_revenue),
      total_revenue: round(catTotalRev),
    });
  }

  // Find fastest growing channel
  let fastestGrowth = null;
  for (const cat of result) {
    for (const opt of cat.options) {
      if (!fastestGrowth || opt.yoy_growth > fastestGrowth.yoy_growth) {
        fastestGrowth = { name: opt.name, category: cat.category_name, yoy_growth: opt.yoy_growth };
      }
    }
  }

  const summaryObj = {
    total_categories: result.length,
    fastest_growing: fastestGrowth,
  };

  return { categories: result, summary: summaryObj };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PREDICTIVE ANALYTICS ENGINE                                               */
/*  All predictions computed from historical data — no mock values.           */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Industry benchmarks for Australian hospitality.
 */
const BENCHMARKS = {
  cogs_pct:       { low: 28, target: 30, high: 32, label: 'Cost of Goods' },
  labour_pct:     { low: 28, target: 30, high: 32, label: 'Labour' },
  occupancy_pct:  { low: 8,  target: 10, high: 12, label: 'Occupancy' },
  marketing_pct:  { low: 2,  target: 3,  high: 4,  label: 'Marketing' },
  net_margin_pct: { low: 5,  target: 10, high: 15, label: 'Net Margin' },
};

/**
 * Compute all predictive analytics from historical Xero data.
 * @param {string} outletId
 * @returns {Promise<object>}
 */
async function getPredictions(outletId) {
  const prisma = getDbClient();
  const conn = await getConnection(outletId);
  if (!conn) return { error: 'No Xero connection found' };

  // ─── Fetch all historical data ────────────────────────────────────────
  const allTxns = await prisma.xeroTransaction.findMany({
    where: { connection_id: conn.id },
    orderBy: { date: 'asc' },
  });

  if (allTxns.length === 0) return { error: 'No transaction data' };

  // ─── Organize monthly data ────────────────────────────────────────────
  const monthlyData = {};  // key: "2022-01" → { revenue, cogs, labour, occupancy, marketing, other_exp, total_exp }

  for (const t of allTxns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[key]) {
      monthlyData[key] = {
        year: d.getFullYear(), month: d.getMonth() + 1,
        revenue: 0, cogs: 0, labour: 0, occupancy: 0, marketing: 0, other_exp: 0, total_exp: 0,
      };
    }
    const amt = Number(t.net_amount);
    if (t.account_type === 'REVENUE') {
      monthlyData[key].revenue += amt;
    } else if (t.category === 'Cost of Sales' || t.account_type === 'DIRECTCOSTS') {
      monthlyData[key].cogs += Math.abs(amt);
      monthlyData[key].total_exp += Math.abs(amt);
    } else if (t.category === 'Labour') {
      monthlyData[key].labour += Math.abs(amt);
      monthlyData[key].total_exp += Math.abs(amt);
    } else if (t.category === 'Occupancy') {
      monthlyData[key].occupancy += Math.abs(amt);
      monthlyData[key].total_exp += Math.abs(amt);
    } else if (t.category === 'Marketing') {
      monthlyData[key].marketing += Math.abs(amt);
      monthlyData[key].total_exp += Math.abs(amt);
    } else if (t.account_type === 'EXPENSE' || t.account_type === 'OVERHEADS') {
      monthlyData[key].other_exp += Math.abs(amt);
      monthlyData[key].total_exp += Math.abs(amt);
    }
  }

  const sortedKeys = Object.keys(monthlyData).sort();
  const months = sortedKeys.map(k => monthlyData[k]);
  const numMonths = months.length;

  // ─── Totals ───────────────────────────────────────────────────────────
  let totalRevenue = 0, totalCogs = 0, totalLabour = 0, totalOccupancy = 0;
  let totalMarketing = 0, totalOtherExp = 0, totalExp = 0;
  for (const m of months) {
    totalRevenue += m.revenue;
    totalCogs += m.cogs;
    totalLabour += m.labour;
    totalOccupancy += m.occupancy;
    totalMarketing += m.marketing;
    totalOtherExp += m.other_exp;
    totalExp += m.total_exp;
  }
  const avgMonthlyRevenue = totalRevenue / numMonths;

  // ─── Annual data for growth rates ─────────────────────────────────────
  const annualRevenue = {};
  for (const m of months) {
    if (!annualRevenue[m.year]) annualRevenue[m.year] = 0;
    annualRevenue[m.year] += m.revenue;
  }
  const years = Object.keys(annualRevenue).map(Number).sort();

  // Calculate YoY growth rates
  const growthRates = [];
  for (let i = 1; i < years.length; i++) {
    const prev = annualRevenue[years[i - 1]];
    const curr = annualRevenue[years[i]];
    if (prev > 0) growthRates.push((curr - prev) / prev);
  }
  const avgGrowthRate = growthRates.length > 0
    ? growthRates.reduce((s, r) => s + r, 0) / growthRates.length
    : 0.05; // default 5% if not enough data

  // ─── 1. SEASONAL INDICES (per calendar month) ────────────────────────
  const monthRevTotals = Array(12).fill(0);
  const monthRevCounts = Array(12).fill(0);
  for (const m of months) {
    monthRevTotals[m.month - 1] += m.revenue;
    monthRevCounts[m.month - 1] += 1;
  }
  const monthAvgs = monthRevTotals.map((t, i) => monthRevCounts[i] > 0 ? t / monthRevCounts[i] : 0);
  const overallMonthAvg = avgMonthlyRevenue;
  const seasonalIndex = monthAvgs.map(a => overallMonthAvg > 0 ? a / overallMonthAvg : 1);

  // ─── 2. REVENUE FORECAST (next 12 months) ────────────────────────────
  const lastDataYear = years[years.length - 1];
  const lastDataMonth = months[months.length - 1].month;

  // Base revenue: latest year's total (annualized if partial)
  const latestYearMonths = months.filter(m => m.year === lastDataYear);
  const latestYearRevenue = latestYearMonths.reduce((s, m) => s + m.revenue, 0);
  const latestMonthCount = latestYearMonths.length;
  const annualizedBase = latestMonthCount >= 12 ? latestYearRevenue : (latestYearRevenue / latestMonthCount) * 12;

  const revenue_forecast = [];
  let forecastStartMonth = lastDataMonth + 1;
  let forecastStartYear = lastDataYear;
  if (forecastStartMonth > 12) { forecastStartMonth = 1; forecastStartYear += 1; }

  for (let i = 0; i < 12; i++) {
    const fm = ((forecastStartMonth - 1 + i) % 12) + 1;
    const fy = forecastStartYear + Math.floor((forecastStartMonth - 1 + i) / 12);
    const baseMonthly = annualizedBase / 12;
    const predicted = baseMonthly * seasonalIndex[fm - 1] * (1 + avgGrowthRate);
    const confidence = 0.10 + (i * 0.015); // Widens with time

    revenue_forecast.push({
      month: `${SHORT_MONTH_NAMES[fm - 1]} ${fy}`,
      month_num: fm,
      year: fy,
      predicted: round(predicted),
      lower_bound: round(predicted * (1 - confidence)),
      upper_bound: round(predicted * (1 + confidence)),
      seasonal_index: round(seasonalIndex[fm - 1] * 100) / 100,
    });
  }

  const forecastTotal = revenue_forecast.reduce((s, f) => s + f.predicted, 0);

  // ─── 3. PROFITABILITY FORECAST & BREAK-EVEN ──────────────────────────
  // Separate fixed vs variable costs
  // Fixed: Occupancy, Depreciation, portion of Admin
  // Variable: COGS, Labour (mostly), Marketing
  const fixedCostTotal = totalOccupancy + totalOtherExp * 0.6; // ~60% of other exp is fixed
  const variableCostTotal = totalCogs + totalLabour + totalMarketing + totalOtherExp * 0.4;
  const variableCostRatio = totalRevenue > 0 ? variableCostTotal / totalRevenue : 0.7;
  const monthlyFixedCost = fixedCostTotal / numMonths;

  const breakEvenRevenue = variableCostRatio < 1
    ? monthlyFixedCost / (1 - variableCostRatio)
    : monthlyFixedCost * 10; // fallback

  const currentNetMargin = totalRevenue > 0 ? ((totalRevenue - totalExp) / totalRevenue) * 100 : 0;
  const forecastedNetMargin = currentNetMargin + (avgGrowthRate * 10); // slight improvement

  // Monthly profitability forecast
  const profitability_forecast = revenue_forecast.map(f => {
    const rev = f.predicted;
    const varCost = rev * variableCostRatio;
    const netProfit = rev - varCost - monthlyFixedCost;
    return {
      month: f.month,
      revenue: f.predicted,
      variable_costs: round(varCost),
      fixed_costs: round(monthlyFixedCost),
      net_profit: round(netProfit),
      margin_pct: rev > 0 ? round((netProfit / rev) * 100) : 0,
    };
  });

  const profitability = {
    break_even_monthly: round(breakEvenRevenue),
    break_even_annual: round(breakEvenRevenue * 12),
    current_avg_monthly_revenue: round(avgMonthlyRevenue),
    safety_margin_pct: avgMonthlyRevenue > 0
      ? round(((avgMonthlyRevenue - breakEvenRevenue) / avgMonthlyRevenue) * 100)
      : 0,
    monthly_fixed_costs: round(monthlyFixedCost),
    variable_cost_ratio: round(variableCostRatio * 100),
    current_net_margin: round(currentNetMargin),
    forecasted_net_margin: round(forecastedNetMargin),
    monthly_forecast: profitability_forecast,
  };

  // ─── 4. CASH FLOW PROJECTION ─────────────────────────────────────────
  const bankAcct = await prisma.xeroBankAccount.findFirst({
    where: { connection_id: conn.id, is_active: true },
  });
  const currentBalance = bankAcct ? Number(bankAcct.current_balance) : 0;

  // Average monthly net cash flow from last 6 months of data
  const last6 = months.slice(-6);
  const avgNetCashFlow = last6.reduce((s, m) => s + (m.revenue - m.total_exp), 0) / last6.length;

  const cash_projection = [];
  let projectedBalance = currentBalance;
  let runwayMonths = null;

  for (let i = 0; i < 12; i++) {
    const fm = ((forecastStartMonth - 1 + i) % 12) + 1;
    const fy = forecastStartYear + Math.floor((forecastStartMonth - 1 + i) / 12);
    const netFlow = avgNetCashFlow * seasonalIndex[fm - 1] * (1 + avgGrowthRate * 0.5);
    projectedBalance += netFlow;

    if (projectedBalance <= 0 && runwayMonths === null) {
      runwayMonths = i;
    }

    cash_projection.push({
      month: `${SHORT_MONTH_NAMES[fm - 1]} ${fy}`,
      projected_balance: round(projectedBalance),
      net_flow: round(netFlow),
      is_negative: projectedBalance < 0,
    });
  }

  const cash_summary = {
    current_balance: round(currentBalance),
    projected_end_balance: round(projectedBalance),
    avg_monthly_net_flow: round(avgNetCashFlow),
    runway_months: runwayMonths,
    trend: projectedBalance > currentBalance ? 'improving' : 'declining',
  };

  // ─── 5. EXPENSE OPTIMIZATION ─────────────────────────────────────────
  const currentRatios = {
    cogs_pct: totalRevenue > 0 ? round((totalCogs / totalRevenue) * 100) : 0,
    labour_pct: totalRevenue > 0 ? round((totalLabour / totalRevenue) * 100) : 0,
    occupancy_pct: totalRevenue > 0 ? round((totalOccupancy / totalRevenue) * 100) : 0,
    marketing_pct: totalRevenue > 0 ? round((totalMarketing / totalRevenue) * 100) : 0,
    net_margin_pct: round(currentNetMargin),
  };

  const expense_optimization = Object.entries(BENCHMARKS).map(([key, bench]) => {
    const current = currentRatios[key] || 0;
    const isMargin = key === 'net_margin_pct';
    // For costs: under benchmark is good; for margin: over benchmark is good
    let status = 'on_target';
    if (isMargin) {
      if (current >= bench.high) status = 'excellent';
      else if (current >= bench.target) status = 'good';
      else if (current >= bench.low) status = 'caution';
      else status = 'critical';
    } else {
      if (current <= bench.low) status = 'excellent';
      else if (current <= bench.target) status = 'good';
      else if (current <= bench.high) status = 'caution';
      else status = 'critical';
    }

    // Calculate potential annual savings if brought to target
    let potentialSavings = 0;
    if (!isMargin && current > bench.target) {
      potentialSavings = round(((current - bench.target) / 100) * totalRevenue / (numMonths / 12));
    }

    return {
      category: bench.label,
      key,
      current_pct: current,
      benchmark_low: bench.low,
      benchmark_target: bench.target,
      benchmark_high: bench.high,
      status,
      potential_annual_savings: potentialSavings,
      recommendation: getRecommendation(key, status),
    };
  });

  // ─── 6. CHANNEL GROWTH PROJECTIONS ───────────────────────────────────
  const trackingCats = await prisma.xeroTrackingCategory.findMany({
    where: { connection_id: conn.id },
    include: {
      options: {
        include: {
          summaries: {
            where: { connection_id: conn.id },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
          },
        },
      },
    },
  });

  const channel_growth = [];
  const serviceTypeCat = trackingCats.find(c => c.name === 'Service Type');
  if (serviceTypeCat) {
    for (const opt of serviceTypeCat.options) {
      // Calculate channel-specific growth rate
      const channelByYear = {};
      for (const s of opt.summaries) {
        if (!channelByYear[s.year]) channelByYear[s.year] = 0;
        channelByYear[s.year] += Number(s.revenue);
      }
      const chYears = Object.keys(channelByYear).map(Number).sort();
      let channelGrowth = avgGrowthRate;
      if (chYears.length >= 2) {
        const chRates = [];
        for (let i = 1; i < chYears.length; i++) {
          const prev = channelByYear[chYears[i - 1]];
          if (prev > 0) chRates.push((channelByYear[chYears[i]] - prev) / prev);
        }
        if (chRates.length > 0) channelGrowth = chRates.reduce((s, r) => s + r, 0) / chRates.length;
      }

      const latestAnnual = chYears.length > 0 ? channelByYear[chYears[chYears.length - 1]] : 0;
      const projected12m = latestAnnual * (1 + channelGrowth);

      channel_growth.push({
        channel: opt.name,
        current_annual: round(latestAnnual),
        projected_annual: round(projected12m),
        growth_rate: round(channelGrowth * 100),
        monthly_projected: revenue_forecast.map(f => {
          const channelShare = totalRevenue > 0 ? latestAnnual / totalRevenue : 0.25;
          return {
            month: f.month,
            projected: round(f.predicted * channelShare * (1 + channelGrowth) / (1 + avgGrowthRate)),
          };
        }),
      });
    }
  }

  // ─── 7. SEASONAL STAFFING GUIDE ──────────────────────────────────────
  const labourBenchmark = 0.30; // 30% target
  const monthLabourTotals = Array(12).fill(0);
  const monthLabourCounts = Array(12).fill(0);
  for (const m of months) {
    monthLabourTotals[m.month - 1] += m.labour;
    monthLabourCounts[m.month - 1] += 1;
  }

  const staffing_guide = revenue_forecast.map((f, i) => {
    const optimalLabour = f.predicted * labourBenchmark;
    const avgHistorical = monthLabourCounts[f.month_num - 1] > 0
      ? monthLabourTotals[f.month_num - 1] / monthLabourCounts[f.month_num - 1]
      : optimalLabour;
    // Project historical labour forward with growth
    const projectedHistorical = avgHistorical * (1 + avgGrowthRate * 0.3); // Labour grows slower than revenue

    return {
      month: f.month,
      month_num: f.month_num,
      forecasted_revenue: f.predicted,
      optimal_labour: round(optimalLabour),
      projected_current_labour: round(projectedHistorical),
      potential_savings: round(Math.max(0, projectedHistorical - optimalLabour)),
      labour_pct_projected: f.predicted > 0 ? round((projectedHistorical / f.predicted) * 100) : 0,
      optimal_pct: round(labourBenchmark * 100),
      action: projectedHistorical > optimalLabour * 1.1 ? 'reduce' : projectedHistorical < optimalLabour * 0.9 ? 'hire' : 'maintain',
    };
  });

  const totalStaffingSavings = staffing_guide.reduce((s, g) => s + g.potential_savings, 0);

  // ─── 8. TAX LIABILITY FORECAST ───────────────────────────────────────
  const basReturns = await prisma.xeroBASReturn.findMany({
    where: { connection_id: conn.id },
    orderBy: [{ year: 'asc' }, { quarter: 'asc' }],
  });

  // Average GST rate from historical
  const totalGstCollected = basReturns.reduce((s, r) => s + Number(r.gst_collected), 0);
  const totalGstPaid = basReturns.reduce((s, r) => s + Number(r.gst_paid), 0);
  const totalPayg = basReturns.reduce((s, r) => s + Number(r.payg_withheld), 0);
  const basQuarters = basReturns.length || 1;

  const avgGstRate = totalRevenue > 0 ? totalGstCollected / totalRevenue : 0.10;
  const avgGstPaidRate = totalExp > 0 ? totalGstPaid / totalExp : 0.10;
  const avgPaygPerQ = totalPayg / basQuarters;

  // Determine next quarter
  const lastBas = basReturns[basReturns.length - 1];
  let nextQ = lastBas ? lastBas.quarter + 1 : 1;
  let nextQYear = lastBas ? lastBas.year : forecastStartYear;
  if (nextQ > 4) { nextQ = 1; nextQYear += 1; }

  const tax_forecast = [];
  for (let i = 0; i < 4; i++) {
    const q = ((nextQ - 1 + i) % 4) + 1;
    const y = nextQYear + Math.floor((nextQ - 1 + i) / 4);

    // Sum forecasted revenue for this quarter (3 months)
    const qMonthStart = (q - 1) * 3;
    const qRevenue = revenue_forecast
      .filter(f => {
        const fq = Math.ceil(f.month_num / 3);
        return fq === q && f.year === y;
      })
      .reduce((s, f) => s + f.predicted, 0)
      || (forecastTotal / 4); // fallback to even split

    const qExpenses = qRevenue * variableCostRatio + monthlyFixedCost * 3;

    const estGstCollected = round(qRevenue * avgGstRate);
    const estGstPaid = round(qExpenses * avgGstPaidRate);
    const estNetGst = round(estGstCollected - estGstPaid);
    const estPayg = round(avgPaygPerQ * (1 + avgGrowthRate * 0.3));
    const estTotal = round(estNetGst + estPayg);

    const qLabels = ['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'];
    tax_forecast.push({
      quarter: `Q${q} ${y}`,
      period: qLabels[q - 1],
      year: y,
      quarter_num: q,
      est_gst_collected: estGstCollected,
      est_gst_paid: estGstPaid,
      est_net_gst: estNetGst,
      est_payg: estPayg,
      est_total_payable: estTotal,
    });
  }

  // ─── 9. SCENARIO MODELLING DEFAULTS ──────────────────────────────────
  const scenario_defaults = {
    revenue_growth: round(avgGrowthRate * 100),
    labour_cut: 0,
    rent_change: 0,
    cogs_improvement: 0,
    base_annual_revenue: round(annualizedBase),
    base_annual_cogs: round(totalCogs / (numMonths / 12)),
    base_annual_labour: round(totalLabour / (numMonths / 12)),
    base_annual_occupancy: round(totalOccupancy / (numMonths / 12)),
    base_annual_marketing: round(totalMarketing / (numMonths / 12)),
    base_annual_other: round(totalOtherExp / (numMonths / 12)),
    base_net_profit: round((totalRevenue - totalExp) / (numMonths / 12)),
  };

  // ─── Summary stats ───────────────────────────────────────────────────
  const prediction_summary = {
    data_months: numMonths,
    data_range: `${SHORT_MONTH_NAMES[months[0].month - 1]} ${months[0].year} – ${SHORT_MONTH_NAMES[months[months.length - 1].month - 1]} ${months[months.length - 1].year}`,
    avg_growth_rate: round(avgGrowthRate * 100),
    forecasted_annual_revenue: round(forecastTotal),
    forecasted_annual_profit: round(profitability_forecast.reduce((s, f) => s + f.net_profit, 0)),
    total_potential_savings: round(expense_optimization.reduce((s, e) => s + e.potential_annual_savings, 0)),
    staffing_savings: round(totalStaffingSavings),
  };

  return {
    prediction_summary,
    revenue_forecast,
    profitability,
    cash_projection,
    cash_summary,
    expense_optimization,
    channel_growth,
    staffing_guide,
    tax_forecast,
    scenario_defaults,
    seasonal_indices: seasonalIndex.map((si, i) => ({
      month: SHORT_MONTH_NAMES[i],
      index: round(si * 100) / 100,
    })),
  };
}

/**
 * Generate recommendations based on benchmark status.
 */
function getRecommendation(key, status) {
  const recs = {
    cogs_pct: {
      excellent: 'COGS well controlled — maintain supplier relationships',
      good: 'COGS within target — monitor for seasonal spikes',
      caution: 'COGS trending high — review supplier contracts & portion sizes',
      critical: 'COGS over benchmark — urgent: renegotiate suppliers, reduce waste',
    },
    labour_pct: {
      excellent: 'Labour efficiently managed — good scheduling',
      good: 'Labour within range — optimise roster during slow periods',
      caution: 'Labour costs elevated — review roster efficiency & casual ratios',
      critical: 'Labour significantly over benchmark — restructure rosters, consider automation',
    },
    occupancy_pct: {
      excellent: 'Rent/occupancy very competitive for revenue level',
      good: 'Occupancy costs reasonable — review at next lease renewal',
      caution: 'Occupancy costs above target — consider subletting or renegotiating',
      critical: 'High occupancy burden — review lease terms urgently',
    },
    marketing_pct: {
      excellent: 'Low marketing spend — ensure brand visibility is maintained',
      good: 'Marketing spend balanced — track ROI on campaigns',
      caution: 'Marketing spend slightly high — measure return per channel',
      critical: 'Marketing overspend — cut low-ROI channels immediately',
    },
    net_margin_pct: {
      excellent: 'Outstanding profitability — reinvest strategically',
      good: 'Healthy margins — continue current strategy',
      caution: 'Margins below target — focus on revenue growth & cost control',
      critical: 'Margins critically low — immediate action needed on costs',
    },
  };
  return recs[key]?.[status] || '';
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  DEMO DATA SEEDER                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Seeds 3 years of realistic restaurant financial demo data for an outlet.
 * Idempotent — if a xero_connection already exists for the outlet, skips.
 */
async function seedDemoData(outletId) {
  const prisma = getDbClient();

  // Skip if already seeded
  const existing = await prisma.xeroConnection.findFirst({
    where: { outlet_id: outletId, is_deleted: false },
  });
  if (existing) return { skipped: true, connection_id: existing.id };

  // ── 1. Connection ────────────────────────────────────────────────────────
  const conn = await prisma.xeroConnection.create({
    data: {
      outlet_id:    outletId,
      org_name:     'Demo Restaurant Pty Ltd',
      abn:          '51 824 753 556',
      address:      '123 Collins St, Melbourne VIC 3000',
      currency:     'AUD',
      country_code: 'AU',
      timezone:     'Australia/Melbourne',
      is_connected: true,
      last_synced:  new Date(),
    },
  });

  // ── 2. Chart of Accounts ─────────────────────────────────────────────────
  const accounts = [
    { code: '200', name: 'Food & Beverage Revenue', type: 'REVENUE',  category: 'Revenue' },
    { code: '201', name: 'Catering Revenue',         type: 'REVENUE',  category: 'Revenue' },
    { code: '300', name: 'Cost of Sales – Food',     type: 'EXPENSE',  category: 'Cost of Sales' },
    { code: '301', name: 'Cost of Sales – Bev',      type: 'EXPENSE',  category: 'Cost of Sales' },
    { code: '400', name: 'Wages & Salaries',          type: 'EXPENSE',  category: 'Labour' },
    { code: '401', name: 'Casual Labour',             type: 'EXPENSE',  category: 'Labour' },
    { code: '450', name: 'Rent & Outgoings',          type: 'EXPENSE',  category: 'Occupancy' },
    { code: '451', name: 'Utilities',                 type: 'EXPENSE',  category: 'Occupancy' },
    { code: '500', name: 'Marketing & Advertising',   type: 'EXPENSE',  category: 'Marketing' },
    { code: '600', name: 'Repairs & Maintenance',     type: 'EXPENSE',  category: 'Operations' },
    { code: '601', name: 'Supplies & Consumables',    type: 'EXPENSE',  category: 'Operations' },
    { code: '700', name: 'Accounting & Legal',        type: 'EXPENSE',  category: 'Admin' },
    { code: '701', name: 'Insurance',                 type: 'EXPENSE',  category: 'Admin' },
    { code: '800', name: 'Depreciation',              type: 'EXPENSE',  category: 'Depreciation' },
  ];
  await prisma.xeroAccount.createMany({ data: accounts.map(a => ({ ...a, connection_id: conn.id })) });

  // ── 3. Transactions (36 months of daily aggregates) ──────────────────────
  // Monthly revenue baseline with seasonal factors and slight growth trend
  const now       = new Date();
  const txnRows   = [];
  let   refSeq    = 1;

  // Seasonal multipliers by month (index 0=Jan)
  const seasonal  = [0.85, 0.80, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.05, 1.00, 1.10, 1.30];
  const baseRev   = 95000; // monthly revenue base

  for (let mo = 35; mo >= 0; mo--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - mo, 1);
    const yr    = d.getFullYear();
    const mnth  = d.getMonth(); // 0-based
    const growth = 1 + (35 - mo) * 0.004; // ~15% growth over 3 years
    const sf    = seasonal[mnth];
    const rev   = Math.round(baseRev * sf * growth);
    const dateStr = `${yr}-${String(mnth + 1).padStart(2,'0')}-15`; // mid-month date

    const addRow = (ref, acctCode, acctName, acctType, cat, amt, contact) => {
      const net = Math.round(amt);
      txnRows.push({
        connection_id:   conn.id,
        transaction_ref: `DEMO-${String(refSeq++).padStart(6,'0')}`,
        date:            new Date(dateStr),
        type:            acctType === 'REVENUE' ? 'ACCREC' : 'ACCPAY',
        reference:       ref,
        account_code:    acctCode,
        account_name:    acctName,
        account_type:    acctType,
        category:        cat,
        contact:         contact || null,
        amount_incl_gst: Math.round(net * 1.1 * 100) / 100,
        gst:             Math.round(net * 0.1 * 100) / 100,
        net_amount:      net,
        currency:        'AUD',
      });
    };

    // Revenue (positive)
    addRow(`REV-${yr}-${mnth+1}-A`, '200', 'Food & Beverage Revenue', 'REVENUE', 'Revenue', Math.round(rev * 0.88));
    addRow(`REV-${yr}-${mnth+1}-B`, '201', 'Catering Revenue',        'REVENUE', 'Revenue', Math.round(rev * 0.12));

    // COGS ~32% of revenue (negative)
    addRow(`COGS-${yr}-${mnth+1}-F`, '300', 'Cost of Sales – Food', 'EXPENSE', 'Cost of Sales', -Math.round(rev * 0.22));
    addRow(`COGS-${yr}-${mnth+1}-B`, '301', 'Cost of Sales – Bev',  'EXPENSE', 'Cost of Sales', -Math.round(rev * 0.10));

    // Labour ~32%
    addRow(`LAB-${yr}-${mnth+1}-W`, '400', 'Wages & Salaries', 'EXPENSE', 'Labour', -Math.round(rev * 0.26), 'Payroll AUS');
    addRow(`LAB-${yr}-${mnth+1}-C`, '401', 'Casual Labour',    'EXPENSE', 'Labour', -Math.round(rev * 0.06), 'Workpac Staffing');

    // Occupancy ~12%
    addRow(`OCC-${yr}-${mnth+1}-R`, '450', 'Rent & Outgoings', 'EXPENSE', 'Occupancy', -Math.round(rev * 0.10), 'GPT Property Group');
    addRow(`OCC-${yr}-${mnth+1}-U`, '451', 'Utilities',        'EXPENSE', 'Occupancy', -Math.round(rev * 0.025), 'AGL Energy');

    // Marketing ~3%
    addRow(`MKT-${yr}-${mnth+1}`, '500', 'Marketing & Advertising', 'EXPENSE', 'Marketing', -Math.round(rev * 0.03), 'Meta Ads');

    // Operations ~4%
    addRow(`OPS-${yr}-${mnth+1}-R`, '600', 'Repairs & Maintenance',  'EXPENSE', 'Operations', -Math.round(rev * 0.02), 'Local Repairs Co');
    addRow(`OPS-${yr}-${mnth+1}-S`, '601', 'Supplies & Consumables', 'EXPENSE', 'Operations', -Math.round(rev * 0.02), 'Bidfood Australia');

    // Admin ~2%
    addRow(`ADM-${yr}-${mnth+1}-A`, '700', 'Accounting & Legal', 'EXPENSE', 'Admin', -Math.round(rev * 0.01), 'Deloitte Accounting');
    addRow(`ADM-${yr}-${mnth+1}-I`, '701', 'Insurance',          'EXPENSE', 'Admin', -Math.round(rev * 0.008), 'QBE Insurance');

    // Depreciation ~1.5%
    addRow(`DEP-${yr}-${mnth+1}`, '800', 'Depreciation', 'EXPENSE', 'Depreciation', -Math.round(rev * 0.015));
  }

  // Batch insert transactions
  await prisma.xeroTransaction.createMany({ data: txnRows, skipDuplicates: true });

  // ── 4. Bank account ──────────────────────────────────────────────────────
  const bank = await prisma.xeroBankAccount.create({
    data: {
      connection_id:   conn.id,
      account_name:    'NAB Business Account',
      account_number:  '062-000-12345678',
      bsb:             '062-000',
      opening_balance: 45000,
      opening_date:    new Date(now.getFullYear() - 3, now.getMonth(), 1),
      current_balance: 82500,
    },
  });

  // ── 5. Balance sheet snapshots (quarterly for 3 years) ──────────────────
  const bsRows = [];
  for (let q = 11; q >= 0; q--) {
    const d         = new Date(now.getFullYear(), now.getMonth() - q * 3, 1);
    const asAt      = new Date(d.getFullYear(), d.getMonth() + 2, 28); // end of quarter
    const scale     = 1 + (11 - q) * 0.025;
    const bsLines   = [
      { code: 'BA01', name: 'NAB Business Account',  type: 'BANK',           sub_type: 'CurrentAssets',   balance: Math.round(82500 * scale * 0.7) },
      { code: 'AR01', name: 'Accounts Receivable',   type: 'CURRENT',        sub_type: 'CurrentAssets',   balance: Math.round(18000 * scale) },
      { code: 'INV1', name: 'Inventory',             type: 'CURRENT',        sub_type: 'CurrentAssets',   balance: Math.round(12000 * scale) },
      { code: 'FA01', name: 'Kitchen Equipment',     type: 'FIXED',          sub_type: 'NonCurrentAssets',balance: Math.round(120000 - q * 3500) },
      { code: 'FA02', name: 'Fit-out & Leasehold',   type: 'FIXED',          sub_type: 'NonCurrentAssets',balance: Math.round(85000 - q * 2000) },
      { code: 'AP01', name: 'Accounts Payable',      type: 'CURRENT',        sub_type: 'CurrentLiabilities', balance: -Math.round(22000 * scale * 0.6) },
      { code: 'GST1', name: 'GST Payable',           type: 'CURRENT',        sub_type: 'CurrentLiabilities', balance: -Math.round(8500 * scale) },
      { code: 'LN01', name: 'Bank Loan',             type: 'NON_CURRENT',    sub_type: 'NonCurrentLiabilities', balance: -Math.round(95000 - q * 2200) },
      { code: 'EQ01', name: 'Retained Earnings',     type: 'EQUITY',         sub_type: 'Equity',          balance: Math.round(55000 * scale) },
      { code: 'EQ02', name: 'Share Capital',         type: 'EQUITY',         sub_type: 'Equity',          balance: 50000 },
    ];
    bsRows.push(...bsLines.map(l => ({ ...l, connection_id: conn.id, as_at_date: asAt })));
  }
  await prisma.xeroBalanceSheetLine.createMany({ data: bsRows });

  // ── 6. Invoices (last 12 months) ─────────────────────────────────────────
  const invRows = [];
  const invoiceContacts = ['GPT Property Group', 'AGL Energy', 'Bidfood Australia', 'Workpac Staffing', 'QBE Insurance'];
  let invNum = 1001;
  for (let mo = 11; mo >= 0; mo--) {
    const d       = new Date(now.getFullYear(), now.getMonth() - mo, 10);
    const contact = invoiceContacts[mo % invoiceContacts.length];
    const total   = Math.round((8000 + Math.random() * 12000) * 100) / 100;
    const paid    = mo > 1 ? total : mo === 1 ? Math.round(total * 0.5 * 100) / 100 : 0;
    invRows.push({
      connection_id:  conn.id,
      invoice_number: `INV-${invNum++}`,
      contact,
      type:           'ACCPAY',
      status:         mo > 1 ? 'PAID' : mo === 1 ? 'AUTHORISED' : 'DRAFT',
      date:           d,
      due_date:       new Date(d.getFullYear(), d.getMonth(), d.getDate() + 30),
      total,
      amount_paid:    paid,
      amount_due:     Math.round((total - paid) * 100) / 100,
      currency:       'AUD',
    });
  }
  await prisma.xeroInvoice.createMany({ data: invRows });

  // ── 7. BAS Returns (last 12 quarters) ────────────────────────────────────
  const basRows = [];
  for (let q = 11; q >= 0; q--) {
    const qEnd  = new Date(now.getFullYear(), now.getMonth() - q * 3, 1);
    const yr    = qEnd.getFullYear();
    const qNum  = Math.floor(qEnd.getMonth() / 3) + 1;
    const qS    = new Date(yr, (qNum - 1) * 3, 1);
    const qE    = new Date(yr, qNum * 3, 0);
    const gstC  = Math.round(baseRev * 3 * 0.1 * (1 + q * 0.01));
    const gstP  = Math.round(gstC * 0.35);
    basRows.push({
      connection_id: conn.id,
      quarter:       qNum,
      year:          yr,
      period_start:  qS,
      period_end:    qE,
      gst_collected: gstC,
      gst_paid:      gstP,
      net_gst:       gstC - gstP,
      payg_withheld: Math.round(baseRev * 3 * 0.26 * 0.19),
      total_payable: Math.round((gstC - gstP) + baseRev * 3 * 0.26 * 0.19),
      status:        q > 0 ? 'LODGED' : 'PENDING',
      lodged_date:   q > 0 ? new Date(qE.getFullYear(), qE.getMonth() + 1, 28) : null,
      due_date:      new Date(qE.getFullYear(), qE.getMonth() + 1, 28),
    });
  }
  await prisma.xeroBASReturn.createMany({ data: basRows, skipDuplicates: true });

  // ── 8. Contacts ───────────────────────────────────────────────────────────
  const contactRows = [
    { name: 'Bidfood Australia',    contact_type: 'SUPPLIER', abn: '31 000 070 480', city: 'Melbourne', state: 'VIC', total_spend: 285000, transaction_count: 36 },
    { name: 'GPT Property Group',   contact_type: 'SUPPLIER', abn: '58 071 467 667', city: 'Sydney',    state: 'NSW', total_spend: 432000, transaction_count: 36 },
    { name: 'AGL Energy',           contact_type: 'SUPPLIER', abn: '74 115 061 375', city: 'Melbourne', state: 'VIC', total_spend: 86400,  transaction_count: 36 },
    { name: 'Workpac Staffing',     contact_type: 'SUPPLIER', abn: '67 117 688 831', city: 'Brisbane',  state: 'QLD', total_spend: 194400, transaction_count: 36 },
    { name: 'Meta Ads',             contact_type: 'SUPPLIER', abn: null,             city: 'Menlo Park', state: null, total_spend: 97200,  transaction_count: 36 },
    { name: 'QBE Insurance',        contact_type: 'SUPPLIER', abn: '28 008 485 014', city: 'Sydney',    state: 'NSW', total_spend: 34560,  transaction_count: 12 },
    { name: 'Deloitte Accounting',  contact_type: 'SUPPLIER', abn: '74 490 121 060', city: 'Melbourne', state: 'VIC', total_spend: 43200,  transaction_count: 12 },
    { name: 'Catering Corp AU',     contact_type: 'CUSTOMER', abn: '12 345 678 901', city: 'Melbourne', state: 'VIC', total_revenue: 145000, transaction_count: 18 },
  ];
  await prisma.xeroContact.createMany({
    data: contactRows.map(c => ({ ...c, connection_id: conn.id })),
    skipDuplicates: true,
  });

  // ── 9. Tracking (Dine-In vs Takeaway) ────────────────────────────────────
  const trackCat = await prisma.xeroTrackingCategory.create({
    data: { connection_id: conn.id, name: 'Revenue Stream' },
  });
  const optDineIn   = await prisma.xeroTrackingOption.create({ data: { category_id: trackCat.id, name: 'Dine-In' } });
  const optTakeaway = await prisma.xeroTrackingOption.create({ data: { category_id: trackCat.id, name: 'Takeaway' } });

  const trackRows = [];
  for (let mo = 35; mo >= 0; mo--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - mo, 1);
    const rev = Math.round(baseRev * seasonal[d.getMonth()] * (1 + (35 - mo) * 0.004));
    trackRows.push(
      { connection_id: conn.id, option_id: optDineIn.id,   year: d.getFullYear(), month: d.getMonth() + 1, revenue: Math.round(rev * 0.68), cost: Math.round(rev * 0.68 * 0.32), transaction_count: Math.round(rev / 45) },
      { connection_id: conn.id, option_id: optTakeaway.id, year: d.getFullYear(), month: d.getMonth() + 1, revenue: Math.round(rev * 0.32), cost: Math.round(rev * 0.32 * 0.28), transaction_count: Math.round(rev / 25) },
    );
  }
  await prisma.xeroTrackingSummary.createMany({ data: trackRows });

  return { skipped: false, connection_id: conn.id, transactions: txnRows.length };
}

/**
 * Removes all demo data for an outlet (so it can be re-seeded).
 */
async function clearDemoData(outletId) {
  const prisma = getDbClient();
  const conn = await prisma.xeroConnection.findFirst({
    where: { outlet_id: outletId, is_deleted: false },
  });
  if (!conn) return;
  // Hard-delete all child rows then the connection
  await prisma.xeroTrackingSummary.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroTrackingOption.deleteMany({ where: { category: { connection_id: conn.id } } });
  await prisma.xeroTrackingCategory.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroContact.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroBASReturn.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroInvoice.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroBalanceSheetLine.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroBankAccount.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroTransaction.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroAccount.deleteMany({ where: { connection_id: conn.id } });
  await prisma.xeroConnection.delete({ where: { id: conn.id } });
}

module.exports = {
  getConnection,
  getOverview,
  getProfitLoss,
  getExpenseAnalysis,
  getLabourAnalysis,
  getSeasonalInsights,
  getBankCashFlow,
  getBalanceSheet,
  getInvoiceStatus,
  getBASReturns,
  getContactsAnalysis,
  getTrackingAnalysis,
  getPredictions,
  seedDemoData,
  clearDemoData,
};
