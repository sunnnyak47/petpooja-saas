/**
 * @fileoverview Joi validation schemas for the Credit Note module.
 * @module modules/financial-docs/creditnote.validation
 */

const Joi = require('joi');

const lineSchema = Joi.object({
  description: Joi.string().trim().max(200).required(),
  quantity: Joi.number().min(0).default(1),
  unit_price: Joi.number().min(0).required(),
  gst_rate: Joi.number().min(0).max(100).default(0),
});

/**
 * Create-credit-note payload. Requires EITHER a non-empty `lines` array OR an
 * explicit positive `total_amount`.
 */
const createCreditNoteSchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
  order_id: Joi.string().uuid().optional(),
  reason: Joi.string().trim().max(500).allow('', null),
  customer_name: Joi.string().trim().max(150).allow('', null),
  customer_phone: Joi.string().trim().max(15).allow('', null),
  currency: Joi.string().trim().max(5).optional(),
  notes: Joi.string().trim().max(1000).allow('', null),
  linked_payment_id: Joi.string().uuid().optional(),
  lines: Joi.array().items(lineSchema).optional(),
  subtotal: Joi.number().min(0).optional(),
  tax_amount: Joi.number().min(0).optional(),
  total_amount: Joi.number().min(0).optional(),
})
  .or('lines', 'total_amount')
  .custom((value, helpers) => {
    const hasLines = Array.isArray(value.lines) && value.lines.length > 0;
    const hasTotal = typeof value.total_amount === 'number' && value.total_amount > 0;
    if (!hasLines && !hasTotal) {
      return helpers.error('any.custom', {
        message: 'Provide at least one line item or a positive total_amount',
      });
    }
    return value;
  }, 'lines-or-total presence check')
  .messages({
    'any.custom': 'Provide at least one line item or a positive total_amount',
  });

const cancelCreditNoteSchema = Joi.object({
  reason: Joi.string().trim().min(3).max(500).required(),
});

module.exports = { createCreditNoteSchema, cancelCreditNoteSchema };
