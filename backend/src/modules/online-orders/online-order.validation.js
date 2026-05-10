/**
 * @fileoverview Joi validation schemas for online order endpoints.
 * @module modules/online-orders/online-order.validation
 */

const Joi = require('joi');

/** PUT /api/online-orders/:id/accept */
const acceptOrderSchema = Joi.object({
  prep_time: Joi.number().integer().min(1).max(120),
});

/** PUT /api/online-orders/:id/reject */
const rejectOrderSchema = Joi.object({
  reason: Joi.string().required().max(500),
});

module.exports = {
  acceptOrderSchema,
  rejectOrderSchema,
};
