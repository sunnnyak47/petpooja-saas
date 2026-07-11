/**
 * @fileoverview Staff Chat domain logic — read/write internal messages for an
 * outlet. Every query is scoped by outlet_id + is_deleted:false. Uses the
 * shared `staffMessage` Prisma model (table `staff_message`).
 *
 * @module modules/chat/chat.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

/**
 * List the most recent messages for an outlet, returned OLDEST-first so the
 * mobile chat can append and scroll to the newest at the bottom. We fetch the
 * newest `limit` rows (created_at desc) then reverse, so a busy outlet still
 * shows the latest conversation rather than ancient history.
 *
 * @param {string} outletId - UUID of the outlet
 * @param {number} [limit=100] - max rows (1..500)
 * @returns {Promise<Array<{id:string,outlet_id:string,user_id:string,user_name:string,body:string,created_at:Date}>>}
 */
async function listMessages(outletId, limit = 100) {
  const take = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const rows = await getDbClient().staffMessage.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { created_at: 'desc' },
    take,
  });
  // Reverse to newest-last for a natural chat transcript order.
  return rows.reverse();
}

/**
 * Resolve a human-friendly display name for the sender. req.user carries no
 * name (only id/email), so we best-effort look up the user's full_name and
 * fall back to email → 'Staff'. Never throws — a lookup failure just yields a
 * fallback label.
 *
 * @param {{id:string,email?:string,name?:string,full_name?:string}} user
 * @returns {Promise<string>}
 */
async function resolveUserName(user) {
  if (user && (user.name || user.full_name)) return user.name || user.full_name;
  try {
    const u = await getDbClient().user.findUnique({
      where: { id: user.id },
      select: { full_name: true, email: true },
    });
    return u?.full_name || u?.email || user?.email || 'Staff';
  } catch (err) {
    logger.warn('Chat resolveUserName lookup failed', { error: err.message });
    return user?.email || 'Staff';
  }
}

/**
 * Create a staff message, stamping user_id + user_name from the authenticated
 * user. After persisting, best-effort broadcasts CHAT_MESSAGE over the realtime
 * bus (guarded — realtime is optional and must never fail the write).
 *
 * @param {string} outletId
 * @param {{id:string,email?:string}} user - req.user
 * @param {string} body
 * @returns {Promise<object>} the created message
 */
async function createMessage(outletId, user, body) {
  const userName = await resolveUserName(user);
  const message = await getDbClient().staffMessage.create({
    data: {
      outlet_id: outletId,
      user_id: user.id,
      user_name: userName,
      body: body.trim(),
    },
  });

  // Realtime fan-out — optional, guarded, never blocks or fails the request.
  try {
    if (typeof global.broadcastToOutlet === 'function') {
      global.broadcastToOutlet(outletId, 'CHAT_MESSAGE', message);
    }
  } catch (err) {
    logger.warn('Chat broadcast failed', { error: err.message, outlet_id: outletId });
  }

  return message;
}

module.exports = { listMessages, createMessage, resolveUserName };
