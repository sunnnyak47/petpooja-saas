/**
 * @fileoverview Auto-86 routes — availability board, manual 86 toggle, manual
 * re-sync, and config. Mounted at /api/auto86.
 * @module modules/integrations/auto86.routes
 */

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { enforceOutletScope, hasPermission } = require('../../middleware/rbac.middleware');
const { sendSuccess } = require('../../utils/response');
const auto86 = require('./auto86.service');

/** Resolves the effective outlet id for the request (scoped user or query). */
function resolveOutletId(req) {
  return req.user?.outlet_id || req.query.outlet_id;
}

/**
 * GET /api/auto86/board
 * Full availability board for the outlet (items + summary).
 */
router.get('/board', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const board = await auto86.getBoard(resolveOutletId(req));
    return sendSuccess(res, board, 'Availability board');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auto86/toggle  { menu_item_id, available }
 * Manually 86 / un-86 an item across all platforms.
 */
router.post('/toggle', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), async (req, res, next) => {
  try {
    const { menu_item_id, available } = req.body;
    const item = await auto86.manualToggle(resolveOutletId(req), menu_item_id, !!available, req.user);
    return sendSuccess(res, item, available ? 'Item marked available' : 'Item 86ed');
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auto86/sync
 * Re-evaluate every tracked item against current stock now.
 */
router.post('/sync', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), async (req, res, next) => {
  try {
    const result = await auto86.evaluateAvailability(resolveOutletId(req), null);
    return sendSuccess(res, result, 'Availability re-evaluated');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auto86/config
 */
router.get('/config', authenticate, enforceOutletScope, async (req, res, next) => {
  try {
    const cfg = await auto86.getConfig(resolveOutletId(req));
    return sendSuccess(res, cfg, 'Auto-86 config');
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/auto86/config  { auto_86_enabled }
 */
router.put('/config', authenticate, enforceOutletScope, hasPermission('MANAGE_MENU'), async (req, res, next) => {
  try {
    const cfg = await auto86.setConfig(resolveOutletId(req), { auto_86_enabled: !!req.body.auto_86_enabled });
    return sendSuccess(res, cfg, 'Auto-86 config updated');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
