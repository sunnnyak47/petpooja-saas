const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const posting = require('./accounting.posting.service');

const VALID_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

/**
 * List all non-deleted chart accounts for an outlet, ordered by code asc.
 */
async function listAccounts(outletId) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');

  return prisma.chartAccount.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { code: 'asc' },
  });
}

/**
 * Create a new chart account for an outlet.
 */
async function createAccount(outletId, { code, name, type, subtype, gst } = {}) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');
  if (!code) throw new Error('Account code is required');
  if (!name) throw new Error('Account name is required');
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Account type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const existing = await prisma.chartAccount.findFirst({
    where: { outlet_id: outletId, code, is_active: true, is_deleted: false },
  });
  if (existing) throw new Error('Account code already exists');

  const account = await prisma.chartAccount.create({
    data: {
      outlet_id: outletId,
      code,
      name,
      type,
      subtype: subtype ?? null,
      gst: gst === true,
      is_active: true,
      is_deleted: false,
    },
  });

  logger.info(`Chart account created: ${code} (${type}) for outlet ${outletId}`);
  return account;
}

/**
 * Update an existing chart account. The code cannot be changed.
 */
async function updateAccount(outletId, id, patch = {}) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');
  if (!id) throw new Error('Account id is required');

  const account = await prisma.chartAccount.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!account) throw new Error('Account not found');

  const data = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.subtype !== undefined) data.subtype = patch.subtype;
  if (patch.gst !== undefined) data.gst = patch.gst === true;
  if (patch.is_active !== undefined) data.is_active = patch.is_active === true;
  if (patch.type !== undefined) {
    if (!VALID_TYPES.includes(patch.type)) {
      throw new Error(`Account type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    data.type = patch.type;
  }
  // Note: patch.code is intentionally ignored — codes are immutable.

  return prisma.chartAccount.update({ where: { id }, data });
}

/**
 * Deactivate a chart account (soft). Never hard-deletes, so historical
 * journal lines retain their account reference.
 */
async function deactivateAccount(outletId, id) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');
  if (!id) throw new Error('Account id is required');

  const account = await prisma.chartAccount.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!account) throw new Error('Account not found');

  await prisma.chartAccount.update({
    where: { id },
    data: { is_active: false },
  });

  logger.info(`Chart account deactivated: ${account.code} for outlet ${outletId}`);
  return { id, is_active: false };
}

/**
 * Post a manual balanced journal entry through the posting service.
 */
async function postManualJournal(outletId, { entry_date, memo, lines, created_by } = {}) {
  const prisma = getDbClient(); // eslint-disable-line no-unused-vars
  if (!outletId) throw new Error('outletId is required');
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('A manual journal requires at least 2 lines');
  }

  lines.forEach((line, idx) => {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit < 0 || credit < 0) {
      throw new Error(`Line ${idx + 1}: debit and credit must not be negative`);
    }
    const hasDebit = debit > 0;
    const hasCredit = credit > 0;
    if (hasDebit && hasCredit) {
      throw new Error(`Line ${idx + 1}: a line cannot have both a debit and a credit`);
    }
    if (!hasDebit && !hasCredit) {
      throw new Error(`Line ${idx + 1}: a line must have a positive debit or credit`);
    }
  });

  return posting.postJournal(outletId, {
    entry_date,
    source: 'manual',
    source_id: null,
    reference: 'Manual journal',
    memo,
    created_by,
    lines,
  });
}

module.exports = { listAccounts, createAccount, updateAccount, deactivateAccount, postManualJournal };
