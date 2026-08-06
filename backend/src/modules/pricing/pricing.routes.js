/**
 * @fileoverview Dynamic Pricing Engine routes.
 * @module modules/pricing/pricing.routes
 */

const express = require('express');
const router = express.Router();
const svc = require('./pricing.service');
const { authenticate } = require('../../middleware/auth.middleware');
// FIX(IDOR): pricing routes previously trusted a client-supplied outlet_id as the sole
// tenant filter, letting any authenticated user read/mutate any outlet's pricing rules.
// enforceOutletScope rejects a mismatched outlet_id for non-owner roles (and defaults it
// to req.user.outlet_id); hasPermission('MANAGE_MENU') gates the mutating routes.
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createRuleSchema, updateRuleSchema, toggleRuleSchema, logApplicationSchema, seedRulesSchema } = require('./pricing.validation');
const { sendSuccess, sendCreated } = require('../../utils/response');

/** GET  /api/pricing/rules — list all rules for outlet */
router.get('/rules', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.listRules(outletId), 'Pricing rules retrieved');
  } catch (e) { next(e); }
});

/** POST /api/pricing/rules — create rule */
router.post('/rules', authenticate, hasPermission('MANAGE_MENU'), enforceOutletScope, validate(createRuleSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendCreated(res, await svc.createRule(outletId, req.body), 'Pricing rule created');
  } catch (e) { next(e); }
});

/** PATCH /api/pricing/rules/:id — update rule */
router.patch('/rules/:id', authenticate, hasPermission('MANAGE_MENU'), enforceOutletScope, validate(updateRuleSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.updateRule(req.params.id, outletId, req.body), 'Rule updated');
  } catch (e) { next(e); }
});

/** DELETE /api/pricing/rules/:id — soft delete */
router.delete('/rules/:id', authenticate, hasPermission('MANAGE_MENU'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.deleteRule(req.params.id, outletId), 'Rule deleted');
  } catch (e) { next(e); }
});

/** POST /api/pricing/rules/:id/toggle — enable/disable */
router.post('/rules/:id/toggle', authenticate, hasPermission('MANAGE_MENU'), enforceOutletScope, validate(toggleRuleSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.toggleRule(req.params.id, outletId), 'Rule toggled');
  } catch (e) { next(e); }
});

/** GET /api/pricing/live — active rules + computed prices RIGHT NOW */
router.get('/live', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const weather  = req.query.weather || null;
    sendSuccess(res, await svc.computeLivePrices(outletId, weather), 'Live prices computed');
  } catch (e) { next(e); }
});

/** POST /api/pricing/log — log a rule application from POS */
router.post('/log', authenticate, hasPermission('MANAGE_MENU'), enforceOutletScope, validate(logApplicationSchema), async (req, res, next) => {
  try {
    const { rule_id, menu_item_id, original_price, applied_price } = req.body;
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await svc.logApplication(rule_id, outletId, menu_item_id, original_price, applied_price);
    sendSuccess(res, null, 'Logged');
  } catch (e) { next(e); }
});

/** GET /api/pricing/analytics — rule performance stats */
router.get('/analytics', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    sendSuccess(res, await svc.getRuleAnalytics(outletId, req.query.from, req.query.to), 'Analytics retrieved');
  } catch (e) { next(e); }
});

/** POST /api/pricing/seed — seed default rules (first-time setup) */
router.post('/seed', authenticate, hasPermission('MANAGE_MENU'), enforceOutletScope, validate(seedRulesSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    sendCreated(res, await svc.seedDefaultRules(outletId), 'Default rules seeded');
  } catch (e) { next(e); }
});

module.exports = router;
