/**
 * @fileoverview Redis client configuration with automatic fallback to a no-op mock.
 * When Redis is unavailable (no REDIS_URL or connection failure), all Redis
 * operations silently return safe default values so the app never crashes.
 */

const Redis = require('ioredis');
const logger = require('./logger');

/** @type {object} */
let redisClient = null;

/**
 * Returns a safe no-op Redis mock so the app continues without caching.
 * @returns {object} Mock Redis client
 */
function createMockRedis() {
  logger.warn('Redis unavailable — using no-op mock. Caching and rate-limiting disabled.');
  return {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 0,
    incr: async () => 1,
    expire: async () => 1,
    hget: async () => null,
    hset: async () => 'OK',
    publish: async () => 0,
    on: () => {},
    quit: async () => {},
    status: 'mock',
  };
}

/**
 * Returns the shared Redis client, initialising it on first call.
 * Falls back to a no-op mock if no REDIS_URL is configured.
 * @returns {object} Redis client or mock
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  if (!process.env.REDIS_URL) {
    // No Redis configured — use mock immediately, no connection attempts
    redisClient = createMockRedis();
    return redisClient;
  }

  const realClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.warn('Redis connection failed permanently. Switching to no-op mock.');
        // Swap out for mock so future calls work cleanly
        redisClient = createMockRedis();
        return null; // stop retrying
      }
      return Math.min(times * 200, 1000);
    },
  });

  realClient.on('error', (err) => {
    logger.warn(`Redis error: ${err.message}`);
  });

  realClient.on('connect', () => {
    logger.info('Connected to Redis.');
  });

  redisClient = realClient;
  return redisClient;
}

/**
 * Gracefully disconnects Redis if a real connection is active.
 * @returns {Promise<void>}
 */
async function disconnectRedis() {
  if (redisClient && typeof redisClient.quit === 'function' && redisClient.status !== 'mock') {
    await redisClient.quit();
  }
  redisClient = null;
}

module.exports = { getRedisClient, disconnectRedis };
