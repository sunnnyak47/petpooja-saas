/**
 * @fileoverview Rate limiting middleware using express-rate-limit.
 * Provides separate limiters for general API and auth endpoints.
 *
 * Counters are shared across instances via Redis (rate-limit-redis) when the
 * app's Redis connection is available. Without Redis (mock mode, connection
 * loss, or test runs) every limiter degrades gracefully to the per-process
 * MemoryStore — the default express-rate-limit behaviour — and never crashes
 * a request.
 * @module middleware/rateLimit
 */

const rateLimit = require('express-rate-limit');
const { MemoryStore } = require('express-rate-limit');
const appConfig = require('../config/app');
const logger = require('../config/logger');
const { sendError } = require('../utils/response');

/**
 * express-rate-limit Store backed by Redis with an in-memory fallback.
 *
 * Uses the RAW ioredis client (see config/redis.getRawRedisClient) because the
 * wrapped client only exposes a small command set and silently no-ops on
 * failure — silent no-ops would break rate-limit counting invisibly. Instead,
 * every store operation checks the connection first and falls back to a local
 * MemoryStore, so a Redis outage degrades to per-instance limiting rather
 * than 500s (or no limiting at all).
 */
class ResilientRedisStore {
  /**
   * @param {string} prefix - Redis key prefix isolating this limiter's keys
   */
  constructor(prefix) {
    const { getRawRedisClient } = require('../config/redis');
    this.getRaw = getRawRedisClient;
    this.prefix = prefix;
    // Created LAZILY on the first request that finds Redis ready: the
    // RedisStore constructor eagerly fires SCRIPT LOAD, which would surface
    // as an unhandled rejection if built while the connection is still down.
    this.redisStore = null;
    this.memoryStore = new MemoryStore();
    this.options = null;
    this.warned = false;
  }

  /** Keys live in Redis — shared across instances. */
  get localKeys() { return false; }

  /**
   * @param {object} options - express-rate-limit options (windowMs etc.)
   */
  init(options) {
    this.options = options;
    if (this.redisStore && typeof this.redisStore.init === 'function') this.redisStore.init(options);
    if (typeof this.memoryStore.init === 'function') this.memoryStore.init(options);
  }

  /** @returns {boolean} true when the raw Redis connection is usable now */
  redisUsable() {
    const raw = this.getRaw();
    return !!raw && raw.status === 'ready';
  }

  /**
   * Builds the RedisStore on first use (only called while Redis is ready).
   * @returns {import('rate-limit-redis').RedisStore}
   */
  ensureRedisStore() {
    if (!this.redisStore) {
      const { RedisStore } = require('rate-limit-redis');
      const getRaw = this.getRaw;
      this.redisStore = new RedisStore({
        // rate-limit-redis only needs a raw command runner; ioredis#call
        // sends arbitrary commands (SCRIPT LOAD / EVALSHA) verbatim. Reject
        // fast when the connection is down so callers fall back to memory.
        sendCommand: (...args) => {
          const raw = getRaw();
          if (!raw || raw.status !== 'ready') {
            return Promise.reject(new Error('Redis connection not ready'));
          }
          return raw.call(...args);
        },
        prefix: this.prefix,
      });
      if (this.options) this.redisStore.init(this.options);
    }
    return this.redisStore;
  }

  /** Log the Redis→memory downgrade once, not per request. */
  warnOnce(err) {
    if (this.warned) return;
    this.warned = true;
    logger.warn(`Rate-limit Redis store failed — degrading to in-memory store. Reason: ${err.message}`);
  }

  /**
   * @param {string} key
   * @returns {Promise<{totalHits: number, resetTime: Date|undefined}>}
   */
  async increment(key) {
    if (this.redisUsable()) {
      try {
        return await this.ensureRedisStore().increment(key);
      } catch (err) {
        this.warnOnce(err);
      }
    }
    return this.memoryStore.increment(key);
  }

  /** @param {string} key */
  async decrement(key) {
    if (this.redisUsable()) {
      try {
        return await this.ensureRedisStore().decrement(key);
      } catch (err) {
        this.warnOnce(err);
      }
    }
    return this.memoryStore.decrement(key);
  }

  /** @param {string} key */
  async resetKey(key) {
    if (this.redisUsable()) {
      try {
        await this.ensureRedisStore().resetKey(key);
      } catch (err) {
        this.warnOnce(err);
      }
    }
    return this.memoryStore.resetKey(key);
  }
}

/**
 * Builds the store for one limiter. Returns undefined (→ express-rate-limit's
 * default MemoryStore) when Redis isn't configured (mock mode), when the
 * rate-limit-redis dependency is missing, or under test — so the limiter
 * always works, shared or not.
 * @param {string} name - limiter name used as the Redis key prefix segment
 * @returns {ResilientRedisStore|undefined}
 */
function createSharedStore(name) {
  if (process.env.NODE_ENV === 'test') return undefined;
  try {
    const { getRawRedisClient } = require('../config/redis');
    const raw = getRawRedisClient();
    if (!raw) return undefined; // Redis in mock mode — nothing to share through

    // The app's client is lazyConnect — kick the connection off now so the
    // store becomes shared as soon as Redis is reachable.
    if (raw.status === 'wait') {
      try { raw.connect().catch(() => {}); } catch (_) { /* already connecting */ }
    }
    return new ResilientRedisStore(`rl:${name}:`);
  } catch (err) {
    logger.warn(`Shared rate-limit store unavailable (${err.message}) — using in-memory store.`);
    return undefined;
  }
}

/**
 * General API rate limiter: 100 requests per minute per IP.
 */
const generalLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: appConfig.rateLimit.general,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSharedStore('general'),
  message: { success: false, data: null, message: 'Too many requests, please try again later' },
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
  handler: (req, res) => {
    sendError(res, 429, 'Too many requests, please try again later');
  },
});

/**
 * Auth endpoint rate limiter: 5 requests per minute per IP.
 */
const authLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: appConfig.rateLimit.auth,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSharedStore('auth'),
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    sendError(res, 429, 'Too many authentication attempts, please try again later');
  },
});

/**
 * Webhook endpoint rate limiter: 1000 requests per minute.
 * Higher limit for external service callbacks.
 */
const webhookLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSharedStore('webhook'),
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    sendError(res, 429, 'Webhook rate limit exceeded');
  },
});

/**
 * File upload rate limiter: 10 uploads per minute per user.
 */
const uploadLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSharedStore('upload'),
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
  handler: (req, res) => {
    sendError(res, 429, 'Too many file uploads, please try again later');
  },
});

module.exports = { generalLimiter, authLimiter, webhookLimiter, uploadLimiter };
