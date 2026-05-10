/**
 * @fileoverview Joi validation schemas for Head Office endpoints.
 * @module modules/headoffice/headoffice.validation
 */

const Joi = require('joi');

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
  email: Joi.string().email().required(),
  phone: Joi.string().required().pattern(/^[0-9]{10,15}$/),
  password: Joi.string().required().min(6).max(100),
  legal_name: Joi.string().max(200),
  gstin: Joi.string().max(15).allow('', null),
  owner_name: Joi.string().max(150),
  plan: Joi.string().valid('starter', 'growth', 'pro', 'enterprise'),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  address: Joi.string().max(500),
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
  primary_color: Joi.string().max(7),
  logo_url: Joi.string().allow('', null),
  gstin: Joi.string().max(15).allow('', null),
  legal_name: Joi.string().max(200),
});

module.exports = {
  menuSyncSchema,
  createIndentSchema,
  registerRestaurantSchema,
  updateBrandingSchema,
  setupCompleteSchema,
};
