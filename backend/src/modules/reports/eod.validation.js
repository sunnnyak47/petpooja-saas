/**
 * @fileoverview Joi validation schemas for EOD report endpoints.
 * @module modules/reports/eod.validation
 */

const Joi = require('joi');

/** POST /api/reports/eod/save */
const saveDraftSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  date: Joi.date(),
  opening_cash: Joi.number().min(0),
  denomination_count: Joi.object(),
  notes: Joi.string().max(500),
  discrepancy_reason: Joi.string().max(255),
});

/** POST /api/reports/eod/lock */
const lockEODSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  report_id: Joi.string().uuid().required(),
});

module.exports = {
  saveDraftSchema,
  lockEODSchema,
};
