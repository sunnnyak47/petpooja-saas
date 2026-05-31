const Joi = require('joi');

const createAssetSchema = Joi.object({
  name: Joi.string().required().max(150),
  category: Joi.string().max(60).allow('', null),
  purchase_date: Joi.string().required(),
  cost: Joi.number().min(0).required(),
  salvage_value: Joi.number().min(0).default(0),
  useful_life_months: Joi.number().integer().min(1).default(60),
  method: Joi.string().valid('straight_line').default('straight_line'),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const updateAssetSchema = Joi.object({
  name: Joi.string().max(150),
  category: Joi.string().max(60).allow('', null),
  salvage_value: Joi.number().min(0),
  useful_life_months: Joi.number().integer().min(1),
  is_disposed: Joi.boolean(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const runDepreciationSchema = Joi.object({
  period: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

module.exports = { createAssetSchema, updateAssetSchema, runDepreciationSchema };
