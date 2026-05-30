/**
 * @fileoverview Xero predictive analytics engine.
 * All predictions are computed from historical xeroTransaction data — no mock
 * values. Extracted from xero.service.js.
 * @module modules/xero/xero.predictions.service
 */

const { getDbClient } = require('../../config/database');
const { SHORT_MONTH_NAMES, round, getConnection } = require('./xero.query');
const { BENCHMARKS, getRecommendation } = require('./predictions.benchmarks');

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

module.exports = { getPredictions, getRecommendation, BENCHMARKS };
