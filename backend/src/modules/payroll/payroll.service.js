'use strict';

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const posting = require('../accounting/accounting.posting.service');

/**
 * Round to 2 decimal places.
 */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * SIMPLIFIED AU PAYG annual tax on ANNUAL gross.
 * Marginal brackets (2024-25, approximate, no Medicare levy nuance).
 * Clearly approximate — not for compliance use.
 *
 * @param {number} annualGross
 * @returns {number} annual tax
 */
function calcPAYE(annualGross) {
  const g = Number(annualGross) || 0;
  let tax;
  if (g <= 18200) {
    tax = 0;
  } else if (g <= 45000) {
    tax = (g - 18200) * 0.19;
  } else if (g <= 135000) {
    tax = 5092 + (g - 45000) * 0.325;
  } else if (g <= 190000) {
    tax = 34342 + (g - 135000) * 0.37;
  } else {
    tax = 54692 + (g - 190000) * 0.45;
  }
  return round2(tax);
}

/**
 * Compute a single payslip for a period gross.
 * Annualise periodGross by periodsPerYear to find marginal tax, then divide back.
 *
 * @param {number} gross period gross
 * @param {{periodsPerYear?:number, superRate?:number}} opts
 * @returns {{gross:number, paye:number, super_amt:number, net:number}}
 */
function calcPayslip(gross, { periodsPerYear = 52, superRate = 0.115 } = {}) {
  const periodGross = Number(gross) || 0;
  const periods = Number(periodsPerYear) || 52;
  const rate = Number(superRate);
  const effRate = Number.isFinite(rate) ? rate : 0.115;

  const annualGross = periodGross * periods;
  const annualTax = calcPAYE(annualGross);
  const periodTax = periods > 0 ? annualTax / periods : 0;

  const paye = round2(periodTax);
  const super_amt = round2(periodGross * effRate);
  const grossR = round2(periodGross);
  const net = round2(grossR - paye); // super is paid on top, not deducted from net

  return { gross: grossR, paye, super_amt, net };
}

/**
 * Ensure payroll-related chart accounts exist for the outlet.
 *  810 PAYG Withholding Payable (LIABILITY)
 *  811 Superannuation Payable    (LIABILITY)
 *  730 Superannuation Expense    (EXPENSE)
 */
async function ensurePayrollAccounts(outletId) {
  const prisma = getDbClient();
  const accounts = [
    { code: '810', name: 'PAYG Withholding Payable', type: 'LIABILITY' },
    { code: '811', name: 'Superannuation Payable', type: 'LIABILITY' },
    { code: '730', name: 'Superannuation Expense', type: 'EXPENSE' },
  ];

  const results = [];
  for (const acct of accounts) {
    const rec = await prisma.chartAccount.upsert({
      where: { outlet_id_code: { outlet_id: outletId, code: acct.code } },
      update: {},
      create: {
        outlet_id: outletId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
      },
    });
    results.push(rec);
  }
  return results;
}

/**
 * Create a draft pay run with payslips.
 *
 * @param {string} outletId
 * @param {object} params
 * @param {Date|string} params.period_start
 * @param {Date|string} params.period_end
 * @param {Date|string} params.pay_date
 * @param {number} [params.periodsPerYear]
 * @param {number} [params.superRate]
 * @param {Array<{staff_id:string, staff_name:string, gross:number, hours:number}>} params.lines
 * @param {string} params.created_by
 */
async function createPayRun(
  outletId,
  {
    period_start,
    period_end,
    pay_date,
    periodsPerYear = 52,
    superRate = 0.115,
    lines = [],
    created_by,
  } = {}
) {
  const prisma = getDbClient();

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('createPayRun: at least one employee line is required');
  }

  let grossTotal = 0;
  let payeTotal = 0;
  let superTotal = 0;
  let netTotal = 0;

  const payslipData = lines.map((ln) => {
    const slip = calcPayslip(ln.gross, { periodsPerYear, superRate });
    grossTotal += slip.gross;
    payeTotal += slip.paye;
    superTotal += slip.super_amt;
    netTotal += slip.net;
    return {
      outlet_id: outletId,
      staff_id: ln.staff_id,
      staff_name: ln.staff_name,
      gross: slip.gross,
      paye: slip.paye,
      super_amt: slip.super_amt,
      net: slip.net,
      hours: ln.hours != null ? Number(ln.hours) : 0,
    };
  });

  grossTotal = round2(grossTotal);
  payeTotal = round2(payeTotal);
  superTotal = round2(superTotal);
  netTotal = round2(netTotal);

  const payRun = await prisma.payRun.create({
    data: {
      outlet_id: outletId,
      period_start: period_start ? new Date(period_start) : null,
      period_end: period_end ? new Date(period_end) : null,
      pay_date: pay_date ? new Date(pay_date) : null,
      status: 'draft',
      gross_total: grossTotal,
      paye_total: payeTotal,
      super_total: superTotal,
      net_total: netTotal,
      created_by,
      payslips: {
        create: payslipData.map((p) => ({
          outlet_id: p.outlet_id,
          staff_id: p.staff_id,
          staff_name: p.staff_name,
          gross: p.gross,
          paye: p.paye,
          super_amt: p.super_amt,
          net: p.net,
          hours: p.hours,
        })),
      },
    },
    include: { payslips: true },
  });

  logger.info(
    `payroll: created draft pay run ${payRun.id} for outlet ${outletId} (${payslipData.length} payslips, net ${netTotal})`
  );

  return payRun;
}

/**
 * List recent pay runs for an outlet, with payslip counts, newest period first.
 */
async function listPayRuns(outletId) {
  const prisma = getDbClient();
  return prisma.payRun.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { period_start: 'desc' },
    include: { _count: { select: { payslips: true } } },
  });
}

/**
 * Get a single pay run with its payslips.
 */
async function getPayRun(outletId, id) {
  const prisma = getDbClient();
  return prisma.payRun.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
    include: { payslips: true },
  });
}

/**
 * Finalise a pay run: mark finalised, ensure accounts, post a single balanced journal.
 *
 * Journal (entry_date = pay_date):
 *   Dr 400 Wages            gross_total
 *   Dr 730 Super Expense    super_total
 *   Cr 810 PAYG Payable     paye_total
 *   Cr 091 Bank/Net Pay     (gross_total - paye_total)   [net]
 *   Cr 811 Super Payable    super_total
 * debits  = gross + super
 * credits = paye + net + super = gross + super  → balanced
 */
async function finalisePayRun(outletId, id, createdBy) {
  const prisma = getDbClient();

  const payRun = await prisma.payRun.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
    include: { payslips: true },
  });
  if (!payRun) {
    throw new Error(`finalisePayRun: pay run ${id} not found for outlet ${outletId}`);
  }

  if (payRun.status === 'finalised') {
    logger.info(`payroll: pay run ${id} already finalised, skipping posting`);
    return payRun;
  }

  await ensurePayrollAccounts(outletId);

  const grossTotal = Number(payRun.gross_total) || 0;
  const payeTotal = Number(payRun.paye_total) || 0;
  const superTotal = Number(payRun.super_total) || 0;
  const netAmount = round2(grossTotal - payeTotal);

  const lines = [
    { account_code: '400', debit: round2(grossTotal), credit: 0, description: 'Wages' },
    { account_code: '730', debit: round2(superTotal), credit: 0, description: 'Superannuation expense' },
    { account_code: '810', debit: 0, credit: round2(payeTotal), description: 'PAYG withholding payable' },
    { account_code: '091', debit: 0, credit: netAmount, description: 'Net wages paid' },
    { account_code: '811', debit: 0, credit: round2(superTotal), description: 'Superannuation payable' },
  ];

  await posting.postJournal(outletId, {
    entry_date: payRun.pay_date,
    source: 'payroll',
    source_id: id,
    reference: 'Pay run',
    memo: `Payroll for period ${payRun.period_start || ''} - ${payRun.period_end || ''}`,
    created_by: createdBy,
    lines,
  });

  const updated = await prisma.payRun.update({
    where: { id },
    data: { status: 'finalised' },
    include: { payslips: true },
  });

  logger.info(`payroll: finalised pay run ${id} for outlet ${outletId} and posted journal`);

  return updated;
}

/**
 * Build an STP-style export payload.
 * EXPORT ONLY — this is NOT lodged with the ATO.
 */
function buildSTPExport(payRun, payslips) {
  const slips = Array.isArray(payslips) ? payslips : payRun && payRun.payslips ? payRun.payslips : [];

  const employees = slips.map((p) => ({
    name: p.staff_name,
    gross: round2(Number(p.gross) || 0),
    paye: round2(Number(p.paye) || 0),
    super: round2(Number(p.super_amt) || 0),
  }));

  const totals = employees.reduce(
    (acc, e) => {
      acc.gross = round2(acc.gross + e.gross);
      acc.paye = round2(acc.paye + e.paye);
      acc.super = round2(acc.super + e.super);
      acc.net = round2(acc.net + round2(e.gross - e.paye));
      return acc;
    },
    { gross: 0, paye: 0, super: 0, net: 0 }
  );

  return {
    _note: 'STP-style export only — NOT lodged with the ATO',
    payer: {
      outlet_id: payRun ? payRun.outlet_id : null,
    },
    period: {
      period_start: payRun ? payRun.period_start : null,
      period_end: payRun ? payRun.period_end : null,
      pay_date: payRun ? payRun.pay_date : null,
    },
    employees,
    totals,
  };
}

module.exports = {
  calcPAYE,
  calcPayslip,
  ensurePayrollAccounts,
  createPayRun,
  listPayRuns,
  getPayRun,
  finalisePayRun,
  buildSTPExport,
};
