/**
 * @fileoverview Background jobs for combined performance analytics.
 *  - Nightly auto-pull: refreshes Square snapshots for every connected outlet so
 *    owners never have to click "Refresh".
 *  - triggerPull(): a debounced helper the Square webhook calls to refresh an
 *    outlet's recent data in near-real-time after a payment/refund/payout.
 * @module modules/performance/performance.cron
 */
const cron = require('node-cron');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const squarePull = require('./square.pull.service');

// Per-outlet debounce so a burst of webhooks doesn't trigger overlapping pulls.
const _lastPull = new Map(); // outletId -> epoch ms
const DEBOUNCE_MS = 90 * 1000;

/** Pull recent Square data for one outlet, swallowing errors. */
async function pullOutlet(outletId, days) {
  try {
    const r = await squarePull.pullAll(outletId, { days });
    logger.info(`[performance] Square pull ok for ${outletId}`, { days_pulled: r?.days_pulled });
    return r;
  } catch (e) {
    logger.warn(`[performance] Square pull failed for ${outletId}: ${e.message}`);
    return null;
  }
}

/**
 * Debounced, fire-and-forget refresh used by the webhook. Refreshes the last
 * couple of days; runs at most once per 90s per outlet.
 */
function triggerPull(outletId) {
  if (!outletId) return;
  const now = Date.now();
  if (now - (_lastPull.get(outletId) || 0) < DEBOUNCE_MS) return;
  _lastPull.set(outletId, now);
  pullOutlet(outletId, 2); // fire and forget — webhook already responded 200
}

/**
 * Nightly refresh of BOTH sides of the analytics: Square snapshots for every
 * connected outlet, then a Xero re-sync for every Xero-connected outlet.
 *
 * Why Xero is refreshed here (daily) and NOT on webhooks: Xero's financials
 * change slowly and `syncFromXero` is heavy + Xero enforces strict API rate
 * limits (60/min, 5000/day per org). A once-daily, off-peak resync keeps the
 * financial side fresh without risking throttling. Payments stay real-time via
 * the Square webhook.
 */
async function nightlyPull() {
  const prisma = getDbClient();

  // ── Square-connected outlets ──
  let squareOutlets = [];
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT outlet_id, setting_value FROM outlet_settings
       WHERE setting_key LIKE 'au_integration_square_%'`,
    );
    squareOutlets = (rows || [])
      .filter((r) => {
        try {
          const cfg = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
          return cfg && cfg.connected;
        } catch { return false; }
      })
      .map((r) => r.outlet_id);
  } catch (e) {
    logger.error('[performance] nightly: Square outlet scan failed', { error: e.message });
  }

  // ── Xero-connected outlets ──
  let xeroOutlets = [];
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT outlet_id FROM xero_connections WHERE is_connected = true`,
    );
    xeroOutlets = (rows || []).map((r) => r.outlet_id);
  } catch (e) {
    logger.warn('[performance] nightly: Xero outlet scan failed', { error: e.message });
  }

  logger.info(`[performance] nightly refresh: ${squareOutlets.length} Square + ${xeroOutlets.length} Xero outlet(s)`);

  // Sequential to avoid hammering either API / rate limits.
  for (const outletId of squareOutlets) {
    await pullOutlet(outletId, 3);
  }

  // Lazy-require Xero service so this module loads cheaply at startup.
  let xeroService = null;
  try { xeroService = require('../integrations/accounting/xero.service'); } catch (_e) { /* unavailable */ }
  if (xeroService && typeof xeroService.syncFromXero === 'function') {
    for (const outletId of xeroOutlets) {
      try {
        await xeroService.syncFromXero(outletId);
        logger.info(`[performance] Xero resync ok for ${outletId}`);
      } catch (e) {
        logger.warn(`[performance] Xero resync failed for ${outletId}: ${e.message}`);
      }
    }
  }
}

// Run nightly at 02:30 server time.
cron.schedule('30 2 * * *', () => {
  nightlyPull().catch((e) => logger.error('[performance] nightly pull crashed', { error: e.message }));
});

module.exports = { triggerPull, nightlyPull };
