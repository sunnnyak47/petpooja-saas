/**
 * @fileoverview Joi validation schemas for reservation endpoints.
 * @module modules/reservations/reservations.validation
 */

const Joi = require('joi');
const { phoneOptional, phoneRequired } = require('../../utils/validators');

// Reusable past-date validator: compares at start-of-UTC-day so "today" is always
// allowed regardless of what time of day the request arrives.
function notInPast(value, helpers) {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const dayUtc = new Date(value);
  dayUtc.setUTCHours(0, 0, 0, 0);
  if (dayUtc < todayUtc) return helpers.error('date.past');
  return value;
}

/** POST /api/reservations */
const createReservationSchema = Joi.object({
  customer_name: Joi.string().required().max(150),
  customer_phone: phoneOptional,
  party_size: Joi.number().integer().min(1).max(50).required(),
  reservation_date: Joi.date().required().custom(notInPast).messages({
    'date.past': '"reservation_date" cannot be in the past — check the year and month/day order',
  }),
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

/**
 * POST /api/reservations/public — customer self-service via QR/link.
 * Phone is required here (no logged-in staff to follow up otherwise) and the
 * outlet is taken from the link/token, not a trusted session.
 */
const publicReservationSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  customer_name: Joi.string().trim().required().max(150),
  customer_phone: phoneRequired,
  party_size: Joi.number().integer().min(1).max(50).required(),
  reservation_date: Joi.date().required().custom(notInPast).messages({
    'date.past': '"reservation_date" cannot be in the past — check the year and month/day order',
  }),
  reservation_time: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/).required(),
  special_requests: Joi.string().max(500).allow('', null),
  table_id: Joi.string().uuid().allow(null, ''),
});

module.exports = {
  createReservationSchema,
  updateReservationSchema,
  publicReservationSchema,
};
