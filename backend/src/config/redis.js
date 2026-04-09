/**
 * @fileoverview Redis client configuration with automatic fallback to a no-op mock.
 * When Redis is unavailable, all operations return safe defaults — app never crashes.
 */

const Redis = require('ioredis');
const logger = require('./logger');

/** @type {object} */
let redisClient = null;

/** @type {boolean} */
let useMock = false;

/**
 * Returns a safe no-op Redis mock so the app continues without caching.
 * @returns {object} Mock Redis client
 */
function createMockRedis() {
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
 * Wraps every Redis command with a try-catch that falls back to the mock
 * value if the connection is down. This catches BOTH async rejections AND
 * the synchronous throws ioredis makes with enableOfflineQueue=false.
 * @param {object} client - real ioredis client
 * @returns {object} safe wrapper
 */
function wrapWithFallback(client) {
  const COMMANDS = ['get', 'set', 'setex', 'del', 'incr', 'expire', 'hget', 'hset', 'publish'];
  const DEFAULTS = { get: null, hget: null, incr: 1, del: 0, publish: 0 };

  const safe = {};
  COMMANDS.forEach((cmd) => {
    safe[cmd] = async (...args) => {
      if (useMock) {
        return DEFAULTS[cmd] !== undefined ? DEFAULTS[cmd] : 'OK';
      }
      try {
        return await client[cmd](...args);
      } catch (err) {
        logger.warn(`Redis '${cmd}' failed — falling back to default. Reason: ${err.message}`);
        useMock = true; // all future calls skip redis
        return DEFAULTS[cmd] !== undefined ? DEFAULTS[cmd] : 'OK';
      }
    };
  });

  safe.on = (event, handler) => {
    if (typeof client.on === 'function') client.on(event, handler);
  };
  safe.quit = async () => {
    if (typeof client.quit === 'function') {
      try { await client.quit(); } catch (_) {}
    }
  };
  safe.status = 'wrapped';

  return safe;
}

/**
 * Returns the shared Redis client, initialising it on first call.
 * Falls back to a no-op mock if no REDIS_URL is configured or connection fails.
 * @returns {object} Redis client or mock
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  const isMockUrl = !process.env.REDIS_URL || process.env.REDIS_URL === 'mock' || process.env.REDIS_URL.includes('localhost');

  if (isMockUrl && process.env.NODE_ENV === 'production') {
    logger.warn('Redis URL is missing or invalid for production — using mock.');
    useMock = true;
    redisClient = createMockRedis();
    return redisClient;
  }

  const realClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 0,      // don't retry per-command
    enableOfflineQueue: false,    // fail fast
    lazyConnect: true,
    connectTimeout: 2000,         // fail connection fast (2s)
    commandTimeout: 2000,         // fail commands fast (2s)
    retryStrategy: (times) => {
      if (times > 3) {
        logger.warn('Redis connection failed permanently — switching to no-op mock.');
        useMock = true;
        return null;
      }
      return Math.min(times * 200, 1000);
    },
  });

  realClient.on('error', (err) => {
    logger.warn(`Redis connection error: ${err.message}`);
    useMock = true; // immediately disable redis on any error
  });

  realClient.on('connect', () => {
    logger.info('Redis connected.');
    useMock = false; // re-enable if connection recovers
  });

  redisClient = wrapWithFallback(realClient);
  return redisClient;
}

/**
 * Gracefully disconnects Redis.
 * @returns {Promise<void>}
 */
async function disconnectRedis() {
  if (redisClient) {
    try {
      if (typeof redisClient.quit === 'function') await redisClient.quit();
    } catch (_) {}
  }
  redisClient = null;
  useMock = false;
}

module.exports = { getRedisClient, disconnectRedis };
