/**
 * @fileoverview Outbound HTTP client for aggregator partner APIs (Swiggy, Zomato,
 * DoorDash, Menulog, Uber Eats).
 *
 * One place where every real call to a delivery platform goes out, so timeout,
 * retry/backoff, auth-header construction and error shaping stay consistent across
 * menu push, availability push and status push-back.
 *
 * Design contract:
 *  - NEVER throws. Always resolves to a structured result `{ ok, status, data,
 *    error, attempts, simulated }`. Callers decide whether to surface the error.
 *  - Credential-gated: when no `api_key` is configured for the outlet+platform the
 *    call is short-circuited to a `simulated: true` result and NO network request
 *    is made — identical observable shape to a real success, so un-provisioned
 *    environments keep working.
 *  - Idempotent retries only: GET/PUT and any call given an `idempotencyKey` retry
 *    on transient failures (network error, timeout, 429, 5xx). Plain POSTs without
 *    an idempotency key are NOT retried, to avoid duplicate side effects.
 *
 * Per-platform request shape (auth scheme, header names) is driven by the optional
 * `auth` block on each PLATFORMS definition in aggregator.service.js. When a real
 * partner contract differs, only that one config block changes — call sites do not.
 *
 * @module modules/integrations/aggregator.http
 */

const logger = require('../../config/logger');

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3; // 1 initial + up to 2 retries
const BASE_BACKOFF_MS = 300;
const MAX_BACKOFF_MS = 4_000;

/**
 * Builds the outbound auth + identity headers for a platform.
 *
 * Strategy is taken from `pDef.auth` (set per platform in aggregator.service.js);
 * defaults to `Authorization: Bearer <api_key>` which is what Swiggy, Zomato,
 * DoorDash, Menulog and Uber Eats all use for partner tokens today. Optional
 * per-outlet identifiers (`client_id`, `partner_id`) are forwarded when present so
 * adding a platform that needs them is a config change, not a code change.
 *
 * @param {object} pDef  platform definition (may carry an `auth` block)
 * @param {object} cfg   per-outlet config (api_key, client_id, partner_id, …)
 * @returns {Record<string,string>}
 */
function buildAuthHeaders(pDef, cfg) {
  const auth = (pDef && pDef.auth) || { type: 'bearer' };
  const key = cfg && cfg.api_key ? String(cfg.api_key) : '';
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

  switch (auth.type) {
    case 'header': {
      // API key carried in a custom header, e.g. { type:'header', name:'X-Partner-Token' }
      headers[auth.name || 'X-Api-Key'] = key;
      break;
    }
    case 'basic': {
      // username = api_key, password from cfg.api_secret (or empty)
      const secret = cfg && cfg.api_secret ? String(cfg.api_secret) : '';
      headers.Authorization = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
      break;
    }
    case 'bearer':
    default:
      headers.Authorization = `${auth.scheme || 'Bearer'} ${key}`;
      break;
  }

  // Optional identity headers — only sent when the outlet has them configured.
  if (cfg && cfg.client_id) headers['X-Client-Id'] = String(cfg.client_id);
  if (cfg && cfg.partner_id) headers['X-Partner-Id'] = String(cfg.partner_id);
  return headers;
}

/** Parses a fetch Response body as JSON, falling back to a bounded raw string. */
async function parseBody(resp) {
  try {
    const text = await resp.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return { raw: text.slice(0, 2000) }; }
  } catch {
    return null;
  }
}

/** Whether a failed attempt should be retried (only for idempotent calls). */
function isRetryable(status, errName) {
  if (errName) return true; // network error / abort/timeout
  return status === 429 || (status >= 500 && status <= 599);
}

/** Resolves the backoff delay for an attempt, honouring Retry-After when present. */
function backoffMs(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_BACKOFF_MS);
  }
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Performs a single outbound request to an aggregator partner API.
 *
 * @param {object}  opts
 * @param {string}  opts.platform        platform key (for logging only)
 * @param {object}  opts.pDef            platform definition (apiUrl, auth, name)
 * @param {object}  opts.cfg             per-outlet config (must carry api_key to go live)
 * @param {string}  opts.url             fully-resolved absolute URL (placeholders substituted)
 * @param {string} [opts.method='POST']
 * @param {*}       [opts.body]          JSON-serialisable request body
 * @param {string} [opts.idempotencyKey] enables retries for POST + dedupe on the platform
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxAttempts]
 * @returns {Promise<{ok:boolean,status:number|null,data:*,error:string|null,attempts:number,simulated?:boolean}>}
 */
async function aggregatorFetch(opts) {
  const {
    platform, pDef, cfg, url,
    method = 'POST', body,
    idempotencyKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = opts;

  // Credential gate — no key means simulate, never hit the network.
  if (!cfg || !cfg.api_key) {
    return {
      ok: true, simulated: true, status: null, attempts: 0, error: null,
      data: { simulated: true, message: `Simulated call to ${pDef ? pDef.name : platform} — add API key to go live` },
    };
  }

  const headers = buildAuthHeaders(pDef, cfg);
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey);

  // Retry only when it is safe: idempotent verbs, or an explicit idempotency key.
  const idempotent = method === 'GET' || method === 'PUT' || method === 'DELETE' || Boolean(idempotencyKey);
  const attemptsAllowed = idempotent ? Math.max(1, maxAttempts) : 1;

  let lastError = null;
  let lastStatus = null;
  let lastData = null;

  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      lastStatus = resp.status;
      lastData = await parseBody(resp);

      if (resp.ok) {
        return { ok: true, status: resp.status, data: lastData, error: null, attempts: attempt };
      }

      lastError = `HTTP ${resp.status}`;
      if (attempt < attemptsAllowed && isRetryable(resp.status, null)) {
        await sleep(backoffMs(attempt, resp.headers.get('retry-after')));
        continue;
      }
      return { ok: false, status: resp.status, data: lastData, error: lastError, attempts: attempt };
    } catch (e) {
      clearTimeout(timer);
      lastError = e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e.message;
      if (attempt < attemptsAllowed && isRetryable(null, e.name || 'Error')) {
        logger.warn(`Aggregator call retry ${attempt}/${attemptsAllowed - 1} for ${pDef ? pDef.name : platform}`, { error: lastError });
        await sleep(backoffMs(attempt, null));
        continue;
      }
      return { ok: false, status: lastStatus, data: lastData, error: lastError, attempts: attempt };
    }
  }

  return { ok: false, status: lastStatus, data: lastData, error: lastError || 'unknown error', attempts: attemptsAllowed };
}

/** Substitutes a `{id}` placeholder (store id) in an endpoint path, URL-encoded. */
function resolveEndpoint(apiUrl, endpoint, storeId) {
  const path = String(endpoint || '').replace('{id}', encodeURIComponent(storeId || ''));
  return `${apiUrl}${path}`;
}

module.exports = {
  aggregatorFetch,
  buildAuthHeaders,
  resolveEndpoint,
  DEFAULT_TIMEOUT_MS,
};
