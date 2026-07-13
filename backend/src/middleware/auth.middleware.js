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
const prisma = require('../config/database').getDbClient();
const { isPlatformRole } = require('../modules/superadmin/platform-rbac');
const sessionService = require('../modules/auth/session.service');

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
    let isBlacklisted = false;
    try {
      isBlacklisted = await redis.get(`${appConfig.redisKeys.tokenBlacklist}${token}`);
    } catch (redisErr) {
      // Redis unreachable. The blacklist is how we honour logout/revocation, so
      // skipping it (fail-open) means revoked tokens are accepted for up to the
      // 15m access-token TTL — a security hole. Default = FAIL CLOSED.
      // Escape hatch: set AUTH_FAIL_OPEN_ON_REDIS_ERROR=true to prioritise
      // availability (e.g. if prod Redis is flaky and you accept the risk).
      logger.error('Redis unavailable for token blacklist check.', {
        error: redisErr.message,
        failMode: process.env.AUTH_FAIL_OPEN_ON_REDIS_ERROR === 'true' ? 'open' : 'closed',
      });
      if (process.env.AUTH_FAIL_OPEN_ON_REDIS_ERROR !== 'true') {
        return res.status(503).json({
          success: false,
          message: 'Authentication service temporarily unavailable. Please retry.',
        });
      }
    }

    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    const decoded = jwt.verify(token, appConfig.jwt.secret);

    // Per-device revocation: a session signed out from the Devices & Security
    // page (or "log out other devices") sets a Redis flag keyed by the token's
    // sid. Fail-open on Redis outage — the wrapper returns null rather than
    // throwing — consistent with the blacklist check above.
    if (decoded.sid && await sessionService.isSessionRevoked(decoded.sid)) {
      throw new UnauthorizedError('Session has been signed out');
    }

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
      sid: decoded.sid || null,
    };

    req.token = token;

    // Block suspended chains (tenant users only; platform staff are outlet-less)
    if (req.user.head_office_id && !isPlatformRole(req.user.role)) {
      try {
        const ho = await prisma.headOffice.findUnique({
          where: { id: req.user.head_office_id },
          select: { is_active: true },
        });
        if (ho && ho.is_active === false) {
          return res.status(403).json({
            success: false,
            message: 'Your account has been suspended. Contact support.',
          });
        }
      } catch (_) {
        // DB unreachable — allow through to avoid blocking valid sessions
      }
    }

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
    try {
      const isBlacklisted = await redis.get(`${appConfig.redisKeys.tokenBlacklist}${token}`);
      if (isBlacklisted) { return next(); }
    } catch (redisErr) {
      logger.warn('Redis error in optionalAuth, passing through', { error: redisErr.message });
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

/**
 * Gate the SuperAdmin console: the user must hold ANY platform role
 * (super_admin or a scoped platform_* staff role). Per-route capability is
 * then enforced by requirePlatformPermission().
 */
const isSuperAdmin = (req, res, next) => {
  if (!req.user || !isPlatformRole(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: SuperAdmin only.',
    });
  }
  next();
};

/**
 * Require one of the given platform permission keys on the current platform
 * staff user. `super_admin` always passes (god account). Scoped staff are
 * checked against the `permissions` array carried in their JWT.
 * @param {...string} keys — accepted permission keys (any-of)
 */
const requirePlatformPermission = (...keys) => (req, res, next) => {
  if (!req.user || !isPlatformRole(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: SuperAdmin only.',
    });
  }
  if (req.user.role === 'super_admin') return next(); // founder/god account
  const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
  if (!keys.some((k) => perms.includes(k))) {
    return res.status(403).json({
      success: false,
      message: `Access Denied: your role lacks permission (${keys.join(' or ')}).`,
    });
  }
  next();
};

module.exports = { authenticate, optionalAuth, hasRole, isSuperAdmin, requirePlatformPermission };
