/**
 * @fileoverview Shared singleton + common dependencies for the SuperAdmin
 * service split.
 *
 * The original superadmin.service.js was one large object literal whose methods
 * self-reference via the module-level `superadminService` identifier (e.g.
 * `superadminService._loadInvoices()`). To preserve that interface EXACTLY while
 * splitting by domain, every domain module imports this single shared object and
 * augments it (Object.assign) with its own methods. Because all domain modules
 * close over the same `superadminService` reference exported here, cross-domain
 * calls resolve identically to the original file.
 *
 * @module modules/superadmin/services/_shared
 */

const prisma = require('../../../config/database').getDbClient();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const appConfig = require('../../../config/app');
const logger = require('../../../config/logger');
const { UnauthorizedError, NotFoundError, BadRequestError, ConflictError } = require('../../../utils/errors');

/**
 * Hardcoded mock stats used as fallback when DB is unreachable
 */
const MOCK_STATS = {
  restaurants: { total: 247, active: 198, trial: 18, expired: 31 },
  revenue: { mrr: 82400, arr: 988800, today: 4200, churned: 3 },
  health: { api: 'online', database: 'connected', redis: 'disconnected', socket: 143 }
};

/**
 * The shared SuperAdmin service singleton. Domain modules Object.assign their
 * methods onto this object; the facade re-exports it.
 * @type {object}
 */
const superadminService = {};

module.exports = {
  superadminService,
  prisma,
  jwt,
  bcrypt,
  appConfig,
  logger,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
  ConflictError,
  MOCK_STATS,
};
