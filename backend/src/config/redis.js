/**
 * @fileoverview Redis client configuration - MOCKED FOR CLOUD STABILITY.
 * Returns a simulated client to prevent connection loops.
 */
const logger = require('./logger');

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    logger.warn('REDIS CLOUD MODE: Connection logic is DISABLED to prevent loops. Using In-Memory Simulator.');
    
    // Simulate ioredis interface
    redisClient = {
      on: () => {},
      once: () => {},
      get: () => Promise.resolve(null),
      set: () => Promise.resolve('OK'),
      del: () => Promise.resolve(1),
      quit: () => Promise.resolve(),
      status: 'ready'
    };
  }

  return redisClient;
}

async function disconnectRedis() {
  return Promise.resolve();
}

module.exports = { getRedisClient, disconnectRedis };
