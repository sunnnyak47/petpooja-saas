/**
 * @fileoverview Square integration service — multi-tenant OAuth + real payments.
 *
 * Model: ONE Square "platform" application (your app-level SQUARE_APPLICATION_ID
 * + SQUARE_APPLICATION_SECRET), and EACH restaurant owner connects their OWN
 * Square account via OAuth. Their per-outlet access/refresh tokens are stored in
 * outlet_settings (same store the other AU integrations use) keyed per outlet, so
 * every outlet charges to its own Square account → money lands in its own bank.
 *
 * No `square` npm SDK is required — we call the REST API directly with global
 * fetch, mirroring the existing xero.service.js approach.
 *
 * @module modules/integrations/square.service
 */
const crypto = require('crypto');
const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');

// Pin an API version so Square doesn't silently change response shapes on us.
const SQUARE_VERSION = '2025-01-23';

// Scopes: payments (online + in-person/Terminal), orders, merchant profile,
// device management for the Terminal path, PLUS read scopes for every Square
// module we pull into combined analytics (customers, loyalty, gift cards,
// catalog, inventory, team/labor, invoices, bookings, disputes, cash drawers).
const SCOPES = [
  'MERCHANT_PROFILE_READ',
  'PAYMENTS_WRITE',
  'PAYMENTS_READ',
  'PAYMENTS_WRITE_IN_PERSON',
  'ORDERS_WRITE',
  'ORDERS_READ',
  'DEVICE_CREDENTIAL_MANAGEMENT',
  // ── read-only analytics scopes ──
  'ITEMS_READ',
  'INVENTORY_READ',
  'CUSTOMERS_READ',
  'LOYALTY_READ',
  'GIFTCARDS_READ',
  'EMPLOYEES_READ',
  'TIMECARDS_READ',
  'INVOICES_READ',
  'APPOINTMENTS_READ',
  'DISPUTES_READ',
  'BANK_ACCOUNTS_READ',
  'CASH_DRAWER_READ',
];

// Square OAuth access tokens last ~30 days. Refresh when fewer than 7 days remain.
const REFRESH_SKEW_MS = 7 * 24 * 60 * 60 * 1000;
// Signed OAuth state is only valid for 15 minutes.
const STATE_TTL_MS = 15 * 60 * 1000;

/** Resolve environment-driven config (sandbox vs production). */
function env() {
  const isProd = String(process.env.SQUARE_ENV || 'sandbox').toLowerCase() === 'production';
  return {
    isProd,
    apiBase: isProd ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com',
    appId: process.env.SQUARE_APPLICATION_ID,
    appSecret: process.env.SQUARE_APPLICATION_SECRET,
    redirectUrl: process.env.SQUARE_REDIRECT_URL,
  };
}

/** True when the server has the app-level Square credentials needed for OAuth. */
function isConfigured() {
  const e = env();
  return !!(e.appId && e.appSecret && e.redirectUrl);
}

// ── Per-outlet token storage (same key scheme as au-integrations.routes.js) ──
function settingKey(outletId) { return `au_integration_square_${outletId}`; }

async function getConfig(outletId) {
  const row = await prisma.outletSetting.findUnique({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: settingKey(outletId) } },
  });
  return row ? JSON.parse(row.setting_value) : null;
}

async function saveConfig(outletId, data) {
  await prisma.outletSetting.upsert({
    where: { outlet_id_setting_key: { outlet_id: outletId, setting_key: settingKey(outletId) } },
    create: { outlet_id: outletId, setting_key: settingKey(outletId), setting_value: JSON.stringify(data), data_type: 'json' },
    update: { setting_value: JSON.stringify(data) },
  });
}

// ── Signed OAuth state ───────────────────────────────────────────────────────
// The callback is hit by a browser redirect (no JWT), so we can't trust a raw
// outlet_id in the URL. We HMAC-sign {outlet_id, timestamp} with the app secret
// and verify it on the way back — prevents anyone forging which outlet a Square
// account gets attached to.
function signState(outletId) {
  const payload = Buffer.from(JSON.stringify({ o: outletId, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', env().appSecret || '').update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyState(state) {
  if (!state || !state.includes('.')) return null;
  const [payload, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', env().appSecret || '').update(payload).digest('base64url');
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.o || Date.now() - data.t > STATE_TTL_MS) return null;
    return data.o;
  } catch { return null; }
}

/** Build the Square consent URL the restaurant owner is sent to. */
function getAuthorizationUrl(outletId) {
  const e = env();
  const params = new URLSearchParams({
    client_id: e.appId,
    scope: SCOPES.join(' '),
    session: 'false',
    state: signState(outletId),
  });
  if (e.redirectUrl) params.set('redirect_uri', e.redirectUrl);
  return `${e.apiBase}/oauth2/authorize?${params.toString()}`;
}

// ── Token exchange + refresh ─────────────────────────────────────────────────
async function exchangeCodeForTokens(outletId, code) {
  const e = env();
  const res = await fetch(`${e.apiBase}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify({
      client_id: e.appId,
      client_secret: e.appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: e.redirectUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('[Square] token exchange failed', { status: res.status, body: JSON.stringify(data).slice(0, 500) });
    throw new Error(data?.errors?.[0]?.detail || `Square token exchange failed (${res.status})`);
  }

  const { merchantName, locationId, currency } = await fetchMerchantAndLocation(e.apiBase, data.access_token, data.merchant_id);
  const prev = await getConfig(outletId);
  const config = {
    connected: true,
    environment: e.isProd ? 'production' : 'sandbox',
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at, // ISO 8601 string from Square
    merchant_id: data.merchant_id,
    merchant_name: merchantName,
    location_id: locationId,
    currency: currency || 'AUD',
    connected_at: new Date().toISOString(),
    total_processed: prev?.total_processed || 0,
    last_transaction: prev?.last_transaction || null,
  };
  await saveConfig(outletId, config);
  logger.info('[Square] outlet connected', { outletId, merchant: merchantName, env: config.environment });
  return config;
}

async function fetchMerchantAndLocation(apiBase, accessToken, merchantId) {
  let merchantName = null; let currency = null; let locationId = null;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Square-Version': SQUARE_VERSION };
  try {
    const mRes = await fetch(`${apiBase}/v2/merchants/${merchantId}`, { headers });
    if (mRes.ok) {
      const m = await mRes.json();
      merchantName = m?.merchant?.business_name || null;
      currency = m?.merchant?.currency || null;
    }
  } catch (err) { logger.warn('[Square] merchant fetch failed', { error: err.message }); }
  try {
    const lRes = await fetch(`${apiBase}/v2/locations`, { headers });
    if (lRes.ok) {
      const l = await lRes.json();
      const loc = (l?.locations || []).find((x) => x.status === 'ACTIVE') || l?.locations?.[0];
      locationId = loc?.id || null;
      if (!currency) currency = loc?.currency || null;
      if (!merchantName) merchantName = loc?.name || null;
    }
  } catch (err) { logger.warn('[Square] location fetch failed', { error: err.message }); }
  return { merchantName, locationId, currency };
}

/** Returns a valid (non-expiring-soon) access token, refreshing if needed. */
async function getValidAccessToken(outletId) {
  const config = await getConfig(outletId);
  if (!config || !config.connected || !config.access_token) {
    throw new Error('Square is not connected for this outlet');
  }
  const expMs = config.expires_at ? new Date(config.expires_at).getTime() : 0;
  if (expMs && (expMs - Date.now() < REFRESH_SKEW_MS) && config.refresh_token) {
    return refreshAccessToken(outletId, config);
  }
  return config.access_token;
}

async function refreshAccessToken(outletId, config) {
  const e = env();
  const res = await fetch(`${e.apiBase}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify({
      client_id: e.appId,
      client_secret: e.appSecret,
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('[Square] token refresh failed', { status: res.status, body: JSON.stringify(data).slice(0, 300) });
    throw new Error('Square token refresh failed — the owner must reconnect Square');
  }
  config.access_token = data.access_token;
  if (data.refresh_token) config.refresh_token = data.refresh_token;
  config.expires_at = data.expires_at;
  await saveConfig(outletId, config);
  return config.access_token;
}

// ── Payments ─────────────────────────────────────────────────────────────────
/**
 * Charge a card token (source_id) via the Square Payments API. The card is
 * tokenized client-side by the Web Payments SDK, so raw PAN never touches us.
 */
async function createPayment(outletId, { amount, source_id, order_id, idempotency_key } = {}) {
  const e = env();
  const config = await getConfig(outletId);
  if (!config?.connected) throw new Error('Square is not connected for this outlet');
  if (!source_id) throw new Error('source_id (card token) is required');
  if (!config.location_id) throw new Error('No Square location on file — reconnect Square');

  const accessToken = await getValidAccessToken(outletId);
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error('Invalid payment amount');

  const body = {
    source_id,
    idempotency_key: idempotency_key || crypto.randomUUID(),
    amount_money: { amount: cents, currency: config.currency || 'AUD' },
    location_id: config.location_id,
  };
  if (order_id) body.reference_id = String(order_id).slice(0, 40);

  const res = await fetch(`${e.apiBase}/v2/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || `Square payment failed (${res.status})`;
    logger.error('[Square] payment failed', { status: res.status, body: JSON.stringify(data).slice(0, 500) });
    throw new Error(msg);
  }

  const payment = data.payment || {};
  config.last_transaction = new Date().toISOString();
  config.total_processed = (config.total_processed || 0) + Number(amount);
  await saveConfig(outletId, config);

  return {
    payment_id: payment.id,
    status: payment.status,
    amount: Number(amount),
    currency: config.currency || 'AUD',
    order_id: order_id || null,
    receipt_url: payment.receipt_url || null,
  };
}

/**
 * Push a charge to a physical Square Terminal/Reader (in-person path). The
 * customer taps/inserts on the device; final status arrives via webhook or by
 * polling the checkout. Requires a paired device_id.
 */
async function createTerminalCheckout(outletId, { amount, device_id, order_id, idempotency_key } = {}) {
  const e = env();
  const config = await getConfig(outletId);
  if (!config?.connected) throw new Error('Square is not connected for this outlet');
  if (!device_id) throw new Error('device_id (Square Terminal) is required');

  const accessToken = await getValidAccessToken(outletId);
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error('Invalid payment amount');

  const checkout = {
    amount_money: { amount: cents, currency: config.currency || 'AUD' },
    device_options: { device_id },
  };
  if (order_id) checkout.reference_id = String(order_id).slice(0, 40);

  const res = await fetch(`${e.apiBase}/v2/terminals/checkouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify({ idempotency_key: idempotency_key || crypto.randomUUID(), checkout }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || `Square Terminal checkout failed (${res.status})`;
    logger.error('[Square] terminal checkout failed', { status: res.status, body: JSON.stringify(data).slice(0, 500) });
    throw new Error(msg);
  }
  const c = data.checkout || {};
  return { checkout_id: c.id, status: c.status, amount: Number(amount), order_id: order_id || null };
}

// ── Payment reconciliation helpers ───────────────────────────────────────────
/** Round to 2dp (money). */
function round2(n) { return Math.round(Number(n) * 100) / 100; }

/**
 * Merge new gateway data into an existing gateway_response JSON blob without
 * losing what previous flows stored (same pattern as razorpay.webhook.service).
 */
function mergeGatewayResponse(existing, incoming) {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  return { ...base, ...incoming };
}

/**
 * Handles a `terminal.checkout.updated` webhook event. When the checkout reaches
 * COMPLETED, records the money as a Payment row and settles the order through
 * the SAME path the online-card flow uses (order.service.processPayment: payment
 * row, conditional is_paid flip, status history, inventory deduction, table
 * lifecycle), then attaches the raw webhook payload as gateway_response.
 *
 * Idempotent: a replayed webhook is a no-op — the Payment row already carries
 * this Square payment id as transaction_id; a concurrent replay loses the
 * conditional is_paid flip inside processPayment and rolls back.
 *
 * Never throws — the webhook route must always be able to answer 200.
 *
 * @param {object} event - Verified Square webhook event body.
 * @returns {Promise<object>} { handled, idempotent?, reason?, payment_id?, order_id? }
 */
async function handleTerminalCheckoutEvent(event) {
  try {
    const checkout = event?.data?.object?.checkout;
    if (!checkout) return { handled: false, reason: 'no_checkout_in_event' };
    const status = String(checkout.status || '').toUpperCase();
    if (status !== 'COMPLETED') {
      // PENDING / IN_PROGRESS / CANCELED etc. — nothing to record.
      return { handled: false, reason: `checkout_status_${status || 'unknown'}` };
    }

    // Tenant routing: the merchant that signed this event → the outlet that
    // connected it. Never trust reference_id alone across tenants.
    const outletId = await findOutletByMerchant(event.merchant_id);
    if (!outletId) return { handled: false, reason: 'unknown_merchant' };

    // createTerminalCheckout threads our order id through reference_id.
    const orderId = checkout.reference_id || null;
    if (!orderId) {
      logger.warn('[Square] terminal checkout completed without reference_id — cannot reconcile', { checkoutId: checkout.id, outletId });
      return { handled: false, reason: 'no_reference_id' };
    }

    // The Square payment id is the durable transaction reference (refunds key on
    // it). Fall back to the checkout id if payment_ids hasn't populated yet.
    const squarePaymentId = (Array.isArray(checkout.payment_ids) && checkout.payment_ids[0]) || checkout.id;

    // Idempotency (replayed webhook): this Square payment was already recorded.
    const existing = await prisma.payment.findFirst({
      where: { order_id: orderId, transaction_id: squarePaymentId, is_deleted: false },
      select: { id: true },
    });
    if (existing) {
      return { handled: true, idempotent: true, payment_id: existing.id, order_id: orderId };
    }

    // Scope the order to the routed outlet (blocks cross-tenant reference_id injection).
    const order = await prisma.order.findFirst({
      where: { id: orderId, outlet_id: outletId, is_deleted: false },
      select: { id: true, is_paid: true },
    });
    if (!order) return { handled: false, reason: 'order_not_found', order_id: orderId };
    if (order.is_paid) {
      // Paid through another path (e.g. cashier settled manually while the
      // terminal processed). Do NOT double-record the money — flag for reconciliation.
      logger.warn('[Square] terminal checkout completed for an already-paid order — skipped recording', {
        orderId, outletId, squarePaymentId, checkoutId: checkout.id,
      });
      return { handled: true, idempotent: true, reason: 'order_already_paid', order_id: orderId };
    }

    // checkout.amount_money is the base amount WE set at creation (tips ride in
    // tip_money), so it reconciles against the order's amount owed.
    const amount = round2(Number(checkout.amount_money?.amount || 0) / 100);
    if (!(amount > 0)) return { handled: false, reason: 'invalid_amount', order_id: orderId };

    // Settle exactly like the online-card path. Lazy require avoids a
    // module-load cycle (order.service pulls in half the app).
    const orderService = require('../orders/order.service');
    let result;
    try {
      result = await orderService.processPayment(
        orderId,
        { method: 'card', amount, transaction_id: squarePaymentId },
        null, // no staff — settled by the Square Terminal webhook
        outletId,
      );
    } catch (err) {
      if (/already paid/i.test(err?.message || '')) {
        // Lost a race against a concurrent settle/replay — its transaction won; ours rolled back.
        return { handled: true, idempotent: true, reason: 'order_already_paid', order_id: orderId };
      }
      logger.error('[Square] terminal checkout settle failed', { orderId, outletId, error: err.message });
      return { handled: false, reason: err.message, order_id: orderId };
    }

    // Attach the raw webhook payload for audit/reconciliation (best-effort).
    try {
      await prisma.payment.update({
        where: { id: result.payment.id },
        data: {
          gateway_response: mergeGatewayResponse(null, {
            source: 'square_terminal_webhook',
            event_type: event.type,
            event_id: event.event_id || null,
            merchant_id: event.merchant_id || null,
            checkout,
            recorded_at: new Date().toISOString(),
          }),
        },
      });
    } catch (err) {
      logger.warn('[Square] could not attach webhook payload to payment', { paymentId: result.payment.id, error: err.message });
    }

    // Keep the connection stats in step with createPayment's behaviour (best-effort).
    try {
      const config = await getConfig(outletId);
      if (config?.connected) {
        config.last_transaction = new Date().toISOString();
        config.total_processed = (config.total_processed || 0) + amount;
        await saveConfig(outletId, config);
      }
    } catch (err) { logger.warn('[Square] stats update failed after terminal settle', { error: err.message }); }

    logger.info('[Square] terminal checkout reconciled to Payment', {
      orderId, outletId, paymentId: result.payment.id, squarePaymentId, amount,
    });
    return { handled: true, payment_id: result.payment.id, order_id: orderId, transaction_id: squarePaymentId, amount };
  } catch (error) {
    logger.error('[Square] terminal checkout webhook processing failed', { error: error.message });
    return { handled: false, error: error.message };
  }
}

// ── Refunds ──────────────────────────────────────────────────────────────────
/**
 * Applies one Square refund state to our Payment row, idempotently.
 *
 * Amount is applied ONCE per refund id (tracked in gateway_response.refund_ids,
 * mirroring razorpay.webhook.service): PENDING/COMPLETED for a refund id we've
 * already seen only refresh status markers; FAILED/REJECTED for a previously
 * applied refund reverses the amount exactly once (gateway_response.refund_failed_ids).
 *
 * @param {object} payment - Our Payment row (fresh read).
 * @param {object} refund - { id, status, amount (major units), reason }
 * @param {string} source - Where this state came from (api | api_mock | webhook event type).
 * @returns {Promise<object>} Result with handled/idempotent flags.
 */
async function recordRefundState(payment, { id, status, amount, reason }, source) {
  const normalized = String(status || '').toUpperCase();
  const prev = payment.gateway_response && typeof payment.gateway_response === 'object' && !Array.isArray(payment.gateway_response)
    ? payment.gateway_response : {};
  const seen = Array.isArray(prev.refund_ids) ? prev.refund_ids : [];
  const failed = Array.isArray(prev.refund_failed_ids) ? prev.refund_failed_ids : [];
  const paid = Number(payment.amount || 0);
  const alreadyRefunded = round2(Number(payment.refund_amount || 0));
  const amt = round2(Number(amount) || 0);

  if (normalized === 'PENDING' || normalized === 'COMPLETED') {
    if (id && seen.includes(id)) {
      // Replay, or PENDING → COMPLETED progression: the amount was applied when
      // this refund id was first seen — never add it twice.
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          gateway_response: mergeGatewayResponse(prev, { last_refund_event: source, last_refund_status: normalized }),
        },
      });
      return { handled: true, idempotent: true, payment_id: payment.id, refund_id: id, status: normalized };
    }

    const newTotal = round2(alreadyRefunded + amt);
    const fullyRefunded = newTotal >= paid - 0.001;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        refund_amount: newTotal,
        refund_id: id || payment.refund_id,
        ...(reason ? { refund_reason: String(reason).slice(0, 1000) } : {}),
        ...(fullyRefunded ? { status: 'refunded' } : {}),
        gateway_response: mergeGatewayResponse(prev, {
          refund_ids: id ? [...seen, id] : seen,
          last_refund_event: source,
          last_refund_status: normalized,
          last_refund_amount: amt,
          total_refunded: newTotal,
          refunded_at: new Date().toISOString(),
        }),
      },
    });
    return { handled: true, payment_id: payment.id, refund_id: id, status: normalized, refund_amount: newTotal, fully_refunded: fullyRefunded };
  }

  if (normalized === 'FAILED' || normalized === 'REJECTED') {
    if (!id || !seen.includes(id) || failed.includes(id)) {
      // Never applied here, or already reversed — nothing to undo.
      return { handled: true, idempotent: true, payment_id: payment.id, refund_id: id || null, status: normalized };
    }
    const newTotal = round2(Math.max(0, alreadyRefunded - amt));
    const stillFully = newTotal >= paid - 0.001;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        refund_amount: newTotal,
        // A payment we flipped to 'refunded' whose refund then failed goes back to settled.
        ...(payment.status === 'refunded' && !stillFully ? { status: 'success' } : {}),
        gateway_response: mergeGatewayResponse(prev, {
          refund_failed_ids: [...failed, id],
          last_refund_event: source,
          last_refund_status: normalized,
          total_refunded: newTotal,
        }),
      },
    });
    return { handled: true, payment_id: payment.id, refund_id: id, status: normalized, refund_amount: newTotal, reversed: true };
  }

  return { handled: false, reason: `unhandled_refund_status_${normalized || 'unknown'}` };
}

/**
 * Refunds a Square payment via Square's Refunds API (POST /v2/refunds — Square
 * REQUIRES an idempotency_key; one is generated when the caller doesn't supply
 * one). Supports partial refunds; the Payment row's refund fields are updated
 * idempotently through recordRefundState so the later refund webhook can't
 * double-apply the amount.
 *
 * Mock mode: with no app-level Square credentials (isConfigured() false) the
 * refund is simulated coherently — same Payment-row bookkeeping, `mock: true`
 * flag — mirroring how the other AU integrations behave without credentials.
 *
 * @param {string} outletId - Outlet UUID (tenant scope).
 * @param {object} opts
 * @param {string} opts.payment_id - OUR Payment row UUID (not the Square id).
 * @param {number} [opts.amount] - Amount in major units; defaults to the full refundable balance.
 * @param {string} [opts.reason] - Refund reason (stored + sent to Square).
 * @param {string} [opts.idempotency_key] - Caller-supplied Square idempotency key.
 * @returns {Promise<object>} Refund result.
 */
async function refundSquarePayment(outletId, { payment_id, amount, reason, idempotency_key } = {}) {
  if (!payment_id) throw new Error('payment_id is required');

  // Tenant guard: the payment must belong to THIS outlet.
  const payment = await prisma.payment.findFirst({
    where: { id: payment_id, outlet_id: outletId, is_deleted: false },
  });
  if (!payment) throw new Error('Payment not found for this outlet');

  const paid = Number(payment.amount || 0);
  if (paid <= 0) throw new Error('Cannot refund this row — it is not a positive payment');
  if (!['success', 'completed'].includes(payment.status)) {
    throw new Error(`Only settled payments can be refunded (payment status: ${payment.status})`);
  }

  const alreadyRefunded = round2(Number(payment.refund_amount || 0));
  const remaining = round2(paid - alreadyRefunded);
  if (remaining <= 0) throw new Error('Payment is already fully refunded');

  const refundAmount = (amount === undefined || amount === null || amount === '') ? remaining : round2(Number(amount));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) throw new Error('Invalid refund amount');
  if (refundAmount > remaining + 0.001) {
    throw new Error(`Refund amount ${refundAmount} exceeds refundable balance ${remaining}`);
  }

  // ── Mock mode (no app credentials): simulate coherently ──
  if (!isConfigured()) {
    const refundId = `mock_refund_${crypto.randomUUID()}`;
    const result = await recordRefundState(payment, { id: refundId, status: 'COMPLETED', amount: refundAmount, reason }, 'api_mock');
    logger.info('[Square] refund simulated (mock — no app credentials)', { outletId, paymentId: payment.id, amount: refundAmount });
    return {
      mock: true,
      refund_id: refundId,
      status: 'COMPLETED',
      amount: refundAmount,
      currency: 'AUD',
      payment_id: payment.id,
      order_id: payment.order_id,
      fully_refunded: !!result.fully_refunded,
      message: 'Refund simulated (mock — configure SQUARE_APPLICATION_ID / SECRET / REDIRECT_URL to refund real payments)',
    };
  }

  // ── Real mode ──
  const e = env();
  const config = await getConfig(outletId);
  if (!config?.connected) throw new Error('Square is not connected for this outlet');
  if (!payment.transaction_id) {
    throw new Error('This payment has no Square payment id (transaction_id) — it cannot be refunded through Square');
  }
  const accessToken = await getValidAccessToken(outletId);

  const body = {
    idempotency_key: idempotency_key || crypto.randomUUID(), // Square requires this
    payment_id: payment.transaction_id,
    amount_money: { amount: Math.round(refundAmount * 100), currency: config.currency || 'AUD' },
  };
  if (reason) body.reason = String(reason).slice(0, 192);

  const res = await fetch(`${e.apiBase}/v2/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || `Square refund failed (${res.status})`;
    logger.error('[Square] refund failed', { status: res.status, body: JSON.stringify(data).slice(0, 500) });
    throw new Error(msg);
  }

  const refund = data.refund || {};
  const result = await recordRefundState(
    payment,
    { id: refund.id, status: refund.status || 'PENDING', amount: refundAmount, reason },
    'api',
  );
  logger.info('[Square] refund created', { outletId, paymentId: payment.id, refundId: refund.id, status: refund.status, amount: refundAmount });
  return {
    mock: false,
    refund_id: refund.id || null,
    status: refund.status || 'PENDING',
    amount: refundAmount,
    currency: config.currency || 'AUD',
    payment_id: payment.id,
    order_id: payment.order_id,
    fully_refunded: !!result.fully_refunded,
  };
}

/**
 * Handles `refund.created` / `refund.updated` webhook events — routes the
 * refund back to our Payment row (transaction_id === refund.payment_id, scoped
 * to the merchant's outlet) and applies the status transition idempotently via
 * recordRefundState. Never throws.
 *
 * @param {object} event - Verified Square webhook event body.
 * @returns {Promise<object>} Result object.
 */
async function handleRefundEvent(event) {
  try {
    const refund = event?.data?.object?.refund;
    if (!refund || !refund.payment_id) return { handled: false, reason: 'malformed_refund_event' };

    const outletId = await findOutletByMerchant(event.merchant_id);
    const where = { transaction_id: refund.payment_id, is_deleted: false };
    if (outletId) where.outlet_id = outletId;

    const payment = await prisma.payment.findFirst({ where, orderBy: { created_at: 'desc' } });
    if (!payment) {
      logger.info('[Square] refund webhook for unknown payment', { squarePaymentId: refund.payment_id, refundId: refund.id });
      return { handled: false, reason: 'no_payment_row' };
    }

    const amount = round2(Number(refund.amount_money?.amount || 0) / 100);
    const result = await recordRefundState(
      payment,
      { id: refund.id, status: refund.status, amount, reason: refund.reason },
      event.type || 'refund.webhook',
    );
    if (result.handled && !result.idempotent) {
      logger.info('[Square] refund webhook applied', { paymentId: payment.id, refundId: refund.id, status: refund.status, amount });
    }
    return result;
  } catch (error) {
    logger.error('[Square] refund webhook processing failed', { error: error.message });
    return { handled: false, error: error.message };
  }
}

// ── Shared API context (used by the analytics pull service) ──────────────────
/**
 * Returns an authenticated Square REST context for an outlet — a valid access
 * token (auto-refreshed), the env-correct API base, location, currency, and the
 * pinned API version. The single entry point the pull service uses.
 */
async function getApiContext(outletId) {
  const config = await getConfig(outletId);
  if (!config?.connected) throw new Error('Square is not connected for this outlet');
  const accessToken = await getValidAccessToken(outletId);
  return {
    apiBase: env().apiBase,
    accessToken,
    version: SQUARE_VERSION,
    merchantId: config.merchant_id || null,
    locationId: config.location_id || null,
    currency: config.currency || 'AUD',
  };
}

// ── Webhooks ─────────────────────────────────────────────────────────────────
/** The full public webhook URL Square signs against (must match the dashboard). */
function webhookUrl() {
  if (process.env.SQUARE_WEBHOOK_URL) return process.env.SQUARE_WEBHOOK_URL;
  const redir = process.env.SQUARE_REDIRECT_URL || '';
  return redir ? redir.replace(/\/oauth\/callback$/, '/webhook') : '';
}

/**
 * Verify a Square webhook. Square signs base64(HMAC-SHA256(signatureKey, url + rawBody)).
 * @param {string} signatureHeader  value of the `x-square-hmacsha256-signature` header
 * @param {Buffer|string} rawBody   the exact raw request body
 * @returns {boolean}
 */
function verifyWebhookSignature(signatureHeader, rawBody) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
  const url = webhookUrl();
  if (!key || !url || !signatureHeader) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const expected = crypto.createHmac('sha256', key).update(url + body).digest('base64');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

/** Map a Square merchant_id back to the outlet that connected it (webhook routing). */
async function findOutletByMerchant(merchantId) {
  if (!merchantId) return null;
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT outlet_id FROM outlet_settings
       WHERE setting_key LIKE 'au_integration_square_%'
         AND setting_value::jsonb->>'merchant_id' = $1
       LIMIT 1`,
      merchantId,
    );
    return rows?.[0]?.outlet_id || null;
  } catch (e) {
    logger.warn('[Square] findOutletByMerchant failed', { error: e.message });
    return null;
  }
}

// ── Status + disconnect ──────────────────────────────────────────────────────
async function getConnectionStatus(outletId) {
  const config = await getConfig(outletId);
  return {
    connected: !!config?.connected,
    configured: isConfigured(),
    environment: config?.environment || (env().isProd ? 'production' : 'sandbox'),
    // Public application id — safe to expose; the Web Payments SDK needs it
    // client-side to tokenize cards (paired with the outlet's location_id).
    application_id: env().appId || null,
    merchant_name: config?.merchant_name || null,
    merchant_id: config?.merchant_id || null,
    location_id: config?.location_id || null,
    last_transaction: config?.last_transaction || null,
    total_processed: config?.total_processed || 0,
  };
}

async function disconnect(outletId) {
  const e = env();
  const config = await getConfig(outletId);
  if (config?.access_token) {
    // Best-effort token revocation at Square (uses app secret as Client auth).
    try {
      await fetch(`${e.apiBase}/oauth2/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Client ${e.appSecret}`, 'Square-Version': SQUARE_VERSION },
        body: JSON.stringify({ client_id: e.appId, access_token: config.access_token }),
      });
    } catch (err) { logger.warn('[Square] token revoke failed', { error: err.message }); }
  }
  await saveConfig(outletId, { connected: false });
  return { connected: false };
}

module.exports = {
  isConfigured,
  getAuthorizationUrl,
  verifyState,
  exchangeCodeForTokens,
  getValidAccessToken,
  getApiContext,
  SQUARE_VERSION,
  verifyWebhookSignature,
  findOutletByMerchant,
  createPayment,
  createTerminalCheckout,
  handleTerminalCheckoutEvent,
  refundSquarePayment,
  handleRefundEvent,
  getConnectionStatus,
  disconnect,
};
