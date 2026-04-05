/**
 * @fileoverview Winston logger configuration with daily rotation.
 * Provides structured JSON logging in production and colorized console in development.
 * @module config/logger
 */

const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

const transports = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
];

if (process.env.NODE_ENV === 'production') {
  try {
    const DailyRotateFile = require('winston-daily-rotate-file');

    transports.push(
      new DailyRotateFile({
        dirname: logDir,
        filename: 'petpooja-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '30d',
        format: logFormat,
        level: 'info',
      }),
      new DailyRotateFile({
        dirname: logDir,
        filename: 'petpooja-error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '20m',
        maxFiles: '90d',
        format: logFormat,
        level: 'error',
      })
    );
  } catch (err) {
    /** Daily rotate file transport not available; console only */
  }
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'petpooja-api' },
  transports,
  exitOnError: false,
});

module.exports = logger;
