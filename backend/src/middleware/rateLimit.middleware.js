/**
 * @fileoverview Rate limiting middleware using express-rate-limit.
 * Provides separate limiters for general API and auth endpoints.
 * @module middleware/rateLimit
 */

const rateLimit = require('express-rate-limit');
const appConfig = require('../config/app');
const { sendError } = require('../utils/response');

/**
 * General API rate limiter: 100 requests per minute per IP.
 */
const generalLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: appConfig.rateLimit.general,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, message: 'Too many requests, please try again later' },
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
  handler: (req, res) => {
    sendError(res, 429, 'Too many requests, please try again later');
  },
});

/**
 * Auth endpoint rate limiter: 5 requests per minute per IP.
 */
const authLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: appConfig.rateLimit.auth,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    sendError(res, 429, 'Too many authentication attempts, please try again later');
  },
});

/**
 * Webhook endpoint rate limiter: 1000 requests per minute.
 * Higher limit for external service callbacks.
 */
const webhookLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    sendError(res, 429, 'Webhook rate limit exceeded');
  },
});

/**
 * File upload rate limiter: 10 uploads per minute per user.
 */
const uploadLimiter = rateLimit({
  windowMs: appConfig.rateLimit.windowMs,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user.id : req.ip;
  },
  handler: (req, res) => {
    sendError(res, 429, 'Too many file uploads, please try again later');
  },
});

module.exports = { generalLimiter, authLimiter, webhookLimiter, uploadLimiter };
