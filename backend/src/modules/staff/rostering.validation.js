/**
 * @fileoverview Joi validation schemas for rostering endpoints.
 * @module modules/staff/rostering.validation
 */

const Joi = require('joi');

const timePattern = /^[0-2][0-9]:[0-5][0-9]$/;

/** POST /api/rostering */
const createRosterSchema = Joi.object({
  name: Joi.string().required().max(100),
  start_date: Joi.date().required(),
  end_date: Joi.date().required(),
  notes: Joi.string().max(500),
  outlet_id: Joi.string().uuid().required(),
});

/** PATCH /api/rostering/:id */
const updateRosterSchema = Joi.object({
  name: Joi.string().max(100),
  start_date: Joi.date(),
  end_date: Joi.date(),
  notes: Joi.string().max(500),
  status: Joi.string().valid('draft', 'published', 'archived'),
  outlet_id: Joi.string().uuid(),
});

/** POST /api/rostering/:id/publish */
const publishRosterSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
});

/** POST /api/rostering/:id/assignments */
const addAssignmentSchema = Joi.object({
  staff_id: Joi.string().uuid().required(),
  date: Joi.date().required(),
  start_time: Joi.string().required().pattern(timePattern),
  end_time: Joi.string().required(),
  role_label: Joi.string().max(50),
  notes: Joi.string().max(200),
});

/** PATCH /api/rostering/assignments/:assignmentId */
const updateAssignmentSchema = Joi.object({
  date: Joi.date(),
  start_time: Joi.string(),
  end_time: Joi.string(),
  role_label: Joi.string().max(50),
  notes: Joi.string().max(200),
  status: Joi.string().valid('scheduled', 'completed', 'missed', 'cancelled'),
});

/** POST /api/rostering/staff/:staffId/availability */
const setAvailabilitySchema = Joi.object({
  day_of_week: Joi.string().valid('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun').required(),
  available: Joi.boolean().required(),
  start_time: Joi.string(),
  end_time: Joi.string(),
  notes: Joi.string().max(200),
});

/** POST /api/rostering/certifications */
const addCertificationSchema = Joi.object({
  staff_id: Joi.string().uuid().required(),
  cert_type: Joi.string().required().max(100),
  provider: Joi.string().max(100),
  issue_date: Joi.date().required(),
  expiry_date: Joi.date().required(),
  cert_number: Joi.string().max(50),
  outlet_id: Joi.string().uuid(),
});

/** PATCH /api/rostering/certifications/:id */
const updateCertificationSchema = Joi.object({
  cert_type: Joi.string().max(100),
  provider: Joi.string().max(100),
  issue_date: Joi.date(),
  expiry_date: Joi.date(),
  cert_number: Joi.string().max(50),
});

module.exports = {
  createRosterSchema,
  updateRosterSchema,
  publishRosterSchema,
  addAssignmentSchema,
  updateAssignmentSchema,
  setAvailabilitySchema,
  addCertificationSchema,
  updateCertificationSchema,
};
