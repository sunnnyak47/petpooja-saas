/**
 * @fileoverview Xero analytics — overview, profit & loss, and expense analysis
 * report builders. Read-only over the xeroTransaction table.
 * @module modules/xero/reports.pnl.service
 */

const { getDbClient } = require('../../config/database');
const { SHORT_MONTH_NAMES, round, getConnection, buildWhere } = require('./xero.query');

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

module.exports = { getOverview, getProfitLoss, getExpenseAnalysis };
