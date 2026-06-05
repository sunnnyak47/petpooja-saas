/**
 * @fileoverview Request correlation ID middleware.
 *
 * Assigns every request a stable id (`req.id`) and echoes it back in the
 * `X-Request-Id` response header. If an upstream proxy or client already sent
 * an `X-Request-Id`, we trust a sane-looking value so a single id flows across
 * the load balancer → API → logs, which makes a customer-reported error
 * traceable from one id.
 *
 * This runs as early as possible (before logging and rate limiting) so even
 * rejected requests carry an id.
 *
 * @module middleware/requestId
 */

const crypto = require('crypto');

/** Accept only short, safe inbound ids to avoid log-injection / unbounded headers. */
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Express middleware that attaches a correlation id to the request.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming)
    ? incoming
    : crypto.randomUUID();

  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestId };
