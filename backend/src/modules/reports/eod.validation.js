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
  // Joi.string() rejects '' by default, but Save Draft is meant to work at any
  // step with the drawer un-counted and no notes yet — the wizard always sends
  // notes and discrepancy_reason (both default to ''). Allow blank/null so an
  // early draft save doesn't 400 with "notes is not allowed to be empty".
  notes: Joi.string().max(500).allow('', null),
  discrepancy_reason: Joi.string().max(255).allow('', null),
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
