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

/** Find every outlet with a connected Square integration and refresh it. */
async function nightlyPull() {
  const prisma = getDbClient();
  let outlets = [];
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT outlet_id, setting_value FROM outlet_settings
       WHERE setting_key LIKE 'au_integration_square_%'`,
    );
    outlets = (rows || [])
      .filter((r) => {
        try {
          const cfg = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
          return cfg && cfg.connected;
        } catch { return false; }
      })
      .map((r) => r.outlet_id);
  } catch (e) {
    logger.error('[performance] nightly pull: outlet scan failed', { error: e.message });
    return;
  }

  logger.info(`[performance] nightly Square pull for ${outlets.length} outlet(s)`);
  // Sequential to avoid hammering the Square API / rate limits.
  for (const outletId of outlets) {
    await pullOutlet(outletId, 3);
  }
}

// Run nightly at 02:30 server time.
cron.schedule('30 2 * * *', () => {
  nightlyPull().catch((e) => logger.error('[performance] nightly pull crashed', { error: e.message }));
});

module.exports = { triggerPull, nightlyPull };
