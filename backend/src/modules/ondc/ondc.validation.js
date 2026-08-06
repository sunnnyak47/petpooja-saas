/**
 * @fileoverview Joi validation schemas for ONDC endpoints.
 * @module modules/ondc/ondc.validation
 */

const Joi = require('joi');
const { phoneOptional, emailOptional } = require('../../utils/validators');

/**
 * PATCH /api/ondc/profile
 * Keys must match real OndcSellerProfile columns — the previous schema declared fields that
 * are not columns (business_name/gst_number/address/…), so the validate middleware's
 * stripUnknown silently dropped every real field the client sends and onboarding never saved.
 */
const updateSellerProfileSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  store_name: Joi.string().max(200).allow('', null),
  store_description: Joi.string().max(2000).allow('', null),
  store_category: Joi.string().max(100).allow('', null),
  cuisine_types: Joi.string().max(500).allow('', null),
  fssai_number: Joi.string().max(20).allow('', null),
  fssai_expiry: Joi.date().allow('', null),
  gstin: Joi.string().max(15).allow('', null),
  pan: Joi.string().max(10).allow('', null),
  bank_account_name: Joi.string().max(150).allow('', null),
  bank_account_number: Joi.string().max(30).allow('', null),
  bank_ifsc: Joi.string().max(15).allow('', null),
  bank_name: Joi.string().max(100).allow('', null),
  service_radius_km: Joi.number().min(0).max(999).allow('', null),
  min_order_value: Joi.number().min(0).allow('', null),
  delivery_enabled: Joi.boolean(),
  pickup_enabled: Joi.boolean(),
  prep_time_minutes: Joi.number().integer().min(1).max(240),
  auto_accept: Joi.boolean(),
  tnc_accepted: Joi.boolean(),
  operating_hours: Joi.object().unknown(true),
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
// Enum must match the service transition map (accepted→preparing→ready→picked_up). The old
// enum omitted 'picked_up' (the only terminal target) and listed dead values, so orders got
// stuck at 'ready' and picked_up_at was never set.
const updateOndcOrderStatusSchema = Joi.object({
  status: Joi.string().valid('preparing', 'ready', 'picked_up').required(),
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
