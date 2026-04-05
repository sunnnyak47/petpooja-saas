/**
 * @fileoverview Application-level configuration constants.
 * Centralizes all configurable values used across the application.
 * @module config/app
 */

const appConfig = {
  /** Application name */
  name: process.env.APP_NAME || 'Petpooja ERP',

  /** Server port */
  port: parseInt(process.env.PORT, 10) || 5000,

  /** Node environment */
  env: process.env.NODE_ENV || 'development',

  /** Redis configuration */
  redis: {
    url: process.env.REDIS_URL || null,
  },

  /** Frontend URL for CORS and redirects */
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  /** Kitchen display URL */
  kitchenUrl: process.env.KITCHEN_URL || 'http://localhost:3002',

  /** JWT configuration */
  jwt: {
    secret: process.env.JWT_SECRET || 'default_dev_secret_change_in_production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_dev_refresh_secret_change_in_production',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  /** Bcrypt configuration */
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  },

  /** Rate limiting configuration */
  rateLimit: {
    general: parseInt(process.env.RATE_LIMIT_GENERAL, 10) || 100,
    auth: parseInt(process.env.RATE_LIMIT_AUTH, 10) || 5,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  },

  /** CORS whitelist */
  corsWhitelist: (process.env.CORS_WHITELIST || 'http://localhost:3001,http://localhost:3002,http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),

  /** File upload limits */
  upload: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
    dir: process.env.UPLOAD_DIR || './uploads',
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/csv',
    ],
  },

  /** GST configuration */
  gst: {
    defaultRate: 5,
    acRestaurantRate: 18,
    acThreshold: 7500,
    hsnCode: '9963',
    financialYearStartMonth: 4,
  },

  /** Loyalty configuration defaults */
  loyalty: {
    earnRate: 1,
    earnPerAmount: 10,
    redeemValue: 0.25,
    minRedemption: 100,
    expiryDays: 365,
  },

  /** Pagination defaults */
  pagination: {
    defaultPage: 1,
    defaultLimit: 20,
    maxLimit: 100,
    defaultSort: 'created_at',
    defaultOrder: 'desc',
  },

  /** Login lockout */
  lockout: {
    maxAttempts: 5,
    durationMinutes: 15,
  },

  /** Redis key prefixes */
  redisKeys: {
    tokenBlacklist: 'bl:',
    loginAttempts: 'la:',
    otpPrefix: 'otp:',
    reportCache: 'rpt:',
    sessionPrefix: 'sess:',
  },
};

module.exports = appConfig;
