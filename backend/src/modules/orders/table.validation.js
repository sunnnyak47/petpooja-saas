/**
 * @fileoverview Table validation schemas using Joi.
 * @module modules/orders/table.validation
 */

const Joi = require('joi');

const createTableSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  table_number: Joi.string().max(20).required(),
  seating_capacity: Joi.number().integer().min(1).default(4),
  area_id: Joi.string().uuid().allow(null),
  display_order: Joi.number().integer().min(0).default(0),
});

const updateTableStatusSchema = Joi.object({
  status: Joi.string().valid('available', 'occupied', 'dirty', 'reserved', 'blocked').required(),
});

const createTableAreaSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().max(100).required(),
  display_order: Joi.number().integer().min(0).default(0),
});

module.exports = {
  createTableSchema,
  updateTableStatusSchema,
  createTableAreaSchema,
};
