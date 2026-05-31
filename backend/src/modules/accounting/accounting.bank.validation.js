/**
 * @fileoverview Joi validation schemas for accounting bank endpoints.
 * @module modules/accounting/accounting.bank.validation
 */

const Joi = require('joi');

const createBankAccountSchema = Joi.object({
  name: Joi.string().required().max(120),
  bsb: Joi.string().max(10).allow('', null),
  account_number: Joi.string().max(30).allow('', null),
  gl_account_code: Joi.string().max(10).default('091'),
  opening_balance: Joi.number().default(0),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const updateBankAccountSchema = Joi.object({
  name: Joi.string().max(120),
  bsb: Joi.string().max(10).allow('', null),
  account_number: Joi.string().max(30).allow('', null),
  gl_account_code: Joi.string().max(10),
  opening_balance: Joi.number(),
  is_active: Joi.boolean(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const importStatementSchema = Joi.object({
  bank_account_id: Joi.string().uuid().optional(),
  csv: Joi.string().allow('', null),
  lines: Joi.array().items(Joi.object({
    txn_date: Joi.string().required(),
    description: Joi.string().allow('', null),
    amount: Joi.number().required(),
  })),
  outlet_id: Joi.string().uuid().optional(),
}).or('csv', 'lines').unknown(true);

const reconcileSchema = Joi.object({
  statement_line_id: Joi.string().uuid().required(),
  journal_line_id: Joi.string().uuid().required(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const unreconcileSchema = Joi.object({
  statement_line_id: Joi.string().uuid().required(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

const adjustmentSchema = Joi.object({
  account_code: Joi.string().required().max(10),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

module.exports = {
  createBankAccountSchema,
  updateBankAccountSchema,
  importStatementSchema,
  reconcileSchema,
  unreconcileSchema,
  adjustmentSchema,
};
