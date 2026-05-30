/**
 * @fileoverview Small Prisma helpers for the common soft-delete pattern used
 * across the codebase. Centralises the hand-rolled `is_deleted: false` filter
 * and the "set is_deleted: true" update so call sites stay DRY.
 * @module utils/prismaHelpers
 */

const { getDbClient } = require('../config/database');

/**
 * Merge a soft-delete guard into a Prisma `where` clause.
 * @param {object} [where={}] - Existing where clause
 * @returns {object} where clause with `is_deleted: false` applied
 */
function notDeleted(where = {}) {
  return { ...where, is_deleted: false };
}

/**
 * Soft-delete a record by flipping `is_deleted` to true.
 * @param {string} model - Prisma model accessor name (e.g. 'staffProfile')
 * @param {string} id - Record id
 * @returns {Promise<object>} The updated record
 */
function softDelete(model, id) {
  const prisma = getDbClient();
  return prisma[model].update({
    where: { id },
    data: { is_deleted: true },
  });
}

module.exports = { notDeleted, softDelete };
