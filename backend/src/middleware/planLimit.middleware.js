/**
 * @fileoverview Plan-limit & subscription gating middleware (usage-based billing).
 *
 * Opt-in guards applied to specific create/write routes. They enforce the head
 * office's active {@link BillingPlan} limits and block suspended subscriptions.
 *
 * Philosophy (matches auth.middleware's suspended-chain check): FAIL OPEN. Any
 * DB error, missing subscription, missing plan, or null limit lets the request
 * through — gating must never lock out a paying pilot customer because of an
 * infrastructure blip. Only a *confirmed* suspension or *confirmed* over-limit
 * count blocks.
 *
 * @module middleware/planLimit.middleware
 */

const { getDbClient } = require('../config/database');
const logger = require('../config/logger');

/**
 * Loads the active subscription (+plan) for the request's head office.
 * @param {object} req
 * @returns {Promise<{subscription:object, plan:object|null}|null>}
 */
async function loadSubscription(req) {
  const headOfficeId = req.user?.head_office_id;
  if (!headOfficeId) return null;
  const prisma = getDbClient();
  const subscription = await prisma.subscription.findFirst({
    where: { head_office_id: headOfficeId, is_deleted: false },
    orderBy: { created_at: 'desc' },
    include: { plan: true },
  });
  if (!subscription) return null;
  return { subscription, plan: subscription.plan || null };
}

/**
 * Blocks requests when the subscription is suspended. Super admins bypass.
 * @returns {import('express').RequestHandler}
 */
function requireActiveSubscription() {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'super_admin') return next();
      const ctx = await loadSubscription(req);
      if (ctx && ctx.subscription.status === 'suspended') {
        return res.status(402).json({
          success: false,
          message: 'Your subscription is suspended for non-payment. Please clear the outstanding invoice to continue.',
          code: 'SUBSCRIPTION_SUSPENDED',
        });
      }
      return next();
    } catch (err) {
      logger.warn('requireActiveSubscription failed open', { error: err.message });
      return next();
    }
  };
}

/**
 * Enforces a plan numeric limit (e.g. max_outlets) by comparing against a live
 * count. Fail-open if the plan, limit, or count can't be determined.
 *
 * @param {object} opts
 * @param {'max_outlets'|'max_users'} opts.limitKey
 * @param {(prisma:object, headOfficeId:string)=>Promise<number>} opts.count - current usage counter
 * @param {string} opts.resource - human label for the error message
 * @returns {import('express').RequestHandler}
 */
function enforceLimit({ limitKey, count, resource }) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'super_admin') return next();
      const ctx = await loadSubscription(req);
      const limit = ctx?.plan?.[limitKey];
      if (limit == null) return next(); // unlimited / unknown → allow

      const prisma = getDbClient();
      const current = await count(prisma, req.user.head_office_id);
      if (current >= Number(limit)) {
        return res.status(402).json({
          success: false,
          message: `Your plan allows up to ${limit} ${resource}. Upgrade your plan to add more.`,
          code: 'PLAN_LIMIT_REACHED',
          limit: Number(limit),
          current,
        });
      }
      return next();
    } catch (err) {
      logger.warn('enforceLimit failed open', { limitKey, error: err.message });
      return next();
    }
  };
}

/** Guard for outlet creation. @returns {import('express').RequestHandler} */
function enforceOutletLimit() {
  return enforceLimit({
    limitKey: 'max_outlets',
    resource: 'outlets',
    count: (prisma, headOfficeId) =>
      prisma.outlet.count({ where: { head_office_id: headOfficeId, is_deleted: false } }),
  });
}

/** Guard for user/staff creation. @returns {import('express').RequestHandler} */
function enforceUserLimit() {
  return enforceLimit({
    limitKey: 'max_users',
    resource: 'users',
    count: (prisma, headOfficeId) =>
      prisma.user.count({ where: { head_office_id: headOfficeId, is_deleted: false } }),
  });
}

module.exports = {
  requireActiveSubscription,
  enforceLimit,
  enforceOutletLimit,
  enforceUserLimit,
};
