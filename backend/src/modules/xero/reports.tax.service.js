/**
 * @fileoverview Xero analytics — BAS/tax returns, contacts (supplier/customer)
 * analysis, and tracking-category (channel) analysis report builders.
 * Read-only over xeroBASReturn, xeroContact, xeroTrackingCategory.
 * @module modules/xero/reports.tax.service
 */

const { getDbClient } = require('../../config/database');
const { SHORT_MONTH_NAMES, round, getConnection, getDateCutoff } = require('./xero.query');

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

module.exports = { getBASReturns, getContactsAnalysis, getTrackingAnalysis };
