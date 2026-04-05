/**
 * @fileoverview Security hardening middleware — CSP, HSTS, XSS prevention, input sanitization.
 * @module middleware/security
 */

const { BadRequestError } = require('../utils/errors');

/**
 * Sets Content-Security-Policy headers to prevent XSS and data injection.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function contentSecurityPolicy(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://checkout.razorpay.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' wss: https://api.razorpay.com; " +
    "frame-src https://api.razorpay.com; " +
    "object-src 'none'; " +
    "base-uri 'self';"
  );
  next();
}

/**
 * Sets Strict-Transport-Security header for HTTPS enforcement.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function strictTransportSecurity(req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
}

/**
 * Recursively sanitizes string values in objects to prevent XSS.
 * Strips HTML tags and dangerous characters from user input.
 * @param {*} input - Value to sanitize
 * @returns {*} Sanitized value
 */
function sanitizeValue(input) {
  if (typeof input === 'string') {
    return input
      .replace(/<script[^>]*?>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/data:\s*text\/html/gi, '')
      .trim();
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeValue);
  }
  if (input && typeof input === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeValue(value);
    }
    return sanitized;
  }
  return input;
}

/**
 * Express middleware that sanitizes req.body, req.query, req.params.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function inputSanitizer(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeValue(req.params);
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Validates that UUIDs in common param positions are actually valid UUIDs.
 * Prevents NoSQL/Prisma injection via malformed IDs.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function validateUUIDs(req, res, next) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidParams = ['id', 'orderId', 'itemId', 'customerId', 'userId'];

  for (const param of uuidParams) {
    if (req.params[param] && !uuidRegex.test(req.params[param])) {
      return next(new BadRequestError(`Invalid ${param} format`));
    }
  }
  next();
}

/**
 * Blocks requests with suspiciously large payloads beyond expected limits.
 * @param {number} maxSize - Maximum body size in bytes (default 1MB)
 * @returns {import('express').RequestHandler}
 */
function payloadSizeGuard(maxSize = 1048576) {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxSize) {
      return next(new BadRequestError(`Payload too large. Maximum: ${Math.round(maxSize / 1024)}KB`));
    }
    next();
  };
}

/**
 * Additional security headers beyond what helmet provides.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function additionalHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self)');
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = {
  contentSecurityPolicy, strictTransportSecurity, inputSanitizer,
  validateUUIDs, payloadSizeGuard, additionalHeaders, sanitizeValue,
};
