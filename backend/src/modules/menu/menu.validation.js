/**
 * @fileoverview Joi validation schemas for menu endpoints.
 * @module modules/menu/menu.validation
 */

const Joi = require('joi');

const createCategorySchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().trim().max(500).allow('', null),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
  parent_id: Joi.string().uuid().allow(null),
});

const updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  description: Joi.string().trim().max(500).allow('', null),
  display_order: Joi.number().integer().min(0),
  is_active: Joi.boolean(),
  parent_id: Joi.string().uuid().allow(null),
}).min(1);

const createMenuItemSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  category_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().max(1000).allow('', null),
  short_code: Joi.string().trim().max(20).allow('', null),
  base_price: Joi.number().precision(2).min(0).required(),
  food_type: Joi.string().valid('veg', 'non_veg', 'egg').default('veg'),
  cuisine: Joi.string().trim().max(50).allow('', null),
  kitchen_station: Joi.string().valid('KITCHEN', 'BAR', 'COLD', 'DESSERT', 'GRILL').default('KITCHEN'),
  gst_rate: Joi.number().valid(0, 5, 12, 18, 28).default(5),
  hsn_code: Joi.string().default('9963'),
  is_active: Joi.boolean().default(true),
  is_available: Joi.boolean().default(true),
  is_bestseller: Joi.boolean().default(false),
  is_new: Joi.boolean().default(false),
  is_spicy: Joi.boolean().default(false),
  is_recommended: Joi.boolean().default(false),
  allergen_info: Joi.string().max(500).allow('', null),
  preparation_time_min: Joi.number().integer().min(1).max(180).default(15),
  calories: Joi.number().integer().min(0).allow(null),
  tags: Joi.array().items(Joi.string().max(30)).default([]),
});

const updateMenuItemSchema = Joi.object({
  category_id: Joi.string().uuid(),
  name: Joi.string().trim().min(2).max(200),
  description: Joi.string().trim().max(1000).allow('', null),
  short_code: Joi.string().trim().max(20).allow('', null),
  base_price: Joi.number().precision(2).min(0),
  food_type: Joi.string().valid('veg', 'non_veg', 'egg'),
  cuisine: Joi.string().trim().max(50).allow('', null),
  kitchen_station: Joi.string().valid('KITCHEN', 'BAR', 'COLD', 'DESSERT', 'GRILL'),
  gst_rate: Joi.number().valid(0, 5, 12, 18, 28),
  is_active: Joi.boolean(),
  is_available: Joi.boolean(),
  is_bestseller: Joi.boolean(),
  is_new: Joi.boolean(),
  is_spicy: Joi.boolean(),
  is_recommended: Joi.boolean(),
  allergen_info: Joi.string().max(500).allow('', null),
  preparation_time_min: Joi.number().integer().min(1).max(180),
  calories: Joi.number().integer().min(0).allow(null),
  tags: Joi.array().items(Joi.string().max(30)),
}).min(1);

const createVariantSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  price_addition: Joi.number().precision(2).min(0).default(0),
  is_default: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
  display_order: Joi.number().integer().min(0).default(0),
});

const createAddonGroupSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(2).max(100).required(),
  min_selection: Joi.number().integer().min(0).default(0),
  max_selection: Joi.number().integer().min(1).default(5),
  is_required: Joi.boolean().default(false),
});

const createAddonSchema = Joi.object({
  addon_group_id: Joi.string().uuid().required(),
  menu_item_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(1).max(100).required(),
  price: Joi.number().precision(2).min(0).default(0),
  is_active: Joi.boolean().default(true),
});

const bulkPriceUpdateSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  items: Joi.array().items(Joi.object({
    item_id: Joi.string().uuid().required(),
    new_price: Joi.number().precision(2).min(0).required(),
  })).min(1).required(),
});

const bulkAvailabilitySchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  items: Joi.array().items(Joi.object({
    item_id: Joi.string().uuid().required(),
    is_available: Joi.boolean().required(),
  })).min(1).required(),
});

const createMenuScheduleSchema = Joi.object({
  day_of_week: Joi.number().integer().min(1).max(7).required(),
  start_time: Joi.string().pattern(/^([01]\d|2[0-3]):?([0-5]\d)$/).required(),
  end_time: Joi.string().pattern(/^([01]\d|2[0-3]):?([0-5]\d)$/).required(),
});

const createComboSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().trim().max(500).allow('', null),
  combo_price: Joi.number().precision(2).min(0).required(),
  items: Joi.array().items(Joi.object({
    menu_item_id: Joi.string().uuid().required(),
    quantity: Joi.number().integer().min(1).default(1),
  })).min(1).required(),
});

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  createVariantSchema,
  createAddonGroupSchema,
  createAddonSchema,
  bulkPriceUpdateSchema,
  bulkAvailabilitySchema,
  createMenuScheduleSchema,
  createComboSchema,
};
