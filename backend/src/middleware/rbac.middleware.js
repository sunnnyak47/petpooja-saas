/**
 * @fileoverview Role-Based Access Control middleware.
 * Provides middleware factories for role and permission checks.
 * @module middleware/rbac
 */

const { ForbiddenError } = require('../utils/errors');

/**
 * Valid system roles in hierarchical order.
 * @type {string[]}
 */
const VALID_ROLES = ['super_admin', 'owner', 'manager', 'cashier', 'kitchen_staff', 'delivery_boy'];

/**
 * Middleware factory: restricts access to users with specified roles.
 * @param {...string} allowedRoles - Roles allowed to access the endpoint
 * @returns {import('express').RequestHandler}
 * @example
 * router.get('/admin', authenticate, hasRole('super_admin', 'owner'), controller);
 */
function hasRole(...allowedRoles) {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        throw new ForbiddenError('No role assigned to user');
      }

      if (!allowedRoles.includes(req.user.role)) {
        throw new ForbiddenError(
          `Role '${req.user.role}' does not have access. Required: ${allowedRoles.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory: restricts access to users with a specific permission.
 * @param {string} requiredPermission - Permission key to check
 * @returns {import('express').RequestHandler}
 * @example
 * router.post('/void', authenticate, hasPermission('VOID_ORDER'), controller);
 */
function hasPermission(requiredPermission) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      if (req.user.role === 'super_admin') {
        return next();
      }

      const userPermissions = req.user.permissions || [];
      if (!userPermissions.includes(requiredPermission)) {
        throw new ForbiddenError(
          `Missing required permission: ${requiredPermission}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware: ensures the user can only access data for their own outlet.
 * Owners and super_admins can access any outlet.
 * Managers, cashiers, etc. are restricted to their assigned outlet_id.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function enforceOutletScope(req, res, next) {
  try {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    if (['super_admin', 'owner'].includes(req.user.role)) {
      return next();
    }

    const requestedOutletId = req.params.outletId || req.query.outlet_id || req.body.outlet_id;

    if (requestedOutletId && requestedOutletId !== req.user.outlet_id) {
      throw new ForbiddenError('Access denied: cannot access data from another outlet');
    }

    if (!requestedOutletId) {
      req.query.outlet_id = req.user.outlet_id;
      if (req.body && typeof req.body === 'object') {
        req.body.outlet_id = req.user.outlet_id;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: Checks if the restaurant's subscription is active.
 * Super Admins are always exempt.
 */
function checkLicense(req, res, next) {
  const { getDbClient } = require('../config/database');
  const prisma = getDbClient();

  try {
    if (!req.user) return next();
    if (req.user.role === 'super_admin') return next();

    const hoId = req.user.head_office_id;
    if (!hoId) return next(); // Not a SaaS user yet (legacy)

    prisma.headOffice.findFirst({
        where: { id: hoId, is_deleted: false },
        include: { subscriptions: { where: { status: 'active' }, orderBy: { expires_at: 'desc' }, take: 1 } }
    }).then(ho => {
        if (!ho) return next();
        if (!ho.is_active) {
            return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
        }
        
        const activeSub = ho.subscriptions[0];
        const isTrialValid = ho.trial_ends_at && new Date(ho.trial_ends_at) > new Date();
        
        if (!activeSub && !isTrialValid) {
            return res.status(403).json({ 
              success: false, 
              message: 'Subscription expired. Access to POS is locked until payment.',
              code: 'LICENSE_EXPIRED'
            });
        }
        
        next();
    }).catch(next);
  } catch (error) { next(error); }
}

module.exports = { hasRole, hasPermission, enforceOutletScope, checkLicense, VALID_ROLES };
