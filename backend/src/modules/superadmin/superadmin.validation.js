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
  is_active: Joi.boolean().required(),
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
  plan: Joi.string().valid('starter', 'growth', 'pro', 'enterprise').required(),
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
  status: Joi.string().valid('draft', 'sent', 'paid', 'overdue', 'cancelled'),
  payment_date: Joi.date().allow(null),
});

/**
 * Schema for saving tax profiles.
 */
const saveTaxProfilesSchema = Joi.object({
  profiles: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      rate: Joi.number().min(0).max(100).required(),
      type: Joi.string().valid('cgst', 'sgst', 'igst', 'gst', 'vat', 'service_tax'),
      is_inclusive: Joi.boolean(),
    })
  ).required(),
});

/**
 * Schema for creating an announcement.
 */
const createAnnouncementSchema = Joi.object({
  title: Joi.string().required().max(200),
  message: Joi.string().required().max(2000),
  type: Joi.string().valid('info', 'warning', 'maintenance', 'update'),
  target_chain_ids: Joi.array().items(Joi.string().uuid()),
  expires_at: Joi.date().allow(null),
});

/**
 * Schema for updating an announcement.
 */
const updateAnnouncementSchema = Joi.object({
  title: Joi.string().max(200),
  message: Joi.string().max(2000),
  type: Joi.string().valid('info', 'warning', 'maintenance', 'update'),
  is_active: Joi.boolean(),
});

/**
 * Schema for creating a support ticket.
 */
const createTicketSchema = Joi.object({
  subject: Joi.string().required().max(200),
  message: Joi.string().required().max(2000),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  chain_id: Joi.string().uuid(),
});

/**
 * Schema for updating a support ticket.
 */
const updateTicketSchema = Joi.object({
  status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed'),
  assigned_to: Joi.string().max(100),
});

/**
 * Schema for replying to a ticket.
 */
const replyToTicketSchema = Joi.object({
  message: Joi.string().required().max(2000),
});

/**
 * Schema for sending a broadcast.
 */
const sendBroadcastSchema = Joi.object({
  title: Joi.string().required().max(200),
  message: Joi.string().required().max(2000),
  channels: Joi.array().items(Joi.string().valid('email', 'sms', 'whatsapp', 'push')),
  target_chains: Joi.array().items(Joi.string().uuid()),
});

/**
 * Schema for creating a promo code.
 */
const createPromoCodeSchema = Joi.object({
  code: Joi.string().required().max(20).uppercase(),
  discount_type: Joi.string().valid('percentage', 'flat').required(),
  discount_value: Joi.number().min(0).required(),
  max_uses: Joi.number().integer().min(0),
  valid_from: Joi.date(),
  valid_until: Joi.date(),
});

/**
 * Schema for updating a promo code.
 */
const updatePromoCodeSchema = Joi.object({
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
  settings: Joi.object().required(),
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
