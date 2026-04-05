/**
 * @fileoverview Prisma database client singleton.
 * Ensures a single PrismaClient instance is reused across the application.
 * @module config/database
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

/** @type {PrismaClient} */
let prisma;

/**
 * Returns the singleton PrismaClient instance.
 * Creates a new instance on first call with query logging in development.
 * @returns {PrismaClient} The Prisma database client
 */
function getDbClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'event', level: 'error' },
              { emit: 'event', level: 'warn' },
            ]
          : [{ emit: 'event', level: 'error' }],
    });

    prisma.$on('query', (e) => {
      logger.debug(`Query: ${e.query}`, { duration: `${e.duration}ms`, params: e.params });
    });

    prisma.$on('error', (e) => {
      logger.error('Prisma Error:', { message: e.message, target: e.target });
    });

    prisma.$on('warn', (e) => {
      logger.warn('Prisma Warning:', { message: e.message });
    });
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
