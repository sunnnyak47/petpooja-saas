/**
 * @fileoverview Joi validation schemas for KOT endpoints.
 * @module modules/orders/kot.validation
 */

const Joi = require('joi');

/** PUT /api/kitchen/kots/:id/status */
const updateKOTStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'preparing', 'ready', 'completed').required(),
  outlet_id: Joi.string().uuid().required(),
});

/** PATCH /api/kitchen/kot/:id/item-ready */
const markItemReadySchema = Joi.object({
  kot_item_id: Joi.string().uuid(),
});

module.exports = {
  updateKOTStatusSchema,
  markItemReadySchema,
};
