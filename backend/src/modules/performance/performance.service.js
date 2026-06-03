'use strict';

/**
 * Performance / Business Health metric engine.
 *
 * Fuses Square module data (from the `square_snapshots` table) with Xero
 * financial data (from Xero Prisma models) into a single "Business Health"
 * analytics payload for one outlet.
 *
 * @module modules/performance/performance.service
 */

const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const squarePull = require('./square.pull.service');
const square = require('../integrations/square.service');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Round a value to 2 decimal places. Non-finite inputs become 0.
 * @param {*} n
 * @returns {number}
 */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Round a value to 1 decimal place (used for percentages). Non-finite -> 0.
 * @param {*} n
 * @returns {number}
 */
function round1(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 10) / 10;
}

/**
 * Safe division. Returns null when the denominator is 0 / non-finite.
 * @param {*} a
 * @param {*} b
 * @returns {number|null}
 */
function div(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(y) || y === 0) return null;
  if (!Number.isFinite(x)) return null;
  return x / y;
}

/**
 * Coerce a possibly-string value to a finite Number (0 fallback).
 * @param {*} v
 * @returns {number}
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format a 'YYYY-MM-DD' string from a Date.
 * @param {Date} d
 * @returns {string}
 */
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Guard JSONB values that may arrive as a string instead of an object.
 * @param {*} x
 * @returns {object}
 */
function parseJsonb(x) {
  if (x == null) return {};
  if (typeof x === 'string') {
    try {
      return JSON.parse(x) || {};
    } catch (_e) {
      return {};
    }
  }
  if (typeof x === 'object') return x;
  return {};
}

/**
 * Format a number as currency-ish string for headlines (no symbol).
 * @param {number} n
 * @returns {string}
 */
function money(n) {
  const v = round2(n);
  return v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* -------------------------------------------------------------------------- */
/* Square aggregation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Read & aggregate square_snapshots for an outlet over a date range.
 * @param {string} outletId
 * @param {string} fromStr  'YYYY-MM-DD'
 * @param {string} toStr    'YYYY-MM-DD'
 * @returns {Promise<object>} aggregated square data (+ raw rows for trends)
 */
async function aggregateSquare(outletId, fromStr, toStr) {
  const empty = {
    has_data: false,
    environment: null,
    currency: null,
    gross_sales: 0,
    fees: 0,
    refunds: 0,
    net_sales: 0,
    tips: 0,
    payout_total: 0,
    payments_count: 0,
    disputes_count: 0,
    disputes_amount: 0,
    labor_hours: 0,
    labor_cost: 0,
    customers_count: 0,
    loyalty_members: 0,
    giftcard_outstanding: 0,
    payment_mix: [],
    top_items: [],
    hourly: [],
    modules: {},
    rows: [],
  };

  let rows = [];
  try {
    rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM square_snapshots WHERE outlet_id=$1 AND snapshot_date BETWEEN $2 AND $3 ORDER BY snapshot_date ASC',
      outletId,
      fromStr,
      toStr
    );
  } catch (err) {
    logger.warn(`[performance] square_snapshots read failed for outlet ${outletId}: ${err.message}`);
    return empty;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return empty;
  }

  const agg = { ...empty, has_data: true, rows: [] };

  const mixByBrand = new Map();
  const itemsByName = new Map();
  const hourlyByHour = new Map();
  const modules = {};

  for (const r of rows) {
    if (!agg.environment && r.environment) agg.environment = r.environment;

    agg.gross_sales += num(r.gross_sales);
    agg.fees += num(r.fees);
    agg.refunds += num(r.refunds);
    agg.net_sales += num(r.net_sales);
    agg.tips += num(r.tips);
    agg.payout_total += num(r.payout_total);
    agg.payments_count += num(r.payments_count);
    agg.disputes_count += num(r.disputes_count);
    agg.disputes_amount += num(r.disputes_amount);
    agg.labor_hours += num(r.labor_hours);
    agg.labor_cost += num(r.labor_cost);

    // current-total fields => MAX across rows
    agg.customers_count = Math.max(agg.customers_count, num(r.customers_count));
    agg.loyalty_members = Math.max(agg.loyalty_members, num(r.loyalty_members));
    agg.giftcard_outstanding = Math.max(agg.giftcard_outstanding, num(r.giftcard_outstanding));

    const data = parseJsonb(r.data);

    if (!agg.currency && data.currency) agg.currency = data.currency;

    // payment_mix
    if (Array.isArray(data.payment_mix)) {
      for (const pm of data.payment_mix) {
        if (!pm || pm.brand == null) continue;
        const brand = String(pm.brand);
        mixByBrand.set(brand, num(mixByBrand.get(brand)) + num(pm.amount));
      }
    }

    // top_items
    if (Array.isArray(data.top_items)) {
      for (const it of data.top_items) {
        if (!it || it.name == null) continue;
        const name = String(it.name);
        const prev = itemsByName.get(name) || { name, qty: 0, gross: 0 };
        prev.qty += num(it.qty);
        prev.gross += num(it.gross);
        itemsByName.set(name, prev);
      }
    }

    // hourly
    if (Array.isArray(data.hourly)) {
      for (const h of data.hourly) {
        if (!h || h.hour == null) continue;
        const hour = num(h.hour);
        hourlyByHour.set(hour, num(hourlyByHour.get(hour)) + num(h.amount));
      }
    }

    // modules availability = OR across rows
    if (data.modules && typeof data.modules === 'object') {
      for (const [k, v] of Object.entries(data.modules)) {
        modules[k] = Boolean(modules[k]) || Boolean(v);
      }
    }

    agg.rows.push({
      date: typeof r.snapshot_date === 'string' ? r.snapshot_date.slice(0, 10) : toDateStr(new Date(r.snapshot_date)),
      gross_sales: num(r.gross_sales),
      net_sales: num(r.net_sales),
    });
  }

  // finalize payment_mix (pct of gross filled by caller-side using gross_sales)
  agg.payment_mix = Array.from(mixByBrand.entries()).map(([brand, amount]) => ({
    brand,
    amount: round2(amount),
    pct: 0,
  }));

  // finalize top_items: top 10 by gross
  agg.top_items = Array.from(itemsByName.values())
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 10)
    .map((it) => ({ name: it.name, qty: round2(it.qty), gross: round2(it.gross) }));

  // finalize hourly: 0..23
  agg.hourly = Array.from(hourlyByHour.entries())
    .map(([hour, amount]) => ({ hour, amount: round2(amount) }))
    .filter((h) => h.hour >= 0 && h.hour <= 23)
    .sort((a, b) => a.hour - b.hour);

  agg.modules = modules;

  return agg;
}

/* -------------------------------------------------------------------------- */
/* Xero read                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Read Xero financials for an outlet over a range. Returns null on any error
 * or when Xero is not connected.
 * @param {string} outletId
 * @param {Date} fromDate
 * @param {Date} toDate
 * @returns {Promise<object|null>}
 */
async function readXero(outletId, fromDate, toDate) {
  try {
    const conn = await prisma.xeroConnection.findFirst({ where: { outlet_id: outletId } });
    if (!conn) return null;

    const connectionId = conn.id;

    const txns = await prisma.xeroTransaction.findMany({
      where: { connection_id: connectionId, date: { gte: fromDate, lte: toDate } },
    });

    let revenue = 0;
    let expenses = 0;
    let cogs = 0;
    let gstCollected = 0;

    const cogsRe = /cost of goods|cogs|purchase/i;

    for (const t of txns) {
      const netAbs = Math.abs(num(t.net_amount));
      const type = String(t.account_type || '').toUpperCase();
      if (type === 'REVENUE') {
        revenue += netAbs;
        gstCollected += num(t.gst);
      } else if (type === 'EXPENSE') {
        expenses += netAbs;
        const label = `${t.account_name || ''} ${t.category || ''}`;
        if (cogsRe.test(label)) cogs += netAbs;
      }
    }

    // bills due (ACCPAY invoices not yet paid)
    let billsDue = 0;
    try {
      const invoices = await prisma.xeroInvoice.findMany({
        where: { connection_id: connectionId, type: 'ACCPAY' },
      });
      for (const inv of invoices) {
        if (String(inv.status || '').toUpperCase() !== 'PAID') {
          billsDue += num(inv.amount_due);
        }
      }
    } catch (e) {
      logger.warn(`[performance] xero invoices read failed: ${e.message}`);
    }

    // cash from latest balance sheet date
    let cash = 0;
    try {
      const bsLines = await prisma.xeroBalanceSheetLine.findMany({ where: { connection_id: connectionId } });
      if (Array.isArray(bsLines) && bsLines.length) {
        let latest = null;
        for (const l of bsLines) {
          const d = l.as_at_date ? new Date(l.as_at_date).getTime() : null;
          if (d != null && (latest == null || d > latest)) latest = d;
        }
        const cashRe = /bank|cash/i;
        for (const l of bsLines) {
          const d = l.as_at_date ? new Date(l.as_at_date).getTime() : null;
          if (d === latest && cashRe.test(String(l.account_name || ''))) {
            cash += num(l.balance);
          }
        }
      }
    } catch (e) {
      logger.warn(`[performance] xero balance sheet read failed: ${e.message}`);
    }

    return {
      connected: Boolean(conn.is_connected),
      currency: conn.currency || null,
      revenue: round2(revenue),
      expenses: round2(expenses),
      cogs: round2(cogs),
      net_profit: round2(revenue - expenses),
      bills_due: round2(billsDue),
      cash: round2(cash),
      gst_estimate: round2(gstCollected),
    };
  } catch (err) {
    logger.warn(`[performance] xero read failed for outlet ${outletId}: ${err.message}`);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build the combined Business Health analytics payload for an outlet.
 * Never throws — always resolves to a valid object.
 *
 * @param {string} outletId
 * @param {{ from?: string, to?: string }} [range]
 * @returns {Promise<object>}
 */
async function getBusinessHealth(outletId, { from, to } = {}) {
  // ---- Resolve date range -------------------------------------------------
  const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const fromDate = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);

  const fromStr = from || toDateStr(fromDate);
  const toStr = to || toDateStr(toDate);
  const days = Math.max(
    1,
    Math.round((new Date(`${toStr}T00:00:00Z`).getTime() - new Date(`${fromStr}T00:00:00Z`).getTime()) / 86400000) + 1
  );

  // ---- Connection status (defensive) -------------------------------------
  let squareConnected = false;
  try {
    const status = await square.getConnectionStatus(outletId);
    squareConnected = Boolean(status && status.connected);
  } catch (e) {
    logger.warn(`[performance] square status check failed: ${e.message}`);
  }

  // ---- Aggregate Square ---------------------------------------------------
  const sq = await aggregateSquare(outletId, fromStr, toStr);

  // ---- Read Xero ----------------------------------------------------------
  const xeroRaw = await readXero(outletId, fromDate, toDate);
  const xeroConnected = Boolean(xeroRaw && xeroRaw.connected);

  const currency = (xeroRaw && xeroRaw.currency) || sq.currency || 'AUD';

  // ---- Square derived metrics --------------------------------------------
  const grossSales = round2(sq.gross_sales);
  const fees = round2(sq.fees);
  const refunds = round2(sq.refunds);
  const netSales = round2(sq.net_sales);
  const tips = round2(sq.tips);
  const payoutTotal = round2(sq.payout_total);
  const paymentsCount = Math.round(sq.payments_count);
  const laborHours = round2(sq.labor_hours);
  const laborCost = round2(sq.labor_cost);

  const avgTicket = round2(div(grossSales, paymentsCount) || 0);
  const laborPctRaw = div(laborCost, grossSales);
  const laborPct = laborPctRaw == null ? null : round1(laborPctRaw * 100);

  // payment_mix pct of gross
  const paymentMix = sq.payment_mix.map((pm) => {
    const pctRaw = div(pm.amount, grossSales);
    return { brand: pm.brand, amount: round2(pm.amount), pct: pctRaw == null ? 0 : round1(pctRaw * 100) };
  });

  // ---- Module availability ------------------------------------------------
  const m = sq.modules || {};
  const moduleFlag = (key, fallback) =>
    Boolean(typeof m[key] === 'boolean' ? m[key] : fallback);

  const modules = {
    payments: moduleFlag('payments', paymentsCount > 0 || grossSales > 0),
    payouts: moduleFlag('payouts', payoutTotal > 0),
    orders: moduleFlag('orders', sq.top_items.length > 0),
    labor: moduleFlag('labor', laborHours > 0 || laborCost > 0),
    customers: moduleFlag('customers', sq.customers_count > 0),
    loyalty: moduleFlag('loyalty', sq.loyalty_members > 0),
    giftcards: moduleFlag('giftcards', sq.giftcard_outstanding > 0),
    refunds: moduleFlag('refunds', refunds > 0),
    disputes: moduleFlag('disputes', sq.disputes_count > 0),
  };

  // ---- Xero block ---------------------------------------------------------
  const xero = xeroRaw
    ? {
        revenue: round2(xeroRaw.revenue),
        expenses: round2(xeroRaw.expenses),
        cogs: round2(xeroRaw.cogs),
        net_profit: round2(xeroRaw.net_profit),
        bills_due: round2(xeroRaw.bills_due),
        cash: round2(xeroRaw.cash),
        gst_estimate: round2(xeroRaw.gst_estimate),
      }
    : null;

  // ---- KPIs ---------------------------------------------------------------
  const trueNetProfit = round2(
    xero ? grossSales - fees - xero.expenses : netSales
  );

  const marginRaw = div(trueNetProfit, grossSales);
  const marginPct = marginRaw == null ? 0 : round1(marginRaw * 100);

  const feeLeakageRaw = div(fees, trueNetProfit);
  const feeLeakagePct = feeLeakageRaw == null ? 0 : round1(feeLeakageRaw * 100);

  const cogs = xero ? num(xero.cogs) : 0;
  const profitPerLaborHourRaw = div(grossSales - fees - cogs, laborHours);
  const profitPerLaborHour = profitPerLaborHourRaw == null ? null : round2(profitPerLaborHourRaw);

  const avgDailyNet = div(netSales, days) || 0;
  const grossSalesForecast = round2(avgDailyNet * days);
  const cashForecast = round2(
    (xero ? num(xero.cash) : 0) +
      grossSalesForecast -
      (xero ? num(xero.bills_due) : 0) -
      (xero ? num(xero.gst_estimate) : 0)
  );

  const breakEvenDaily = xero ? round2(div(xero.expenses, days) || 0) : null;

  const kpis = {
    true_net_profit: trueNetProfit,
    margin_pct: marginPct,
    fee_leakage_pct: feeLeakagePct,
    profit_per_labor_hour: profitPerLaborHour,
    labor_pct: laborPct,
    cash_forecast: cashForecast,
    break_even_daily: breakEvenDaily,
  };

  // ---- Reconciliation -----------------------------------------------------
  let reconciliation = null;
  if (xero) {
    const squarePayouts = payoutTotal;
    // approximate bank deposits as Xero revenue cash receipts
    const xeroBankDeposits = round2(xero.revenue);
    const diff = round2(squarePayouts - xeroBankDeposits);
    const tolerance = Math.max(50, Math.abs(squarePayouts) * 0.01);
    reconciliation = {
      square_payouts: squarePayouts,
      xero_bank_deposits: xeroBankDeposits,
      diff,
      match: Math.abs(diff) < tolerance,
    };
  }

  // ---- Trends -------------------------------------------------------------
  const trends = sq.rows.map((r) => ({
    date: r.date,
    gross_sales: round2(r.gross_sales),
    net_profit: round2(r.net_sales),
  }));

  // ---- Headline -----------------------------------------------------------
  let headline;
  if (!squareConnected && !sq.has_data) {
    headline = 'Connect Square to see combined performance analytics.';
  } else if (squareConnected && !sq.has_data) {
    headline = 'No Square data yet — tap Refresh to pull your latest figures.';
  } else {
    const clauses = [];
    clauses.push(`Profit this period: $${money(trueNetProfit)} (${marginPct}%).`);
    if (feeLeakagePct > 0 && trueNetProfit > 0) {
      clauses.push(`Card fees ate ${feeLeakagePct}% of profit.`);
    }
    if (modules.loyalty && sq.loyalty_members > 0) {
      clauses.push(`Loyalty members: ${Math.round(sq.loyalty_members)}.`);
    }
    if (xero) {
      clauses.push(`Cash projected $${money(cashForecast)} after upcoming bills.`);
    }
    headline = clauses.join(' ');
  }

  // ---- Alerts -------------------------------------------------------------
  const alerts = [];
  if (sq.has_data) {
    if (feeLeakagePct > 6 && trueNetProfit > 0) {
      alerts.push({ level: 'warn', text: `Card fees are ${feeLeakagePct}% of profit — review your processing rates.` });
    }
    if (laborPct != null && laborPct > 32) {
      alerts.push({ level: 'warn', text: `Labor is ${laborPct}% of sales — above the 32% target.` });
    }
    if (marginPct > 18) {
      alerts.push({ level: 'good', text: `Healthy margin of ${marginPct}% this period.` });
    }
    if (reconciliation && !reconciliation.match) {
      alerts.push({ level: 'warn', text: `Square payouts and Xero deposits differ by $${money(reconciliation.diff)} — reconcile your accounts.` });
    }
    if (alerts.length === 0) {
      alerts.push({ level: 'info', text: 'Figures look stable for this period.' });
    }
  } else {
    alerts.push({ level: 'info', text: 'No data available for the selected period.' });
  }

  // ---- Assemble payload ---------------------------------------------------
  return {
    period: { from: fromStr, to: toStr, days },
    currency,
    data_availability: {
      square_connected: squareConnected,
      xero_connected: xeroConnected,
      modules,
    },
    square: {
      gross_sales: grossSales,
      fees,
      refunds,
      net_sales: netSales,
      tips,
      payout_total: payoutTotal,
      payments_count: paymentsCount,
      avg_ticket: avgTicket,
      labor_hours: laborHours,
      labor_cost: laborCost,
      labor_pct: laborPct,
      customers_count: Math.round(sq.customers_count),
      loyalty_members: Math.round(sq.loyalty_members),
      giftcard_outstanding: round2(sq.giftcard_outstanding),
      payment_mix: paymentMix,
      top_items: sq.top_items,
      hourly: sq.hourly,
    },
    xero,
    kpis,
    reconciliation,
    trends,
    headline,
    alerts: alerts.slice(0, 4),
  };
}

/**
 * Trigger a Square pull for the outlet (last 30 days).
 * @param {string} outletId
 * @returns {Promise<object>}
 */
async function refresh(outletId) {
  try {
    const result = await squarePull.pullAll(outletId, { days: 30 });
    return { ok: true, ...result };
  } catch (err) {
    logger.warn(`[performance] refresh failed for outlet ${outletId}: ${err.message}`);
    return { ok: false, message: 'Square is not connected for this outlet' };
  }
}

/**
 * Lightweight status probe for the performance module.
 * @param {string} outletId
 * @returns {Promise<object>}
 */
async function getStatus(outletId) {
  let squareStatus = null;
  let xeroConnected = false;
  let lastSnapshot = null;
  let configured = false;

  try {
    squareStatus = await square.getConnectionStatus(outletId);
  } catch (e) {
    logger.warn(`[performance] getStatus square status failed: ${e.message}`);
  }

  try {
    configured = Boolean(square.isConfigured());
  } catch (_e) {
    configured = false;
  }

  try {
    const conn = await prisma.xeroConnection.findFirst({ where: { outlet_id: outletId } });
    xeroConnected = Boolean(conn && conn.is_connected);
  } catch (e) {
    logger.warn(`[performance] getStatus xero lookup failed: ${e.message}`);
  }

  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT MAX(snapshot_date) AS last_snapshot FROM square_snapshots WHERE outlet_id=$1',
      outletId
    );
    if (Array.isArray(rows) && rows[0] && rows[0].last_snapshot != null) {
      const ls = rows[0].last_snapshot;
      lastSnapshot = typeof ls === 'string' ? ls.slice(0, 10) : toDateStr(new Date(ls));
    }
  } catch (e) {
    logger.warn(`[performance] getStatus snapshot lookup failed: ${e.message}`);
  }

  return {
    square: squareStatus,
    xero_connected: xeroConnected,
    last_snapshot: lastSnapshot,
    configured,
  };
}

module.exports = { getBusinessHealth, refresh, getStatus };
