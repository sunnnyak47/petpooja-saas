/**
 * @fileoverview Joi validation schemas for staff endpoints.
 * @module modules/staff/staff.validation
 */

const Joi = require('joi');

const createStaffSchema = Joi.object({
  full_name: Joi.string().max(150).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[0-9]{10,15}$/).required()
    .messages({ 'string.pattern.base': 'Phone must be 10-15 digits' }),
  password: Joi.string().min(6).max(100),
  employee_code: Joi.string().max(20),
  department: Joi.string().max(50),
  designation: Joi.string().max(50),
  manager_pin: Joi.string().length(4).pattern(/^[0-9]{4}$/)
    .messages({ 'string.pattern.base': 'Manager PIN must be 4 digits' }),
  join_date: Joi.date(),
  role: Joi.string().valid('manager', 'cashier', 'waiter', 'chef', 'delivery'),
  outlet_id: Joi.string().uuid().required(),
});

const updateStaffSchema = Joi.object({
  department: Joi.string().max(50),
  designation: Joi.string().max(50),
  manager_pin: Joi.string().length(4).pattern(/^[0-9]{4}$/)
    .messages({ 'string.pattern.base': 'Manager PIN must be 4 digits' }),
  hourly_rate: Joi.number().min(0),
  monthly_salary: Joi.number().min(0),
});

const verifyPinSchema = Joi.object({
  pin: Joi.string().length(4).required(),
  outlet_id: Joi.string().uuid().required(),
});

const clockInSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  location: Joi.object({
    lat: Joi.number(),
    lng: Joi.number(),
  }),
  device_info: Joi.string().max(255),
});

const clockOutSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  location: Joi.object({
    lat: Joi.number(),
    lng: Joi.number(),
  }),
  device_info: Joi.string().max(255),
});

const createShiftSchema = Joi.object({
  outlet_id: Joi.string().uuid().required(),
  name: Joi.string().max(50).required(),
  start_time: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/).required()
    .messages({ 'string.pattern.base': 'start_time must be in HH:MM format' }),
  end_time: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/).required()
    .messages({ 'string.pattern.base': 'end_time must be in HH:MM format' }),
  days: Joi.array().items(Joi.string().valid('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
});

const calculateSalarySchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2020).max(2030).required(),
  outlet_id: Joi.string().uuid(),
});

const bulkCalculateSalarySchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2020).max(2030).required(),
  outlet_id: Joi.string().uuid(),
});

const markSalaryPaidSchema = Joi.object({
  bonus: Joi.number().min(0).allow(null),
});

const generateOTPSchema = Joi.object({
  action: Joi.string().valid('clock_in', 'clock_out').required(),
  outlet_id: Joi.string().uuid().required(),
});

const verifyOTPSchema = Joi.object({
  otp: Joi.string().length(6).required(),
  action: Joi.string().valid('clock_in', 'clock_out').required(),
  outlet_id: Joi.string().uuid().required(),
});

module.exports = {
  createStaffSchema,
  updateStaffSchema,
  verifyPinSchema,
  clockInSchema,
  clockOutSchema,
  createShiftSchema,
  calculateSalarySchema,
  bulkCalculateSalarySchema,
  markSalaryPaidSchema,
  generateOTPSchema,
  verifyOTPSchema,
};
