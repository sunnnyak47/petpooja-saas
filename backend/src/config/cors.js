/**
 * @fileoverview Shared CORS origin allowlist — used by BOTH the Express CORS
 * middleware (src/app.js) and the Socket.io CORS check (src/socket/index.js)
 * so the two can never drift apart.
 *
 * EXACT origins only. The previous checks accepted `petpooja-*.vercel.app`
 * (HTTP) and even any `*.vercel.app` (Socket.io) via patterns; with
 * `credentials: true` that let anyone who registered a matching Vercel
 * project make credentialed requests to this API from a hostile page.
 *
 * Known first-party hosts are built in; operators extend the list (never
 * widen it to a pattern) with the comma-separated CORS_ORIGINS env var
 * (CORS_WHITELIST is still honoured for backwards compatibility). Localhost
 * origins are accepted only OUTSIDE production.
 * @module config/cors
 */

const appConfig = require('./app');

/** First-party production hosts — always allowed. */
const KNOWN_ORIGINS = [
  'https://petpooja-saas.vercel.app',
  'https://petpooja-admin.vercel.app',
  'https://getmsrm.com.au',
  'https://www.getmsrm.com.au',
];

const envOrigins = [process.env.CORS_ORIGINS, process.env.CORS_WHITELIST]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter((s) => /^https?:\/\//.test(s)); // exact origins only — no '*' wildcard

/** @type {Set<string>} */
const allowedOrigins = new Set([...KNOWN_ORIGINS, ...envOrigins]);

const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Decides whether a request Origin may use this API cross-origin.
 * @param {string|undefined} origin - the Origin header (undefined for
 *   non-browser clients: mobile apps, curl, Electron — always allowed)
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, '');
  if (allowedOrigins.has(normalized)) return true;
  // Any localhost port for dev/test — never in production
  return appConfig.env !== 'production' && localhostOrigin.test(normalized);
}

module.exports = { isOriginAllowed, allowedOrigins };
