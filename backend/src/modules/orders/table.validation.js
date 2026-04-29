/**
 * @fileoverview Table validation schemas using Joi.
 * @module modules/orders/table.validation
 */

const Joi = require('joi');

const createTableSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  table_number: Joi.string().max(20).required(),
  seating_capacity: Joi.number().integer().min(1).default(4),
  capacity: Joi.number().integer().min(1),
  area_id: Joi.string().uuid().allow(null, ''),
  display_order: Joi.number().integer().min(0).default(0),
  pos_x: Joi.number().default(0),
  pos_y: Joi.number().default(0),
  width: Joi.number().integer().min(40).default(80),
  height: Joi.number().integer().min(40).default(80),
  shape: Joi.string().valid('square', 'round', 'rectangle').default('square'),
  rotation: Joi.number().integer().min(0).max(359).default(0),
});

const updateTableStatusSchema = Joi.object({
  status: Joi.string().valid('available', 'occupied', 'dirty', 'reserved', 'blocked').required(),
});

const updateTableSchema = Joi.object({
  table_number: Joi.string().max(20),
  seating_capacity: Joi.number().integer().min(1),
  area_id: Joi.string().uuid().allow(null, ''),
  display_order: Joi.number().integer().min(0),
  pos_x: Joi.number(),
  pos_y: Joi.number(),
  width: Joi.number().integer().min(40),
  height: Joi.number().integer().min(40),
  shape: Joi.string().valid('square', 'round', 'rectangle'),
  rotation: Joi.number().integer().min(0).max(359),
});

const createTableAreaSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().max(100).required(),
  display_order: Joi.number().integer().min(0).default(0),
  color: Joi.string().max(30).default('#1e293b'),
  pos_x: Joi.number().default(0),
  pos_y: Joi.number().default(0),
  width: Joi.number().integer().min(100).default(400),
  height: Joi.number().integer().min(100).default(300),
});

const updateTableAreaSchema = Joi.object({
  name: Joi.string().max(100),
  display_order: Joi.number().integer().min(0),
  color: Joi.string().max(30),
  pos_x: Joi.number(),
  pos_y: Joi.number(),
  width: Joi.number().integer().min(100),
  height: Joi.number().integer().min(100),
});

const saveFloorPlanSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  tables: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      pos_x: Joi.number().required(),
      pos_y: Joi.number().required(),
      width: Joi.number().integer().min(40).required(),
      height: Joi.number().integer().min(40).required(),
      shape: Joi.string().valid('square', 'round', 'rectangle').required(),
      rotation: Joi.number().integer().min(0).max(359).default(0),
      area_id: Joi.string().uuid().allow(null, ''),
      table_number: Joi.string().max(20),
      seating_capacity: Joi.number().integer().min(1),
    })
  ).required(),
  areas: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      pos_x: Joi.number().required(),
      pos_y: Joi.number().required(),
      width: Joi.number().integer().min(100).required(),
      height: Joi.number().integer().min(100).required(),
      color: Joi.string().max(30),
      name: Joi.string().max(100),
    })
  ).default([]),
});

module.exports = {
  createTableSchema,
  updateTableStatusSchema,
  updateTableSchema,
  createTableAreaSchema,
  updateTableAreaSchema,
  saveFloorPlanSchema,
};
