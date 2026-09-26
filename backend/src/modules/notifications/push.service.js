/**
 * @fileoverview Expo push-notification sender.
 *
 * The mobile app registers each device's Expo push token (see
 * integration.routes → /push-token). This service is the OTHER half: it
 * actually delivers pushes, via Expo's HTTP Push API
 * (https://exp.host/--/api/v2/push/send). We do NOT touch APNs/FCM directly —
 * Expo relays to them — so no native credentials live here.
 *
 * Every export is FIRE-AND-FORGET: all network/lookup errors are swallowed and
 * logged, never thrown, so a failed push can never break the business flow that
 * triggered it (order creation, stock alert, …). Callers should still `await`
 * (or `.catch`) but a rejection is impossible.
 *
 * @module modules/notifications/push.service
 */

const logger = require('../../config/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts at most 100 messages per request.
const MAX_PER_REQUEST = 100;

/**
 * Is this a well-formed Expo push token? Guards against junk / stale values so
 * we never POST garbage to Expo (which would reject the whole chunk).
 * @param {*} token
 * @returns {boolean}
 */
function isValidExpoToken(token) {
  return typeof token === 'string' && /^ExponentPushToken\[[^\]]+\]$/.test(token.trim());
}

/** Split an array into fixed-size chunks. */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Lazily resolve the in-memory push-token fallback CACHE (userId → { token,
 * outlet_id, … }). The DB (push_tokens table) is the source of truth; the
 * cache only bridges a DB outage / a row whose persist failed, within the
 * same process. Lazy `require` avoids a circular import with the routes
 * module and lets tests inject their own registry.
 * @returns {Map<string, object>|null}
 */
function getRegistry() {
  try {
    return require('../integrations/integration.routes').getPushTokenRegistry();
  } catch (_) {
    return null;
  }
}

/**
 * Lazily resolve the Prisma client. Never throws — pushes are fire-and-forget.
 * @returns {object|null}
 */
function getDb() {
  try {
    return require('../../config/database').getDbClient();
  } catch (_) {
    return null;
  }
}

/**
 * Query the persistent registry for tokens. Returns null (not []) when the
 * lookup FAILS, so callers can tell "DB said none" from "DB unreachable".
 * @param {object} where Prisma where clause on PushToken
 * @returns {Promise<string[]|null>}
 */
async function dbTokens(where) {
  const db = getDb();
  if (!db || !db.pushToken) return null;
  try {
    const rows = await db.pushToken.findMany({ where, select: { token: true } });
    return rows.map((r) => r.token).filter(isValidExpoToken).map((t) => t.trim());
  } catch (err) {
    logger.warn('[push] DB token lookup failed — falling back to in-memory cache', { error: err.message });
    return null;
  }
}

/**
 * Shape recipient tokens into Expo message objects.
 * @param {string[]} tokens
 * @param {{title:string, body:string, data?:object}} payload
 * @returns {object[]}
 */
function buildMessages(tokens, payload = {}) {
  const { title, body, data } = payload;
  return tokens.map((to) => ({
    to,
    title: title || 'MS-RM',
    body: body || '',
    sound: 'default',
    priority: 'high',
    channelId: 'default', // matches the Android channel the app creates
    data: data || {},
  }));
}

/**
 * Send a batch of already-built Expo messages. Filters invalid tokens, chunks
 * to Expo's per-request cap, and never throws.
 * @param {object[]} messages
 * @returns {Promise<{sent:number, tickets:object[]}>}
 */
async function sendExpoPush(messages) {
  const valid = (Array.isArray(messages) ? messages : []).filter((m) => m && isValidExpoToken(m.to));
  if (valid.length === 0) return { sent: 0, tickets: [] };

  const tickets = [];
  for (const group of chunk(valid, MAX_PER_REQUEST)) {
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(group),
      });
      const json = await resp.json().catch(() => null);
      if (json && json.data) {
        tickets.push(...(Array.isArray(json.data) ? json.data : [json.data]));
      }
    } catch (err) {
      logger.warn('[push] Expo send failed', { error: err.message, count: group.length });
    }
  }
  return { sent: valid.length, tickets };
}

/**
 * Push to specific users (by id) — resolves each user's registered device
 * tokens from the persistent registry (push_tokens table), falling back to
 * the in-memory cache when the DB is unreachable.
 * @param {string[]} userIds
 * @param {{title:string, body:string, data?:object}} payload
 * @returns {Promise<{sent:number, tickets:object[]}>}
 */
async function sendToUsers(userIds, payload) {
  if (!Array.isArray(userIds) || userIds.length === 0) return { sent: 0, tickets: [] };

  let tokens = await dbTokens({ user_id: { in: userIds } });
  if (tokens === null) {
    // DB unreachable → same-process cache.
    const reg = getRegistry();
    if (!reg) return { sent: 0, tickets: [] };
    tokens = [];
    for (const uid of userIds) {
      const entry = reg.get(uid);
      if (entry && isValidExpoToken(entry.token)) tokens.push(entry.token.trim());
    }
  }
  return sendExpoPush(buildMessages([...new Set(tokens)], payload));
}

/**
 * Push to every device currently registered against an outlet. The device
 * stores the outlet it's actively watching (the app re-registers on outlet
 * switch), so this reaches exactly the staff/owner focused on that outlet.
 * @param {string} outletId
 * @param {{title:string, body:string, data?:object}} payload
 * @param {{excludeUserId?:string}} [opts]
 * @returns {Promise<{sent:number, tickets:object[]}>}
 */
async function sendToOutlet(outletId, payload, opts = {}) {
  if (!outletId) return { sent: 0, tickets: [] };

  const { excludeUserId } = opts;
  let tokens = await dbTokens({
    outlet_id: outletId,
    ...(excludeUserId ? { user_id: { not: excludeUserId } } : {}),
  });
  if (tokens === null) {
    // DB unreachable → same-process cache.
    const reg = getRegistry();
    if (!reg) return { sent: 0, tickets: [] };
    tokens = [];
    for (const [uid, entry] of reg.entries()) {
      if (excludeUserId && uid === excludeUserId) continue;
      if (entry && entry.outlet_id === outletId && isValidExpoToken(entry.token)) {
        tokens.push(entry.token.trim());
      }
    }
  }
  return sendExpoPush(buildMessages([...new Set(tokens)], payload));
}

module.exports = {
  isValidExpoToken,
  sendExpoPush,
  sendToUsers,
  sendToOutlet,
  buildMessages,
  // exported for tests
  _chunk: chunk,
  EXPO_PUSH_URL,
  MAX_PER_REQUEST,
};
