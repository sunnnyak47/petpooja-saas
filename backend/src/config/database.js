/**
 * @fileoverview Prisma database client singleton.
 * Ensures a single PrismaClient instance is reused across the application.
 *
 * The exported client is wrapped in a query extension that enforces
 * region ↔ currency consistency on HeadOffice / Outlet writes (see
 * utils/regionCurrency). AU rows drifting to INR broke the Settings UI and
 * billing before (scripts/fix-region-currency.js was the one-off repair);
 * the extension prevents the drift at write time across EVERY service path.
 * Corrections are logged as warnings and never reject the write.
 *
 * @module config/database
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');
const { enforceHeadOffice, enforceOutlet, regionFromCountry } = require('../utils/regionCurrency');

/** @type {PrismaClient} */
let prisma;

/** Apply `fn` to a Prisma data payload that may be a single object or an array (createMany). */
function eachData(data, fn) {
  if (Array.isArray(data)) data.forEach((d) => fn(d));
  else if (data) fn(data);
}

/**
 * Build the region/currency-enforcing query extension.
 * @param {PrismaClient} base un-extended client, used for the (rare) lookup of an
 *   existing row's region when a write sets currency without region/country.
 */
function regionCurrencyExtension(base) {
  /** Resolve the existing head office's region for a currency-only write. Never throws. */
  async function headOfficeRegion(where) {
    try {
      const row = await base.headOffice.findFirst({ where, select: { region: true } });
      return row?.region || null;
    } catch (_) { return null; }
  }

  /** Resolve an outlet's effective region (own country, else parent HO region). Never throws. */
  async function outletRegion(where) {
    try {
      const row = await base.outlet.findFirst({
        where,
        select: { country: true, head_office: { select: { region: true } } },
      });
      if (!row) return null;
      return regionFromCountry(row.country) || row.head_office?.region || null;
    } catch (_) { return null; }
  }

  /** Region for a brand-new outlet with no `country` in the payload: parent HO's region. */
  async function parentRegion(headOfficeId) {
    if (typeof headOfficeId !== 'string') return null;
    try {
      const ho = await base.headOffice.findUnique({ where: { id: headOfficeId }, select: { region: true } });
      return ho?.region || null;
    } catch (_) { return null; } // e.g. HO created in the same uncommitted tx — skip
  }

  return {
    query: {
      headOffice: {
        async create({ args, query }) {
          eachData(args.data, (d) => enforceHeadOffice(d, { isCreate: true, source: 'headOffice.create' }));
          return query(args);
        },
        async createMany({ args, query }) {
          eachData(args.data, (d) => enforceHeadOffice(d, { isCreate: true, source: 'headOffice.createMany' }));
          return query(args);
        },
        async update({ args, query }) {
          const d = args.data || {};
          const knownRegion = !d.region && d.currency ? await headOfficeRegion(args.where) : null;
          enforceHeadOffice(d, { knownRegion, source: 'headOffice.update' });
          return query(args);
        },
        async updateMany({ args, query }) {
          const d = args.data || {};
          // The one-off fix script filters `where: { region }` — honour that shape too.
          const whereRegion = typeof args.where?.region === 'string' ? args.where.region : null;
          enforceHeadOffice(d, { knownRegion: whereRegion, source: 'headOffice.updateMany' });
          return query(args);
        },
        async upsert({ args, query }) {
          enforceHeadOffice(args.create, { isCreate: true, source: 'headOffice.upsert' });
          const u = args.update || {};
          const knownRegion = !u.region && u.currency ? await headOfficeRegion(args.where) : null;
          enforceHeadOffice(u, { knownRegion, source: 'headOffice.upsert' });
          return query(args);
        },
      },
      outlet: {
        async create({ args, query }) {
          const d = args.data || {};
          const knownRegion = !d.country ? await parentRegion(d.head_office_id) : null;
          enforceOutlet(d, { isCreate: true, knownRegion, source: 'outlet.create' });
          return query(args);
        },
        async createMany({ args, query }) {
          eachData(args.data, (d) => enforceOutlet(d, { isCreate: true, source: 'outlet.createMany' }));
          return query(args);
        },
        async update({ args, query }) {
          const d = args.data || {};
          const knownRegion = !d.country && d.currency ? await outletRegion(args.where) : null;
          enforceOutlet(d, { knownRegion, source: 'outlet.update' });
          return query(args);
        },
        async updateMany({ args, query }) {
          enforceOutlet(args.data || {}, { source: 'outlet.updateMany' });
          return query(args);
        },
        async upsert({ args, query }) {
          enforceOutlet(args.create, { isCreate: true, source: 'outlet.upsert' });
          const u = args.update || {};
          const knownRegion = !u.country && u.currency ? await outletRegion(args.where) : null;
          enforceOutlet(u, { knownRegion, source: 'outlet.upsert' });
          return query(args);
        },
      },
    },
  };
}

/**
 * Returns the singleton PrismaClient instance.
 * Creates a new instance on first call with query logging in development.
 * @returns {PrismaClient} The Prisma database client
 */
function getDbClient() {
  if (!prisma) {
    const base = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'event', level: 'error' },
              { emit: 'event', level: 'warn' },
            ]
          : [{ emit: 'event', level: 'error' }],
    });

    base.$on('query', (e) => {
      logger.debug(`Query: ${e.query}`, { duration: `${e.duration}ms`, params: e.params });
    });

    base.$on('error', (e) => {
      logger.error('Prisma Error:', { message: e.message, target: e.target });
    });

    base.$on('warn', (e) => {
      logger.warn('Prisma Warning:', { message: e.message });
    });

    prisma = base.$extends(regionCurrencyExtension(base));
  }
  return prisma;
}

/**
 * Gracefully disconnects the Prisma client.
 * Should be called during application shutdown.
 * @returns {Promise<void>}
 */
async function disconnectDb() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database connection closed');
  }
}

module.exports = { getDbClient, disconnectDb };
