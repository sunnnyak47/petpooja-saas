/**
 * @fileoverview Joi validation schemas for reservation endpoints.
 * @module modules/reservations/reservations.validation
 */

const Joi = require('joi');
const { phoneOptional } = require('../../utils/validators');

/** POST /api/reservations */
const createReservationSchema = Joi.object({
  customer_name: Joi.string().required().max(150),
  customer_phone: phoneOptional,
  party_size: Joi.number().integer().min(1).max(50).required(),
  reservation_date: Joi.date().required(),
  reservation_time: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/),
  special_requests: Joi.string().max(500).allow('', null),
  outlet_id: Joi.string().uuid().required(),
  table_id: Joi.string().uuid().allow(null),
});

/** PATCH /api/reservations/:id */
const updateReservationSchema = Joi.object({
  status: Joi.string().valid('confirmed', 'cancelled', 'seated', 'completed', 'no_show'),
  customer_name: Joi.string().max(150),
  customer_phone: phoneOptional,
  party_size: Joi.number().integer().min(1).max(50),
  reservation_date: Joi.date(),
  reservation_time: Joi.string(),
  special_requests: Joi.string().max(500),
});

module.exports = {
  createReservationSchema,
  updateReservationSchema,
};
