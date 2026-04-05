/**
 * @fileoverview HTTP request/response logging middleware using Morgan + Winston.
 * @module middleware/logger
 */

const morgan = require('morgan');
const logger = require('../config/logger');

/**
 * Custom Morgan token for response time with color coding.
 */
morgan.token('colored-status', (req, res) => {
  const status = res.statusCode;
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`;
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`;
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`;
  return `\x1b[32m${status}\x1b[0m`;
});

/**
 * Morgan stream that writes to Winston logger.
 */
const stream = {
  write: (message) => {
    logger.info(message.trim(), { source: 'http' });
  },
};

/**
 * Development HTTP logger — colorized, concise format.
 */
const devLogger = morgan(':method :url :colored-status :response-time ms - :res[content-length]', {
  stream,
  skip: (req) => req.url === '/health',
});

/**
 * Production HTTP logger — structured JSON-compatible format.
 */
const prodLogger = morgan(
  ':remote-addr :method :url :status :response-time ms - :res[content-length]',
  {
    stream,
    skip: (req) => req.url === '/health',
  }
);

/**
 * Returns the appropriate HTTP logger middleware based on NODE_ENV.
 * @returns {import('express').RequestHandler} Morgan middleware instance
 */
function httpLogger() {
  if (process.env.NODE_ENV === 'production') {
    return prodLogger;
  }
  return devLogger;
}

module.exports = { httpLogger };
