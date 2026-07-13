/**
 * @fileoverview Session / device management service.
 *
 * Design (no schema migration required):
 *  - Login history + the active-device list are derived from the existing
 *    `audit_log` rows (`USER_LOGIN` / `USER_LOGOUT`), which already carry
 *    `ip_address`, `user_agent` and `created_at`. Each login now also stamps a
 *    session id (`sid`) into `audit_log.metadata`, so a row maps to one device
 *    session and can be revoked individually.
 *  - Revocation is a Redis string flag `revsid:<sid>` (only get/setex/del are
 *    used, matching the fallback-safe Redis wrapper). The auth middleware checks
 *    it on every request, exactly like the existing token blacklist. If Redis is
 *    down the flag no-ops (fail-open) but the device LIST still works from the DB.
 *
 * @module modules/auth/session.service
 */

const { getDbClient } = require('../../config/database');
const { getRedisClient } = require('../../config/redis');
const appConfig = require('../../config/app');
const logger = require('../../config/logger');

/** A session is considered active for the refresh-token lifetime (7 days). */
const SESSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REVOKE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Best-effort User-Agent parser (no external dependency). Extracts a friendly
 * device label, browser, OS and coarse device type from a UA string.
 * @param {string|null|undefined} ua
 * @returns {{ label: string, type: string, browser: string, os: string, isApp: boolean }}
 */
function describeDevice(ua) {
  const s = String(ua || '');
  if (!s.trim()) {
    return { label: 'Unknown device', type: 'unknown', browser: 'Unknown', os: 'Unknown', isApp: false };
  }

  // Our own Electron desktop POS app.
  const isApp = /electron/i.test(s) || /msrm|petpooja-erp-desktop|MS-RM System/i.test(s);

  // OS detection
  let os = 'Unknown';
  if (/windows nt 10/i.test(s)) os = 'Windows 10/11';
  else if (/windows nt/i.test(s)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(s)) os = /ipad/i.test(s) ? 'iPadOS' : 'iOS';
  else if (/mac os x/i.test(s)) os = 'macOS';
  else if (/android/i.test(s)) os = 'Android';
  else if (/cros/i.test(s)) os = 'ChromeOS';
  else if (/linux/i.test(s)) os = 'Linux';

  // Browser detection (order matters — Edge/Brave/Opera masquerade as Chrome)
  let browser = 'Unknown';
  if (isApp && /electron/i.test(s)) browser = 'Desktop App';
  else if (/edg\//i.test(s)) browser = 'Edge';
  else if (/opr\/|opera/i.test(s)) browser = 'Opera';
  else if (/samsungbrowser/i.test(s)) browser = 'Samsung Internet';
  else if (/chrome\/|crios/i.test(s)) browser = 'Chrome';
  else if (/firefox\/|fxios/i.test(s)) browser = 'Firefox';
  else if (/safari/i.test(s) && /version\//i.test(s)) browser = 'Safari';

  // Device type
  let type = 'desktop';
  if (isApp) type = 'app';
  else if (/ipad|tablet/i.test(s)) type = 'tablet';
  else if (/mobile|iphone|android/i.test(s)) type = 'mobile';

  let label;
  if (isApp) label = `MS-RM Desktop App${os !== 'Unknown' ? ` · ${os}` : ''}`;
  else if (browser !== 'Unknown' && os !== 'Unknown') label = `${browser} on ${os}`;
  else if (browser !== 'Unknown') label = browser;
  else if (os !== 'Unknown') label = os;
  else label = 'Web browser';

  return { label, type, browser, os, isApp };
}

/**
 * Reads the raw login/logout audit rows for a user within the active window.
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
async function fetchLoginAuditRows(userId, sinceMs) {
  const prisma = getDbClient();
  return prisma.auditLog.findMany({
    where: {
      user_id: userId,
      action: { in: ['USER_LOGIN', 'USER_LOGOUT'] },
      is_deleted: false,
      created_at: { gte: new Date(Date.now() - sinceMs) },
    },
    orderBy: { created_at: 'asc' },
    select: {
      id: true, action: true, ip_address: true, user_agent: true,
      metadata: true, created_at: true,
    },
  });
}

/** Reads the `sid` out of an audit row's metadata (null for legacy rows). */
function rowSid(row) {
  const m = row && row.metadata;
  return m && typeof m === 'object' ? (m.sid || null) : null;
}

/**
 * Returns the list of active device sessions for a user, most-recent first,
 * with the current session (if identifiable) marked and pinned to the top.
 *
 * @param {string} userId
 * @param {string|null} currentSid  session id from the caller's token
 * @param {{ ip?: string, user_agent?: string }} [currentCtx] used to synthesize
 *        the current device when the caller's token predates sid tracking.
 * @returns {Promise<Array<object>>}
 */
async function listActiveSessions(userId, currentSid, currentCtx = {}) {
  const redis = getRedisClient();
  const rows = await fetchLoginAuditRows(userId, SESSION_WINDOW_MS);

  // Collapse rows into one entry per sid: latest LOGIN wins; a later LOGOUT ends it.
  const bySid = new Map();
  for (const row of rows) {
    const sid = rowSid(row);
    if (!sid) continue; // legacy rows can't be tracked as sessions
    if (row.action === 'USER_LOGIN') {
      bySid.set(sid, {
        sid,
        ip: row.ip_address || null,
        user_agent: row.user_agent || null,
        signed_in_at: row.created_at,
        ended: false,
      });
    } else if (row.action === 'USER_LOGOUT') {
      const existing = bySid.get(sid);
      if (existing) existing.ended = true;
    }
  }

  const sessions = [];
  for (const entry of bySid.values()) {
    if (entry.ended) continue;
    // Skip sessions revoked via Redis (per-device sign-out / logout-others).
    let revoked = null;
    try {
      revoked = await redis.get(`${appConfig.redisKeys.revokedSession}${entry.sid}`);
    } catch (_) { /* fail-open: treat as not revoked */ }
    if (revoked) continue;

    const device = describeDevice(entry.user_agent);
    sessions.push({
      sid: entry.sid,
      is_current: !!currentSid && entry.sid === currentSid,
      ip: entry.ip,
      device_label: device.label,
      device_type: device.type,
      browser: device.browser,
      os: device.os,
      is_app: device.isApp,
      signed_in_at: entry.signed_in_at,
    });
  }

  // If the caller's own session isn't represented (legacy token with no sid, or
  // a fresh login not yet flushed), synthesize a "this device" entry so the UI
  // always shows the current device.
  const hasCurrent = sessions.some((s) => s.is_current);
  if (!hasCurrent) {
    const device = describeDevice(currentCtx.user_agent);
    sessions.unshift({
      sid: currentSid || null,
      is_current: true,
      ip: currentCtx.ip || null,
      device_label: device.label,
      device_type: device.type,
      browser: device.browser,
      os: device.os,
      is_app: device.isApp,
      signed_in_at: null,
      synthetic: true,
    });
  }

  // Current device first, then most-recent sign-in.
  sessions.sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return new Date(b.signed_in_at || 0) - new Date(a.signed_in_at || 0);
  });

  return sessions;
}

/**
 * Paginated login/logout history for a user.
 * @param {string} userId
 * @param {{ limit?: number, page?: number, days?: number }} [opts]
 */
async function getLoginHistory(userId, opts = {}) {
  const prisma = getDbClient();
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 25, 1), 100);
  const page = Math.max(parseInt(opts.page, 10) || 1, 1);
  const days = Math.min(Math.max(parseInt(opts.days, 10) || 90, 1), 365);

  const where = {
    user_id: userId,
    action: { in: ['USER_LOGIN', 'USER_LOGOUT'] },
    is_deleted: false,
    created_at: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, action: true, ip_address: true, user_agent: true, created_at: true },
    }),
  ]);

  const items = rows.map((r) => {
    const device = describeDevice(r.user_agent);
    return {
      id: r.id,
      action: r.action === 'USER_LOGIN' ? 'login' : 'logout',
      ip: r.ip_address || null,
      device_label: device.label,
      device_type: device.type,
      browser: device.browser,
      os: device.os,
      at: r.created_at,
    };
  });

  return { items, total, page, limit, has_more: page * limit < total };
}

/**
 * Confirms a sid belongs to this user (appears in their recent login audit).
 * Prevents revoking another user's session by guessing its sid.
 */
async function sidBelongsToUser(userId, sid) {
  if (!sid) return false;
  const rows = await fetchLoginAuditRows(userId, SESSION_WINDOW_MS);
  return rows.some((r) => rowSid(r) === sid && r.action === 'USER_LOGIN');
}

/**
 * Revokes a single device session. Sets the Redis revocation flag and records a
 * USER_LOGOUT audit row so the device drops off the active list.
 * @returns {Promise<{ revoked: boolean }>}
 */
async function revokeSession(userId, sid, auditInfo = {}) {
  const prisma = getDbClient();
  const redis = getRedisClient();

  const owned = await sidBelongsToUser(userId, sid);
  if (!owned) return { revoked: false };

  try {
    await redis.setex(`${appConfig.redisKeys.revokedSession}${sid}`, REVOKE_TTL_SECONDS, 'revoked');
  } catch (err) {
    logger.warn('Failed to set session revocation flag', { error: err.message, sid });
  }

  await prisma.auditLog.create({
    data: {
      user_id: userId,
      action: 'USER_LOGOUT',
      entity_type: 'user',
      entity_id: userId,
      ip_address: auditInfo.ip || null,
      user_agent: auditInfo.user_agent || null,
      metadata: { sid, reason: 'device_revoked' },
    },
  }).catch(() => null);

  logger.info('Device session revoked', { userId, sid });
  return { revoked: true };
}

/**
 * Signs the user out of every device except the current one.
 * @returns {Promise<{ count: number }>}
 */
async function logoutOtherDevices(userId, currentSid, auditInfo = {}) {
  const prisma = getDbClient();
  const redis = getRedisClient();

  const sessions = await listActiveSessions(userId, currentSid, auditInfo);
  const targets = sessions.filter((s) => !s.is_current && s.sid);

  for (const s of targets) {
    try {
      await redis.setex(`${appConfig.redisKeys.revokedSession}${s.sid}`, REVOKE_TTL_SECONDS, 'revoked');
    } catch (err) {
      logger.warn('Failed to revoke session during logout-others', { error: err.message, sid: s.sid });
    }
  }

  await prisma.auditLog.create({
    data: {
      user_id: userId,
      action: 'USER_LOGOUT',
      entity_type: 'user',
      entity_id: userId,
      ip_address: auditInfo.ip || null,
      user_agent: auditInfo.user_agent || null,
      metadata: { reason: 'logout_other_devices', count: targets.length },
    },
  }).catch(() => null);

  logger.info('Logged out other devices', { userId, count: targets.length });
  return { count: targets.length };
}

/**
 * Whether a session id has been revoked. Used by the auth middleware.
 * @param {string} sid
 * @returns {Promise<boolean>}
 */
async function isSessionRevoked(sid) {
  if (!sid) return false;
  const redis = getRedisClient();
  try {
    const flag = await redis.get(`${appConfig.redisKeys.revokedSession}${sid}`);
    return !!flag;
  } catch (_) {
    return false; // fail-open, consistent with the wrapper's mock fallback
  }
}

module.exports = {
  describeDevice,
  listActiveSessions,
  getLoginHistory,
  revokeSession,
  logoutOtherDevices,
  isSessionRevoked,
  sidBelongsToUser,
  SESSION_WINDOW_MS,
};
