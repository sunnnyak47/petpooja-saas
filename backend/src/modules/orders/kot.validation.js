/**
 * @fileoverview Joi validation schemas for KOT endpoints.
 * @module modules/orders/kot.validation
 */

const Joi = require('joi');

/** PUT /api/kitchen/kots/:id/status */
const updateKOTStatusSchema = Joi.object({
  // 'served' = picked up by waiter; 'completed' = order fully done.
  // Both are terminal KDS states — the frontend SERVED/PICKED UP button sends 'served'.
  status: Joi.string().valid('pending', 'preparing', 'ready', 'served', 'completed').required(),
  outlet_id: Joi.string().uuid().optional(), // already known from req.user — accept legacy clients
});

/** PATCH /api/kitchen/kot/:id/item-ready */
const markItemReadySchema = Joi.object({
  kot_item_id: Joi.string().uuid(),
});

module.exports = {
  updateKOTStatusSchema,
  markItemReadySchema,
};
