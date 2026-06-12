/**
 * @fileoverview Joi validation schemas for Head Office endpoints.
 * @module modules/headoffice/headoffice.validation
 */

const Joi = require('joi');
const { phoneRequired, emailRequired } = require('../../utils/validators');

/**
 * Schema for menu sync — push menu from source outlet to targets.
 */
const menuSyncSchema = Joi.object({
  source_outlet_id: Joi.string().uuid().required(),
  target_outlet_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  options: Joi.object(),
});

/**
 * Schema for creating a central kitchen indent.
 */
const createIndentSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  items: Joi.array().items(
    Joi.object({
      inventory_item_id: Joi.string().uuid().required(),
      requested_quantity: Joi.number().min(1).required(),
      unit: Joi.string(),
    })
  ).min(1).required(),
});

/**
 * Schema for SaaS restaurant onboarding.
 */
const registerRestaurantSchema = Joi.object({
  name: Joi.string().required().max(150),
  email: emailRequired,
  phone: phoneRequired,
  password: Joi.string().required().min(6).max(100),
  legal_name: Joi.string().max(200),
  gstin: Joi.string().max(15).allow('', null),
  owner_name: Joi.string().max(150),
  full_name: Joi.string().max(150),
  plan: Joi.string().valid('starter', 'growth', 'pro', 'enterprise'),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  address: Joi.string().max(500),
  region: Joi.string().valid('IN', 'AU').default('IN'),
  abn: Joi.string().max(20).allow('', null),
  acn: Joi.string().max(15).allow('', null),
});

/**
 * Schema for updating branding of a chain.
 */
const updateBrandingSchema = Joi.object({
  head_office_id: Joi.string().uuid().required(),
  primary_color: Joi.string().max(7).pattern(/^#[0-9A-Fa-f]{6}$/),
  logo_url: Joi.string().uri().allow('', null),
});

/**
 * Schema for owner setup completion wizard.
 */
const setupCompleteSchema = Joi.object({
  primary_color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow('', null),
  logo_url: Joi.string().max(500).allow('', null),
  gstin: Joi.string().max(15).allow('', null),
  abn: Joi.string().max(20).allow('', null),
  legal_name: Joi.string().max(200).allow('', null),
});

/**
 * Schema for an owner updating their own chain branding (color + logo)
 * from the wizard or Settings — no head_office_id (scoped to the caller).
 */
const myBrandingSchema = Joi.object({
  primary_color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow('', null),
  logo_url: Joi.string().max(500).allow('', null),
}).min(1);

module.exports = {
  menuSyncSchema,
  createIndentSchema,
  registerRestaurantSchema,
  updateBrandingSchema,
  setupCompleteSchema,
  myBrandingSchema,
};
