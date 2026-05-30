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

// Canonical unit names + common aliases used by the frontend UI
const VALID_UNITS = ['kg', 'g', 'gm', 'l', 'ltr', 'ml', 'pcs', 'dozen', 'box', 'packet', 'pkt', 'bunch', 'roll', 'sleeve', 'ctn', 'tray'];

const createItemSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  sku: Joi.string().trim().max(50).allow('', null),
  category: Joi.string().trim().max(50).allow('', null),
  unit: Joi.string().valid(...VALID_UNITS).required(),
  cost_per_unit: Joi.number().min(0).default(0),
  min_threshold: Joi.number().min(0).default(0),
  max_threshold: Joi.number().min(0).default(0),
  auto_order_enabled: Joi.boolean().default(false),
  reorder_qty: Joi.number().min(0).allow(null),
  preferred_supplier_id: Joi.string().uuid().allow(null, ''),
  outlet_id: Joi.string().uuid().required(),
});

const updateItemSchema = Joi.object({
  name: Joi.string().trim().max(100),
  sku: Joi.string().trim().max(50).allow('', null),
  category: Joi.string().trim().max(50).allow('', null),
  unit: Joi.string().valid(...VALID_UNITS),
  cost_per_unit: Joi.number().min(0),
  min_threshold: Joi.number().min(0),
  max_threshold: Joi.number().min(0),
  auto_order_enabled: Joi.boolean(),
  reorder_qty: Joi.number().min(0).allow(null),
  preferred_supplier_id: Joi.string().uuid().allow(null, ''),
  outlet_id: Joi.string().uuid(),
});

const createSupplierSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  contact_person: Joi.string().trim().max(100),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/),
  email: Joi.string().email().allow('', null),
  address: Joi.string().max(500),
  gstin: Joi.string().max(15).allow('', null),
  abn: Joi.string().max(11).allow('', null),
  pan: Joi.string().max(10).allow('', null),
  payment_terms: Joi.string().max(100),
  outlet_id: Joi.string().uuid().required(),
});

const triggerAutoOrderSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

const restockOrderSchema = Joi.object({
  order_id: Joi.string().uuid().required(),
  outlet_id: Joi.string().uuid().required(),
});

const aiSuggestItemsSchema = Joi.object({
  outlet_id: Joi.string().uuid().allow('', null),
  // Frontend sends restaurant_type; controller reads restaurant_type
  restaurant_type: Joi.string().trim().max(200).required(),
  region: Joi.string().valid('IN', 'AU').default('IN'),
});

const aiSuggestRecipeSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  menu_item_id: Joi.string().uuid().required(),
});

const aiBuildPOSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

const aiAutofillItemSchema = Joi.object({
  outlet_id: Joi.string().uuid().allow('', null),
  // Frontend sends item_name; controller reads item_name
  item_name: Joi.string().trim().max(100).required(),
  region: Joi.string().valid('IN', 'AU').default('IN'),
});

module.exports = {
  adjustStockSchema,
  recordWastageSchema,
  createRecipeSchema,
  createInventoryItemSchema,
  createItemSchema,
  updateItemSchema,
  createSupplierSchema,
  triggerAutoOrderSchema,
  restockOrderSchema,
  aiSuggestItemsSchema,
  aiSuggestRecipeSchema,
  aiBuildPOSchema,
  aiAutofillItemSchema,
};
