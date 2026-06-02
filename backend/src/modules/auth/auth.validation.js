/**
 * @fileoverview Joi validation schemas for authentication endpoints.
 * @module modules/auth/auth.validation
 */

const Joi = require('joi');
const { phoneRequired } = require('../../utils/validators');

// Accepts Indian 10-digit (6-9XXXXXXXXX) or Australian mobile/landline (+61 or 04xx or 02/03/07/08)
const phoneRegex = /^(\+?61[0-9]{9}|0[2-9][0-9]{8}|[6-9][0-9]{9})$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,50}$/;

/**
 * Schema for user registration.
 */
const registerSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(150).required()
    .messages({ 'string.min': 'Name must be at least 2 characters' }),
  email: Joi.string().trim().lowercase().email().max(150).required(),
  phone: phoneRequired,
  password: Joi.string().pattern(passwordRegex).required()
    .messages({ 'string.pattern.base': 'Password must be 8-50 chars with uppercase, lowercase, number, and special character' }),
  role: Joi.string().valid('owner', 'manager', 'cashier', 'kitchen_staff', 'delivery_boy').default('cashier'),
  outlet_id: Joi.string().uuid().optional(),
});

/**
 * Schema for user login.
 */
const loginSchema = Joi.object({
  login: Joi.string().trim().required()
    .messages({ 'any.required': 'Email or phone is required' }),
  password: Joi.string().required(),
});

/**
 * Schema for token refresh.
 */
const refreshTokenSchema = Joi.object({
  refresh_token: Joi.string().required(),
});

/**
 * Schema for forgot password (OTP request).
 */
const forgotPasswordSchema = Joi.object({
  phone: phoneRequired,
});

/**
 * Schema for OTP verification.
 */
const verifyOtpSchema = Joi.object({
  phone: phoneRequired,
  otp: Joi.string().length(6).pattern(/^\d+$/).required()
    .messages({ 'string.length': 'OTP must be 6 digits' }),
});

/**
 * Schema for password reset.
 */
const resetPasswordSchema = Joi.object({
  phone: phoneRequired,
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
  new_password: Joi.string().pattern(passwordRegex).required()
    .messages({ 'string.pattern.base': 'Password must be 8-50 chars with uppercase, lowercase, number, and special character' }),
});

/**
 * Schema for forgot password (email request).
 */
const forgotPasswordEmailSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

/**
 * Schema for password reset (via token).
 */
const resetPasswordTokenSchema = Joi.object({
  token: Joi.string().required(),
  new_password: Joi.string().pattern(passwordRegex).required()
    .messages({ 'string.pattern.base': 'Password must be 8-50 chars with uppercase, lowercase, number, and special character' }),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  forgotPasswordEmailSchema,
  resetPasswordTokenSchema,
};
