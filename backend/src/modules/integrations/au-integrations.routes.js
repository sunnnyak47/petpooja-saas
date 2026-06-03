/**
 * @fileoverview Australian Franchise Integrations — Xero, Square, MYOB, Google Reviews, Pronto
 * Xero routes delegate to the real OAuth2 xero.service.js
 * MYOB routes delegate to the real myob.service.js for CSV export & BAS
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const {
  xeroConnectSchema,
  xeroExportSchema,
  xeroSyncPOSchema,
  xeroGSTSummarySchema,
  squareConnectSchema,
  squarePaymentSchema,
  squareTerminalSchema,
  myobConnectSchema,
  myobExportSchema,
  googleReviewsConnectSchema,
  googleReviewReplySchema,
  prontoConnectSchema,
  prontoSyncSchema,
} = require('./au-integrations.validation');
const { sendSuccess } = require('../../utils/response');
const logger = require('../../config/logger');
const prisma = require('../../config/database').getDbClient();
const xeroService = require('./accounting/xero.service');
const myobService = require('./accounting/myob.service');
const squareService = require('./square.service');

// ── Helpers ───────────────────────────────────────────────────────────────
function getIntegrationKey(outletId, type) { return `au_integration_${type}_${outletId}`; }

async function saveIntegration(outletId, type, data) {
  const key = getIntegrationKey(outletId, type);
  await prisma.outletSetting.upsert({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: key } },
    create: { outlet_id: outletId, setting_key: key, setting_value: JSON.stringify(data), data_type: 'json' },
    update: { setting_value: JSON.stringify(data) }
  });
}

async function getIntegration(outletId, type) {
  const key = getIntegrationKey(outletId, type);
  const row = await prisma.outletSetting.findUnique({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: key } }
  });
  return row ? JSON.parse(row.setting_value) : null;
}

// ── XERO (OAuth2 via xero.service.js) ────────────────────────────────────

// Get OAuth2 authorization URL — frontend redirects browser to this URL
router.get('/xero/auth-url', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const state = `${outletId}:${Date.now()}`;
    const url = xeroService.getAuthorizationUrl(outletId, state);
    sendSuccess(res, { url, state }, 'Xero authorization URL');
  } catch (e) { next(e); }
});

// OAuth2 callback — frontend sends code after Xero redirect
router.post('/xero/callback', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { code } = req.body;
    const result = await xeroService.exchangeCodeForTokens(outletId, code);
    sendSuccess(res, result, 'Connected to Xero');
  } catch (e) { next(e); }
});

router.get('/xero/status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const result = await xeroService.getConnectionStatus(outletId);
    sendSuccess(res, result, 'Xero status');
  } catch (e) { next(e); }
});

// Legacy connect (saves client_id/secret directly — backward compat)
router.post('/xero/connect', authenticate, validate(xeroConnectSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { client_id, client_secret, org_name } = req.body;
    await saveIntegration(outletId, 'xero', {
      connected: true, client_id, client_secret, org_name,
      connected_at: new Date().toISOString(), last_sync: null, invoices_exported: 0
    });
    sendSuccess(res, { connected: true, org_name }, 'Xero connected');
  } catch (e) { next(e); }
});

// Sync daily sales as Xero invoice
router.post('/xero/export-sales', authenticate, validate(xeroExportSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { from_date, to_date } = req.body;
    const itemised = req.body.itemised !== undefined ? req.body.itemised : true;
    const channel_tracking = req.body.channel_tracking !== undefined ? req.body.channel_tracking : true;
    const reconcile = req.body.reconcile !== undefined ? req.body.reconcile : false;
    const per_order = req.body.per_order !== undefined ? req.body.per_order : false;

    // Per-order mode: push each order as its own Xero invoice
    if (per_order === true) {
      const r = await xeroService.syncOrdersIndividually(outletId, from_date, to_date, { channelTracking: channel_tracking });

      // Pull side: refresh analytics tables in the background. Fire-and-forget.
      if (!r.mock) {
        Promise.resolve(xeroService.syncFromXero(outletId))
          .catch(err => logger.warn('[Xero] background analytics pull failed after export-sales', { error: err.message }));
      }

      return sendSuccess(res, { per_order: true, ...r }, 'Exported per-order invoices to Xero');
    }

    // Daily summary mode: sync each day in the range
    const start = new Date(from_date);
    const end = new Date(to_date);
    const results = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const r = await xeroService.syncDailySales(outletId, dateStr, { itemised, channelTracking: channel_tracking, reconcile });
      results.push(r);
    }
    const totalExported = results.reduce((s, r) => s + r.orders_count, 0);
    const totalAmount = results.reduce((s, r) => s + r.total_amount, 0);
    const reconciledDays = results.reduce((s, r) => s + (r.reconciled === true ? 1 : 0), 0);
    const paymentsCreated = results.reduce((s, r) => s + (r.payments_created || 0), 0);

    // Pull side: refresh the analytics tables (P&L, balance sheet, invoices)
    // in the background so the dashboards reflect the newly-pushed sales.
    // Fire-and-forget — never let a pull failure fail the push response.
    if (!results[0]?.mock) {
      Promise.resolve(xeroService.syncFromXero(outletId))
        .catch(err => logger.warn('[Xero] background analytics pull failed after export-sales', { error: err.message }));
    }

    sendSuccess(res, {
      exported: totalExported,
      total_amount: totalAmount,
      days: results.length,
      reconciled_days: reconciledDays,
      payments_created: paymentsCreated,
      mock: results[0]?.mock || false,
      invoices: results,
    }, 'Exported to Xero');
  } catch (e) { next(e); }
});

// Sync a purchase order as Xero Bill
router.post('/xero/sync-po', authenticate, validate(xeroSyncPOSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { po_id } = req.body;
    const result = await xeroService.syncPurchaseOrder(outletId, { id: po_id });
    sendSuccess(res, result, 'PO synced as Bill in Xero');
  } catch (e) { next(e); }
});

// GST / BAS summary
router.get('/xero/gst-summary', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const { from_date, to_date } = req.query;
    const result = await xeroService.getGSTSummary(outletId, from_date, to_date);
    sendSuccess(res, result, 'GST summary');
  } catch (e) { next(e); }
});

/** POST /api/integrations/au/xero/sync-full — Pull all data from Xero into analytics tables */
router.post('/xero/sync-full', authenticate, async (req, res, next) => {
  try {
    const outletId = req.user.outlet_id;
    // Start in background — sync takes 10–30s; respond immediately so the UI doesn't timeout
    xeroService.syncFromXero(outletId)
      .then(r => console.info(`[Xero] Manual sync done ${outletId}:`, r))
      .catch(e => console.error(`[Xero] Manual sync error ${outletId}:`, e.message));
    sendSuccess(res, { syncing: true }, 'Xero sync started — data will appear in ~30 seconds');
  } catch (err) { next(err); }
});

router.delete('/xero/disconnect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await xeroService.disconnect(outletId);
    sendSuccess(res, result, 'Xero disconnected');
  } catch (e) { next(e); }
});

// ── SQUARE (multi-tenant OAuth + real payments via square.service.js) ───────
// Each restaurant owner connects their OWN Square account; payments charge to
// that outlet's account. See square.service.js for the OAuth + Payments logic.

// Start OAuth — frontend opens the returned URL so the owner can authorize.
router.get('/square/oauth/authorize', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    if (!squareService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Square is not configured on the server (missing SQUARE_APPLICATION_ID / SECRET / REDIRECT_URL).',
      });
    }
    const url = squareService.getAuthorizationUrl(outletId);
    sendSuccess(res, { url }, 'Square authorization URL');
  } catch (e) { next(e); }
});

// OAuth callback — Square redirects the browser here directly (NO auth middleware,
// since there's no JWT on a browser redirect). The outlet is recovered from the
// HMAC-signed `state`. On success we bounce the browser back to the integrations
// page with a ?square=… flag the frontend reads.
router.get('/square/oauth/callback', async (req, res) => {
  const frontend = require('../../config/app').frontendUrl;
  const back = (flag) => res.redirect(`${frontend}/?square=${flag}#/au-integrations`);
  try {
    const { code, state, error } = req.query;
    if (error) { logger.warn('[Square] OAuth denied by user', { error }); return back('denied'); }
    const outletId = squareService.verifyState(state);
    if (!outletId || !code) return back('invalid');
    await squareService.exchangeCodeForTokens(outletId, code);
    return back('connected');
  } catch (e) {
    logger.error('[Square] OAuth callback error', { error: e.message });
    return back('error');
  }
});

router.get('/square/status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await squareService.getConnectionStatus(outletId), 'Square status');
  } catch (e) { next(e); }
});

// Legacy manual-token connect (kept for backward compatibility / direct testing).
router.post('/square/connect', authenticate, validate(squareConnectSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { access_token, merchant_name, location_id } = req.body;
    await saveIntegration(outletId, 'square', {
      connected: true, access_token, merchant_name, location_id,
      environment: process.env.SQUARE_ENV || 'sandbox',
      connected_at: new Date().toISOString(), total_processed: 0,
    });
    sendSuccess(res, { connected: true, merchant_name, location_id }, 'Square connected');
  } catch (e) { next(e); }
});

// Online card payment (Web Payments SDK tokenizes the card → source_id).
router.post('/square/process-payment', authenticate, validate(squarePaymentSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { amount, order_id, source_id, idempotency_key } = req.body;
    const result = await squareService.createPayment(outletId, { amount, order_id, source_id, idempotency_key });
    sendSuccess(res, result, 'Payment processed via Square');
  } catch (e) { next(e); }
});

// In-person payment pushed to a physical Square Terminal/Reader.
router.post('/square/terminal-checkout', authenticate, validate(squareTerminalSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { amount, device_id, order_id, idempotency_key } = req.body;
    const result = await squareService.createTerminalCheckout(outletId, { amount, device_id, order_id, idempotency_key });
    sendSuccess(res, result, 'Terminal checkout started');
  } catch (e) { next(e); }
});

router.delete('/square/disconnect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await squareService.disconnect(outletId), 'Square disconnected');
  } catch (e) { next(e); }
});

// ── MYOB (CSV export via myob.service.js) ────────────────────────────────
router.get('/myob/status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const cfg = await getIntegration(outletId, 'myob');
    sendSuccess(res, {
      connected: !!cfg?.connected,
      company_name: cfg?.company_name || null,
      last_export: cfg?.last_export || null,
      records_exported: cfg?.records_exported || 0,
    }, 'MYOB status');
  } catch (e) { next(e); }
});

router.post('/myob/connect', authenticate, validate(myobConnectSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { api_key, company_file_id, company_name } = req.body;
    await saveIntegration(outletId, 'myob', {
      connected: true, api_key, company_file_id, company_name,
      connected_at: new Date().toISOString(), records_exported: 0
    });
    sendSuccess(res, { connected: true, company_name }, 'MYOB connected');
  } catch (e) { next(e); }
});

// Export sales/expenses/payroll as MYOB-compatible CSV download
router.post('/myob/export', authenticate, validate(myobExportSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { from_date, to_date, type } = req.body;
    const fromStr = new Date(from_date).toISOString().split('T')[0];
    const toStr = new Date(to_date).toISOString().split('T')[0];

    let result;
    if (type === 'expenses') {
      result = await myobService.exportExpensesCSV(outletId, fromStr, toStr);
    } else if (type === 'payroll') {
      result = await myobService.exportPayrollSummary(outletId, fromStr, toStr);
    } else {
      result = await myobService.exportSalesCSV(outletId, fromStr, toStr);
    }

    // Update export counter
    const cfg = await getIntegration(outletId, 'myob');
    if (cfg) {
      await saveIntegration(outletId, 'myob', {
        ...cfg, last_export: new Date().toISOString(),
        records_exported: (cfg.records_exported || 0) + result.count
      });
    }

    // If CSV is empty (no data), return JSON
    if (!result.csv) {
      sendSuccess(res, { type, exported: 0, message: result.message || 'No data found' }, 'No data to export');
      return;
    }

    // Return CSV as downloadable file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  } catch (e) { next(e); }
});

// Export as JSON (for frontend preview before download)
router.post('/myob/export-preview', authenticate, validate(myobExportSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { from_date, to_date, type } = req.body;
    const fromStr = new Date(from_date).toISOString().split('T')[0];
    const toStr = new Date(to_date).toISOString().split('T')[0];

    let result;
    if (type === 'expenses') {
      result = await myobService.exportExpensesCSV(outletId, fromStr, toStr);
    } else if (type === 'payroll') {
      result = await myobService.exportPayrollSummary(outletId, fromStr, toStr);
    } else {
      result = await myobService.exportSalesCSV(outletId, fromStr, toStr);
    }

    sendSuccess(res, {
      type,
      exported: result.count,
      totalAmount: result.totalAmount,
      filename: result.filename,
      message: result.message || `${result.count} records ready for download`,
    }, `MYOB ${type} export preview`);
  } catch (e) { next(e); }
});

// BAS Worksheet calculation
router.get('/myob/bas-worksheet', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const quarter = parseInt(req.query.quarter, 10);
    const year = parseInt(req.query.year, 10);
    if (!quarter || !year) {
      return res.status(400).json({ success: false, message: 'quarter and year are required' });
    }
    const result = await myobService.generateBASWorksheet(outletId, quarter, year);
    sendSuccess(res, result, 'BAS worksheet');
  } catch (e) { next(e); }
});

router.delete('/myob/disconnect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await saveIntegration(outletId, 'myob', { connected: false });
    sendSuccess(res, null, 'MYOB disconnected');
  } catch (e) { next(e); }
});

// ── GOOGLE REVIEWS ────────────────────────────────────────────────────────
// NOTE: Demo data — replace with Google Business Profile API when API key is configured
const MOCK_REVIEWS = [
  { id: 'r1', author: 'Sarah M.', rating: 5, text: 'Absolutely loved the Smashed Avo! Best in Melbourne. Service was impeccable.', date: '2026-04-20', replied: false, sentiment: 'positive' },
  { id: 'r2', author: 'James T.', rating: 4, text: 'Great atmosphere. The barramundi was perfectly cooked. Will definitely return.', date: '2026-04-18', replied: true, sentiment: 'positive' },
  { id: 'r3', author: 'Lisa K.', rating: 3, text: 'Food was good but waited 25 mins for our mains on a quiet Tuesday. Could improve timing.', date: '2026-04-15', replied: false, sentiment: 'neutral' },
  { id: 'r4', author: 'Mike P.', rating: 5, text: 'Best flat white I have had outside of a specialty roaster. Pavlova was divine!', date: '2026-04-12', replied: true, sentiment: 'positive' },
  { id: 'r5', author: 'Emma R.', rating: 2, text: 'Disappointed with the portion sizes for the price. Staff were friendly though.', date: '2026-04-10', replied: false, sentiment: 'negative' },
  { id: 'r6', author: 'David W.', rating: 5, text: 'Took the family for Sunday brunch. Kids loved the Big Brekky. Highly recommend!', date: '2026-04-08', replied: false, sentiment: 'positive' },
];

router.get('/google-reviews/status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const cfg = await getIntegration(outletId, 'google_reviews');
    sendSuccess(res, { connected: !!cfg?.connected, business_name: cfg?.business_name || null, place_id: cfg?.place_id || null }, 'Google Reviews status');
  } catch (e) { next(e); }
});

router.post('/google-reviews/connect', authenticate, validate(googleReviewsConnectSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { api_key, place_id, business_name } = req.body;
    await saveIntegration(outletId, 'google_reviews', { connected: true, api_key, place_id, business_name, connected_at: new Date().toISOString() });
    sendSuccess(res, { connected: true, business_name, place_id }, 'Google Reviews connected');
  } catch (e) { next(e); }
});

router.get('/google-reviews/reviews', authenticate, async (req, res, next) => {
  try {
    const avgRating = (MOCK_REVIEWS.reduce((s, r) => s + r.rating, 0) / MOCK_REVIEWS.length).toFixed(1);
    const sentiment = {
      positive: MOCK_REVIEWS.filter(r => r.sentiment === 'positive').length,
      neutral: MOCK_REVIEWS.filter(r => r.sentiment === 'neutral').length,
      negative: MOCK_REVIEWS.filter(r => r.sentiment === 'negative').length,
    };
    sendSuccess(res, { reviews: MOCK_REVIEWS, total: MOCK_REVIEWS.length, avg_rating: Number(avgRating), sentiment }, 'Reviews retrieved');
  } catch (e) { next(e); }
});

router.post('/google-reviews/reply', authenticate, validate(googleReviewReplySchema), async (req, res, next) => {
  try {
    const { review_id, reply_text } = req.body;
    sendSuccess(res, { review_id, replied: true, reply_text, replied_at: new Date().toISOString() }, 'Reply posted to Google');
  } catch (e) { next(e); }
});

router.delete('/google-reviews/disconnect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await saveIntegration(outletId, 'google_reviews', { connected: false });
    sendSuccess(res, null, 'Google Reviews disconnected');
  } catch (e) { next(e); }
});

// ── PRONTO ────────────────────────────────────────────────────────────────
router.get('/pronto/status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const cfg = await getIntegration(outletId, 'pronto');
    sendSuccess(res, { connected: !!cfg?.connected, site_id: cfg?.site_id || null, last_sync: cfg?.last_sync || null, orders_synced: cfg?.orders_synced || 0 }, 'Pronto status');
  } catch (e) { next(e); }
});

router.post('/pronto/connect', authenticate, validate(prontoConnectSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { api_endpoint, site_id, api_key } = req.body;
    await saveIntegration(outletId, 'pronto', { connected: true, api_endpoint, site_id, api_key, connected_at: new Date().toISOString(), orders_synced: 0 });
    sendSuccess(res, { connected: true, site_id }, 'Pronto connected');
  } catch (e) { next(e); }
});

router.post('/pronto/sync', authenticate, validate(prontoSyncSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const cfg = await getIntegration(outletId, 'pronto');
    const lastSync = cfg?.last_sync ? new Date(cfg.last_sync) : new Date(0);
    const newOrders = await prisma.order.findMany({
      where: { outlet_id: outletId, is_deleted: false, is_paid: true, created_at: { gt: lastSync } },
      select: { id: true },
    });
    const count = newOrders.length;
    await saveIntegration(outletId, 'pronto', { ...cfg, last_sync: new Date().toISOString(), orders_synced: (cfg?.orders_synced || 0) + count });
    sendSuccess(res, { orders_synced: count, last_sync: new Date().toISOString() }, 'Pronto sync complete');
  } catch (e) { next(e); }
});

router.delete('/pronto/disconnect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await saveIntegration(outletId, 'pronto', { connected: false });
    sendSuccess(res, null, 'Pronto disconnected');
  } catch (e) { next(e); }
});

// ── All integrations status overview ─────────────────────────────────────
router.get('/au-status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const [xero, square, myob, google, pronto] = await Promise.all([
      getIntegration(outletId, 'xero'),
      getIntegration(outletId, 'square'),
      getIntegration(outletId, 'myob'),
      getIntegration(outletId, 'google_reviews'),
      getIntegration(outletId, 'pronto'),
    ]);
    sendSuccess(res, {
      xero: { connected: !!xero?.connected, name: 'Xero', description: 'Accounting & invoicing', color: '#13B5EA' },
      square: { connected: !!square?.connected, name: 'Square', description: 'Payment processing', color: '#000000' },
      myob: { connected: !!myob?.connected, name: 'MYOB', description: 'Australian accounting', color: '#7B2FBE' },
      google_reviews: { connected: !!google?.connected, name: 'Google Reviews', description: 'Customer reviews & reputation', color: '#4285F4' },
      pronto: { connected: !!pronto?.connected, name: 'Pronto', description: 'POS system sync', color: '#FF6B35' },
    }, 'AU integrations status');
  } catch (e) { next(e); }
});

module.exports = router;
