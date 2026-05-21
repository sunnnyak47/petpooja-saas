/**
 * @fileoverview Joi validation schemas for Voice POS endpoints.
 * @module modules/voice-pos/voice-pos.validation
 */

const Joi = require('joi');

/** POST /api/voice-pos/converse */
const converseSchema = Joi.object({
  transcript: Joi.string().required().max(2000),
  conversation_history: Joi.array(),
  current_cart: Joi.array(),
  outlet_id: Joi.string().uuid().required(),
  // BCP-47 locale (e.g. "en-IN", "en-AU", "hi-IN"). Optional; defaults to en-IN.
  language: Joi.string().max(10).allow('', null),
});

/** POST /api/voice-pos/upsell */
const upsellSchema = Joi.object({
  cart: Joi.array().required(),
  outlet_id: Joi.string().uuid().required(),
});

/** POST /api/voice-pos/place-order */
const placeVoiceOrderSchema = Joi.object({
  cart: Joi.array().min(1).required(),
  outlet_id: Joi.string().uuid().required(),
  order_type: Joi.string().valid('dine_in', 'takeaway', 'delivery'),
  table_id: Joi.string().uuid().allow(null),
  customer_name: Joi.string().max(150),
});

module.exports = {
  converseSchema,
  upsellSchema,
  placeVoiceOrderSchema,
};
