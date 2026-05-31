const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

function signedFromLine(line) {
  return Number(line.debit || 0) - Number(line.credit || 0);
}

async function suggestMatches(outletId, bankAccountId) {
  const prisma = getDbClient();

  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, outlet_id: outletId },
  });
  if (!bankAccount || !bankAccount.gl_account_code) {
    return [];
  }

  const glAccount = await prisma.chartAccount.findFirst({
    where: { outlet_id: outletId, code: bankAccount.gl_account_code },
  });
  if (!glAccount) {
    return [];
  }
  const bankAccountGlId = glAccount.id;

  const statementLines = await prisma.bankStatementLine.findMany({
    where: {
      outlet_id: outletId,
      bank_account_id: bankAccountId,
      reconciled: false,
      is_deleted: false,
    },
  });

  const ledgerLines = await prisma.journalLine.findMany({
    where: {
      account_id: bankAccountGlId,
      entry: { outlet_id: outletId, is_deleted: false },
    },
    include: { entry: true },
  });

  // Exclude journal lines already matched by any reconciled statement line.
  const usedRows = await prisma.bankStatementLine.findMany({
    where: {
      outlet_id: outletId,
      reconciled: true,
      matched_journal_line_id: { not: null },
    },
    select: { matched_journal_line_id: true },
  });
  const usedIds = new Set(usedRows.map((r) => r.matched_journal_line_id));

  const availableLedger = ledgerLines.filter((l) => !usedIds.has(l.id));

  const results = statementLines.map((sl) => {
    const txnTime = new Date(sl.txn_date).getTime();
    const amount = Number(sl.amount);

    const suggestions = availableLedger
      .filter((l) => {
        const ledgerSigned = signedFromLine(l);
        if (Math.abs(ledgerSigned - amount) > 0.01) return false;
        const entryTime = new Date(l.entry.entry_date).getTime();
        return Math.abs(entryTime - txnTime) <= 5 * DAY_MS;
      })
      .map((l) => ({
        journal_line_id: l.id,
        entry_date: l.entry.entry_date,
        amount: signedFromLine(l),
        reference: l.entry.reference,
        source: l.entry.source,
      }));

    return {
      statement_line: {
        id: sl.id,
        txn_date: sl.txn_date,
        description: sl.description,
        amount: Number(sl.amount),
      },
      suggestions,
    };
  });

  return results;
}

async function reconcile(outletId, statementLineId, journalLineId) {
  const prisma = getDbClient();

  const line = await prisma.bankStatementLine.findFirst({
    where: { id: statementLineId, outlet_id: outletId },
  });
  if (!line) {
    throw new Error('Statement line not found for outlet');
  }

  const updated = await prisma.bankStatementLine.update({
    where: { id: statementLineId },
    data: { reconciled: true, matched_journal_line_id: journalLineId },
    select: { id: true, reconciled: true },
  });

  logger.info(
    `Reconciled statement line ${statementLineId} to journal line ${journalLineId} (outlet ${outletId})`
  );
  return updated;
}

async function unreconcile(outletId, statementLineId) {
  const prisma = getDbClient();

  const line = await prisma.bankStatementLine.findFirst({
    where: { id: statementLineId, outlet_id: outletId },
  });
  if (!line) {
    throw new Error('Statement line not found for outlet');
  }

  const updated = await prisma.bankStatementLine.update({
    where: { id: statementLineId },
    data: { reconciled: false, matched_journal_line_id: null },
    select: { id: true, reconciled: true },
  });

  logger.info(
    `Unreconciled statement line ${statementLineId} (outlet ${outletId})`
  );
  return updated;
}

async function autoReconcile(outletId, bankAccountId) {
  const matches = await suggestMatches(outletId, bankAccountId);

  let reconciled = 0;
  for (const m of matches) {
    if (m.suggestions.length === 1) {
      await reconcile(outletId, m.statement_line.id, m.suggestions[0].journal_line_id);
      reconciled += 1;
    }
  }

  return { reconciled };
}

module.exports = { suggestMatches, reconcile, unreconcile, autoReconcile };
