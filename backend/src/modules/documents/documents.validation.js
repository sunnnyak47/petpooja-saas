/**
 * @fileoverview Joi validation schemas for the Documents (licenses & files) module.
 * @module modules/documents/documents.validation
 */

const Joi = require('joi');

const CATEGORIES = ['License', 'Contract', 'Certificate', 'Menu', 'Other'];

/**
 * GET /api/documents?outlet_id= — list query.
 * outlet_id is optional here (falls back to the token's outlet in the controller).
 */
const listQuerySchema = Joi.object({
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

/**
 * POST /api/documents — multipart form fields (the file itself is handled by
 * multer, so it is NOT part of this body schema). All values arrive as strings.
 */
const createDocumentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  category: Joi.string().valid(...CATEGORIES).default('Other'),
  expires_at: Joi.date().iso().allow('', null).optional(),
  outlet_id: Joi.string().uuid().optional(),
}).unknown(true);

module.exports = { listQuerySchema, createDocumentSchema, CATEGORIES };
