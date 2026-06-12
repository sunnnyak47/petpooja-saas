/**
 * @fileoverview Error monitoring service — persists, de-duplicates (fingerprints),
 * lists and resolves application error logs from both backend and frontend sources.
 * @module modules/monitoring/monitoring.service
 */

const crypto = require('crypto');
const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const { NotFoundError } = require('../../utils/errors');

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;

/** Trim a string to a max length, tolerating non-string input. */
function clamp(value, max) {
  if (value == null) return null;
  const str = String(value);
  return str.length > max ? str.slice(0, max) : str;
}

/**
 * Build a stable fingerprint so repeated occurrences of the same error group.
 * Concrete ids (uuids/hex/numeric) in the path are normalized to ":id".
 */
function computeFingerprint({ source, name, message, path, url }) {
  const route = String(path || url || '').replace(/[0-9a-f-]{8,}/gi, ':id');
  const basis = `${source}|${name || ''}|${message || ''}|${route}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}

const monitoringService = {
  /**
   * Record an error occurrence. Groups by fingerprint: increments an existing
   * row or creates a new one. Never throws — returns the row or null on failure.
   * @param {object} payload
   * @returns {Promise<object|null>}
   */
  async recordError(payload = {}) {
    try {
      const source = payload.source === 'frontend' ? 'frontend' : 'backend';
      const level = ['error', 'warn', 'fatal'].includes(payload.level) ? payload.level : 'error';
      const message = clamp(payload.message, MAX_MESSAGE) || 'Unknown error';
      const name = clamp(payload.name, 160);
      const stack = clamp(payload.stack, MAX_STACK);
      const path = clamp(payload.path, 1000);
      const url = clamp(payload.url, 1000);

      const fingerprint = computeFingerprint({ source, name, message, path, url });
      const now = new Date();

      const existing = await prisma.errorLog.findFirst({
        where: { fingerprint, is_deleted: false },
      });

      if (existing) {
        return await prisma.errorLog.update({
          where: { id: existing.id },
          data: {
            count: { increment: 1 },
            last_seen_at: now,
            level,
            stack: stack ?? existing.stack,
            status_code: payload.status_code ?? existing.status_code,
            // Regression: a previously-resolved error fired again — re-open it.
            ...(existing.resolved
              ? { resolved: false, resolved_by: null, resolved_at: null }
              : {}),
          },
        });
      }

      return await prisma.errorLog.create({
        data: {
          source,
          level,
          message,
          name: name ?? null,
          stack: stack ?? null,
          status_code: payload.status_code ?? null,
          method: clamp(payload.method, 16),
          path: path ?? null,
          request_id: clamp(payload.request_id, 100),
          user_id: payload.user_id ?? null,
          head_office_id: payload.head_office_id ?? null,
          outlet_id: payload.outlet_id ?? null,
          user_agent: clamp(payload.user_agent, 500),
          url: url ?? null,
          fingerprint,
          metadata: payload.metadata ?? undefined,
          last_seen_at: now,
        },
      });
    } catch (err) {
      logger.error('monitoring.recordError failed', { error: err.message });
      return null;
    }
  },

  /**
   * Paginated, filtered list of error logs ordered by recency.
   * @returns {Promise<{ rows: object[], total: number }>}
   */
  async listErrors({ resolved, source, level, q, page = 1, limit = 50 } = {}) {
    const where = { is_deleted: false };
    if (typeof resolved === 'boolean') where.resolved = resolved;
    if (source) where.source = source;
    if (level) where.level = level;
    if (q) where.message = { contains: q, mode: 'insensitive' };

    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const currentPage = Math.max(Number(page) || 1, 1);
    const skip = (currentPage - 1) * take;

    const [rows, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { last_seen_at: 'desc' },
        skip,
        take,
      }),
      prisma.errorLog.count({ where }),
    ]);

    return { rows, total };
  },

  /**
   * Fetch a single (non-deleted) error log.
   * @throws {NotFoundError}
   */
  async getError(id) {
    const row = await prisma.errorLog.findFirst({ where: { id, is_deleted: false } });
    if (!row) throw new NotFoundError('Error log not found');
    return row;
  },

  /**
   * Mark an error resolved or re-open it.
   */
  async setResolved(id, userId, resolved) {
    await monitoringService.getError(id);
    return prisma.errorLog.update({
      where: { id },
      data: {
        resolved,
        resolved_by: resolved ? userId ?? null : null,
        resolved_at: resolved ? new Date() : null,
      },
    });
  },

  /**
   * Aggregate counts for the dashboard header.
   * @returns {Promise<object>}
   */
  async getStats() {
    const since24h = new Date(Date.now() - 864e5);
    const base = { is_deleted: false };

    const [unresolved, last24h, backend, frontend, lvlError, lvlWarn, lvlFatal, total] =
      await Promise.all([
        prisma.errorLog.count({ where: { ...base, resolved: false } }),
        prisma.errorLog.count({ where: { ...base, created_at: { gte: since24h } } }),
        prisma.errorLog.count({ where: { ...base, source: 'backend' } }),
        prisma.errorLog.count({ where: { ...base, source: 'frontend' } }),
        prisma.errorLog.count({ where: { ...base, level: 'error' } }),
        prisma.errorLog.count({ where: { ...base, level: 'warn' } }),
        prisma.errorLog.count({ where: { ...base, level: 'fatal' } }),
        prisma.errorLog.count({ where: base }),
      ]);

    return {
      unresolved,
      last_24h: last24h,
      by_source: { backend, frontend },
      by_level: { error: lvlError, warn: lvlWarn, fatal: lvlFatal },
      total,
    };
  },
};

module.exports = monitoringService;
