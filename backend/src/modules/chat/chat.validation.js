/**
 * @fileoverview Joi validation schemas for the Staff Chat (internal messaging) module.
 * @module modules/chat/chat.validation
 */

const Joi = require('joi');

/** GET /api/chat/messages?outlet_id=&limit= */
const listMessagesSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

/** POST /api/chat/messages { outlet_id, body } */
const createMessageSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  body: Joi.string().trim().min(1).max(2000).required(),
});

module.exports = { listMessagesSchema, createMessageSchema };
