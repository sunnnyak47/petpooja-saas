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

// ── Status + disconnect ──────────────────────────────────────────────────────
async function getConnectionStatus(outletId) {
  const config = await getConfig(outletId);
  return {
    connected: !!config?.connected,
    configured: isConfigured(),
    environment: config?.environment || (env().isProd ? 'production' : 'sandbox'),
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
  createPayment,
  createTerminalCheckout,
  getConnectionStatus,
  disconnect,
};
