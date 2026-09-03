/**
 * @fileoverview Tyro EFTPOS integration routes.
 *   GET  /api/integrations/tyro/config     — read saved config (secrets masked)
 *   PUT  /api/integrations/tyro/config     — upsert config (MID/TID/env/etc.)
 *   POST /api/integrations/tyro/test       — validate + reachability probe
 *   POST /api/integrations/tyro/pair       — pair terminal → integrationKey persisted
 *   POST /api/integrations/tyro/purchase   — (501 until cert) initiate purchase
 *   POST /api/integrations/tyro/refund     — (501 until cert) initiate refund
 *
 * Config is stored via the same outletSetting pattern the generic
 * /integrations/config PUT uses (keys prefixed `integration_tyro_`), so the
 * existing Integrations Hub "Save Configuration" button and this dedicated
 * flow stay in sync.
 *
 * @module modules/integrations/tyro.routes
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { sendSuccess, sendError } = require('../../utils/response');
const tyroService = require('./tyro.service');
const logger = require('../../config/logger');

router.use(authenticate);

const configSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  mid: Joi.string().trim().min(4).max(50).required(),
  tid: Joi.string().trim().pattern(/^\d{8}$/).required().messages({
    'string.pattern.base': 'Terminal ID must be exactly 8 digits',
  }),
  merchant_name: Joi.string().trim().min(2).max(100).required(),
  api_key: Joi.string().trim().max(200).allow('', null),
  pos_product_name: Joi.string().trim().max(100).default('PetPooja POS'),
  pos_product_vendor: Joi.string().trim().max(100).default('PetPooja'),
  pos_product_version: Joi.string().trim().max(20).default('1.0.0'),
  environment: Joi.string().valid('sandbox', 'production').default('sandbox'),
});

/** Mask a secret for read responses so it renders "•••••1234" in the UI. */
function mask(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

/** GET /api/integrations/tyro/config */
router.get('/config', hasPermission('MANAGE_INTEGRATIONS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    const cfg = await tyroService.loadConfig(outletId);
    // Never return raw secrets — mask api_key and integration_key. UI shows a
    // "change" affordance if the merchant needs to rotate them.
    sendSuccess(res, {
      mid: cfg.mid || '',
      tid: cfg.tid || '',
      merchant_name: cfg.merchant_name || '',
      pos_product_name: cfg.pos_product_name || '',
      pos_product_vendor: cfg.pos_product_vendor || '',
      pos_product_version: cfg.pos_product_version || '',
      environment: cfg.environment || 'sandbox',
      api_key_masked: mask(cfg.api_key),
      has_api_key: !!cfg.api_key,
      integration_key_masked: mask(cfg.integration_key),
      paired: !!cfg.integration_key,
    }, 'Tyro config loaded');
  } catch (err) { next(err); }
});

/** PUT /api/integrations/tyro/config */
router.put('/config', hasPermission('MANAGE_INTEGRATIONS'), validate(configSchema), enforceOutletScope, async (req, res, next) => {
  try {
    const { outlet_id, ...cfg } = req.body;
    const outletId = outlet_id || req.user.outlet_id;

    // Empty api_key means "don't change it" — preserve the existing secret so a
    // form re-save with the field blank doesn't wipe out a working key.
    const existing = await tyroService.loadConfig(outletId);
    const keysToWrite = { ...cfg };
    if (!keysToWrite.api_key && existing.api_key) delete keysToWrite.api_key;

    for (const [k, v] of Object.entries(keysToWrite)) {
      await tyroService.saveSetting(outletId, k, v ?? '');
    }
    logger.info('Tyro config saved', { outletId, mid: cfg.mid, environment: cfg.environment });
    sendSuccess(res, { saved: true, environment: cfg.environment }, 'Tyro configuration saved');
  } catch (err) { next(err); }
});

/** POST /api/integrations/tyro/test — "Test Connection" button. */
router.post('/test', hasPermission('MANAGE_INTEGRATIONS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.query.outlet_id || req.user.outlet_id;
    const result = await tyroService.testConnection(outletId);
    if (!result.success) return sendError(res, 400, result.errors?.[0] || 'Tyro test failed', result);
    sendSuccess(res, result, result.message);
  } catch (err) { next(err); }
});

/** POST /api/integrations/tyro/pair — real Tyro Pair call; persists integrationKey. */
router.post('/pair', hasPermission('MANAGE_INTEGRATIONS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await tyroService.pairTerminal(outletId);
    sendSuccess(res, result, 'Terminal paired with Tyro');
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.message, err.details);
    next(err);
  }
});

/** POST /api/integrations/tyro/purchase — 501 until certification. */
router.post('/purchase', hasPermission('MANAGE_INTEGRATIONS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await tyroService.initiatePurchase(outletId, req.body);
    sendSuccess(res, result, 'Purchase initiated');
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.message);
    next(err);
  }
});

/** POST /api/integrations/tyro/refund — 501 until certification. */
router.post('/refund', hasPermission('MANAGE_INTEGRATIONS'), enforceOutletScope, async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    const result = await tyroService.initiateRefund(outletId, req.body);
    sendSuccess(res, result, 'Refund initiated');
  } catch (err) {
    if (err.status) return sendError(res, err.status, err.message);
    next(err);
  }
});

module.exports = router;
