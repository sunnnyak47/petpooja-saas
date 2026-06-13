/**
 * @fileoverview Order status push-back to delivery aggregators.
 *
 * When a restaurant advances an aggregator order (Preparing / Ready / etc.) on the
 * POS or KDS, this service pushes the corresponding status to the originating
 * platform (Uber Eats / DoorDash / Menulog / Swiggy / Zomato).
 *
 * Credential-gated: a real outbound HTTP call is only made when the platform has an
 * `api_key` configured for the outlet. Otherwise the push is simulated and logged so
 * the operation remains observable in non-production / un-provisioned environments.
 *
 * This module has a ONE-WAY dependency on `./aggregator.service` (PLATFORMS,
 * getPlatformConfig, writeSyncLog). aggregator.service does NOT require this module,
 * so there is no require cycle.
 *
 * @module modules/integrations/aggregator.status.service
 */

const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const agg = require('./aggregator.service');

const { PLATFORMS } = agg;

const HTTP_TIMEOUT_MS = 10_000;

/**
 * Writes a sync-log row. Prefers aggregator.service.writeSyncLog (so behaviour
 * stays consistent), but falls back to a direct insert if that helper is not
 * exported in this build. Never throws.
 */
async function writeSyncLog(outletId, platform, syncType, status, itemsSynced, errorMessage, payload, response) {
  try {
    if (typeof agg.writeSyncLog === 'function') {
      return await agg.writeSyncLog(outletId, platform, syncType, status, itemsSynced, errorMessage, payload, response);
    }
    await prisma.aggregatorSyncLog.create({
      data: {
        outlet_id: outletId, platform, sync_type: syncType, status,
        items_synced: itemsSynced || 0, error_message: errorMessage || null,
        payload: payload || null, response: response || null,
      },
    });
  } catch (e) {
    logger.warn('Failed to write aggregator status sync log', { error: e.message });
  }
}

/* ─── Status mapping ────────────────────────────────────────────────────────
 * Maps internal order/KOT statuses → a generic aggregator status code, with
 * per-platform overrides where the platform uses different vocabulary.
 *
 * `default` is the canonical code used when a platform has no specific override.
 * Per-platform keys (swiggy/zomato/doordash/menulog/uber_eats) override it.
 * ──────────────────────────────────────────────────────────────────────────── */
const STATUS_MAP = {
  // Order acknowledged / accepted by the restaurant
  confirmed: { default: 'ACCEPTED', zomato: 'ORDER_ACCEPTED', uber_eats: 'ACCEPTED', doordash: 'CONFIRMED' },
  accepted:  { default: 'ACCEPTED', zomato: 'ORDER_ACCEPTED', uber_eats: 'ACCEPTED', doordash: 'CONFIRMED' },

  // Kitchen has started preparing
  preparing: { default: 'PREPARING', zomato: 'FOOD_PREPARATION', uber_eats: 'IN_PROGRESS', doordash: 'PREPARING' },

  // Food is ready for pickup / handover to rider
  ready:     { default: 'READY_FOR_PICKUP', swiggy: 'FOOD_READY', zomato: 'READY_TO_PICKUP', uber_eats: 'READY_FOR_PICKUP', doordash: 'READY_FOR_PICKUP', menulog: 'READY' },

  // Handed to rider / left the store
  dispatched:       { default: 'DISPATCHED', uber_eats: 'OUT_FOR_DELIVERY', doordash: 'EN_ROUTE', zomato: 'ORDER_PICKED_UP' },
  out_for_delivery: { default: 'OUT_FOR_DELIVERY', doordash: 'EN_ROUTE', zomato: 'ORDER_PICKED_UP' },

  // Order fulfilled / picked up by customer or rider
  completed:  { default: 'COMPLETED', uber_eats: 'DELIVERED', doordash: 'DELIVERED', zomato: 'ORDER_DELIVERED', menulog: 'COMPLETED' },
  picked_up:  { default: 'PICKED_UP', uber_eats: 'PICKED_UP', doordash: 'PICKED_UP', zomato: 'ORDER_PICKED_UP' },

  // Cancelled / rejected by the restaurant
  cancelled:  { default: 'CANCELLED', uber_eats: 'CANCELLED', doordash: 'CANCELLED', zomato: 'ORDER_CANCELLED', menulog: 'CANCELLED' },
  rejected:   { default: 'REJECTED', uber_eats: 'DENIED', doordash: 'CANCELLED', zomato: 'ORDER_REJECTED', menulog: 'REJECTED' },

  // KDS bump button also emits 'served' — treat as ready-for-pickup for delivery.
  served:     { default: 'READY_FOR_PICKUP', swiggy: 'FOOD_READY', zomato: 'READY_TO_PICKUP', uber_eats: 'READY_FOR_PICKUP', doordash: 'READY_FOR_PICKUP', menulog: 'READY' },
};

/**
 * Resolves the platform-specific aggregator status code for an internal status.
 * @param {string} platform
 * @param {string} internalStatus
 * @returns {string|null} mapped status code, or null if unmapped
 */
function mapStatus(platform, internalStatus) {
  const entry = STATUS_MAP[String(internalStatus || '').toLowerCase()];
  if (!entry) return null;
  return entry[platform] || entry.default || null;
}

/**
 * Pushes an order's status to its originating aggregator platform.
 *
 * NEVER throws — always resolves to a result object — because callers invoke this
 * fire-and-forget from request handlers.
 *
 * @param {string} orderId
 * @param {string} internalStatus  one of the STATUS_MAP keys
 * @returns {Promise<object>} result describing what happened
 */
async function pushStatus(orderId, internalStatus) {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      select: { id: true, outlet_id: true, aggregator: true, aggregator_order_id: true, status: true },
    });

    if (!order || !order.aggregator) {
      return { skipped: true, reason: 'not an aggregator order' };
    }

    const platform = order.aggregator;
    const pDef = PLATFORMS[platform];
    if (!pDef) {
      return { skipped: true, reason: `unknown platform: ${platform}` };
    }

    const mappedStatus = mapStatus(platform, internalStatus);
    if (!mappedStatus) {
      return { skipped: true, reason: 'status not mapped' };
    }

    const cfg = await agg.getPlatformConfig(order.outlet_id, platform).catch(() => ({}));

    // ── Simulation mode: no credentials → log + return, no network call ──
    if (!cfg || !cfg.api_key) {
      await writeSyncLog(
        order.outlet_id, platform, 'status_push', 'simulated', 1, null,
        { order_id: order.id, aggregator_order_id: order.aggregator_order_id, internal_status: internalStatus, mapped_status: mappedStatus },
        { simulated: true, message: `Simulated status push to ${pDef.name} — add API key to go live` },
      );
      logger.info(`Simulated status push to ${pDef.name}`, {
        order_id: order.id, internal_status: internalStatus, mapped_status: mappedStatus,
      });
      return { ok: true, simulated: true, mapped_status: mappedStatus };
    }

    // ── Live mode: real outbound HTTP call ──
    if (!order.aggregator_order_id) {
      return { skipped: true, reason: 'missing aggregator_order_id' };
    }

    const url = `${pDef.apiUrl}${pDef.statusEndpoint}`.replace('{id}', encodeURIComponent(order.aggregator_order_id));
    const body = { status: mappedStatus };

    let httpStatus = null;
    let ok = false;
    let responseData = null;
    let errorMsg = null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      httpStatus = resp.status;
      ok = resp.ok;
      responseData = await resp.text().then((t) => {
        try { return JSON.parse(t); } catch { return t ? { raw: t.slice(0, 1000) } : null; }
      }).catch(() => null);
      if (!ok) errorMsg = `HTTP ${httpStatus}`;
    } catch (e) {
      errorMsg = e.name === 'AbortError' ? `timeout after ${HTTP_TIMEOUT_MS}ms` : e.message;
      logger.error(`Status push to ${pDef.name} failed`, { order_id: order.id, error: errorMsg });
    } finally {
      clearTimeout(timer);
    }

    await writeSyncLog(
      order.outlet_id, platform, 'status_push', ok ? 'success' : 'error', ok ? 1 : 0, errorMsg,
      { order_id: order.id, aggregator_order_id: order.aggregator_order_id, internal_status: internalStatus, mapped_status: mappedStatus, url },
      { http_status: httpStatus, response: responseData },
    );

    if (ok) {
      logger.info(`Status pushed to ${pDef.name}`, {
        order_id: order.id, mapped_status: mappedStatus, http_status: httpStatus,
      });
    }

    return { ok, mapped_status: mappedStatus, http_status: httpStatus };
  } catch (e) {
    // Defensive — pushStatus must never throw to its fire-and-forget callers.
    logger.error('pushStatus unexpected failure', { order_id: orderId, error: e.message });
    return { ok: false, error: e.message };
  }
}

/**
 * Convenience wrapper: resolves a KOT's parent order, then pushes the status.
 * @param {string} kotId
 * @param {string} status  internal status (e.g. 'preparing', 'ready')
 * @returns {Promise<object>}
 */
async function pushStatusForKot(kotId, status) {
  try {
    const kot = await prisma.kOT.findFirst({
      where: { id: kotId },
      select: { id: true, order_id: true },
    });
    if (!kot || !kot.order_id) {
      return { skipped: true, reason: 'KOT or order not found' };
    }
    return await pushStatus(kot.order_id, status);
  } catch (e) {
    logger.error('pushStatusForKot unexpected failure', { kot_id: kotId, error: e.message });
    return { ok: false, error: e.message };
  }
}

module.exports = {
  STATUS_MAP,
  mapStatus,
  pushStatus,
  pushStatusForKot,
};
