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
  forgotPasswordEmailSchema,
  resetPasswordTokenSchema,
} = require('./auth.validation');

/**
 * GET /api/auth/branding
 * Public — Fetch platform branding
 */
router.get('/branding', authController.getBranding);

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
 * POST /api/auth/forgot-password-email
 * Public — sends reset link to email
 */
router.post('/forgot-password-email', authLimiter, validate(forgotPasswordEmailSchema), authController.forgotPasswordEmail);

/**
 * POST /api/auth/reset-password-token
 * Public — resets password with valid email token
 */
router.post('/reset-password-token', authLimiter, validate(resetPasswordTokenSchema), authController.resetPasswordToken);

/**
 * GET /api/auth/me
 * Requires authentication — returns current user profile
 */
router.get('/me', authenticate, authController.getMe);

/**
 * POST /api/auth/emergency-reset
 * TEMPORARY — one-time admin password reset, remove after use
 */
router.post('/emergency-reset', async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const bcrypt = require('bcrypt');
    const prisma = new PrismaClient();

    const hash = await bcrypt.hash('Petpooja@2026', 12);

    // Try to find user first
    const existing = await prisma.user.findFirst({ where: { email: 'admin@petpooja.com' } });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { password_hash: hash, is_active: true, is_deleted: false, failed_login_attempts: 0, locked_until: null }
      });
      await prisma.$disconnect();
      return res.json({ success: true, message: 'Admin password reset', userId: existing.id, is_deleted_was: existing.is_deleted, is_active_was: existing.is_active });
    }

    // User doesn't exist — create
    const user = await prisma.user.create({
      data: {
        full_name: 'Global Software Owner',
        email: 'admin@petpooja.com',
        phone: '9999999999',
        password_hash: hash,
        is_active: true,
        is_email_verified: true,
        is_phone_verified: true
      }
    });
    await prisma.$disconnect();
    return res.json({ success: true, message: 'Admin user created', userId: user.id });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
