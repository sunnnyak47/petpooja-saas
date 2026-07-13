/**
 * @fileoverview Validation for the OWNER-side support module (SA-006). Owners
 * raise/reply to tickets that land in the same SystemConfig-backed inbox the
 * super-admin manages.
 * @module modules/support/support.validation
 */
const Joi = require('joi');

const createTicketSchema = Joi.object({
  subject: Joi.string().trim().min(3).max(150).required(),
  body: Joi.string().trim().min(5).max(4000).required(),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM'),
});

const replyTicketSchema = Joi.object({
  body: Joi.string().trim().min(1).max(4000).required(),
});

module.exports = { createTicketSchema, replyTicketSchema };
