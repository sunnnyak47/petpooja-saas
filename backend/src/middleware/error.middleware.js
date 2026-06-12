/**
 * @fileoverview Global error handling middleware.
 * Catches all errors and returns standardized error responses.
 * @module middleware/error
 */

const { AppError } = require('../utils/errors');
const logger = require('../config/logger');

/**
 * Global error handler middleware.
 * Differentiates between operational errors (expected) and programming errors (unexpected).
 * Always returns { success: false, data: null, message } format.
 * @param {Error} err - Error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} _next - Express next function
 * @returns {void}
 */
function errorHandler(err, req, res, _next) {
  let statusCode = 500;
  let message = 'Internal server error';
  let validationErrors = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    validationErrors = err.validationErrors || null;

    if (err.isOperational) {
      logger.warn(`Operational error: ${err.message}`, {
        statusCode,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        userId: req.user ? req.user.id : null,
      });
    } else {
      logger.error(`Non-operational error: ${err.message}`, {
        stack: err.stack,
        method: req.method,
        path: req.originalUrl,
      });
    }
  } else if (err.constructor?.name?.startsWith('Prisma') || (typeof err.code === 'string' && err.code.startsWith('P'))) {
    // Prisma known errors
    if (err.code === 'P2002') {
      statusCode = 409;
      message = `A record with this ${err.meta?.target?.join(', ') || 'value'} already exists`;
      logger.warn(`Duplicate record: ${message}`, { path: req.originalUrl });
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = err.meta?.cause || 'Record not found';
      logger.warn(`Not found: ${message}`, { path: req.originalUrl });
    } else if (err.code === 'P2003') {
      statusCode = 400;
      message = 'Referenced record does not exist';
      logger.warn(`FK violation: ${message}`, { path: req.originalUrl });
    } else if (err.code === 'P1001' || err.code === 'P1002') {
      statusCode = 503;
      message = 'Database temporarily unavailable. Please retry.';
      logger.error(`DB unavailable: ${err.code}`, { path: req.originalUrl });
    } else {
      logger.error(`Unhandled Prisma error ${err.code}: ${err.message}`, {
        stack: err.stack, path: req.originalUrl,
      });
    }
  } else if (err.name === 'SyntaxError' && err.status === 400) {
    statusCode = 400;
    message = 'Invalid JSON in request body';
    logger.warn('Malformed JSON received', { path: req.originalUrl, ip: req.ip });
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    logger.warn('Invalid JWT', { path: req.originalUrl });
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired';
    logger.warn('Expired JWT', { path: req.originalUrl });
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File too large. Maximum size is 10MB';
    logger.warn('File upload size limit exceeded', { path: req.originalUrl });
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body too large';
  } else {
    logger.error(`Unhandled error: ${err.message}`, {
      stack: err.stack,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      requestId: req.id,
    });
  }

  // Fire-and-forget persistence for server-side faults only (5xx or
  // non-operational). Operational 4xx noise (validation, not-found, auth) is
  // intentionally skipped. Lazy-required to avoid a require cycle, and any
  // failure here must never affect the response we send the client.
  if (!err.isOperational || statusCode >= 500) {
    require('../modules/monitoring/monitoring.service')
      .recordError({
        source: 'backend',
        level: statusCode >= 500 ? 'error' : 'warn',
        message: err.message,
        name: err.name,
        stack: err.stack,
        status_code: statusCode,
        method: req.method,
        path: req.originalUrl || req.path,
        request_id: req.id,
        user_id: req.user?.id,
        head_office_id: req.user?.head_office_id,
        outlet_id: req.user?.outlet_id,
        user_agent: req.headers?.['user-agent'],
      })
      .catch(() => {});
  }

  const response = {
    success: false,
    data: null,
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : message,
  };

  // Correlation id (set by requestId middleware) so a user can quote it and we
  // can grep the logs straight to this request. Dropped from JSON when absent.
  if (req.id) response.requestId = req.id;

  if (validationErrors) {
    response.errors = validationErrors;
  }

  if (process.env.NODE_ENV === 'development' && statusCode === 500) {
    response.stack = err.stack;
  }

  // Diagnostics: only the platform owner (super_admin) may append ?debug=1 to
  // receive the raw error message + Prisma code on 500s. Restricted to
  // super_admin so tenant users can never read internal schema/constraint
  // details (table/column names, Prisma meta) — that was a data-disclosure leak.
  if (statusCode === 500 && req.query?.debug === '1' && req.user?.role === 'super_admin') {
    response.debug = {
      raw_message: err.message,
      code: err.code || err.name || null,
      meta: err.meta || null,
    };
  }

  res.status(statusCode).json(response);
}

/**
 * Middleware for handling 404 Not Found routes.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {void}
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    data: null,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = { errorHandler, notFoundHandler };
