/**
 * @fileoverview Joi validation schemas for customer endpoints.
 * @module modules/customers/customer.validation
 */

const Joi = require('joi');

const phoneRegex = /^[6-9]\d{9}$/;

const createCustomerSchema = Joi.object({
  phone: Joi.string().trim().pattern(phoneRegex).required()
    .messages({ 'string.pattern.base': 'Phone must be a valid 10-digit Indian mobile number' }),
  full_name: Joi.string().trim().min(2).max(150).allow('', null),
  email: Joi.string().trim().lowercase().email().max(150).allow('', null),
  date_of_birth: Joi.date().iso().allow(null),
  anniversary: Joi.date().iso().allow(null),
  gender: Joi.string().valid('male', 'female', 'other').allow(null),
  dietary_preference: Joi.string().valid('veg', 'non_veg', 'vegan', 'jain').allow(null),
  allergens: Joi.string().max(500).allow('', null),
  notes: Joi.string().max(1000).allow('', null),
});

const updateCustomerSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(150),
  email: Joi.string().trim().lowercase().email().max(150).allow('', null),
  date_of_birth: Joi.date().iso().allow(null),
  anniversary: Joi.date().iso().allow(null),
  gender: Joi.string().valid('male', 'female', 'other').allow(null),
  dietary_preference: Joi.string().valid('veg', 'non_veg', 'vegan', 'jain').allow(null),
  allergens: Joi.string().max(500).allow('', null),
  notes: Joi.string().max(1000).allow('', null),
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

module.exports = { createCustomerSchema, updateCustomerSchema, addAddressSchema, redeemPointsSchema };
