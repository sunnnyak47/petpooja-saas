/**
 * @fileoverview Redis client configuration and connection management.
 * Uses ioredis with automatic reconnection and error handling.
 * @module config/redis
 */

const Redis = require('ioredis');
const logger = require('./logger');
const appConfig = require('./app');

/** @type {Redis|null} */
let redisClient = null;

/**
 * Returns the singleton Redis client instance.
 * Creates a new connection on first call with retry strategy.
 * @returns {Redis} The Redis client
 */
function getRedisClient() {
  if (!redisClient) {
    const redisUrl = appConfig.redis.url;
    
    if (!redisUrl) {
      logger.warn('REDIS_URL environment variable not provided. Redis core is disabled.');
      return {
        on: () => {},
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(null),
        del: () => Promise.resolve(null),
        quit: () => Promise.resolve()
      };
    }

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        logger.warn(`Redis reconnecting... attempt ${times}, delay ${delay}ms`);
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some((e) => err.message.includes(e));
      },
      lazyConnect: false,
      enableReadyCheck: true,
      connectTimeout: 10000,
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', { message: err.message });
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisClient;
}

/**
 * Gracefully disconnects the Redis client.
 * @returns {Promise<void>}
 */
async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed gracefully');
  }
}

module.exports = { getRedisClient, disconnectRedis };
