const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const posting = require('./accounting.posting.service');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function importStatement(outletId, bankAccountId, lines) {
  const prisma = getDbClient();

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, outlet_id: outletId },
  });
  if (!bankAccount) {
    throw new Error('Bank account not found');
  }

  const valid = [];
  let skipped = 0;

  for (const l of lines || []) {
    const date = new Date(l.txn_date);
    const amount = Number(l.amount);
    if (Number.isNaN(date.getTime()) || !Number.isFinite(amount)) {
      skipped += 1;
      continue;
    }
    valid.push({
      outlet_id: outletId,
      bank_account_id: bankAccountId,
      txn_date: date,
      description: l.description,
      amount: round2(amount),
      reconciled: false,
    });
  }

  if (valid.length) {
    await prisma.bankStatementLine.createMany({ data: valid });
  }

  logger.info(
    `importStatement: imported ${valid.length}, skipped ${skipped} for outlet ${outletId}`
  );
  return { imported: valid.length, skipped };
}

async function listStatementLines(outletId, { bank_account_id, reconciled, limit = 200 } = {}) {
  const prisma = getDbClient();

  const where = { outlet_id: outletId, is_deleted: false };
  if (bank_account_id) where.bank_account_id = bank_account_id;
  if (typeof reconciled === 'boolean') where.reconciled = reconciled;

  return prisma.bankStatementLine.findMany({
    where,
    orderBy: { txn_date: 'desc' },
    take: limit,
  });
}

async function deleteStatementLine(outletId, id) {
  const prisma = getDbClient();

  const line = await prisma.bankStatementLine.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!line) {
    throw new Error('Bank statement line not found');
  }

  return prisma.bankStatementLine.update({
    where: { id },
    data: { is_deleted: true },
  });
}

async function createAdjustmentJournal(outletId, statementLineId, accountCode, createdBy) {
  const prisma = getDbClient();

  const line = await prisma.bankStatementLine.findFirst({
    where: { id: statementLineId, outlet_id: outletId, is_deleted: false },
  });
  if (!line) {
    throw new Error('Bank statement line not found');
  }
  if (line.reconciled) {
    throw new Error('Bank statement line already reconciled');
  }

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: line.bank_account_id, outlet_id: outletId },
  });
  if (!bankAccount) {
    throw new Error('Bank account not found');
  }

  const bankGL = bankAccount.gl_account_code;
  const amount = Number(line.amount);
  const abs = round2(Math.abs(amount));

  let lines;
  if (amount > 0) {
    lines = [
      { account_code: bankGL, debit: abs, credit: 0, description: line.description },
      { account_code: accountCode, debit: 0, credit: abs, description: line.description },
    ];
  } else {
    lines = [
      { account_code: accountCode, debit: abs, credit: 0, description: line.description },
      { account_code: bankGL, debit: 0, credit: abs, description: line.description },
    ];
  }

  const result = await posting.postJournal(outletId, {
    entry_date: line.txn_date,
    source: 'bank_adjustment',
    source_id: statementLineId,
    reference: 'Bank adjustment',
    memo: line.description,
    created_by: createdBy,
    lines,
  });

  await prisma.bankStatementLine.update({
    where: { id: statementLineId },
    data: { reconciled: true },
  });

  return { success: true, ...result };
}

module.exports = { importStatement, listStatementLines, deleteStatementLine, createAdjustmentJournal };
