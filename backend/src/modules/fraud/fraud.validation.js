/**
 * @fileoverview Joi validation schemas for Fraud Detection endpoints.
 * @module modules/fraud/fraud.validation
 */

const Joi = require('joi');

/**
 * Schema for running fraud detection scan.
 */
const runDetectionSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  thresholds: Joi.object(),
});

/**
 * Schema for marking a single alert as read.
 */
const markReadSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

/**
 * Schema for marking all alerts as read.
 */
const markAllReadSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

/**
 * Schema for dismissing an alert.
 */
const dismissAlertSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

/**
 * Schema for resolving an alert.
 */
const resolveAlertSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  note: Joi.string().max(500).allow('', null),
});

/**
 * Schema for approving an alert.
 */
const approveAlertSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  note: Joi.string().max(500).allow('', null),
});

/**
 * Schema for rejecting an alert.
 */
const rejectAlertSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  note: Joi.string().max(500).allow('', null),
});

module.exports = {
  runDetectionSchema,
  markReadSchema,
  markAllReadSchema,
  dismissAlertSchema,
  resolveAlertSchema,
  approveAlertSchema,
  rejectAlertSchema,
};
