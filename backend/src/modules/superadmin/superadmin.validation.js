/**
 * @fileoverview Joi validation schemas for Super Admin endpoints.
 * @module modules/superadmin/superadmin.validation
 */

const Joi = require('joi');

/**
 * Schema for super admin login.
 */
const superadminLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

/**
 * Schema for onboarding a new restaurant chain.
 */
const onboardSchema = Joi.object({
  name: Joi.string().required().max(150),
  owner_name: Joi.string().max(150),
  contact_email: Joi.string().email().required(),
  contact_phone: Joi.string().required().pattern(/^[0-9]{10,15}$/),
  password: Joi.string().required().min(6),
  plan: Joi.string().valid('starter', 'growth', 'pro', 'enterprise'),
  legal_name: Joi.string().max(200),
  gstin: Joi.string().max(15).allow('', null),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  address: Joi.string().max(500),
});

/**
 * Schema for impersonating a chain.
 */
const impersonateSchema = Joi.object({
  head_office_id: Joi.string().uuid().required(),
});

/**
 * Schema for updating subscription.
 */
const updateSubscriptionSchema = Joi.object({
  plan: Joi.string().valid('starter', 'growth', 'pro', 'enterprise'),
  is_active: Joi.boolean(),
  expires_at: Joi.date().allow(null),
});

/**
 * Schema for switching a chain's region.
 */
const switchRegionSchema = Joi.object({
  region: Joi.string().valid('IN', 'AU', 'US', 'UK', 'SG', 'AE').required(),
  abn: Joi.string().max(20).allow('', null).optional(),
  acn: Joi.string().max(15).allow('', null).optional(),
});

/**
 * Schema for updating feature flags.
 */
const updateFeaturesSchema = Joi.object({
  features: Joi.object().required(),
});

/**
 * Schema for toggling chain active status.
 */
const toggleStatusSchema = Joi.object({
  action: Joi.string().valid('suspend', 'activate', 'trial').required(),
  reason: Joi.string().allow('', null).optional(),
});

/**
 * Schema for updating internal notes.
 */
const updateNotesSchema = Joi.object({
  notes: Joi.string().max(2000).allow('', null),
});

/**
 * Schema for assigning a plan to a chain.
 */
const assignPlanSchema = Joi.object({
  plan: Joi.string().uppercase().valid('TRIAL', 'STARTER', 'PRO', 'ENTERPRISE').required(),
});

/**
 * Schema for generating invoices.
 */
const generateInvoicesSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12),
  year: Joi.number().integer().min(2020).max(2030),
});

/**
 * Schema for updating an invoice.
 */
const updateInvoiceSchema = Joi.object({
  status: Joi.string().uppercase().valid('PENDING', 'PAID', 'OVERDUE', 'WAIVED'),
  paid_at: Joi.date().allow(null),
  notes: Joi.string().max(500).allow('', null),
});

/**
 * Schema for saving tax profiles.
 */
const saveTaxProfilesSchema = Joi.object({
  profiles: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      region: Joi.string().required(),
      name: Joi.string().required(),
      slabs: Joi.array().items(
        Joi.object({
          rate: Joi.number().min(0).max(100).required(),
          label: Joi.string().allow('').optional(),
        })
      ).default([]),
      default_slab: Joi.number().min(0).max(100).optional(),
      gst_type: Joi.string().optional(),
      inclusive: Joi.boolean().optional(),
    })
  ).required(),
});

/**
 * Schema for creating an announcement.
 */
const createAnnouncementSchema = Joi.object({
  title: Joi.string().required().max(200),
  message: Joi.string().required().max(2000),
  type: Joi.string().valid('info', 'warning', 'maintenance', 'feature', 'update'),
  target: Joi.string().valid('all', 'specific').optional(),
  chain_ids: Joi.array().items(Joi.string().uuid()),
  target_chain_ids: Joi.array().items(Joi.string().uuid()),
  expires_at: Joi.date().allow(null),
});

/**
 * Schema for updating an announcement.
 */
const updateAnnouncementSchema = Joi.object({
  title: Joi.string().max(200),
  message: Joi.string().max(2000),
  type: Joi.string().valid('info', 'warning', 'maintenance', 'feature', 'update'),
  target: Joi.string().valid('all', 'specific').optional(),
  chain_ids: Joi.array().items(Joi.string().uuid()),
  target_chain_ids: Joi.array().items(Joi.string().uuid()),
  expires_at: Joi.date().allow(null),
  is_active: Joi.boolean(),
});

/**
 * Schema for creating a support ticket.
 */
const createTicketSchema = Joi.object({
  subject: Joi.string().required().max(200),
  body: Joi.string().required().max(2000),
  priority: Joi.string().uppercase().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
  chain_id: Joi.string().uuid(),
  chain_name: Joi.string().max(150).allow('', null),
  email: Joi.string().email().allow('', null),
});

/**
 * Schema for updating a support ticket.
 */
const updateTicketSchema = Joi.object({
  status: Joi.string().uppercase().valid('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'),
  priority: Joi.string().uppercase().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT'),
  notes: Joi.string().max(2000).allow('', null),
});

/**
 * Schema for replying to a ticket.
 */
const replyToTicketSchema = Joi.object({
  from: Joi.string().valid('admin', 'chain').default('admin'),
  body: Joi.string().required().max(2000),
});

/**
 * Schema for sending a broadcast.
 */
const sendBroadcastSchema = Joi.object({
  title: Joi.string().required().max(200),
  body: Joi.string().required().max(2000),
  type: Joi.string().uppercase().valid('INFO', 'WARNING', 'MAINTENANCE', 'PROMO').required(),
  target: Joi.string().uppercase().valid('ALL', 'TRIAL', 'STARTER', 'PRO', 'ENTERPRISE').required(),
});

/**
 * Schema for creating a promo code.
 */
const createPromoCodeSchema = Joi.object({
  code: Joi.string().required().max(20).uppercase(),
  discount_type: Joi.string().uppercase().valid('PERCENT', 'FLAT').required(),
  discount_value: Joi.number().min(0).when('discount_type', {
    is: 'PERCENT',
    then: Joi.number().max(100),
  }).required(),
  applicable_plans: Joi.array().items(
    Joi.string().uppercase().valid('TRIAL', 'STARTER', 'PRO', 'ENTERPRISE')
  ),
  description: Joi.string().max(500).allow('', null),
  max_uses: Joi.number().integer().min(0),
  valid_from: Joi.date(),
  valid_until: Joi.date(),
});

/**
 * Schema for updating a promo code.
 */
const updatePromoCodeSchema = Joi.object({
  discount_type: Joi.string().uppercase().valid('PERCENT', 'FLAT'),
  discount_value: Joi.number().min(0).when('discount_type', {
    is: 'PERCENT',
    then: Joi.number().max(100),
  }),
  applicable_plans: Joi.array().items(
    Joi.string().uppercase().valid('TRIAL', 'STARTER', 'PRO', 'ENTERPRISE')
  ),
  description: Joi.string().max(500).allow('', null),
  is_active: Joi.boolean(),
  max_uses: Joi.number().integer().min(0),
  valid_until: Joi.date(),
});

/**
 * Schema for validating a promo code.
 */
const validatePromoCodeSchema = Joi.object({
  code: Joi.string().required(),
});

/**
 * Schema for updating a chain's profile.
 */
const updateChainProfileSchema = Joi.object({
  name: Joi.string().max(150),
  logo_url: Joi.string().allow('', null),
  primary_color: Joi.string().max(7),
  contact_email: Joi.string().email(),
  contact_phone: Joi.string().pattern(/^[0-9]{10,15}$/),
});

/**
 * Schema for logging impersonation actions.
 */
const logImpersonationSchema = Joi.object({
  head_office_id: Joi.string().uuid().required(),
  action: Joi.string().required().max(200),
});

/**
 * Schema for saving platform settings.
 */
const savePlatformSettingsSchema = Joi.object({
  maintenance_mode: Joi.boolean(),
  registration_open: Joi.boolean(),
  platform_name: Joi.string().max(150).allow(''),
  support_email: Joi.string().email().allow(''),
  default_trial_days: Joi.number().integer().min(0),
  plan_pricing: Joi.object().pattern(Joi.string(), Joi.number().min(0)),
  max_outlets_per_plan: Joi.object().pattern(Joi.string(), Joi.number().integer().min(0)),
  allow_impersonation: Joi.boolean(),
  onboarding_required: Joi.boolean(),
  min_password_length: Joi.number().integer().min(1),
  session_timeout_hours: Joi.number().integer().min(1),
  updated_at: Joi.date().optional(),
});

module.exports = {
  superadminLoginSchema,
  onboardSchema,
  impersonateSchema,
  updateSubscriptionSchema,
  switchRegionSchema,
  updateFeaturesSchema,
  toggleStatusSchema,
  updateNotesSchema,
  assignPlanSchema,
  generateInvoicesSchema,
  updateInvoiceSchema,
  saveTaxProfilesSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  createTicketSchema,
  updateTicketSchema,
  replyToTicketSchema,
  sendBroadcastSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
  validatePromoCodeSchema,
  updateChainProfileSchema,
  logImpersonationSchema,
  savePlatformSettingsSchema,
};
