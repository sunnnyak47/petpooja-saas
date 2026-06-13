/**
 * @fileoverview Head Office routes — enterprise management endpoints.
 * @module modules/headoffice/headoffice.routes
 */

const express = require('express');
const router = express.Router();
const hoService = require('./headoffice.service');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasRole, hasPermission } = require('../../middleware/rbac.middleware');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');
const Joi = require('joi');
const { validate } = require('../../middleware/validate.middleware');
const logger = require('../../config/logger');
const multer = require('multer');
const { uploadFile } = require('../../config/storage');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
const {
  menuSyncSchema,
  createIndentSchema,
  registerRestaurantSchema,
  updateBrandingSchema,
  setupCompleteSchema,
  myBrandingSchema,
} = require('./headoffice.validation');

/**
 * Joi schema for saving outlet settings.
 */
const saveSettingsSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
  settings: Joi.object().pattern(Joi.string(), Joi.any()).required(),
});

/**
 * Builds the tenant-scoping context from the authenticated user.
 * super_admin (no head office) gets a global view; everyone else is pinned
 * to their own head_office_id.
 * @param {object} req - Express request
 * @returns {{ headOfficeId: string|null, isSuperAdmin: boolean }}
 */
function tenantContext(req) {
  return {
    headOfficeId: req.user?.head_office_id ?? null,
    isSuperAdmin: req.user?.role === 'super_admin',
  };
}

/** GET /api/ho/outlets — List all outlets with today's KPIs */
router.get('/outlets', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const outlets = await hoService.listOutlets(req.user.id, tenantContext(req));
    sendSuccess(res, outlets, 'Outlets retrieved');
  } catch (error) { next(error); }
});

/** GET /api/ho/outlets/:id — Single outlet details */
router.get('/outlets/:id', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const outlet = await hoService.getOutletById(req.params.id, tenantContext(req));
    sendSuccess(res, outlet, 'Outlet details retrieved');
  } catch (error) { next(error); }
});

/**
 * GET /api/ho/menu-analytics?outlet_id= — ABC menu performance (last 30 days).
 * Owner-accessible mirror of the SuperAdmin endpoint. Reuses the existing
 * analytics service. Tenant-safe: getOutletById throws NotFound when the
 * outlet does not belong to the caller's head office (super_admin: global).
 */
router.get('/menu-analytics', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id;
    if (!outletId) return sendError(res, 400, 'outlet_id required');

    // Ownership / tenant-isolation guard — throws NotFoundError on cross-tenant access.
    await hoService.getOutletById(outletId, tenantContext(req));

    const superadminService = require('../superadmin/superadmin.service');
    const data = await superadminService.getMenuAnalytics(outletId);
    sendSuccess(res, data, 'Menu analytics');
  } catch (error) { next(error); }
});

/** GET /api/ho/dashboard — Enterprise consolidated dashboard */
router.get('/dashboard', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const data = await hoService.getEnterpriseDashboard(tenantContext(req));
    sendSuccess(res, data, 'Enterprise dashboard');
  } catch (error) { next(error); }
});

/** GET /api/ho/outlet-comparison?from=&to= — Outlet revenue comparison */
router.get('/outlet-comparison', authenticate, hasRole('super_admin', 'owner'), async (req, res, next) => {
  try {
    const data = await hoService.getOutletComparison(req.query.from, req.query.to, tenantContext(req));
    sendSuccess(res, data, 'Outlet comparison');
  } catch (error) { next(error); }
});

/** POST /api/ho/menu-sync — Push menu from source outlet to targets */
router.post('/menu-sync', authenticate, hasRole('super_admin', 'owner'), validate(menuSyncSchema), async (req, res, next) => {
  try {
    const { source_outlet_id, target_outlet_ids, options } = req.body;
    const result = await hoService.syncMenu(source_outlet_id, target_outlet_ids, options);
    sendSuccess(res, result, `${result.synced} items synced`);
  } catch (error) { next(error); }
});

/** POST /api/ho/indents — Create central kitchen indent */
router.post('/indents', authenticate, hasPermission('MANAGE_INVENTORY'), validate(createIndentSchema), async (req, res, next) => {
  try {
    const indent = await hoService.createIndent(req.body);
    sendCreated(res, indent, 'Indent created');
  } catch (error) { next(error); }
});

/** POST /api/ho/register — SaaS Onboarding (Super Admin only) */
router.post('/register', authenticate, hasRole('super_admin'), validate(registerRestaurantSchema), async (req, res, next) => {
  try {
    const result = await hoService.registerRestaurant(req.body);
    sendCreated(res, result, 'New restaurant chain onboarded');
  } catch (error) {
    const { ConflictError } = require('../../utils/errors');
    if (
      error.code === 'P2002' ||
      error.message?.includes('already exists') ||
      error.message?.includes('Use a different')
    ) {
      return next(new ConflictError(error.message));
    }
    next(error);
  }
});

/** GET /api/ho/chains — List all restaurant chains */
router.get('/chains', authenticate, hasRole('super_admin'), async (req, res, next) => {
  try {
    const chains = await hoService.listAllChains();
    sendSuccess(res, chains, 'All restaurant chains retrieved');
  } catch (error) { next(error); }
});

/** PATCH /api/ho/branding — Update branding for a chain */
router.patch('/branding', authenticate, hasRole('super_admin'), validate(updateBrandingSchema), async (req, res, next) => {
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

/** PATCH /api/ho/setup-complete — Owner completes (or skips) the wizard */
router.patch('/setup-complete', authenticate, hasRole('owner'), validate(setupCompleteSchema), async (req, res, next) => {
  const { primary_color, logo_url, gstin, abn, legal_name } = req.body;
  const prisma = require('../../config/database').getDbClient();
  try {
    // Only write fields that were actually provided (a "skip" sends nothing but
    // still flips setup_completed so the wizard doesn't reappear).
    const data = { setup_completed: true };
    if (primary_color) data.primary_color = primary_color;
    if (logo_url !== undefined) data.logo_url = logo_url || null;
    if (gstin !== undefined) data.gstin = gstin || null;
    if (abn !== undefined) data.abn = abn || null;
    if (legal_name) data.legal_name = legal_name;

    const ho = await prisma.headOffice.update({ where: { id: req.user.head_office_id }, data });

    // Cascade branding to all outlets so receipts/QR match.
    const brand = {};
    if (data.primary_color) brand.primary_color = data.primary_color;
    if (data.logo_url !== undefined) brand.logo_url = data.logo_url;
    if (Object.keys(brand).length) {
      await prisma.outlet.updateMany({ where: { head_office_id: ho.id, is_deleted: false }, data: brand });
    }

    sendSuccess(res, ho, 'Setup completed! Welcome aboard.');
  } catch (error) { next(error); }
});

/** POST /api/ho/upload-logo — Owner uploads a brand logo (S3 with local fallback) */
router.post('/upload-logo', authenticate, hasRole('owner', 'manager'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 400, 'No file uploaded');
    if (!String(req.file.mimetype || '').startsWith('image/')) {
      return sendError(res, 400, 'Logo must be an image (PNG, JPG, SVG, WebP)');
    }
    try {
      const { url } = await uploadFile(req.file.buffer, req.file.originalname, 'branding', req.file.mimetype);
      return sendSuccess(res, { url }, 'Logo uploaded');
    } catch (s3Error) {
      // S3 not configured / failed → save to local disk (served at /uploads).
      const fs = require('fs');
      const path = require('path');
      const { v4: uuidv4 } = require('uuid');
      const uploadDir = path.join(__dirname, '../../../uploads/branding');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
      const filename = `${uuidv4()}${ext}`;
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      const url = `${req.protocol}://${req.get('host')}/uploads/branding/${filename}`;
      logger.warn('S3 logo upload failed, saved locally', { filename, error: s3Error.message });
      return sendSuccess(res, { url }, 'Logo uploaded (local)');
    }
  } catch (error) { next(error); }
});

/** PATCH /api/ho/my-branding — Owner updates their own chain's color + logo */
router.patch('/my-branding', authenticate, hasRole('owner'), validate(myBrandingSchema), async (req, res, next) => {
  const { primary_color, logo_url } = req.body;
  const prisma = require('../../config/database').getDbClient();
  try {
    // Resolve the head office from the token, falling back to the owner's outlet so
    // branding works even for owners whose user row has no head_office_id.
    let hoId = req.user.head_office_id;
    if (!hoId) {
      const ur = await prisma.userRole.findFirst({ where: { user_id: req.user.id, outlet_id: { not: null } }, select: { outlet_id: true } });
      if (ur?.outlet_id) {
        const o = await prisma.outlet.findUnique({ where: { id: ur.outlet_id }, select: { head_office_id: true } });
        hoId = o?.head_office_id || null;
      }
    }
    if (!hoId) {
      return res.status(400).json({ success: false, message: 'No head office linked to this account' });
    }
    const data = {};
    if (primary_color) data.primary_color = primary_color;
    if (logo_url !== undefined) data.logo_url = logo_url || null;
    const ho = await prisma.headOffice.update({ where: { id: hoId }, data });
    await prisma.outlet.updateMany({ where: { head_office_id: ho.id, is_deleted: false }, data });
    sendSuccess(res, { primary_color: ho.primary_color, logo_url: ho.logo_url }, 'Branding updated');
  } catch (error) { next(error); }
});

/** GET /api/ho/onboarding-status — get-started checklist state (computed from real data) */
router.get('/onboarding-status', authenticate, hasRole('owner', 'manager'), async (req, res, next) => {
  const prisma = require('../../config/database').getDbClient();
  try {
    const hoId = req.user.head_office_id;
    if (!hoId) return sendSuccess(res, { applicable: false });
    const ho = await prisma.headOffice.findUnique({
      where: { id: hoId },
      select: { setup_completed: true, primary_color: true, logo_url: true, gstin: true, abn: true, legal_name: true, metadata: true },
    });
    const outlets = await prisma.outlet.findMany({ where: { head_office_id: hoId, is_deleted: false }, select: { id: true } });
    const outletIds = outlets.map((o) => o.id);
    const [menuCount, tableCount, orderCount] = await Promise.all([
      prisma.menuItem.count({ where: { outlet_id: { in: outletIds }, is_deleted: false } }).catch(() => 0),
      prisma.table.count({ where: { outlet_id: { in: outletIds }, is_deleted: false } }).catch(() => 0),
      prisma.order.count({ where: { outlet_id: { in: outletIds }, is_deleted: false } }).catch(() => 0),
    ]);
    const steps = {
      brand: !!(ho?.logo_url || ho?.primary_color),
      tax: !!(ho?.gstin || ho?.abn || ho?.legal_name),
      menu: menuCount > 0,
      table: tableCount > 0,
      order: orderCount > 0,
    };
    const completed = Object.values(steps).filter(Boolean).length;
    sendSuccess(res, {
      applicable: true,
      setup_completed: !!ho?.setup_completed,
      dismissed: !!(ho?.metadata && ho.metadata.onboarding_dismissed),
      steps,
      completed_count: completed,
      total: 5,
    }, 'Onboarding status');
  } catch (error) { next(error); }
});

/** POST /api/ho/onboarding-dismiss — owner hides the get-started checklist */
router.post('/onboarding-dismiss', authenticate, hasRole('owner', 'manager'), async (req, res, next) => {
  const prisma = require('../../config/database').getDbClient();
  try {
    const ho = await prisma.headOffice.findUnique({ where: { id: req.user.head_office_id }, select: { metadata: true } });
    const metadata = { ...(ho?.metadata || {}), onboarding_dismissed: true };
    await prisma.headOffice.update({ where: { id: req.user.head_office_id }, data: { metadata } });
    sendSuccess(res, { dismissed: true }, 'Checklist dismissed');
  } catch (error) { next(error); }
});

/**
 * Verifies the given outlet belongs to the caller's tenant.
 * super_admin bypasses the check (global access). For everyone else the outlet
 * must share the caller's head_office_id, otherwise a ForbiddenError is thrown.
 * @param {object} req - Express request
 * @param {string} outletId - Outlet to authorize
 * @returns {Promise<void>}
 */
async function assertOutletOwnership(req, outletId) {
  const { ForbiddenError } = require('../../utils/errors');
  if (req.user?.role === 'super_admin') return; // global access
  const prisma = require('../../config/database').getDbClient();
  const headOfficeId = req.user?.head_office_id;

  // Primary path: the outlet belongs to the caller's head office.
  if (headOfficeId) {
    const owned = await prisma.outlet.findFirst({
      where: { id: outletId, head_office_id: headOfficeId },
      select: { id: true },
    });
    if (owned) return;
  }

  // Fallback: the token carries no head office (legacy/owner created without one).
  // Allow when the user is directly linked to this outlet via a role assignment or
  // a staff profile — so Settings and other /ho endpoints keep working instead of
  // failing with "No head office linked to this account".
  const linked = (await prisma.userRole.findFirst({ where: { user_id: req.user.id, outlet_id: outletId }, select: { id: true } }))
    || (await prisma.staffProfile.findFirst({ where: { user_id: req.user.id, outlet_id: outletId }, select: { id: true } }));
  if (linked) return;

  throw new ForbiddenError('You do not have access to this outlet');
}

/**
 * GET /api/ho/settings — Get all settings for an outlet.
 */
router.get('/settings', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const prisma = require('../../config/database').getDbClient();
    const outlet_id = req.query.outlet_id || req.user?.outlet_id || req.user?.outlets?.[0]?.id;
    if (!outlet_id) return res.status(400).json({ success: false, message: 'outlet_id required' });

    // Tenant isolation: caller may only read settings for an outlet they own.
    await assertOutletOwnership(req, outlet_id);

    const section = req.query.section;

    const where = { outlet_id, is_deleted: false };
    if (section) {
      // Filter settings whose key starts with the section prefix
      where.setting_key = { startsWith: `${section}_` };
    }

    let rows = await prisma.outletSetting.findMany({ where });

    // If section filter was used but returned nothing, also try exact key match
    // (handles case where section is stored as a single JSON value key)
    if (section && rows.length === 0) {
      rows = await prisma.outletSetting.findMany({
        where: { outlet_id, is_deleted: false, setting_key: section },
      });
    }

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
router.put('/settings', authenticate, hasRole('super_admin', 'owner', 'manager'), validate(saveSettingsSchema), async (req, res, next) => {
  try {
    const prisma = require('../../config/database').getDbClient();
    const outlet_id = req.body.outlet_id || req.user?.outlet_id || req.user?.outlets?.[0]?.id;
    if (!outlet_id) return res.status(400).json({ success: false, message: 'outlet_id required' });

    // Tenant isolation: caller may only upsert settings for an outlet they own.
    await assertOutletOwnership(req, outlet_id);

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

/**
 * GET /api/ho/my-health-score
 * Owner-facing: returns chain health score for their own head office
 */
router.get('/my-health-score', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const { computeAllChainScores } = require('../superadmin/health-score.service');
    const headOfficeId = req.user?.head_office_id;
    if (!headOfficeId) return res.status(400).json({ success: false, message: 'No head office linked to this account' });
    const results = await computeAllChainScores({ headOfficeId });
    const { sendSuccess } = require('../../utils/response');
    if (!results.length) return res.status(404).json({ success: false, message: 'No chain data found' });
    sendSuccess(res, results[0], 'Health score');
  } catch (err) { next(err); }
});

/**
 * GET /api/ho/my-subscription
 * Owner-facing: returns current plan info for their own head office
 */
router.get('/my-subscription', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const { getDbClient } = require('../../config/database');
    const prisma = getDbClient();
    const headOfficeId = req.user?.head_office_id;
    if (!headOfficeId) return res.status(400).json({ success: false, message: 'No head office linked to this account' });

    const ho = await prisma.headOffice.findUnique({
      where: { id: headOfficeId },
      select: { id: true, name: true, plan: true, is_active: true, created_at: true,
        outlets: { where: { is_deleted: false }, select: { id: true, name: true } },
        users:   { where: { is_deleted: false, is_active: true }, select: { id: true } },
      },
    });
    if (!ho) return res.status(404).json({ success: false, message: 'Head office not found' });

    const PLAN_PRICES = { TRIAL: 0, STARTER: 2999, PRO: 7999, ENTERPRISE: 19999 };
    const PLAN_LIMITS = {
      TRIAL:      { outlets: 1,  staff: 3,   features: ['pos', 'menu', 'orders'] },
      STARTER:    { outlets: 2,  staff: 10,  features: ['pos', 'menu', 'orders', 'reports', 'tables', 'payments'] },
      PRO:        { outlets: 5,  staff: 50,  features: ['pos', 'menu', 'orders', 'reports', 'tables', 'payments', 'crm', 'inventory', 'kitchen', 'online_orders'] },
      ENTERPRISE: { outlets: 20, staff: 200, features: ['all'] },
    };

    sendSuccess(res, {
      plan:          ho.plan,
      plan_price:    PLAN_PRICES[ho.plan] || 0,
      plan_limits:   PLAN_LIMITS[ho.plan] || PLAN_LIMITS.TRIAL,
      outlets_used:  ho.outlets.length,
      staff_used:    ho.users.length,
      is_active:     ho.is_active,
      member_since:  ho.created_at,
      invoices:      [],
      next_plans:    Object.entries(PLAN_PRICES)
        .filter(([p]) => p !== ho.plan && PLAN_PRICES[p] > (PLAN_PRICES[ho.plan] || 0))
        .map(([plan, price]) => ({ plan, price, limits: PLAN_LIMITS[plan] })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
