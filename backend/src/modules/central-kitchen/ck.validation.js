/**
 * @fileoverview Joi validation schemas for Central Kitchen endpoints.
 * @module modules/central-kitchen/ck.validation
 */

const Joi = require('joi');

/**
 * Schema for creating an indent requisition.
 */
const createIndentSchema = Joi.object({
  requesting_outlet_id: Joi.string().uuid().required(),
  ck_outlet_id: Joi.string().uuid().required(),
  notes: Joi.string().max(500),
  items: Joi.array().items(
    Joi.object({
      inventory_item_id: Joi.string().uuid().required(),
      requested_quantity: Joi.number().min(1).required(),
      unit: Joi.string().max(20),
    })
  ).min(1).required(),
});

/**
 * Schema for approving an indent (with approved quantities).
 */
const approveIndentSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      item_id: Joi.string().uuid().required(),
      approved_quantity: Joi.number().min(0).required(),
    })
  ),
});

/**
 * Schema for dispatching an indent (with dispatched quantities).
 */
const dispatchIndentSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      item_id: Joi.string().uuid().required(),
      dispatched_quantity: Joi.number().min(0).required(),
    })
  ),
});

/**
 * Schema for rejecting an indent.
 */
const rejectIndentSchema = Joi.object({
  reason: Joi.string().required().max(500),
});

module.exports = {
  createIndentSchema,
  approveIndentSchema,
  dispatchIndentSchema,
  rejectIndentSchema,
};
