/**
 * @fileoverview Joi validation schemas for the monitoring module.
 * @module modules/monitoring/monitoring.validation
 */

const Joi = require('joi');

/** Frontend crash-report ingest payload. */
const reportSchema = Joi.object({
  message: Joi.string().max(2000).required(),
  name: Joi.string().max(160),
  stack: Joi.string().max(8000),
  url: Joi.string().max(1000),
  level: Joi.string().valid('error', 'warn', 'fatal').default('error'),
  componentStack: Joi.string(),
  metadata: Joi.object(),
}).options({ stripUnknown: true });

/** Resolve/unresolve an error log. */
const resolveSchema = Joi.object({
  resolved: Joi.boolean().default(true),
}).options({ stripUnknown: true });

module.exports = { reportSchema, resolveSchema };
