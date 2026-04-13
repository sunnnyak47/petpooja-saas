/**
 * @fileoverview Joi validation schemas for authentication endpoints.
 * @module modules/auth/auth.validation
 */

const Joi = require('joi');

const phoneRegex = /^[6-9]\d{9}$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,50}$/;

/**
 * Schema for user registration.
 */
const registerSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(150).required()
    .messages({ 'string.min': 'Name must be at least 2 characters' }),
  email: Joi.string().trim().lowercase().email().max(150).required(),
  phone: Joi.string().trim().pattern(phoneRegex).required()
    .messages({ 'string.pattern.base': 'Phone must be a valid 10-digit Indian mobile number' }),
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
  phone: Joi.string().trim().pattern(phoneRegex).required()
    .messages({ 'string.pattern.base': 'Phone must be a valid 10-digit Indian mobile number' }),
});

/**
 * Schema for OTP verification.
 */
const verifyOtpSchema = Joi.object({
  phone: Joi.string().trim().pattern(phoneRegex).required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required()
    .messages({ 'string.length': 'OTP must be 6 digits' }),
});

/**
 * Schema for password reset.
 */
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
