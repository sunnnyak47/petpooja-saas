/**
 * @fileoverview Shared query helpers for the Xero analytics service split.
 * Holds the rounding helper, month-name tables, date-range cutoff logic,
 * the connection-scoped `where` builder, and the connection lookup used by
 * every report/prediction/demo module.
 * @module modules/xero/xero.query
 */

const { getDbClient } = require('../../config/database');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const round = (x) => Math.round(x * 100) / 100;

/**
 * Compute the date cutoff for a given range string.
 * @param {'month'|'quarter'|'year'|'all'} range
 * @returns {Date|null} cutoff date, or null for 'all'
 */
function getDateCutoff(range) {
  if (range === 'all') return null;
  const now = new Date();
  switch (range) {
    case 'month':
      now.setMonth(now.getMonth() - 1);
      break;
    case 'quarter':
      now.setMonth(now.getMonth() - 3);
      break;
    case 'year':
      now.setMonth(now.getMonth() - 12);
      break;
    default:
      return null;
  }
  return now;
}

/**
 * Build a Prisma where clause scoped to a connection + optional date range.
 * @param {string} connectionId
 * @param {string} range
 * @returns {object}
 */
function buildWhere(connectionId, range) {
  const where = { connection_id: connectionId };
  const cutoff = getDateCutoff(range);
  if (cutoff) {
    where.date = { gte: cutoff };
  }
  return where;
}

/**
 * Find the Xero connection for an outlet.
 * @param {string} outletId
 * @returns {Promise<object|null>}
 */
async function getConnection(outletId) {
  const prisma = getDbClient();
  const conn = await prisma.xeroConnection.findFirst({
    where: { outlet_id: outletId, is_deleted: false },
    include: {
      accounts: { where: { is_active: true }, orderBy: { code: 'asc' } },
    },
  });
  return conn || null;
}

module.exports = {
  MONTH_NAMES,
  SHORT_MONTH_NAMES,
  round,
  getDateCutoff,
  buildWhere,
  getConnection,
};
