/**
 * @fileoverview Joi validation schemas for settlement reconciliation endpoints.
 * @module modules/settlements/settlement.validation
 */

const Joi = require('joi');

const PROVIDERS = ['razorpay', 'card_acquirer', 'upi', 'bank', 'manual'];
const LINE_TYPES = ['payment', 'refund', 'chargeback', 'adjustment'];

/**
 * A single settlement line as supplied by the importer (CSV paste or manual).
 */
const lineSchema = Joi.object({
  transaction_id: Joi.string().max(100).allow('', null),
  order_ref: Joi.string().max(100).allow('', null),
  type: Joi.string().valid(...LINE_TYPES).default('payment'),
  amount: Joi.number().required(),
  fee: Joi.number().default(0),
  net: Joi.number(),
});

/**
 * Create a settlement header, optionally with nested lines.
 */
const createSettlementSchema = Joi.object({
  outlet_id: Joi.string().uuid(),
  provider: Joi.string().valid(...PROVIDERS).required(),
  reference: Joi.string().max(100).allow('', null),
  settlement_date: Joi.date().required(),
  currency: Joi.string().max(5).default('INR'),
  gross_amount: Joi.number().min(0),
  fees: Joi.number().min(0),
  tax_on_fees: Joi.number().min(0),
  net_amount: Joi.number().min(0),
  notes: Joi.string().max(1000).allow('', null),
  lines: Joi.array().items(lineSchema).default([]),
});

/**
 * Append additional lines to an existing open settlement.
 */
const addLinesSchema = Joi.object({
  outlet_id: Joi.string().uuid(),
  lines: Joi.array().items(lineSchema).min(1).required(),
});

module.exports = {
  PROVIDERS,
  LINE_TYPES,
  lineSchema,
  createSettlementSchema,
  addLinesSchema,
};
