/**
 * @fileoverview Budget management and budget-vs-actual reporting.
 * Budgets hold per-account target amounts for a financial year; actuals are
 * sourced from the profit & loss statement for a given period.
 *
 * @module modules/accounting/accounting.budget.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const stmts = require('./accounting.statements.service');

/** Round a number to 2 decimal places. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * List non-deleted budgets for an outlet, newest financial year first.
 * @param {string} outletId
 * @returns {Promise<Array<{id,name,fy_year,created_at,line_count:number}>>}
 */
async function listBudgets(outletId) {
  const prisma = getDbClient();
  try {
    const budgets = await prisma.budget.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      orderBy: { fy_year: 'desc' },
      include: { _count: { select: { lines: true } } },
    });
    return budgets.map((b) => ({
      id: b.id,
      name: b.name,
      fy_year: b.fy_year,
      created_at: b.created_at,
      line_count: b._count.lines,
    }));
  } catch (err) {
    logger.error('listBudgets failed', { outletId, error: err.message });
    throw err;
  }
}

/**
 * Fetch a single budget with its lines.
 * @param {string} outletId
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getBudget(outletId, id) {
  const prisma = getDbClient();
  try {
    return await prisma.budget.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
      include: { lines: true },
    });
  } catch (err) {
    logger.error('getBudget failed', { outletId, id, error: err.message });
    throw err;
  }
}

/**
 * Create a budget with nested lines.
 * @param {string} outletId
 * @param {{name:string, fy_year:number, lines:Array<{account_code:string, amount:number}>}} data
 * @returns {Promise<Object>}
 */
async function createBudget(outletId, { name, fy_year, lines }) {
  const prisma = getDbClient();
  try {
    return await prisma.budget.create({
      data: {
        outlet_id: outletId,
        name,
        fy_year,
        lines: {
          create: (lines || []).map((l) => ({
            account_code: l.account_code,
            amount: l.amount,
          })),
        },
      },
      include: { lines: true },
    });
  } catch (err) {
    logger.error('createBudget failed', { outletId, name, error: err.message });
    throw err;
  }
}

/**
 * Update a budget's name and (optionally) replace all of its lines.
 * @param {string} outletId
 * @param {string} id
 * @param {{name?:string, lines?:Array<{account_code:string, amount:number}>}} data
 * @returns {Promise<Object>}
 */
async function updateBudget(outletId, id, { name, lines }) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.budget.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
    });
    if (!existing) {
      throw new Error('Budget not found');
    }

    const data = {};
    if (name !== undefined) data.name = name;

    if (lines !== undefined) {
      await prisma.budgetLine.deleteMany({ where: { budget_id: id } });
      data.lines = {
        create: (lines || []).map((l) => ({
          account_code: l.account_code,
          amount: l.amount,
        })),
      };
    }

    return await prisma.budget.update({
      where: { id },
      data,
      include: { lines: true },
    });
  } catch (err) {
    logger.error('updateBudget failed', { outletId, id, error: err.message });
    throw err;
  }
}

/**
 * Soft-delete a budget.
 * @param {string} outletId
 * @param {string} id
 * @returns {Promise<Object>}
 */
async function deleteBudget(outletId, id) {
  const prisma = getDbClient();
  try {
    const existing = await prisma.budget.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
    });
    if (!existing) {
      throw new Error('Budget not found');
    }
    return await prisma.budget.update({
      where: { id },
      data: { is_deleted: true },
    });
  } catch (err) {
    logger.error('deleteBudget failed', { outletId, id, error: err.message });
    throw err;
  }
}

/**
 * Compare budgeted amounts against actuals from the P&L for a period.
 * @param {string} outletId
 * @param {string} id
 * @param {string|Date} from
 * @param {string|Date} to
 * @returns {Promise<{budget_id:string, name:string, fy_year:number, from, to, lines:Array, totals:Object}>}
 */
async function getBudgetVsActual(outletId, id, from, to) {
  const prisma = getDbClient();
  try {
    const budget = await prisma.budget.findFirst({
      where: { id, outlet_id: outletId, is_deleted: false },
      include: { lines: true },
    });
    if (!budget) {
      throw new Error('Budget not found');
    }

    const pnl = await stmts.getProfitAndLoss(outletId, from, to);

    // Merge revenue + expense accounts into a code -> actual amount map.
    const actualMap = {};
    [...(pnl.revenue?.accounts || []), ...(pnl.expenses?.accounts || [])].forEach((a) => {
      actualMap[a.code] = Number(a.amount) || 0;
    });

    // Resolve account names from the chart of accounts.
    const codes = budget.lines.map((l) => l.account_code);
    const accounts = codes.length
      ? await prisma.chartAccount.findMany({ where: { code: { in: codes } } })
      : [];
    const nameMap = {};
    accounts.forEach((a) => {
      nameMap[a.code] = a.name;
    });

    let totalBudget = 0;
    let totalActual = 0;

    const lines = budget.lines.map((line) => {
      const budgetAmt = round2(Number(line.amount) || 0);
      const actualAmt = round2(actualMap[line.account_code] || 0);
      const variance = round2(actualAmt - budgetAmt);
      const variancePct = budgetAmt !== 0 ? round2((variance / budgetAmt) * 100) : null;

      totalBudget += budgetAmt;
      totalActual += actualAmt;

      return {
        account_code: line.account_code,
        account_name: nameMap[line.account_code] || null,
        budget: budgetAmt,
        actual: actualAmt,
        variance,
        variance_pct: variancePct,
      };
    });

    totalBudget = round2(totalBudget);
    totalActual = round2(totalActual);

    return {
      budget_id: budget.id,
      name: budget.name,
      fy_year: budget.fy_year,
      from,
      to,
      lines,
      totals: {
        budget: totalBudget,
        actual: totalActual,
        variance: round2(totalActual - totalBudget),
      },
    };
  } catch (err) {
    logger.error('getBudgetVsActual failed', { outletId, id, error: err.message });
    throw err;
  }
}

module.exports = {
  listBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetVsActual,
};
