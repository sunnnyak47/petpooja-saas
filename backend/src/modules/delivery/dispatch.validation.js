/**
 * @fileoverview Joi validation schemas for own-delivery dispatch endpoints.
 * @module modules/delivery/dispatch.validation
 */

const Joi = require('joi');

const PROVIDERS = ['uber_direct', 'doordash_drive'];

/** POST /api/delivery/quote */
const quoteSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
  provider: Joi.string().valid(...PROVIDERS).required(),
  dropoff_address: Joi.string().trim().min(3).max(500).required(),
  dropoff_lat: Joi.number().min(-90).max(90).optional(),
  dropoff_lng: Joi.number().min(-180).max(180).optional(),
  order_id: Joi.string().uuid().optional(),
});

/** POST /api/delivery */
const createSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
  provider: Joi.string().valid(...PROVIDERS).required(),
  order_id: Joi.string().uuid().optional(),
  quote_id: Joi.string().max(100).optional(),
  pickup_name: Joi.string().trim().max(150).optional(),
  pickup_address: Joi.string().trim().max(500).optional(),
  dropoff_name: Joi.string().trim().min(1).max(150).required(),
  dropoff_phone: Joi.string().trim().min(5).max(30).required(),
  dropoff_address: Joi.string().trim().min(3).max(500).required(),
  fee: Joi.number().min(0).optional(),
  currency: Joi.string().max(5).optional(),
});

module.exports = { quoteSchema, createSchema, PROVIDERS };
