/**
 * @fileoverview Joi validation schemas for dynamic pricing endpoints.
 * @module modules/pricing/pricing.validation
 */

const Joi = require('joi');

// FIX: the validator's action_type / action_unit / item_target vocabularies were out of sync
// with the engine (applyRule / itemMatchesTarget in pricing.service.js) and the seeded defaults,
// so validated API input never matched a real branch — every API-created discount/surcharge and
// every 'specific'/'slow_movers'/'bestsellers' target rule silently did nothing. Enums below are
// aligned to the exact strings the service and frontend already use.
const createRuleSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  trigger_type: Joi.string().valid('time_of_day', 'day_of_week', 'weather', 'season', 'demand', 'manual').required(),
  action_type: Joi.string().valid('discount', 'surcharge', 'fixed_price').required(),
  action_value: Joi.number().required(),
  description: Joi.string().max(255),
  is_active: Joi.boolean(),
  priority: Joi.number().integer().min(0),
  time_start: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/),
  time_end: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/),
  days_of_week: Joi.array().items(Joi.string().valid('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  weather_trigger: Joi.string().max(50),
  season_trigger: Joi.string().max(50),
  item_target: Joi.string().valid('all', 'category', 'specific', 'slow_movers', 'bestsellers', 'tag'),
  target_ids: Joi.array().items(Joi.string().uuid()),
  target_tag: Joi.string().max(50),
  action_unit: Joi.string().valid('percent', 'flat'),
  max_discount_amt: Joi.number().min(0),
  min_order_value: Joi.number().min(0),
  valid_from: Joi.date(),
  valid_until: Joi.date(),
  outlet_id: Joi.string().uuid().required(),
});

const updateRuleSchema = Joi.object({
  name: Joi.string().trim().max(100),
  trigger_type: Joi.string().valid('time_of_day', 'day_of_week', 'weather', 'season', 'demand', 'manual'),
  action_type: Joi.string().valid('discount', 'surcharge', 'fixed_price'),
  action_value: Joi.number(),
  description: Joi.string().max(255),
  is_active: Joi.boolean(),
  priority: Joi.number().integer().min(0),
  time_start: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/),
  time_end: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/),
  days_of_week: Joi.array().items(Joi.string().valid('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  weather_trigger: Joi.string().max(50),
  season_trigger: Joi.string().max(50),
  item_target: Joi.string().valid('all', 'category', 'specific', 'slow_movers', 'bestsellers', 'tag'),
  target_ids: Joi.array().items(Joi.string().uuid()),
  target_tag: Joi.string().max(50),
  action_unit: Joi.string().valid('percent', 'flat'),
  max_discount_amt: Joi.number().min(0),
  min_order_value: Joi.number().min(0),
  valid_from: Joi.date(),
  valid_until: Joi.date(),
  outlet_id: Joi.string().uuid(),
});

const toggleRuleSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

const logApplicationSchema = Joi.object({
  rule_id: Joi.string().uuid().required(),
  menu_item_id: Joi.string().uuid().required(),
  original_price: Joi.number().required(),
  applied_price: Joi.number().required(),
  outlet_id: Joi.string().uuid().required(),
});

const seedRulesSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

module.exports = {
  createRuleSchema,
  updateRuleSchema,
  toggleRuleSchema,
  logApplicationSchema,
  seedRulesSchema,
};
