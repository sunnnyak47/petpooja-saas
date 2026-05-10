/**
 * @fileoverview Joi validation schemas for ONDC endpoints.
 * @module modules/ondc/ondc.validation
 */

const Joi = require('joi');

/** PATCH /api/ondc/profile */
const updateSellerProfileSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  business_name: Joi.string().max(150),
  description: Joi.string().max(500),
  gst_number: Joi.string().max(15),
  fssai_number: Joi.string().max(14),
  address: Joi.string().max(255),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  pincode: Joi.string().max(6),
  contact_email: Joi.string().email(),
  contact_phone: Joi.string(),
});

/** POST /api/ondc/profile/submit */
const submitForReviewSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

/** POST /api/ondc/profile/toggle-live */
const toggleLiveSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  live: Joi.boolean().required(),
});

/** POST /api/ondc/orders/:id/accept */
const acceptOndcOrderSchema = Joi.object({
  prep_time_minutes: Joi.number().integer().min(1).max(120),
});

/** POST /api/ondc/orders/:id/reject */
const rejectOndcOrderSchema = Joi.object({
  reason: Joi.string().required().max(500),
});

/** PATCH /api/ondc/orders/:id/status */
const updateOndcOrderStatusSchema = Joi.object({
  status: Joi.string().valid('accepted', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled').required(),
});

/** POST /api/ondc/simulate-order */
const simulateOndcOrderSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

module.exports = {
  updateSellerProfileSchema,
  submitForReviewSchema,
  toggleLiveSchema,
  acceptOndcOrderSchema,
  rejectOndcOrderSchema,
  updateOndcOrderStatusSchema,
  simulateOndcOrderSchema,
};
