/**
 * @fileoverview Head Office routes — enterprise management endpoints.
 * @module modules/headoffice/headoffice.routes
 */

const express = require('express');
const router = express.Router();
const hoService = require('./headoffice.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasRole, hasPermission } = require('../../middleware/rbac.middleware');
const { sendSuccess, sendCreated } = require('../../utils/response');
const Joi = require('joi');
const { validate } = require('../../middleware/validate.middleware');

/**
 * Joi schema for saving outlet settings.
 */
const saveSettingsSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
  settings: Joi.object().pattern(Joi.string(), Joi.any()).required(),
});

/** GET /api/ho/outlets — List all outlets with today's KPIs */
router.get('/outlets', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const outlets = await hoService.listOutlets(req.user.id);
    sendSuccess(res, outlets, 'Outlets retrieved');
  } catch (error) { next(error); }
});

/** GET /api/ho/dashboard — Enterprise consolidated dashboard */
router.get('/dashboard', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const data = await hoService.getEnterpriseDashboard();
    sendSuccess(res, data, 'Enterprise dashboard');
  } catch (error) { next(error); }
});

/** GET /api/ho/outlet-comparison?from=&to= — Outlet revenue comparison */
router.get('/outlet-comparison', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const data = await hoService.getOutletComparison(req.query.from, req.query.to);
    sendSuccess(res, data, 'Outlet comparison');
  } catch (error) { next(error); }
});

/** POST /api/ho/menu-sync — Push menu from source outlet to targets */
router.post('/menu-sync', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const { source_outlet_id, target_outlet_ids, options } = req.body;
    const result = await hoService.syncMenu(source_outlet_id, target_outlet_ids, options);
    sendSuccess(res, result, `${result.synced} items synced`);
  } catch (error) { next(error); }
});

/** POST /api/ho/indents — Create central kitchen indent */
router.post('/indents', authenticate, hasPermission('MANAGE_INVENTORY'), async (req, res, next) => {
  try {
    const indent = await hoService.createIndent(req.body);
    sendCreated(res, indent, 'Indent created');
  } catch (error) { next(error); }
});

/** POST /api/ho/register — SaaS Onboarding (Super Admin only) */
router.post('/register', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    const result = await hoService.registerRestaurant(req.body);
    sendCreated(res, result, 'New restaurant chain onboarded');
  } catch (error) { next(error); }
});

/** GET /api/ho/chains — List all restaurant chains */
router.get('/chains', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    const chains = await hoService.listAllChains();
    sendSuccess(res, chains, 'All restaurant chains retrieved');
  } catch (error) { next(error); }
});

/** PATCH /api/ho/branding — Update branding for a chain */
router.patch('/branding', authenticate, hasRole('super_admin'), async (req, res, next) => {
  const { head_office_id, primary_color, logo_url } = req.body;
  const prisma = require('../../config/database').getDbClient();
  try {
    const ho = await prisma.headOffice.update({
        where: { id: head_office_id },
        data: { primary_color, logo_url }
    });
    sendSuccess(res, ho, 'Branding updated successfully');
  } catch (error) { next(error); }
});

/** PATCH /api/ho/setup-complete — Owner completes wizard */
router.patch('/setup-complete', authenticate, hasRole('owner'), async (req, res, next) => {
  const { primary_color, logo_url, gstin, legal_name } = req.body;
  const prisma = require('../../config/database').getDbClient();
  try {
    const ho = await prisma.headOffice.update({
        where: { id: req.user.head_office_id },
        data: { 
            primary_color, 
            logo_url, 
            gstin, 
            legal_name,
            setup_completed: true 
        }
    });
    
    // Auto-update the flagship outlet with these branding colors too
    await prisma.outlet.updateMany({
        where: { head_office_id: ho.id },
        data: { primary_color, logo_url }
    });

    sendSuccess(res, ho, 'Setup completed! Welcome to Petpooja ERP.');
  } catch (error) { next(error); }
});

/**
 * GET /api/ho/settings — Get all settings for an outlet.
 */
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const prisma = require('../../config/database').getDbClient();
    const outlet_id = req.query.outlet_id || req.user?.outlet_id || req.user?.outlets?.[0]?.id;
    if (!outlet_id) return res.status(400).json({ success: false, message: 'outlet_id required' });

    const rows = await prisma.outletSetting.findMany({
      where: { outlet_id, is_deleted: false },
    });

    // Convert to a flat key-value object
    const result = {};
    rows.forEach(r => {
      result[r.setting_key] = r.data_type === 'boolean'
        ? r.setting_value === 'true'
        : r.data_type === 'number'
        ? Number(r.setting_value)
        : r.setting_value;
    });

    sendSuccess(res, result, 'Settings retrieved');
  } catch (error) { next(error); }
});

/**
 * PUT /api/ho/settings — Upsert outlet settings (key-value pairs).
 */
router.put('/settings', authenticate, validate(saveSettingsSchema), async (req, res, next) => {
  try {
    const prisma = require('../../config/database').getDbClient();
    const outlet_id = req.body.outlet_id || req.user?.outlet_id || req.user?.outlets?.[0]?.id;
    if (!outlet_id) return res.status(400).json({ success: false, message: 'outlet_id required' });

    const { settings } = req.body;
    const upsertOps = Object.entries(settings).map(([key, value]) => {
      const strValue = String(value);
      const dataType = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
      return prisma.outletSetting.upsert({
        where: { outlet_id_setting_key: { outlet_id, setting_key: key } },
        update: { setting_value: strValue, data_type: dataType, is_deleted: false },
        create: { outlet_id, setting_key: key, setting_value: strValue, data_type: dataType },
      });
    });

    await prisma.$transaction(upsertOps);
    sendSuccess(res, { saved: upsertOps.length }, 'Settings saved successfully');
  } catch (error) { next(error); }
});

module.exports = router;
