/**
 * @fileoverview M11: Discounts & Promotions Routes
 * RESTful endpoints for discount management and coupon validation.
 * @module modules/discounts/discount.routes
 */

const express = require('express');
const router = express.Router();
const { authenticate, hasRole } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { createDiscountSchema, updateDiscountSchema, validateCouponSchema } = require('./discount.validation');
const discountService = require('./discount.service');
const logger = require('../../config/logger');

/**
 * Tenant-isolation guard: verifies the given outlet belongs to the caller before
 * any discount route scopes a query to it. Every handler below derives outletId
 * from client-supplied req.body/req.query.outlet_id, so without this check any
 * authenticated owner/manager (or reader) could read/create/update/delete another
 * tenant's discounts by passing a foreign outlet_id. Mirrors the ownership rules in
 * headoffice.routes.assertOutletOwnership (kept local — that copy is not exported).
 * super_admin has global access; everyone else must own the outlet via head_office_id
 * or be directly linked to it via a role assignment / staff profile.
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

  // Fallback: token carries no head office (legacy/owner created without one).
  // Allow when the user is directly linked to this outlet via a role assignment
  // or a staff profile.
  const linked = (await prisma.userRole.findFirst({ where: { user_id: req.user.id, outlet_id: outletId }, select: { id: true } }))
    || (await prisma.staffProfile.findFirst({ where: { user_id: req.user.id, outlet_id: outletId }, select: { id: true } }));
  if (linked) return;

  throw new ForbiddenError('You do not have access to this outlet');
}

/**
 * GET /api/discounts — List all discounts for outlet
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await assertOutletOwnership(req, outletId); // WHY: block cross-tenant read of another outlet's discounts
    const filters = {
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      type: req.query.type || undefined,
    };
    const discounts = await discountService.listDiscounts(outletId, filters);
    res.json({ success: true, data: discounts, message: 'Discounts retrieved' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/discounts — Create a new discount
 */
router.post('/', authenticate, hasRole('super_admin', 'owner', 'manager'), validate(createDiscountSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await assertOutletOwnership(req, outletId); // WHY: block creating a discount under another tenant's outlet
    const discount = await discountService.createDiscount(req.body, outletId);
    res.status(201).json({ success: true, data: discount, message: 'Discount created' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/discounts/:id — Update a discount
 */
router.put('/:id', authenticate, hasRole('super_admin', 'owner', 'manager'), validate(updateDiscountSchema), async (req, res, next) => {
  try {
    const outletId = req.body.outlet_id || req.user.outlet_id;
    await assertOutletOwnership(req, outletId); // WHY: block updating another tenant's discount
    const result = await discountService.updateDiscount(req.params.id, req.body, outletId);
    res.json({ success: true, data: result, message: 'Discount updated' });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/discounts/:id — Soft delete a discount
 */
router.delete('/:id', authenticate, hasRole('super_admin', 'owner', 'manager'), async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await assertOutletOwnership(req, outletId); // WHY: block deleting another tenant's discount
    await discountService.deleteDiscount(req.params.id, outletId);
    res.json({ success: true, message: 'Discount deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/discounts/validate — Validate a coupon code
 */
router.post('/validate', authenticate, validate(validateCouponSchema), async (req, res, next) => {
  try {
    const { code, outlet_id, order_total, customer_id } = req.body;
    const outletId = outlet_id || req.user.outlet_id;
    await assertOutletOwnership(req, outletId); // WHY: block probing another tenant's coupons
    const result = await discountService.validateCoupon(code, outletId, order_total, customer_id);
    res.json({ success: true, data: result, message: result.valid ? 'Coupon valid' : result.message });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/discounts/auto — Get auto-applicable discounts for cart
 */
router.get('/auto', authenticate, async (req, res, next) => {
  try {
    const outletId = req.query.outlet_id || req.user.outlet_id;
    await assertOutletOwnership(req, outletId); // WHY: block reading another tenant's auto-discounts
    const orderTotal = Number(req.query.order_total) || 0;
    const channel = req.query.channel || 'pos';
    const discounts = await discountService.getAutoDiscounts(outletId, orderTotal, channel);
    res.json({ success: true, data: discounts, message: 'Auto discounts retrieved' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
