/**
 * @fileoverview Own-delivery dispatch service — delivery-as-a-service.
 * A restaurant requests a courier from Uber Direct / DoorDash Drive for its OWN
 * orders (QR/web/phone): quote → create → track → cancel.
 *
 * Credential-gated: real provider HTTP is performed only when the provider's API
 * key is configured in the environment. Otherwise every operation is SIMULATED
 * deterministically so the feature is testable end-to-end without credentials.
 * @module modules/delivery/dispatch.service
 */

const prisma = require('../../config/database').getDbClient();
const logger = require('../../config/logger');
const { BadRequestError, NotFoundError } = require('../../utils/errors');

/**
 * Supported courier providers and their endpoints.
 * `apiUrl` falls back to the public provider base; `keyEnv` names the env var
 * that holds the credential. Presence of that credential gates real HTTP.
 */
const PROVIDERS = {
  uber_direct: {
    name: 'Uber Direct',
    apiUrl: process.env.UBER_DIRECT_API_URL || 'https://api.uber.com/v1/deliveries',
    keyEnv: 'UBER_DIRECT_API_KEY',
  },
  doordash_drive: {
    name: 'DoorDash Drive',
    apiUrl: process.env.DOORDASH_DRIVE_API_URL || 'https://openapi.doordash.com/drive/v2',
    keyEnv: 'DOORDASH_DRIVE_API_KEY',
  },
};

const HTTP_TIMEOUT_MS = 10_000;

/** Rounds a value to 2 decimal places, returning a Number. */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Resolves the configured credential for a provider (supports UBER_DIRECT_TOKEN alias). */
function getProviderKey(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return null;
  const key = process.env[cfg.keyEnv];
  if (key) return key;
  // Uber Direct accepts a bearer token under an alternate env name.
  if (provider === 'uber_direct' && process.env.UBER_DIRECT_TOKEN) {
    return process.env.UBER_DIRECT_TOKEN;
  }
  return null;
}

/**
 * Whether real provider HTTP can be performed for this provider.
 * @param {string} provider
 * @returns {boolean}
 */
function isConfigured(provider) {
  return Boolean(getProviderKey(provider));
}

/** Validates the provider id, throwing BadRequestError if unknown. */
function assertProvider(provider) {
  if (!PROVIDERS[provider]) {
    throw new BadRequestError(`Unsupported delivery provider: ${provider}`);
  }
}

/**
 * Performs a fetch with a hard 10s timeout via AbortController. Never used in
 * simulation mode — only when credentials are present.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deterministic simulated courier fee. Base A$8.90 plus a small, stable surcharge
 * derived from the dropoff address length so the same input always yields the
 * same quote (no Math.random — must be reproducible for tests).
 */
function simulatedFee(dropoffAddress = '') {
  const surcharge = Math.min(6, (String(dropoffAddress).length % 12) * 0.5);
  return round2(8.9 + surcharge);
}

/**
 * Gets a delivery quote. Does NOT persist anything.
 * @param {string} outletId
 * @param {object} input
 * @param {string} input.provider
 * @param {string} input.dropoff_address
 * @param {number} [input.dropoff_lat]
 * @param {number} [input.dropoff_lng]
 * @param {string} [input.order_id]
 * @returns {Promise<{provider:string,fee:number,currency:string,eta_minutes:number,simulated:boolean,quote_id?:string}>}
 */
async function getQuote(outletId, { provider, dropoff_address, dropoff_lat, dropoff_lng, order_id } = {}) {
  if (!outletId) throw new BadRequestError('outlet_id is required');
  assertProvider(provider);
  if (!dropoff_address) throw new BadRequestError('dropoff_address is required');

  if (isConfigured(provider)) {
    const cfg = PROVIDERS[provider];
    try {
      const url = provider === 'doordash_drive'
        ? `${cfg.apiUrl}/quotes`
        : `${cfg.apiUrl}/quote`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getProviderKey(provider)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dropoff_address,
          dropoff_latitude: dropoff_lat,
          dropoff_longitude: dropoff_lng,
          external_order_id: order_id,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Provider quote ${res.status}: ${text.slice(0, 200)}`);
      }
      const body = await res.json();
      const feeCents = body.fee ?? body.fee_amount ?? body.delivery_fee;
      return {
        provider,
        quote_id: body.id || body.quote_id || body.external_delivery_id || null,
        fee: round2((Number(feeCents) || 0) / (body.fee != null && body.fee > 1000 ? 100 : 1)),
        currency: body.currency || body.currency_type || 'AUD',
        eta_minutes: body.duration ?? body.dropoff_eta_minutes ?? 30,
        simulated: false,
      };
    } catch (err) {
      logger.error('Delivery quote failed, provider HTTP error', { provider, error: err.message });
      throw new BadRequestError(`Failed to get quote from ${cfg.name}: ${err.message}`);
    }
  }

  // SIMULATION — deterministic, no network.
  return {
    provider,
    quote_id: `simq_${provider}_${Date.now()}`,
    fee: simulatedFee(dropoff_address),
    currency: 'AUD',
    eta_minutes: 30,
    simulated: true,
  };
}

/**
 * Creates a courier delivery: persists a deliveryDispatch row, then either calls
 * the provider (configured) or simulates the external booking.
 * @param {string} outletId
 * @param {object} data
 * @param {object} [user]
 * @returns {Promise<object>} the persisted dispatch
 */
async function createDelivery(outletId, data, user) {
  if (!outletId) throw new BadRequestError('outlet_id is required');
  const { provider } = data;
  assertProvider(provider);

  const fee = data.fee != null ? round2(data.fee) : 0;
  const currency = data.currency || 'AUD';

  // Persist first so we always have a tracked record, even if the provider call
  // fails afterwards (status stays 'created' and can be retried/cancelled).
  let dispatch = await prisma.deliveryDispatch.create({
    data: {
      outlet_id: outletId,
      order_id: data.order_id || null,
      provider,
      status: 'created',
      fee,
      currency,
      pickup_name: data.pickup_name || null,
      pickup_address: data.pickup_address || null,
      dropoff_name: data.dropoff_name || null,
      dropoff_phone: data.dropoff_phone || null,
      dropoff_address: data.dropoff_address || null,
      quote_id: data.quote_id || null,
      created_by: user?.id || null,
    },
  });

  if (isConfigured(provider)) {
    const cfg = PROVIDERS[provider];
    try {
      const url = provider === 'doordash_drive'
        ? `${cfg.apiUrl}/deliveries`
        : cfg.apiUrl;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getProviderKey(provider)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quote_id: data.quote_id,
          pickup_name: data.pickup_name,
          pickup_address: data.pickup_address,
          dropoff_name: data.dropoff_name,
          dropoff_phone_number: data.dropoff_phone,
          dropoff_address: data.dropoff_address,
          external_order_id: data.order_id,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Provider create ${res.status}: ${text.slice(0, 200)}`);
      }
      const body = await res.json();
      dispatch = await prisma.deliveryDispatch.update({
        where: { id: dispatch.id },
        data: {
          external_id: body.id || body.external_delivery_id || body.delivery_id || null,
          tracking_url: body.tracking_url || body.tracking_url_v2 || null,
          status: mapProviderStatus(body.status) || 'created',
          courier_name: body.courier?.name || null,
          courier_phone: body.courier?.phone_number || null,
          eta: parseEta(body.dropoff_eta || body.pickup_eta),
          raw: body,
        },
      });
    } catch (err) {
      logger.error('Delivery create failed at provider; row kept as created', {
        provider, dispatch_id: dispatch.id, error: err.message,
      });
      dispatch = await prisma.deliveryDispatch.update({
        where: { id: dispatch.id },
        data: { status: 'failed', raw: { error: err.message } },
      });
      throw new BadRequestError(`Failed to create delivery with ${cfg.name}: ${err.message}`);
    }
  } else {
    // SIMULATION — deterministic external booking.
    dispatch = await prisma.deliveryDispatch.update({
      where: { id: dispatch.id },
      data: {
        external_id: `sim_${provider}_${dispatch.id}`,
        tracking_url: `https://track.example/${dispatch.id}`,
        status: 'created',
        raw: { simulated: true },
      },
    });
  }

  return dispatch;
}

/**
 * Lists dispatches for an outlet (newest first), with optional filters + paging.
 * @returns {Promise<{rows:object[],total:number}>}
 */
async function list(outletId, { provider, status, page = 1, limit = 50 } = {}) {
  if (!outletId) throw new BadRequestError('outlet_id is required');
  const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const current = Math.max(parseInt(page, 10) || 1, 1);
  const where = { outlet_id: outletId, is_deleted: false };
  if (provider) where.provider = provider;
  if (status) where.status = status;

  const [rows, total] = await Promise.all([
    prisma.deliveryDispatch.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (current - 1) * take,
      take,
    }),
    prisma.deliveryDispatch.count({ where }),
  ]);

  return { rows, total };
}

/**
 * Fetches a single dispatch scoped to the outlet.
 * @throws {NotFoundError} when missing.
 */
async function getOne(id, outletId) {
  const dispatch = await prisma.deliveryDispatch.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!dispatch) throw new NotFoundError('Delivery dispatch not found');
  return dispatch;
}

/**
 * Cancels a dispatch. Only allowed when not already delivered/canceled.
 * Calls the provider cancel endpoint when configured.
 */
async function cancel(id, outletId, user) {
  const dispatch = await getOne(id, outletId);

  if (['delivered', 'canceled'].includes(dispatch.status)) {
    throw new BadRequestError(`Cannot cancel a ${dispatch.status} delivery`);
  }

  if (isConfigured(dispatch.provider) && dispatch.external_id) {
    const cfg = PROVIDERS[dispatch.provider];
    try {
      const url = dispatch.provider === 'doordash_drive'
        ? `${cfg.apiUrl}/deliveries/${dispatch.external_id}/cancel`
        : `${cfg.apiUrl}/${dispatch.external_id}/cancel`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getProviderKey(dispatch.provider)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'canceled_by_merchant' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Provider cancel ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (err) {
      logger.error('Delivery cancel failed at provider', {
        provider: dispatch.provider, dispatch_id: id, error: err.message,
      });
      throw new BadRequestError(`Failed to cancel with ${cfg.name}: ${err.message}`);
    }
  }

  return prisma.deliveryDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'canceled', raw: { ...(dispatch.raw || {}), canceled_by: user?.id || null } },
  });
}

/**
 * Handles an inbound provider webhook (status updates / courier assignment).
 * Finds the dispatch by external_id and patches it. Never throws — webhooks must
 * always be acknowledged so the provider doesn't endlessly retry.
 * @returns {Promise<object|null>} the updated dispatch, or null if unmatched.
 */
async function handleWebhook(provider, payload = {}) {
  try {
    if (!PROVIDERS[provider]) return null;
    const externalId = payload.id
      || payload.external_id
      || payload.delivery_id
      || payload.external_delivery_id
      || payload.data?.id;
    if (!externalId) return null;

    const dispatch = await prisma.deliveryDispatch.findFirst({
      where: { external_id: String(externalId), is_deleted: false },
    });
    if (!dispatch) return null;

    const patch = { raw: payload };
    const mapped = mapProviderStatus(payload.status || payload.event || payload.data?.status);
    if (mapped) patch.status = mapped;

    const courierName = payload.courier?.name || payload.dasher?.name;
    const courierPhone = payload.courier?.phone_number || payload.dasher?.phone_number;
    const trackingUrl = payload.tracking_url || payload.tracking_url_v2;
    const eta = parseEta(payload.dropoff_eta || payload.eta || payload.estimated_dropoff_time);

    if (courierName) patch.courier_name = courierName;
    if (courierPhone) patch.courier_phone = courierPhone;
    if (trackingUrl) patch.tracking_url = trackingUrl;
    if (eta) patch.eta = eta;

    return await prisma.deliveryDispatch.update({ where: { id: dispatch.id }, data: patch });
  } catch (err) {
    logger.error('Delivery webhook handling failed (swallowed)', { provider, error: err.message });
    return null;
  }
}

/** Normalizes provider-specific status strings to our internal status set. */
function mapProviderStatus(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (['delivered', 'dropoff_complete', 'completed'].includes(s)) return 'delivered';
  if (['canceled', 'cancelled'].includes(s)) return 'canceled';
  if (['failed', 'returned'].includes(s)) return 'failed';
  if (['pickup', 'pickup_complete', 'picked_up', 'en_route_to_pickup', 'arrived_at_pickup'].includes(s)) return 'pickup';
  if (['dropoff', 'en_route_to_dropoff', 'arrived_at_dropoff', 'delivering'].includes(s)) return 'dropoff';
  if (['quote'].includes(s)) return 'quote';
  if (['created', 'pending', 'scheduled', 'confirmed'].includes(s)) return 'created';
  return null;
}

/** Parses an ETA value (ISO string, epoch seconds, or epoch ms) into a Date. */
function parseEta(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = {
  PROVIDERS,
  isConfigured,
  getQuote,
  createDelivery,
  list,
  getOne,
  cancel,
  handleWebhook,
  round2,
};
