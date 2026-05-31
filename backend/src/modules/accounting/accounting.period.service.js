/**
 * @fileoverview Accounting period lock service.
 * Manages per-outlet monthly accounting period locks (close/reopen) so that
 * postings can be prevented for finalised periods.
 * @module modules/accounting/accounting.period.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

const PERIOD_RE = /^\d{4}-\d{2}$/;

/**
 * Lists all period locks for an outlet, newest period first.
 * @param {string} outletId - The outlet id.
 * @returns {Promise<Array<object>>} Period lock rows ordered by period desc.
 */
async function listLocks(outletId) {
  if (!outletId) {
    throw new Error('outletId is required');
  }
  const prisma = getDbClient();
  return prisma.accountingPeriodLock.findMany({
    where: { outlet_id: outletId },
    orderBy: { period: 'desc' },
  });
}

/**
 * Locks an accounting period for an outlet. No-op if already locked.
 * @param {string} outletId - The outlet id.
 * @param {string} period - The period in 'YYYY-MM' format.
 * @param {string} [lockedBy] - Identifier of the user locking the period.
 * @param {string} [note] - Optional note.
 * @returns {Promise<object>} The lock row.
 */
async function lockPeriod(outletId, period, lockedBy, note) {
  if (!outletId) {
    throw new Error('outletId is required');
  }
  if (!PERIOD_RE.test(period)) {
    throw new Error('Invalid period, expected YYYY-MM');
  }
  const prisma = getDbClient();
  const lock = await prisma.accountingPeriodLock.upsert({
    where: { outlet_id_period: { outlet_id: outletId, period } },
    update: {},
    create: {
      outlet_id: outletId,
      period,
      locked_by: lockedBy ?? null,
      note: note ?? null,
    },
  });
  logger.info('Accounting period locked', { outletId, period, lockedBy });
  return lock;
}

/**
 * Unlocks (deletes the lock for) an accounting period if present.
 * @param {string} outletId - The outlet id.
 * @param {string} period - The period in 'YYYY-MM' format.
 * @returns {Promise<{period: string, unlocked: boolean}>} Result descriptor.
 */
async function unlockPeriod(outletId, period) {
  if (!outletId) {
    throw new Error('outletId is required');
  }
  if (!PERIOD_RE.test(period)) {
    throw new Error('Invalid period, expected YYYY-MM');
  }
  const prisma = getDbClient();
  await prisma.accountingPeriodLock.deleteMany({
    where: { outlet_id: outletId, period },
  });
  logger.info('Accounting period unlocked', { outletId, period });
  return { period, unlocked: true };
}

/**
 * Derives the 'YYYY-MM' period from an arbitrary date input.
 * @param {(Date|string)} date - A Date, 'YYYY-MM-DD', or ISO string.
 * @returns {(string|null)} The 'YYYY-MM' period, or null if not derivable.
 */
function derivePeriod(date) {
  if (date == null) {
    return null;
  }
  if (typeof date === 'string') {
    const m = date.match(/^(\d{4}-\d{2})/);
    if (m) {
      return m[1];
    }
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Checks whether the period containing the given date is locked for an outlet.
 * Never throws on a missing/invalid date — returns false defensively.
 * @param {string} outletId - The outlet id.
 * @param {(Date|string)} date - A Date, 'YYYY-MM-DD', or ISO string.
 * @returns {Promise<boolean>} True if the period is locked.
 */
async function isPeriodLocked(outletId, date) {
  try {
    if (!outletId) {
      return false;
    }
    const period = derivePeriod(date);
    if (!period) {
      return false;
    }
    const prisma = getDbClient();
    const lock = await prisma.accountingPeriodLock.findUnique({
      where: { outlet_id_period: { outlet_id: outletId, period } },
      select: { id: true },
    });
    return Boolean(lock);
  } catch (err) {
    logger.warn('isPeriodLocked check failed; defaulting to false', {
      outletId,
      message: err.message,
    });
    return false;
  }
}

module.exports = { listLocks, lockPeriod, unlockPeriod, isPeriodLocked };
