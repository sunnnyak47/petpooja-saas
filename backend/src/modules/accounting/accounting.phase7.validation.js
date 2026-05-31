const Joi = require('joi');

const createBudgetSchema = Joi.object({
  name: Joi.string().required().max(120),
  fy_year: Joi.number().integer().min(2000).max(2100).required(),
  lines: Joi.array().items(Joi.object({
    account_code: Joi.string().required().max(10),
    amount: Joi.number().required(),
  })).default([]),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const updateBudgetSchema = Joi.object({
  name: Joi.string().max(120),
  lines: Joi.array().items(Joi.object({
    account_code: Joi.string().max(10),
    amount: Joi.number(),
  })),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const createInvoiceSchema = Joi.object({
  customer_name: Joi.string().max(150).allow('', null),
  customer_id: Joi.string().uuid().allow(null, ''),
  issue_date: Joi.string().required(),
  due_date: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
  lines: Joi.array().items(Joi.object({
    description: Joi.string().required().max(300),
    quantity: Joi.number().min(0).default(1),
    unit_price: Joi.number().min(0).default(0),
  })).min(1).required(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const markPaidSchema = Joi.object({
  method: Joi.string().valid('cash', 'bank').default('bank'),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

module.exports = { createBudgetSchema, updateBudgetSchema, createInvoiceSchema, markPaidSchema };
