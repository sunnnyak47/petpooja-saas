/**
 * @fileoverview Joi validation schemas for festival mode endpoints.
 * @module modules/festival/festival.validation
 */

const Joi = require('joi');

/** POST /api/festival/configs */
const saveFestivalConfigSchema = Joi.object({
  festival_key: Joi.string().required().max(50),
  outlet_id: Joi.string().uuid(),
  festival_name: Joi.string().max(100),
  start_date: Joi.date(),
  end_date: Joi.date(),
  special_mode: Joi.boolean(),
  theme: Joi.string().max(50),
  menu_suggestions: Joi.array(),
  offer_structure: Joi.object(),
  custom_banner: Joi.string().max(500),
});

/** POST /api/festival/configs/:id/toggle */
const toggleFestivalSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

module.exports = {
  saveFestivalConfigSchema,
  toggleFestivalSchema,
};
