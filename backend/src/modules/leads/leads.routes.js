/**
 * @fileoverview Marketing-website lead capture (demo requests).
 * Public POST creates a lead; SuperAdmin/platform roles list and update them.
 */
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { getDbClient } = require('../../config/database');
const { authenticate } = require('../../middleware/auth.middleware');
const { hasRole } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { authLimiter } = require('../../middleware/rateLimit.middleware');
const { sendSuccess } = require('../../utils/response');
const logger = require('../../config/logger');

const PLATFORM = ['super_admin', 'platform_admin', 'platform_support', 'platform_billing', 'platform_readonly'];

const createLeadSchema = Joi.object({
  name:           Joi.string().trim().min(2).max(150).required(),
  email:          Joi.string().trim().lowercase().email().max(150).required(),
  restaurant:     Joi.string().trim().max(200).allow('', null),
  phone:          Joi.string().trim().max(30).allow('', null),
  region:         Joi.string().trim().max(20).allow('', null),
  outlets:        Joi.string().trim().max(20).allow('', null),
  current_system: Joi.string().trim().max(100).allow('', null),
  message:        Joi.string().trim().max(1000).allow('', null),
  source:         Joi.string().trim().max(30).allow('', null),
});

const updateLeadSchema = Joi.object({
  status: Joi.string().valid('new', 'contacted', 'demo_booked', 'won', 'lost'),
  notes:  Joi.string().max(2000).allow('', null),
}).min(1);

/** POST /api/leads — public demo/sales lead capture from the marketing site. */
router.post('/', authLimiter, validate(createLeadSchema), async (req, res, next) => {
  try {
    const prisma = getDbClient();
    const b = req.body;
    const lead = await prisma.lead.create({
      data: {
        name: b.name, email: b.email,
        restaurant: b.restaurant || null, phone: b.phone || null,
        region: b.region || null, outlets: b.outlets || null,
        current_system: b.current_system || null, message: b.message || null,
        source: b.source || 'website',
      },
    });
    logger.info('New website lead', { id: lead.id, email: lead.email, restaurant: lead.restaurant });
    sendSuccess(res, { id: lead.id }, 'Thanks! We’ll be in touch shortly.');
  } catch (e) { next(e); }
});

/** GET /api/leads — platform-side list with status counts. */
router.get('/', authenticate, hasRole(...PLATFORM), async (req, res, next) => {
  try {
    const prisma = getDbClient();
    const where = { is_deleted: false };
    if (req.query.status) where.status = req.query.status;
    const take = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const [leads, grouped] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: { created_at: 'desc' }, take }),
      prisma.lead.groupBy({ by: ['status'], where: { is_deleted: false }, _count: true }),
    ]);
    const counts = grouped.reduce((a, g) => ({ ...a, [g.status]: g._count }), {});
    sendSuccess(res, { leads, counts, total: leads.length }, 'Leads retrieved');
  } catch (e) { next(e); }
});

/** PATCH /api/leads/:id — update status / notes. */
router.patch('/:id', authenticate, hasRole('super_admin', 'platform_admin', 'platform_support'), validate(updateLeadSchema), async (req, res, next) => {
  try {
    const prisma = getDbClient();
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data: req.body });
    sendSuccess(res, lead, 'Lead updated');
  } catch (e) { next(e); }
});

module.exports = router;
