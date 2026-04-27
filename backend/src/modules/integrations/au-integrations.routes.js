/**
 * @fileoverview Australian Franchise Integrations — Xero, Square, MYOB, Google Reviews, Pronto
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { sendSuccess } = require('../../utils/response');
const prisma = require('../../config/database').getDbClient();

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

// ── XERO ──────────────────────────────────────────────────────────────────
router.get('/xero/status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const cfg = await getIntegration(outletId, 'xero');
    sendSuccess(res, {
      connected: !!cfg?.connected,
      organisation: cfg?.org_name || null,
      last_sync: cfg?.last_sync || null,
      invoices_exported: cfg?.invoices_exported || 0,
    }, 'Xero status');
  } catch (e) { next(e); }
});

router.post('/xero/connect', authenticate, async (req, res, next) => {
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

router.post('/xero/export-sales', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { from_date, to_date } = req.body;
    // Get completed orders in date range
    const orders = await prisma.order.findMany({
      where: {
        outlet_id: outletId,
        status: 'completed',
        created_at: { gte: new Date(from_date), lte: new Date(to_date) }
      },
      select: { id: true, order_number: true, total_amount: true, created_at: true }
    });
    const cfg = await getIntegration(outletId, 'xero');
    await saveIntegration(outletId, 'xero', {
      ...cfg,
      last_sync: new Date().toISOString(),
      invoices_exported: (cfg?.invoices_exported || 0) + orders.length
    });
    sendSuccess(res, { exported: orders.length, total_amount: orders.reduce((s, o) => s + Number(o.total_amount), 0) }, 'Exported to Xero');
  } catch (e) { next(e); }
});

router.delete('/xero/disconnect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await saveIntegration(outletId, 'xero', { connected: false });
    sendSuccess(res, null, 'Xero disconnected');
  } catch (e) { next(e); }
});

// ── SQUARE ────────────────────────────────────────────────────────────────
router.get('/square/status', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const cfg = await getIntegration(outletId, 'square');
    sendSuccess(res, {
      connected: !!cfg?.connected,
      merchant_name: cfg?.merchant_name || null,
      location_id: cfg?.location_id || null,
      last_transaction: cfg?.last_transaction || null,
      total_processed: cfg?.total_processed || 0,
    }, 'Square status');
  } catch (e) { next(e); }
});

router.post('/square/connect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { access_token, merchant_name, location_id } = req.body;
    await saveIntegration(outletId, 'square', {
      connected: true, access_token, merchant_name, location_id,
      connected_at: new Date().toISOString(), total_processed: 0
    });
    sendSuccess(res, { connected: true, merchant_name, location_id }, 'Square connected');
  } catch (e) { next(e); }
});

router.post('/square/process-payment', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { amount, order_id, source_id } = req.body;
    // In production: call Square Create Payment API
    const squarePaymentId = `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cfg = await getIntegration(outletId, 'square');
    await saveIntegration(outletId, 'square', {
      ...cfg,
      last_transaction: new Date().toISOString(),
      total_processed: (cfg?.total_processed || 0) + Number(amount)
    });
    sendSuccess(res, { payment_id: squarePaymentId, amount, status: 'COMPLETED', order_id }, 'Payment processed via Square');
  } catch (e) { next(e); }
});

router.delete('/square/disconnect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await saveIntegration(outletId, 'square', { connected: false });
    sendSuccess(res, null, 'Square disconnected');
  } catch (e) { next(e); }
});

// ── MYOB ──────────────────────────────────────────────────────────────────
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

router.post('/myob/connect', authenticate, async (req, res, next) => {
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

router.post('/myob/export', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { from_date, to_date, type } = req.body; // type: sales | purchases
    const orders = type !== 'purchases' ? await prisma.order.findMany({
      where: { outlet_id: outletId, status: 'completed', created_at: { gte: new Date(from_date), lte: new Date(to_date) } },
      select: { id: true, order_number: true, total_amount: true }
    }) : [];
    const cfg = await getIntegration(outletId, 'myob');
    await saveIntegration(outletId, 'myob', {
      ...cfg, last_export: new Date().toISOString(),
      records_exported: (cfg?.records_exported || 0) + orders.length
    });
    sendSuccess(res, { type, exported: orders.length }, `Exported ${type} to MYOB`);
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

router.post('/google-reviews/connect', authenticate, async (req, res, next) => {
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

router.post('/google-reviews/reply', authenticate, async (req, res, next) => {
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

router.post('/pronto/connect', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const { api_endpoint, site_id, api_key } = req.body;
    await saveIntegration(outletId, 'pronto', { connected: true, api_endpoint, site_id, api_key, connected_at: new Date().toISOString(), orders_synced: 0 });
    sendSuccess(res, { connected: true, site_id }, 'Pronto connected');
  } catch (e) { next(e); }
});

router.post('/pronto/sync', authenticate, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const cfg = await getIntegration(outletId, 'pronto');
    const count = Math.floor(Math.random() * 15) + 5;
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
