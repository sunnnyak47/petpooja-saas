/**
 * @fileoverview Joi validation schemas for staff endpoints.
 * @module modules/staff/staff.validation
 */

const Joi = require('joi');
const { phoneRequired, emailRequired, emailOptional } = require('../../utils/validators');

const createStaffSchema = Joi.object({
  full_name: Joi.string().max(150).required(),
  // Email is optional — most floor staff don't have one (User.email is nullable). Phone
  // is the required unique identifier. Requiring email forced owners to invent/duplicate
  // addresses, which hit the unique constraint and silently failed the create.
  email: emailOptional,
  phone: phoneRequired,
  password: Joi.string().min(6).max(100),
  employee_code: Joi.string().max(20),
  department: Joi.string().max(50),
  designation: Joi.string().max(50),
  manager_pin: Joi.string().pattern(/^[0-9]{4,6}$/)
    .messages({ 'string.pattern.base': 'Manager PIN must be 4 to 6 digits' }),
  // Pay (optional, additive) — was previously stripped, silently discarding salary
  monthly_salary: Joi.number().min(0).allow(null, ''),
  hourly_rate: Joi.number().min(0).allow(null, ''),
  join_date: Joi.date(),
  role: Joi.string().valid('manager', 'cashier', 'waiter', 'chef', 'delivery'),
  outlet_id: Joi.string().uuid().required(),
});

const updateStaffSchema = Joi.object({
  // Basic employment
  user_id: Joi.string().uuid(),
  employee_code: Joi.string().max(20).allow('', null),
  department: Joi.string().max(50).allow('', null),
  designation: Joi.string().max(100).allow('', null),
  manager_pin: Joi.string().pattern(/^[0-9]{4,6}$/).allow('', null)
    .messages({ 'string.pattern.base': 'Manager PIN must be 4 to 6 digits' }),
  employment_type: Joi.string().valid('full_time', 'part_time', 'casual', 'contract').allow('', null),
  join_date: Joi.date().allow(null, ''),
  end_date: Joi.date().allow(null, ''),
  contract_end_date: Joi.date().allow(null, ''),
  // Pay
  hourly_rate: Joi.number().min(0).allow(null, ''),
  monthly_salary: Joi.number().min(0).allow(null, ''),
  // Personal details
  date_of_birth: Joi.date().allow(null, ''),
  gender: Joi.string().max(20).allow('', null),
  nationality: Joi.string().max(60).allow('', null),
  address: Joi.string().max(500).allow('', null),
  blood_group: Joi.string().max(5).allow('', null),
  // Emergency contact
  emergency_contact: Joi.string().max(15).allow('', null),
  emergency_contact_name: Joi.string().max(100).allow('', null),
  emergency_relationship: Joi.string().max(50).allow('', null),
  // Banking / payroll
  bank_bsb: Joi.string().max(10).allow('', null),
  bank_account: Joi.string().max(20).allow('', null),
  bank_account_name: Joi.string().max(100).allow('', null),
  tax_file_number: Joi.string().max(20).allow('', null),
  superannuation_fund: Joi.string().max(100).allow('', null),
  super_member_number: Joi.string().max(50).allow('', null),
  // Compliance & working rights
  right_to_work_checked: Joi.boolean().allow(null),
  visa_type: Joi.string().max(50).allow('', null),
  visa_expiry: Joi.date().allow(null, ''),
  induction_completed: Joi.boolean().allow(null),
  induction_date: Joi.date().allow(null, ''),
  wwcc_number: Joi.string().max(50).allow('', null),
  wwcc_expiry: Joi.date().allow(null, ''),
  rsa_number: Joi.string().max(50).allow('', null),
  rsa_expiry: Joi.date().allow(null, ''),
  food_safety_cert: Joi.string().max(50).allow('', null),
  food_safety_expiry: Joi.date().allow(null, ''),
  police_check_date: Joi.date().allow(null, ''),
  police_check_expiry: Joi.date().allow(null, ''),
  // Notes
  notes: Joi.string().allow('', null),
  is_deleted: Joi.boolean(),
});

const verifyPinSchema = Joi.object({
  pin: Joi.string().pattern(/^[0-9]{4,6}$/).required()
    .messages({ 'string.pattern.base': 'Manager PIN must be 4 to 6 digits' }),
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
  bonus: Joi.number().min(0).allow(null, ''),
});

const addCertificationSchema = Joi.object({
  cert_type: Joi.string().max(100).required(),
  provider: Joi.string().max(200).allow('', null),
  issue_date: Joi.date().required(),
  expiry_date: Joi.date().required(),
  cert_number: Joi.string().max(100).allow('', null),
  outlet_id: Joi.string().uuid().required(),
});

const setAvailabilitySchema = Joi.object({
  slots: Joi.array().items(Joi.object({
    day_of_week: Joi.number().integer().min(0).max(6).required(),
    available: Joi.boolean().required(),
    start_time: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/).allow('', null),
    end_time: Joi.string().pattern(/^[0-2][0-9]:[0-5][0-9]$/).allow('', null),
    notes: Joi.string().max(200).allow('', null),
  })).required(),
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
  addCertificationSchema,
  setAvailabilitySchema,
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
