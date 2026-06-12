/**
 * @fileoverview Financial statement computation from a double-entry ledger.
 * Produces trial balance, profit & loss, balance sheet, and ledger views.
 *
 * Sign conventions (normal balances):
 *  - ASSET, EXPENSE  => debit-positive  (balance = debit - credit)
 *  - LIABILITY, EQUITY, REVENUE => credit-positive (balance = credit - debit)
 *
 * @module modules/accounting/accounting.statements.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/** Round a number to 2 decimal places. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Coerce an asOf-style argument into the end of that day (inclusive).
 * @param {string|Date|undefined} value YYYY-MM-DD string, Date, or undefined.
 * @returns {Date}
 */
function endOfDay(value) {
  let d = value ? new Date(value) : new Date();
  // Guard against empty/invalid input (e.g. cleared date filter → '') which
  // would otherwise yield an Invalid Date and crash Prisma serialisation.
  if (Number.isNaN(d.getTime())) d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Coerce a from-style argument into the start of that day (inclusive).
 * @param {string|Date} value YYYY-MM-DD string or Date.
 * @returns {Date}
 */
function startOfDay(value) {
  let d = new Date(value);
  // Guard against empty/invalid input (e.g. cleared date filter → '') which
  // would otherwise yield an Invalid Date and crash Prisma serialisation.
  // Default to the epoch so the lower bound includes all prior history.
  if (Number.isNaN(d.getTime())) d = new Date(0);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a date as YYYY-MM-DD. */
function toDateString(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Compute a trial balance as of a given date.
 * @param {string} outletId
 * @param {string|Date} [asOf] Default today.
 * @returns {Promise<{as_of:string, accounts:Array, totals:{debit:number,credit:number}}>}
 */
async function getTrialBalance(outletId, asOf) {
  const prisma = getDbClient();
  const upper = endOfDay(asOf);

  try {
    const lines = await prisma.journalLine.findMany({
      where: {
        entry: {
          outlet_id: outletId,
          is_deleted: false,
          entry_date: { lte: upper },
        },
      },
      include: { entry: true, account: true },
    });

    const byAccount = new Map();
    for (const line of lines) {
      const acct = line.account;
      if (!acct) continue;
      let bucket = byAccount.get(acct.id);
      if (!bucket) {
        bucket = {
          code: acct.code,
          name: acct.name,
          type: acct.type,
          debit: 0,
          credit: 0,
        };
        byAccount.set(acct.id, bucket);
      }
      bucket.debit += Number(line.debit);
      bucket.credit += Number(line.credit);
    }

    const accounts = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const b of byAccount.values()) {
      const debit = round2(b.debit);
      const credit = round2(b.credit);
      totalDebit += debit;
      totalCredit += credit;
      accounts.push({
        code: b.code,
        name: b.name,
        type: b.type,
        debit,
        credit,
        balance: round2(debit - credit),
      });
    }

    accounts.sort((a, b) => String(a.code).localeCompare(String(b.code)));

    return {
      as_of: toDateString(upper),
      accounts,
      totals: { debit: round2(totalDebit), credit: round2(totalCredit) },
    };
  } catch (err) {
    logger.error('getTrialBalance failed', { outletId, asOf, error: err.message });
    throw err;
  }
}

/**
 * Compute a profit & loss statement for an inclusive period.
 * @param {string} outletId
 * @param {string|Date} from
 * @param {string|Date} to
 * @returns {Promise<object>}
 */
async function getProfitAndLoss(outletId, from, to) {
  const prisma = getDbClient();
  const lower = startOfDay(from);
  const upper = endOfDay(to);

  try {
    const lines = await prisma.journalLine.findMany({
      where: {
        entry: {
          outlet_id: outletId,
          is_deleted: false,
          entry_date: { gte: lower, lte: upper },
        },
        account: { type: { in: ['REVENUE', 'EXPENSE'] } },
      },
      include: { entry: true, account: true },
    });

    const byAccount = new Map();
    for (const line of lines) {
      const acct = line.account;
      if (!acct) continue;
      let bucket = byAccount.get(acct.id);
      if (!bucket) {
        bucket = {
          code: acct.code,
          name: acct.name,
          type: acct.type,
          debit: 0,
          credit: 0,
        };
        byAccount.set(acct.id, bucket);
      }
      bucket.debit += Number(line.debit);
      bucket.credit += Number(line.credit);
    }

    const revenueAccounts = [];
    const expenseAccounts = [];
    let revenueTotal = 0;
    let expenseTotal = 0;
    let cogsTotal = 0;

    for (const b of byAccount.values()) {
      if (b.type === 'REVENUE') {
        const amount = round2(b.credit - b.debit); // credit-positive
        revenueTotal += amount;
        revenueAccounts.push({ code: b.code, name: b.name, amount });
      } else {
        const amount = round2(b.debit - b.credit); // debit-positive
        expenseTotal += amount;
        if (String(b.code) === '300') cogsTotal += amount;
        expenseAccounts.push({ code: b.code, name: b.name, amount });
      }
    }

    revenueAccounts.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    expenseAccounts.sort((a, b) => String(a.code).localeCompare(String(b.code)));

    revenueTotal = round2(revenueTotal);
    expenseTotal = round2(expenseTotal);
    cogsTotal = round2(cogsTotal);

    return {
      from: toDateString(lower),
      to: toDateString(upper),
      revenue: { accounts: revenueAccounts, total: revenueTotal },
      expenses: { accounts: expenseAccounts, total: expenseTotal },
      cogs_total: cogsTotal,
      gross_profit: round2(revenueTotal - cogsTotal),
      net_profit: round2(revenueTotal - expenseTotal),
    };
  } catch (err) {
    logger.error('getProfitAndLoss failed', { outletId, from, to, error: err.message });
    throw err;
  }
}

/**
 * Compute a balance sheet as of a given date, including current earnings.
 * @param {string} outletId
 * @param {string|Date} [asOf] Default today.
 * @returns {Promise<object>}
 */
async function getBalanceSheet(outletId, asOf) {
  const prisma = getDbClient();
  const upper = endOfDay(asOf);

  try {
    const lines = await prisma.journalLine.findMany({
      where: {
        entry: {
          outlet_id: outletId,
          is_deleted: false,
          entry_date: { lte: upper },
        },
      },
      include: { entry: true, account: true },
    });

    const byAccount = new Map();
    let revenueCredit = 0; // accumulate REVENUE (credit - debit)
    let expenseDebit = 0; // accumulate EXPENSE (debit - credit)

    for (const line of lines) {
      const acct = line.account;
      if (!acct) continue;
      const debit = Number(line.debit);
      const credit = Number(line.credit);

      if (acct.type === 'REVENUE') {
        revenueCredit += credit - debit;
        continue;
      }
      if (acct.type === 'EXPENSE') {
        expenseDebit += debit - credit;
        continue;
      }

      // ASSET / LIABILITY / EQUITY
      let bucket = byAccount.get(acct.id);
      if (!bucket) {
        bucket = {
          code: acct.code,
          name: acct.name,
          type: acct.type,
          debit: 0,
          credit: 0,
        };
        byAccount.set(acct.id, bucket);
      }
      bucket.debit += debit;
      bucket.credit += credit;
    }

    const assets = [];
    const liabilities = [];
    const equity = [];
    let assetsTotal = 0;
    let liabilitiesTotal = 0;
    let equityTotal = 0;

    for (const b of byAccount.values()) {
      if (b.type === 'ASSET') {
        const amount = round2(b.debit - b.credit); // debit-positive
        assetsTotal += amount;
        assets.push({ code: b.code, name: b.name, amount });
      } else if (b.type === 'LIABILITY') {
        const amount = round2(b.credit - b.debit); // credit-positive
        liabilitiesTotal += amount;
        liabilities.push({ code: b.code, name: b.name, amount });
      } else {
        // EQUITY
        const amount = round2(b.credit - b.debit); // credit-positive
        equityTotal += amount;
        equity.push({ code: b.code, name: b.name, amount });
      }
    }

    const retainedEarnings = round2(revenueCredit - expenseDebit);
    equityTotal += retainedEarnings;
    equity.push({ code: 'RE', name: 'Current Earnings', amount: retainedEarnings });

    assets.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    liabilities.sort((a, b) => String(a.code).localeCompare(String(b.code)));
    equity.sort((a, b) => String(a.code).localeCompare(String(b.code)));

    assetsTotal = round2(assetsTotal);
    liabilitiesTotal = round2(liabilitiesTotal);
    equityTotal = round2(equityTotal);

    return {
      as_of: toDateString(upper),
      assets: { accounts: assets, total: assetsTotal },
      liabilities: { accounts: liabilities, total: liabilitiesTotal },
      equity: { accounts: equity, total: equityTotal },
      balanced: Math.abs(assetsTotal - (liabilitiesTotal + equityTotal)) < 0.01,
    };
  } catch (err) {
    logger.error('getBalanceSheet failed', { outletId, asOf, error: err.message });
    throw err;
  }
}

/**
 * List recent journal entries with their lines.
 * @param {string} outletId
 * @param {object} [opts]
 * @param {string|Date} [opts.from]
 * @param {string|Date} [opts.to]
 * @param {string} [opts.account_code] Restrict to entries touching this account code.
 * @param {number} [opts.limit=200]
 * @returns {Promise<Array>}
 */
async function getLedger(outletId, opts = {}) {
  const prisma = getDbClient();
  const { from, to, account_code, limit = 200 } = opts;

  try {
    const entryWhere = {
      outlet_id: outletId,
      is_deleted: false,
    };

    if (from || to) {
      entryWhere.entry_date = {};
      if (from) entryWhere.entry_date.gte = startOfDay(from);
      if (to) entryWhere.entry_date.lte = endOfDay(to);
    }

    if (account_code) {
      entryWhere.lines = { some: { account: { code: account_code } } };
    }

    const entries = await prisma.journalEntry.findMany({
      where: entryWhere,
      include: { lines: { include: { account: true } } },
      orderBy: [{ entry_date: 'desc' }, { created_at: 'desc' }],
      take: Number(limit) || 200,
    });

    return entries.map((e) => ({
      id: e.id,
      entry_date: e.entry_date,
      source: e.source,
      reference: e.reference,
      memo: e.memo,
      lines: e.lines.map((l) => ({
        account_code: l.account ? l.account.code : null,
        account_name: l.account ? l.account.name : null,
        debit: round2(Number(l.debit)),
        credit: round2(Number(l.credit)),
        description: l.description,
      })),
    }));
  } catch (err) {
    logger.error('getLedger failed', { outletId, opts, error: err.message });
    throw err;
  }
}

module.exports = { getTrialBalance, getProfitAndLoss, getBalanceSheet, getLedger };
