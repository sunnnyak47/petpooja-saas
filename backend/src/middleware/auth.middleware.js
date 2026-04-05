/**
 * @fileoverview JWT authentication middleware.
 * Verifies access tokens from the Authorization header and attaches user to request.
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const appConfig = require('../config/app');
const { getRedisClient } = require('../config/redis');
const { UnauthorizedError } = require('../utils/errors');
const logger = require('../config/logger');

/**
 * Express middleware that verifies JWT access token.
 * Checks Authorization header for Bearer token, validates it,
 * checks Redis blacklist, and attaches decoded user to req.user.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token required');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    const redis = getRedisClient();
    const isBlacklisted = await redis.get(`${appConfig.redisKeys.tokenBlacklist}${token}`);

    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    const decoded = jwt.verify(token, appConfig.jwt.secret);

    req.user = {
      id: decoded.id,
      email: decoded.email,
      phone: decoded.phone,
      role: decoded.role,
      outlet_id: decoded.outlet_id,
      head_office_id: decoded.head_office_id,
      primary_color: decoded.primary_color,
      logo_url: decoded.logo_url,
      permissions: decoded.permissions || [],
    };

    req.token = token;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Access token expired'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError('Invalid access token'));
    }
    next(error);
  }
}

/**
 * Optional authentication middleware.
 * Attaches user if valid token present, but does not reject if absent.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    const redis = getRedisClient();
    const isBlacklisted = await redis.get(`${appConfig.redisKeys.tokenBlacklist}${token}`);
    if (isBlacklisted) return next();

    const decoded = jwt.verify(token, appConfig.jwt.secret);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      phone: decoded.phone,
      role: decoded.role,
      outlet_id: decoded.outlet_id,
      head_office_id: decoded.head_office_id,
      primary_color: decoded.primary_color,
      logo_url: decoded.logo_url,
      permissions: decoded.permissions || [],
    };
    req.token = token;
  } catch (err) {
    logger.debug('Optional auth token invalid, proceeding without user');
  }
  next();
}

/**
 * Middleware to check user roles
 * @param {...string} roles — Allowed roles
 */
const hasRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: This action requires role: [${roles.join(', ')}]`,
    });
  }
  next();
};

const isSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: SuperAdmin only.',
    });
  }
  next();
};

module.exports = { authenticate, optionalAuth, hasRole, isSuperAdmin };
