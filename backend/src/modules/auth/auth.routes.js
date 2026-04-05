/**
 * @fileoverview Auth routes — maps HTTP endpoints to controllers with middleware.
 * @module modules/auth/auth.routes
 */

const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validate } = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimit.middleware');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} = require('./auth.validation');

/**
 * POST /api/auth/register
 * Public (first run) or requires super_admin/owner role
 */
router.post('/register', authLimiter, validate(registerSchema), authController.register);

/**
 * POST /api/auth/login
 * Public — rate limited to 5/min
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * POST /api/auth/refresh-token
 * Public — requires valid refresh token in body
 */
router.post('/refresh-token', authLimiter, validate(refreshTokenSchema), authController.refreshToken);

/**
 * POST /api/auth/logout
 * Requires authentication
 */
router.post('/logout', authenticate, authController.logout);

/**
 * POST /api/auth/forgot-password
 * Public — sends OTP to phone
 */
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * POST /api/auth/verify-otp
 * Public — verifies OTP
 */
router.post('/verify-otp', authLimiter, validate(verifyOtpSchema), authController.verifyOtp);

/**
 * POST /api/auth/reset-password
 * Public — resets password with valid OTP
 */
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);

/**
 * GET /api/auth/me
 * Requires authentication — returns current user profile
 */
router.get('/me', authenticate, authController.getMe);

module.exports = router;
