/**
 * @fileoverview Auth controller — HTTP handlers for authentication endpoints.
 * @module modules/auth/auth.controller
 */

const authService = require('./auth.service');
const sessionService = require('./session.service');
const superadminService = require('../superadmin/superadmin.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');
const logger = require('../../config/logger');

/**
 * POST /api/auth/register — Register a new user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function register(req, res, next) {
  try {
    const auditInfo = { ip: req.ip, user_agent: req.get('User-Agent'), performed_by: req.user?.id, performed_by_role: req.user?.role };
    const user = await authService.register(req.body, auditInfo);
    sendCreated(res, user, 'User registered successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/branding — Fetch public platform branding.
 */
async function getBranding(req, res, next) {
  try {
    const config = await superadminService.getPublicSystemConfig();
    sendSuccess(res, config, 'Public platform branding retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/login — Authenticate user and return JWT pair.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function login(req, res, next) {
  try {
    const { login: loginId, password } = req.body;
    const auditInfo = { ip: req.ip, user_agent: req.get('User-Agent') };
    const result = await authService.login(loginId, password, auditInfo);
    sendSuccess(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/refresh-token — Refresh JWT access token.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function refreshToken(req, res, next) {
  try {
    const { refresh_token } = req.body;
    const auditInfo = { ip: req.ip, user_agent: req.get('User-Agent') };
    const tokens = await authService.refreshTokens(refresh_token, auditInfo);
    sendSuccess(res, tokens, 'Token refreshed successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/logout — Blacklist current token.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function logout(req, res, next) {
  try {
    const auditInfo = { ip: req.ip, user_agent: req.get('User-Agent') };
    await authService.logout(req.token, req.user.id, auditInfo);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/forgot-password — Send OTP to phone.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function forgotPassword(req, res, next) {
  try {
    const result = await authService.forgotPassword(req.body.phone);
    sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/verify-otp — Verify OTP.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function verifyOtp(req, res, next) {
  try {
    const result = await authService.verifyOTP(req.body.phone, req.body.otp);
    sendSuccess(res, result, 'OTP verified successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/reset-password — Reset password using OTP.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function resetPassword(req, res, next) {
  try {
    const { phone, otp, new_password } = req.body;
    const result = await authService.resetPassword(phone, otp, new_password);
    sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me — Get current authenticated user profile.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getMe(req, res, next) {
  try {
    // Reload user from DB so latest features/permissions are included
    const fresh = req.user?.id ? await authService.getCurrentUser(req.user.id) : req.user;
    sendSuccess(res, { user: { ...fresh, role: req.user?.role, permissions: req.user?.permissions, outlet_id: req.user?.outlet_id } }, 'User profile retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/forgot-password-email — Initiate password reset via email.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function forgotPasswordEmail(req, res, next) {
  try {
    const result = await authService.initiateEmailReset(req.body.email);
    sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/reset-password-token — Reset password using email token.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function resetPasswordToken(req, res, next) {
  try {
    const { token, new_password } = req.body;
    const result = await authService.resetPasswordByToken(token, new_password);
    sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/change-password — authenticated self-service password change.
 */
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    const result = await authService.changeOwnPassword(req.user.id, current_password, new_password);
    sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/sessions — active device sessions for the current user, plus a
 * last-login summary. The caller's own session is marked `is_current`.
 */
async function getSessions(req, res, next) {
  try {
    const currentCtx = { ip: req.ip, user_agent: req.get('User-Agent') };
    const [sessions, me] = await Promise.all([
      sessionService.listActiveSessions(req.user.id, req.user.sid || null, currentCtx),
      authService.getCurrentUser(req.user.id).catch(() => null),
    ]);
    sendSuccess(res, {
      sessions,
      active_count: sessions.length,
      last_login_at: me?.last_login_at || null,
    }, 'Active sessions retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/login-history — paginated login/logout history for the user.
 */
async function getLoginHistory(req, res, next) {
  try {
    const { limit, page, days } = req.query;
    const result = await sessionService.getLoginHistory(req.user.id, { limit, page, days });
    sendSuccess(res, result, 'Login history retrieved');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/sessions/:sid/revoke — sign out one device.
 */
async function revokeSession(req, res, next) {
  try {
    const auditInfo = { ip: req.ip, user_agent: req.get('User-Agent') };
    const result = await sessionService.revokeSession(req.user.id, req.params.sid, auditInfo);
    if (!result.revoked) return sendError(res, 'Session not found', 404);
    sendSuccess(res, result, 'Device signed out');
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/sessions/logout-others — sign out every device except this one.
 */
async function logoutOtherDevices(req, res, next) {
  try {
    const auditInfo = { ip: req.ip, user_agent: req.get('User-Agent') };
    const result = await sessionService.logoutOtherDevices(req.user.id, req.user.sid || null, auditInfo);
    sendSuccess(res, result, `Signed out ${result.count} other device(s)`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
  getMe,
  getBranding,
  forgotPasswordEmail,
  resetPasswordToken,
  changePassword,
  getSessions,
  getLoginHistory,
  revokeSession,
  logoutOtherDevices,
};
