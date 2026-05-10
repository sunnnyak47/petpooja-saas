/**
 * @fileoverview Joi validation schemas for aggregator endpoints.
 * @module modules/integrations/aggregator.validation
 */

const Joi = require('joi');

/** PUT /api/aggregators/config/:platform */
const updateAggregatorConfigSchema = Joi.object({
  outlet_id: Joi.string().uuid(),
  store_id: Joi.string().max(100),
  api_key: Joi.string().max(255),
  webhook_secret: Joi.string().max(255),
  enabled: Joi.boolean(),
});

/** POST /api/aggregators/menu/push/:platform */
const pushMenuSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

/** POST /api/aggregators/availability/:platform */
const setItemAvailabilitySchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  item_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  is_available: Joi.boolean().required(),
});

/** POST /api/aggregators/simulate/:platform */
const simulateOrderSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  items: Joi.array(),
  customer: Joi.object(),
});

/** POST /api/aggregators/orders/:id/accept */
const acceptAggOrderSchema = Joi.object({
  prep_time: Joi.number().integer().min(1).max(120),
});

/** POST /api/aggregators/orders/:id/reject */
const rejectAggOrderSchema = Joi.object({
  reason: Joi.string().max(500).allow('', null),
});

module.exports = {
  updateAggregatorConfigSchema,
  pushMenuSchema,
  setItemAvailabilitySchema,
  simulateOrderSchema,
  acceptAggOrderSchema,
  rejectAggOrderSchema,
};
