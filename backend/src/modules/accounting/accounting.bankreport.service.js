const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Build a bank reconciliation summary comparing the bank statement balance
 * against the general-ledger balance for a given bank account.
 */
async function getReconciliationSummary(outletId, bankAccountId) {
  const prisma = getDbClient();

  // 1. Load the bank account.
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, outlet_id: outletId },
  });
  if (!bankAccount) throw new Error('Bank account not found');

  const opening = Number(bankAccount.opening_balance);

  // 2. Statement balance = opening + sum(amount) over non-deleted lines.
  const statementLines = await prisma.bankStatementLine.findMany({
    where: {
      outlet_id: outletId,
      bank_account_id: bankAccountId,
      is_deleted: false,
    },
  });
  const statementSum = statementLines.reduce(
    (acc, line) => acc + Number(line.amount),
    0
  );
  const statement_balance = round2(opening + statementSum);

  // 3. Resolve gl_account_code -> chartAccount.id; compute ledger balance.
  let ledger_balance = opening;
  const chartAccount = await prisma.chartAccount.findFirst({
    where: { outlet_id: outletId, code: bankAccount.gl_account_code },
  });

  let ledgerLines = [];
  if (chartAccount) {
    ledgerLines = await prisma.journalLine.findMany({
      where: {
        account_id: chartAccount.id,
        entry: { outlet_id: outletId, is_deleted: false },
      },
    });
    const ledgerSum = ledgerLines.reduce(
      (acc, line) => acc + (Number(line.debit) - Number(line.credit)),
      0
    );
    ledger_balance = opening + ledgerSum;
  }
  ledger_balance = round2(ledger_balance);

  // 4. Difference.
  const difference = round2(statement_balance - ledger_balance);

  // 5. Match counts.
  const matched_count = statementLines.filter((l) => l.reconciled === true).length;
  const unmatched_statement_count = statementLines.filter(
    (l) => l.reconciled === false
  ).length;

  const matchedJournalLineIds = new Set(
    statementLines
      .filter((l) => l.reconciled === true && l.matched_journal_line_id != null)
      .map((l) => l.matched_journal_line_id)
  );
  const unmatched_ledger_count = ledgerLines.filter(
    (l) => !matchedJournalLineIds.has(l.id)
  ).length;

  logger.info(
    `Bank reconciliation summary for account ${bankAccountId} (outlet ${outletId}): difference ${difference}`
  );

  return {
    bank_account_id: bankAccountId,
    statement_balance,
    ledger_balance,
    difference,
    reconciled: Math.abs(difference) < 0.01,
    matched_count,
    unmatched_statement_count,
    unmatched_ledger_count,
  };
}

module.exports = { getReconciliationSummary };
