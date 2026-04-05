/**
 * @fileoverview Joi validation schemas for inventory endpoints.
 * @module modules/inventory/inventory.validation
 */

const Joi = require('joi');

const adjustStockSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  item_id: Joi.string().uuid().required(),
  quantity: Joi.number().precision(3).required(),
  reason: Joi.string().trim().min(3).max(500).required(),
});

const recordWastageSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  items: Joi.array().items(Joi.object({
    item_id: Joi.string().uuid().required(),
    quantity: Joi.number().precision(3).min(0.001).required(),
    reason: Joi.string().trim().min(3).max(500).required(),
  })).min(1).required(),
});

const createRecipeSchema = Joi.object({
  name: Joi.string().trim().max(200).allow('', null),
  yield_quantity: Joi.number().precision(3).min(0.001).default(1),
  yield_unit: Joi.string().valid('kg', 'g', 'l', 'ml', 'pcs', 'dozen', 'box').default('pcs'),
  instructions: Joi.string().max(2000).allow('', null),
  ingredients: Joi.array().items(Joi.object({
    inventory_item_id: Joi.string().uuid().required(),
    quantity: Joi.number().precision(3).min(0.001).required(),
    unit: Joi.string().valid('kg', 'g', 'l', 'ml', 'pcs', 'dozen', 'box').required(),
  })).min(1).required(),
});

const createInventoryItemSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(2).max(200).required(),
  sku: Joi.string().trim().max(50).allow('', null),
  category: Joi.string().trim().max(50).allow('', null),
  unit: Joi.string().valid('kg', 'g', 'l', 'ml', 'pcs', 'dozen', 'box').default('kg'),
  cost_per_unit: Joi.number().precision(2).min(0).default(0),
  min_threshold: Joi.number().precision(2).min(0).default(0),
  max_threshold: Joi.number().precision(2).min(0).default(0),
});

module.exports = { adjustStockSchema, recordWastageSchema, createRecipeSchema, createInventoryItemSchema };
