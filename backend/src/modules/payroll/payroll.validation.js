/**
 * @fileoverview Joi validation schemas for payroll endpoints.
 * @module modules/payroll/payroll.validation
 */

const Joi = require('joi');

const createPayRunSchema = Joi.object({
  period_start: Joi.string().required(),
  period_end: Joi.string().required(),
  pay_date: Joi.string().required(),
  periodsPerYear: Joi.number().integer().min(1).max(366).default(52),
  superRate: Joi.number().min(0).max(1).default(0.115),
  lines: Joi.array()
    .items(
      Joi.object({
        staff_id: Joi.string().uuid().allow(null, ''),
        staff_name: Joi.string().max(150).allow('', null),
        gross: Joi.number().min(0).required(),
        hours: Joi.number().min(0).default(0),
      })
    )
    .min(1)
    .required(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const finalisePayRunSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

module.exports = { createPayRunSchema, finalisePayRunSchema };
