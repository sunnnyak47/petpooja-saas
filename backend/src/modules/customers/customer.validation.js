/**
 * @fileoverview Joi validation schemas for customer endpoints.
 * @module modules/customers/customer.validation
 */

const Joi = require('joi');
const { phoneRequired, phoneOptional } = require('../../utils/validators');

const createCustomerSchema = Joi.object({
  phone: phoneRequired,
  full_name: Joi.string().trim().min(2).max(150).allow('', null),
  email: Joi.string().trim().lowercase().email().max(150).allow('', null),
  date_of_birth: Joi.date().iso().allow(null),
  anniversary: Joi.date().iso().allow(null),
  gender: Joi.string().valid('male', 'female', 'other').allow(null),
  dietary_preference: Joi.string().valid('veg', 'non_veg', 'vegan', 'jain').allow(null),
  allergens: Joi.string().max(500).allow('', null),
  notes: Joi.string().max(1000).allow('', null),
  // Marketing segment chosen at signup + campaign consent.
  segment: Joi.string().valid('new', 'regular', 'vip', 'lapsed').allow(null),
  marketing_consent: Joi.boolean(),
});

const updateCustomerSchema = Joi.object({
  phone: phoneOptional,
  full_name: Joi.string().trim().min(2).max(150),
  email: Joi.string().trim().lowercase().email().max(150).allow('', null),
  date_of_birth: Joi.date().iso().allow(null),
  anniversary: Joi.date().iso().allow(null),
  gender: Joi.string().valid('male', 'female', 'other').allow(null),
  dietary_preference: Joi.string().valid('veg', 'non_veg', 'vegan', 'jain').allow(null),
  allergens: Joi.string().max(500).allow('', null),
  notes: Joi.string().max(1000).allow('', null),
  segment: Joi.string().valid('new', 'regular', 'vip', 'lapsed'),
}).min(1);

const addAddressSchema = Joi.object({
  label: Joi.string().trim().max(50).default('home'),
  address_line1: Joi.string().trim().min(5).max(255).required(),
  address_line2: Joi.string().trim().max(255).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  state: Joi.string().trim().max(100).allow('', null),
  pincode: Joi.string().trim().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  is_default: Joi.boolean().default(false),
});

const redeemPointsSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  order_id: Joi.string().uuid().required(),
  points: Joi.number().integer().min(1).required(),
});

const adjustPointsSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  points: Joi.number().integer().required(),
  reason: Joi.string().max(255).required(),
});

const createCampaignSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().max(100).required(),
  type: Joi.string().valid('sms', 'whatsapp', 'email').required(),
  target_segment: Joi.string(),
  message: Joi.string().max(1000).required(),
  schedule_at: Joi.date().allow(null),
});

const birthdayCampaignSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  message_template: Joi.string().max(500).required(),
});

module.exports = {
  createCustomerSchema,
  updateCustomerSchema,
  addAddressSchema,
  redeemPointsSchema,
  adjustPointsSchema,
  createCampaignSchema,
  birthdayCampaignSchema,
};
