const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * List all non-deleted bank accounts for an outlet, ordered by created_at asc.
 */
async function listBankAccounts(outletId) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');

  return prisma.bankAccount.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { created_at: 'asc' },
  });
}

/**
 * Create a new bank account for an outlet.
 */
async function createBankAccount(
  outletId,
  { name, bsb, account_number, gl_account_code, opening_balance } = {}
) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');
  if (!name) throw new Error('name is required');

  const row = await prisma.bankAccount.create({
    data: {
      outlet_id: outletId,
      name,
      bsb: bsb ?? null,
      account_number: account_number ?? null,
      gl_account_code: gl_account_code || '091',
      opening_balance: opening_balance ?? 0,
    },
  });

  logger.info(`Bank account created: ${row.id} for outlet ${outletId}`);
  return row;
}

/**
 * Update an existing bank account for an outlet.
 */
async function updateBankAccount(outletId, id, patch = {}) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');
  if (!id) throw new Error('id is required');

  const existing = await prisma.bankAccount.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!existing) throw new Error('Bank account not found');

  const allowed = [
    'name',
    'bsb',
    'account_number',
    'gl_account_code',
    'opening_balance',
    'is_active',
  ];
  const data = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }

  return prisma.bankAccount.update({
    where: { id },
    data,
  });
}

/**
 * Deactivate (soft-disable) a bank account without deleting it.
 */
async function deactivateBankAccount(outletId, id) {
  const prisma = getDbClient();
  if (!outletId) throw new Error('outletId is required');
  if (!id) throw new Error('id is required');

  const existing = await prisma.bankAccount.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!existing) throw new Error('Bank account not found');

  await prisma.bankAccount.update({
    where: { id },
    data: { is_active: false },
  });

  logger.info(`Bank account deactivated: ${id} for outlet ${outletId}`);
  return { id, is_active: false };
}

module.exports = {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
};
