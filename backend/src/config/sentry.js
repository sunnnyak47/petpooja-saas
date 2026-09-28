/**
 * @fileoverview Optional Sentry error monitoring (env-gated).
 *
 * Active ONLY when SENTRY_DSN is set. When it is unset, @sentry/node is never
 * even require()d and both exported functions are no-ops — zero behaviour
 * change for existing deployments.
 *
 * initSentry() must run BEFORE express/http are required (see src/app.js):
 * @sentry/node v8+ instruments incoming requests automatically by hooking the
 * http/express modules at require time, which replaces the old explicit
 * `Handlers.requestHandler()` middleware. The error handler is still explicit:
 * setupSentryErrorHandler(app) attaches it to the Express chain after the
 * routes and before the app's own errorHandler; it always forwards the error
 * with next(err), so client responses are unchanged.
 * @module config/sentry
 */

const logger = require('./logger');

/** @type {import('@sentry/node')|null} */
let Sentry = null;

/**
 * Initializes Sentry when SENTRY_DSN is configured; no-op otherwise.
 * Never throws — monitoring must never take the API down.
 * @returns {import('@sentry/node')|null} the initialized SDK, or null
 */
function initSentry() {
  if (!process.env.SENTRY_DSN) return null;
  if (Sentry) return Sentry;

  try {
    // Lazy require: the SDK (and its OpenTelemetry tree) loads only when enabled.
    // eslint-disable-next-line global-require
    const sentry = require('@sentry/node');
    sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || undefined,
      // Performance tracing is opt-in and off by default (errors only).
      tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0') || 0,
    });
    Sentry = sentry;
    logger.info('Sentry error monitoring initialized.');
  } catch (err) {
    Sentry = null;
    logger.warn(`Sentry initialization failed — continuing without error monitoring: ${err.message}`);
  }
  return Sentry;
}

/**
 * Attaches Sentry's Express error handler to the app. Must be registered
 * after all routes and before the app's own error handler. No-op when Sentry
 * is not initialized.
 * @param {import('express').Express} app
 * @returns {void}
 */
function setupSentryErrorHandler(app) {
  if (!Sentry) return;
  try {
    Sentry.setupExpressErrorHandler(app);
    logger.info('Sentry Express error handler attached.');
  } catch (err) {
    logger.warn(`Sentry Express error handler setup failed: ${err.message}`);
  }
}

/**
 * @returns {import('@sentry/node')|null} the SDK when enabled, else null
 */
function getSentry() {
  return Sentry;
}

module.exports = { initSentry, setupSentryErrorHandler, getSentry };
