/**
 * @fileoverview Authentication service — handles registration, login, JWT, OTP, and password management.
 * @module modules/auth/auth.service
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDbClient } = require('../../config/database');
const { getRedisClient } = require('../../config/redis');
const appConfig = require('../../config/app');
const logger = require('../../config/logger');
const {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../../utils/errors');

/**
 * Registers a new user with hashed password and assigns role.
 * @param {object} userData - Registration data
 * @param {string} userData.full_name - User's full name
 * @param {string} userData.email - User email
 * @param {string} userData.phone - User phone (Indian 10-digit)
 * @param {string} userData.password - Plain text password
 * @param {string} [userData.role='cashier'] - Role to assign
 * @param {string} [userData.outlet_id] - Outlet assignment
 * @param {object} [auditInfo] - Audit metadata (ip, user_agent, performed_by)
 * @returns {Promise<object>} Created user profile (without password_hash)
 */
async function register(userData, auditInfo = {}) {
  const prisma = getDbClient();

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { phone: userData.phone },
        ],
        is_deleted: false,
      },
    });

    if (existingUser) {
      if (existingUser.email === userData.email) {
        throw new ConflictError('Email already registered');
      }
      throw new ConflictError('Phone number already registered');
    }

    const password_hash = await bcrypt.hash(userData.password, appConfig.bcrypt.rounds);

    const role = await prisma.role.findFirst({
      where: { name: userData.role || 'cashier', is_deleted: false },
    });

    if (!role) {
      throw new BadRequestError(`Role '${userData.role}' not found`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          full_name: userData.full_name,
          email: userData.email,
          phone: userData.phone,
          password_hash,
          is_active: true,
        },
      });

      await tx.userRole.create({
        data: {
          user_id: user.id,
          role_id: role.id,
          outlet_id: userData.outlet_id || null,
          is_primary: true,
        },
      });

      await tx.auditLog.create({
        data: {
          user_id: auditInfo.performed_by || user.id,
          outlet_id: userData.outlet_id || null,
          action: 'USER_REGISTERED',
          entity_type: 'user',
          entity_id: user.id,
          new_values: { full_name: user.full_name, email: user.email, phone: user.phone, role: role.name },
          ip_address: auditInfo.ip || null,
          user_agent: auditInfo.user_agent || null,
        },
      });

      return user;
    });

    const { password_hash: _, ...userWithoutPassword } = result;
    return userWithoutPassword;
  } catch (error) {
    if (error instanceof ConflictError || error instanceof BadRequestError) {
      throw error;
    }
    logger.error('Registration failed', { error: error.message });
    throw error;
  }
}

/**
 * Authenticates a user and returns JWT access + refresh token pair.
 * Checks lockout status and increments failed attempts on failure.
 * @param {string} login - Email or phone number
 * @param {string} password - Plain text password
 * @param {object} [auditInfo] - Audit metadata
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 */
async function login(login, password, auditInfo = {}) {
  const prisma = getDbClient();
  const redis = getRedisClient();

  try {
    const lockoutKey = `${appConfig.redisKeys.loginAttempts}${login}`;
    const attemptsVal = await redis.get(lockoutKey);
    const attempts = attemptsVal ? parseInt(attemptsVal, 10) : 0;

    if (attempts >= appConfig.lockout.maxAttempts) {
      throw new ForbiddenError(
        `Account locked due to too many failed attempts. Try again in ${appConfig.lockout.durationMinutes} minutes.`
      );
    }

    const isEmail = login.includes('@');
    const startDb = Date.now();
    const user = await prisma.user.findFirst({
      where: {
        ...(isEmail ? { email: login } : { phone: login }),
        is_deleted: false,
      },
      include: {
        user_roles: {
          where: { is_deleted: false },
          include: {
            role: {
              include: {
                role_permissions: {
                  include: { permission: true },
                },
              },
            },
            outlet: { select: { id: true, name: true, code: true, primary_color: true } },
          },
        },
        head_office: { select: { id: true, name: true, primary_color: true, logo_url: true, setup_completed: true } }
      },
    });
    logger.debug(`Prisma user lookup took ${Date.now() - startDb}ms`);

    if (!user) {
      await incrementLoginAttempts(redis, lockoutKey);
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.is_active) {
      throw new ForbiddenError('Account is deactivated. Contact administrator.');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new ForbiddenError('Account is temporarily locked. Try again later.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      await incrementLoginAttempts(redis, lockoutKey);

      const currentAttemptsVal = await redis.get(lockoutKey);
      const currentAttempts = currentAttemptsVal ? parseInt(currentAttemptsVal, 10) : 0;
      
      if (currentAttempts >= appConfig.lockout.maxAttempts) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            locked_until: new Date(Date.now() + appConfig.lockout.durationMinutes * 60000),
            failed_login_attempts: currentAttempts,
          },
        });
      }

      throw new UnauthorizedError('Invalid credentials');
    }

    await redis.del(lockoutKey);

    const primaryRole = user.user_roles.find((ur) => ur.is_primary) || user.user_roles[0];
    const roleName = primaryRole?.role?.name || 'cashier';
    const outletId = primaryRole?.outlet_id || null;
    const permissions = primaryRole?.role?.role_permissions?.map((rp) => rp.permission.key) || [];

    const tokenPayload = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: roleName,
      outlet_id: outletId,
      head_office_id: user.head_office_id,
      primary_color: primaryRole?.outlet?.primary_color || user.head_office?.primary_color || '#4F46E5',
      logo_url: user.head_office?.logo_url || null,
      permissions,
    };

    const accessToken = jwt.sign(tokenPayload, appConfig.jwt.secret, {
      expiresIn: appConfig.jwt.accessExpiry,
      issuer: 'petpooja-erp',
    });

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh', jti: uuidv4() },
      appConfig.jwt.refreshSecret,
      { expiresIn: appConfig.jwt.refreshExpiry, issuer: 'petpooja-erp' }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), failed_login_attempts: 0, locked_until: null },
    });

    await prisma.auditLog.create({
      data: {
        user_id: user.id,
        outlet_id: outletId,
        action: 'USER_LOGIN',
        entity_type: 'user',
        entity_id: user.id,
        ip_address: auditInfo.ip || null,
        user_agent: auditInfo.user_agent || null,
      },
    });

    const { password_hash: _, ...userWithoutPassword } = user;

    return {
      user: {
        ...userWithoutPassword,
        role: roleName,
        outlet_id: outletId,
        outlet: primaryRole?.outlet || null,
        permissions,
      },
      accessToken,
      refreshToken,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError || error instanceof ConflictError) {
      throw error;
    }
    logger.error('Login failed', { error: error.message, login });
    throw error;
  }
}

/**
 * Increments failed login attempts in Redis with TTL.
 * @param {import('ioredis').Redis} redis - Redis client
 * @param {string} key - Redis lockout key
 * @returns {Promise<void>}
 */
async function incrementLoginAttempts(redis, key) {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, appConfig.lockout.durationMinutes * 60);
  }
}

/**
 * Validates a refresh token and issues a new access + refresh token pair.
 * @param {string} refreshToken - Current refresh token
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
async function refreshTokens(refreshToken) {
  const prisma = getDbClient();
  const redis = getRedisClient();

  try {
    const decoded = jwt.verify(refreshToken, appConfig.jwt.refreshSecret);

    const isBlacklisted = await redis.get(`${appConfig.redisKeys.tokenBlacklist}${refreshToken}`);
    if (isBlacklisted) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    const user = await prisma.user.findFirst({
      where: { id: decoded.id, is_deleted: false, is_active: true },
      include: {
        user_roles: {
          where: { is_deleted: false },
          include: {
            role: { include: { role_permissions: { include: { permission: true } } } },
          },
        },
        head_office: { select: { id: true, name: true, setup_completed: true } }
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found or deactivated');
    }

    await redis.setex(
      `${appConfig.redisKeys.tokenBlacklist}${refreshToken}`,
      7 * 24 * 3600,
      'revoked'
    );

    const primaryRole = user.user_roles.find((ur) => ur.is_primary) || user.user_roles[0];
    const roleName = primaryRole?.role?.name || 'cashier';
    const outletId = primaryRole?.outlet_id || null;
    const permissions = primaryRole?.role?.role_permissions?.map((rp) => rp.permission.key) || [];

    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, phone: user.phone, role: roleName, outlet_id: outletId, permissions },
      appConfig.jwt.secret,
      { expiresIn: appConfig.jwt.accessExpiry, issuer: 'petpooja-erp' }
    );

    const newRefreshToken = jwt.sign(
      { id: user.id, type: 'refresh', jti: uuidv4() },
      appConfig.jwt.refreshSecret,
      { expiresIn: appConfig.jwt.refreshExpiry, issuer: 'petpooja-erp' }
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token expired. Please login again.');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw error;
  }
}

/**
 * Blacklists the current access token in Redis to invalidate the session.
 * @param {string} token - JWT access token to blacklist
 * @param {string} userId - User ID for audit logging
 * @param {object} [auditInfo] - Audit metadata
 * @returns {Promise<void>}
 */
async function logout(token, userId, auditInfo = {}) {
  const prisma = getDbClient();
  const redis = getRedisClient();

  try {
    const decoded = jwt.decode(token);
    const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 900;

    if (ttl > 0) {
      await redis.setex(`${appConfig.redisKeys.tokenBlacklist}${token}`, ttl, 'revoked');
    }

    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: 'USER_LOGOUT',
        entity_type: 'user',
        entity_id: userId,
        ip_address: auditInfo.ip || null,
        user_agent: auditInfo.user_agent || null,
      },
    });

    logger.info('User logged out', { userId });
  } catch (error) {
    logger.error('Logout failed', { error: error.message, userId });
    throw error;
  }
}

/**
 * Generates a 6-digit OTP for phone-based password reset, stores in Redis with 5-minute TTL.
 * @param {string} phone - User's phone number
 * @returns {Promise<{message: string}>}
 */
async function forgotPassword(phone) {
  const prisma = getDbClient();
  const redis = getRedisClient();

  try {
    const user = await prisma.user.findFirst({
      where: { phone, is_deleted: false },
    });

    if (!user) {
      return { message: 'If this phone is registered, you will receive an OTP shortly' };
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await redis.setex(`${appConfig.redisKeys.otpPrefix}${phone}`, 300, otp);

    logger.info('OTP generated for password reset', { phone, otp: process.env.NODE_ENV === 'development' ? otp : '******' });

    return { message: 'If this phone is registered, you will receive an OTP shortly' };
  } catch (error) {
    logger.error('Forgot password failed', { error: error.message, phone });
    throw error;
  }
}

/**
 * Verifies a 6-digit OTP against Redis store.
 * @param {string} phone - User's phone number
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<{verified: boolean}>}
 */
async function verifyOTP(phone, otp) {
  const redis = getRedisClient();

  try {
    const storedOtp = await redis.get(`${appConfig.redisKeys.otpPrefix}${phone}`);

    if (!storedOtp) {
      throw new BadRequestError('OTP expired or not found. Please request a new one.');
    }

    if (storedOtp !== otp) {
      throw new BadRequestError('Invalid OTP');
    }

    return { verified: true };
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    logger.error('OTP verification failed', { error: error.message, phone });
    throw error;
  }
}

/**
 * Resets user password after OTP verification.
 * @param {string} phone - User's phone number
 * @param {string} otp - 6-digit OTP for verification
 * @param {string} newPassword - New plain text password
 * @returns {Promise<{message: string}>}
 */
async function resetPassword(phone, otp, newPassword) {
  const prisma = getDbClient();
  const redis = getRedisClient();

  try {
    const storedOtp = await redis.get(`${appConfig.redisKeys.otpPrefix}${phone}`);

    if (!storedOtp || storedOtp !== otp) {
      throw new BadRequestError('Invalid or expired OTP');
    }

    const user = await prisma.user.findFirst({
      where: { phone, is_deleted: false },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const password_hash = await bcrypt.hash(newPassword, appConfig.bcrypt.rounds);

    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash, failed_login_attempts: 0, locked_until: null },
    });

    await redis.del(`${appConfig.redisKeys.otpPrefix}${phone}`);

    await prisma.auditLog.create({
      data: {
        user_id: user.id,
        action: 'PASSWORD_RESET',
        entity_type: 'user',
        entity_id: user.id,
      },
    });

    return { message: 'Password reset successfully' };
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof NotFoundError) throw error;
    logger.error('Password reset failed', { error: error.message, phone });
    throw error;
  }
}

/**
 * Returns the current authenticated user's full profile.
 * @param {string} userId - User UUID
 * @returns {Promise<object>} User profile with role and outlet info
 */
async function getCurrentUser(userId) {
  const prisma = getDbClient();

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, is_deleted: false },
      include: {
        user_roles: {
          where: { is_deleted: false },
          include: {
            role: { select: { name: true, display_name: true } },
            outlet: { select: { id: true, name: true, code: true, city: true } },
          },
        },
        head_office: { select: { id: true, name: true, setup_completed: true, primary_color: true, logo_url: true } }
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const { password_hash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    logger.error('Get current user failed', { error: error.message, userId });
    throw error;
  }
}

module.exports = {
  register,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  verifyOTP,
  resetPassword,
  getCurrentUser,
};
