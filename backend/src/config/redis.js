const Redis = require('ioredis');
const logger = require('./logger');

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    const redisOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries. Stopping...');
          return null;
        }
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    };

    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL, redisOptions);
    } else if (process.env.NODE_ENV === 'production') {
      logger.warn('No REDIS_URL provided in production. Redis features will be disabled.');
      redisClient = createMockRedis();
    } else {
      redisClient = new Redis(redisOptions);
    }

    // Wrap with resilience layer
    redisClient = createResilientWrapper(redisClient);

    redisClient.on('error', (err) => {
      logger.warn(`Redis connection error: ${err.message}`);
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis Infrastructure.');
    });
  }

  return redisClient;
}

/**
 * Wraps a Redis client to catch "Connection is closed" errors and return defaults.
 */
function createResilientWrapper(client) {
  const handler = {
    get(target, prop) {
      const val = target[prop];
      if (typeof val === 'function' && ['get', 'set', 'setex', 'del', 'incr', 'expire', 'hget', 'hset', 'publish'].includes(prop)) {
        return async (...args) => {
          try {
            return await val.apply(target, args);
          } catch (err) {
            if (err.message.includes('Connection is closed') || err.message.includes('Offline queue')) {
              logger.debug(`Redis command '${prop}' suppressed due to connection issue.`);
              return prop === 'get' || prop === 'hget' ? null : (prop === 'incr' ? 1 : 'OK');
            }
            throw err;
          }
        };
      }
      return val;
    }
  };
  return new Proxy(client, handler);
}

/**
 * Creates a mock Redis client that does nothing but prevents crashes.
 */
function createMockRedis() {
  return {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 0,
    incr: async () => 1,
    expire: async () => 1,
    on: () => {},
    quit: async () => {},
  };
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

module.exports = { getRedisClient, disconnectRedis };
