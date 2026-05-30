/**
 * @fileoverview Report caching utility — thin wrapper over Redis (with safe mock
 * fallback) plus optional persistence into the AnalyticsCache Prisma table.
 *
 * The Redis client returned by getRedisClient() is a safe no-op mock when Redis
 * is absent, so every function here transparently degrades to "always run fn"
 * without throwing. Callers therefore never need to branch on cache availability.
 *
 * @module utils/reportCache
 */

const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

/** Prefix applied to every Redis key so report caches can be invalidated as a group. */
const KEY_PREFIX = 'report:';

/**
 * Run `fn` with read-through caching keyed by `key`.
 *
 * Flow: GET key → if hit, JSON.parse and return → on miss run fn(), SET the
 * JSON-stringified result with a TTL, and return the value. Any cache error is
 * swallowed and `fn` is run directly, so this can never break a report.
 *
 * @template T
 * @param {string} key - Logical cache key (a stable prefix is added internally).
 * @param {number} ttlSeconds - Time-to-live for the cached value, in seconds.
 * @param {() => Promise<T>} fn - Producer invoked on a cache miss.
 * @returns {Promise<T>} The cached or freshly-computed value.
 */
async function cached(key, ttlSeconds, fn) {
  const redis = getRedisClient();
  const fullKey = `${KEY_PREFIX}${key}`;

  // Read path — never let a cache failure block the report.
  try {
    const hit = await redis.get(fullKey);
    if (hit != null) {
      return JSON.parse(hit);
    }
  } catch (err) {
    logger.warn(`reportCache GET failed for ${fullKey}: ${err.message}`);
  }

  // Miss (or read failure) — compute fresh.
  const value = await fn();

  // Write path — best-effort, must not throw.
  try {
    const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : 300;
    await redis.set(fullKey, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    logger.warn(`reportCache SET failed for ${fullKey}: ${err.message}`);
  }

  return value;
}

/**
 * Best-effort invalidation of all report cache keys sharing a logical prefix.
 *
 * The shared Redis wrapper only exposes a fixed command set (no SCAN/KEYS), so
 * this cannot enumerate keys generically. It deletes the exact prefixed key and
 * logs intent; full pattern-based eviction is left for a future enhancement.
 * Safe to call regardless of whether Redis is present.
 *
 * @param {string} prefix - Logical key (or key prefix) to evict.
 * @returns {Promise<void>}
 */
async function invalidate(prefix) {
  if (!prefix) return;
  const redis = getRedisClient();
  try {
    await redis.del(`${KEY_PREFIX}${prefix}`);
  } catch (err) {
    logger.warn(`reportCache invalidate failed for ${prefix}: ${err.message}`);
  }
}

/**
 * Read a persisted analytics payload from the AnalyticsCache table if it exists
 * and has not expired. Used for heavy reports (GST detailed, advanced) so the
 * result survives Redis restarts and cold caches.
 *
 * @param {import('@prisma/client').PrismaClient} prisma - Prisma client.
 * @param {string} outletId - Outlet UUID.
 * @param {string} cacheKey - Type+range identifier, e.g. `gst-detailed:2024-01-01:2024-03-31`.
 * @returns {Promise<*|null>} Parsed JSON payload or null on miss/expiry/error.
 */
async function getPersisted(prisma, outletId, cacheKey) {
  try {
    const row = await prisma.analyticsCache.findUnique({
      where: { outlet_id_cache_key: { outlet_id: outletId, cache_key: cacheKey } },
    });
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    return row.data;
  } catch (err) {
    logger.warn(`reportCache getPersisted failed for ${cacheKey}: ${err.message}`);
    return null;
  }
}

/**
 * Persist an analytics payload into the AnalyticsCache table, upserting on the
 * (outlet_id, cache_key) unique constraint. Best-effort: failures are logged but
 * never thrown so a DB hiccup cannot break a report response.
 *
 * @param {import('@prisma/client').PrismaClient} prisma - Prisma client.
 * @param {string} outletId - Outlet UUID.
 * @param {string} cacheKey - Type+range identifier.
 * @param {*} data - JSON-serialisable payload to store.
 * @param {number} ttlSeconds - TTL used to compute expires_at.
 * @returns {Promise<void>}
 */
async function setPersisted(prisma, outletId, cacheKey, data, ttlSeconds) {
  try {
    const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : 600;
    const expires_at = new Date(Date.now() + ttl * 1000);
    await prisma.analyticsCache.upsert({
      where: { outlet_id_cache_key: { outlet_id: outletId, cache_key: cacheKey } },
      create: { outlet_id: outletId, cache_key: cacheKey, data, expires_at },
      update: { data, expires_at },
    });
  } catch (err) {
    logger.warn(`reportCache setPersisted failed for ${cacheKey}: ${err.message}`);
  }
}

module.exports = { cached, invalidate, getPersisted, setPersisted };
