/**
 * @fileoverview Proactive alerts → PUSH notifications ("the assistant that pings
 * your phone"). This is the delivery bridge between the alert engine
 * (assistant.alerts computeAlerts → severity-sorted read-only alerts) and the
 * Expo push sender (notifications/push.service → Expo HTTP Push API). No native
 * credentials live anywhere in this path: the mobile app registers each device's
 * Expo push token (integration.routes /push-token, in-memory registry) and Expo
 * relays to APNs/FCM for us.
 *
 * Only HIGH-severity alerts are pushed by default — out of stock, a steep sales
 * drop, open fraud, an imminent tax deadline — because a push interrupts the
 * user; medium/low alerts stay in the in-app alert list / digest email. A small
 * in-memory DEDUP guard suppresses re-pushing the same alert to the same outlet
 * within a cooldown window (default 12h), so a cron that runs a few times a day
 * never nags. The guard is memory-only (mirrors the token registry) — a server
 * restart simply allows one fresh push per active alert.
 *
 * Everything is FIRE-AND-FORGET: every failure is swallowed + logged, never
 * thrown, so a push problem can never break the cron or any caller.
 *
 * @module modules/assistant/assistant.push
 */

const logger = require('../../config/logger');
const push = require('../notifications/push.service');
const { computeAlerts } = require('./assistant.alerts');
const { listDigestOutlets, ctxFor } = require('./assistant.digest');

// Severity ranking — a push fires only for alerts at/above the min severity.
const SEV_RANK = { high: 3, medium: 2, low: 1 };
const DEFAULT_MIN_SEVERITY = 'high';
// Don't re-push the same (outlet, alertKey) within this window.
const DEFAULT_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h

// (outletId::alertKey) → last-pushed epoch ms. Memory-only, like the token map.
const lastPushedAt = new Map();

const dedupKey = (outletId, alertKey) => `${outletId}::${alertKey}`;

/**
 * Keep only alerts at/above `minSeverity` that are not still inside their
 * cooldown window for this outlet.
 * @param {string} outletId
 * @param {Array<{key,severity}>} alerts
 * @param {{minSeverity?:string, cooldownMs?:number, nowMs?:number}} opts
 * @returns {Array} the alerts eligible to push now
 */
function selectPushable(outletId, alerts, opts = {}) {
  const min = SEV_RANK[opts.minSeverity] || SEV_RANK[DEFAULT_MIN_SEVERITY];
  const cooldownMs = typeof opts.cooldownMs === 'number' ? opts.cooldownMs : DEFAULT_COOLDOWN_MS;
  const nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
  const list = Array.isArray(alerts) ? alerts : [];
  return list.filter((a) => {
    if (!a || (SEV_RANK[a.severity] || 0) < min) return false;
    const last = lastPushedAt.get(dedupKey(outletId, a.key));
    return !(last && nowMs - last < cooldownMs);
  });
}

/**
 * Collapse one or more high-severity alerts into a single push payload. One
 * alert → its own title/message; several → a count headline with the individual
 * titles as the body, so the user taps once and sees the list in-app.
 * @param {Array<{key,severity,title,message,cta?}>} alerts (non-empty)
 * @param {{outletId?:string, outletName?:string}} [meta]
 * @returns {{title:string, body:string, data:object}}
 */
function buildAlertPayload(alerts, meta = {}) {
  const top = alerts[0];
  const multi = alerts.length > 1;
  const title = multi
    ? `${alerts.length} alerts need your attention`
    : top.title;
  const body = multi
    ? alerts.map((a) => a.title).join(' · ')
    : top.message;
  return {
    title,
    body,
    data: {
      type: 'assistant_alert',
      outletId: meta.outletId || null,
      outletName: meta.outletName || null,
      count: alerts.length,
      keys: alerts.map((a) => a.key),
      severity: top.severity,
      cta: top.cta || null,
    },
  };
}

/**
 * Push the pushable high-severity alerts for one outlet to every device watching
 * it. Filters by severity + cooldown, delivers via push.service.sendToOutlet
 * (Expo), and records the dedup timestamps. Never throws.
 *
 * @param {string|{id:string, name?:string}} outlet  outlet id or outlet object
 * @param {Array<{key,severity,title,message,cta?}>} alerts  from computeAlerts
 * @param {{minSeverity?:string, cooldownMs?:number, nowMs?:number,
 *          excludeUserId?:string, userIds?:string[]}} [opts]
 * @returns {Promise<{pushed:boolean, sent:number, keys:string[], reason?:string}>}
 */
async function sendAlertPush(outlet, alerts, opts = {}) {
  const outletId = typeof outlet === 'string' ? outlet : (outlet && outlet.id);
  const outletName = typeof outlet === 'object' && outlet ? outlet.name : undefined;
  if (!outletId) return { pushed: false, sent: 0, keys: [], reason: 'no_outlet' };

  const pushable = selectPushable(outletId, alerts, opts);
  if (!pushable.length) return { pushed: false, sent: 0, keys: [], reason: 'nothing_pushable' };

  const payload = buildAlertPayload(pushable, { outletId, outletName });
  const nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();

  let result = { sent: 0, tickets: [] };
  try {
    result = Array.isArray(opts.userIds) && opts.userIds.length
      ? await push.sendToUsers(opts.userIds, payload)
      : await push.sendToOutlet(outletId, payload, { excludeUserId: opts.excludeUserId });
  } catch (e) {
    // push.service is fire-and-forget, but belt-and-braces so we never throw.
    logger.warn('[assistant.push] send failed', { outletId, error: e.message });
  }

  // Record cooldown for the keys we attempted — even if 0 devices were reached,
  // so we don't recompute+attempt the same alert every cron tick.
  for (const a of pushable) lastPushedAt.set(dedupKey(outletId, a.key), nowMs);

  logger.info('[assistant.push] alert push', {
    outletId, keys: pushable.map((a) => a.key), sent: result.sent,
  });
  return { pushed: true, sent: result.sent || 0, keys: pushable.map((a) => a.key) };
}

/**
 * Cron entry-point: for every eligible outlet, compute its alerts and push the
 * high-severity ones. Reuses the digest module's outlet scan + owner-scoped ctx
 * so alert visibility exactly matches the digest email. Sequential + isolated —
 * one outlet's failure never affects the others.
 * @param {{minSeverity?:string, cooldownMs?:number, now?:Date|string}} [opts]
 * @returns {Promise<{outlets:number, pushedOutlets:number, sent:number}>}
 */
async function runAlertPush(opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowMs = now.getTime();
  let outlets = [];
  try { outlets = await listDigestOutlets(); }
  catch (e) { logger.warn('[assistant.push] outlet scan failed', { error: e.message }); }

  let pushedOutlets = 0; let sent = 0;
  for (const outlet of (Array.isArray(outlets) ? outlets : [])) {
    try {
      const ctx = ctxFor(outlet);
      const alerts = await computeAlerts(ctx, now);
      const r = await sendAlertPush(outlet, alerts, {
        minSeverity: opts.minSeverity, cooldownMs: opts.cooldownMs, nowMs,
      });
      if (r.pushed) { pushedOutlets += 1; sent += r.sent; }
    } catch (e) {
      logger.warn('[assistant.push] outlet run failed', { outletId: outlet && outlet.id, error: e.message });
    }
  }
  logger.info('[assistant.push] run complete', { outlets: outlets.length, pushedOutlets, sent });
  return { outlets: outlets.length, pushedOutlets, sent };
}

/** Clear the dedup guard (test helper / manual reset). */
function _resetDedup() { lastPushedAt.clear(); }

module.exports = {
  sendAlertPush,
  runAlertPush,
  selectPushable,
  buildAlertPayload,
  _resetDedup,
  DEFAULT_MIN_SEVERITY,
  DEFAULT_COOLDOWN_MS,
};
