/**
 * @fileoverview Joi validation schemas for onboarding wizard endpoints.
 * @module modules/onboarding/onboarding.validation
 */

const Joi = require('joi');

/** POST /api/onboarding/step/:step */
const saveStepSchema = Joi.object({
  data: Joi.object().required(),
});

/** POST /api/onboarding/parse-menu */
const parseMenuSchema = Joi.object({
  menu_text: Joi.string().required().max(10000),
  currency: Joi.string().max(5),
});

module.exports = {
  saveStepSchema,
  parseMenuSchema,
};
