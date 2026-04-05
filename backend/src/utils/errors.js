/**
 * @fileoverview Custom error classes for structured error handling.
 * All errors thrown in the application should use these classes.
 * @module utils/errors
 */

/**
 * Base application error with HTTP status code support.
 * @extends Error
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {boolean} [isOperational=true] - Whether this is an expected operational error
   */
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 Bad Request — invalid input or malformed request */
class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

/** 401 Unauthorized — missing or invalid authentication */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

/** 403 Forbidden — authenticated but insufficient permissions */
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

/** 404 Not Found — requested resource does not exist */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/** 409 Conflict — resource already exists or version conflict */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

/** 422 Unprocessable Entity — validation passed but business logic rejected */
class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity') {
    super(message, 422);
  }
}

/** 429 Too Many Requests — rate limit exceeded */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429);
  }
}

/** 500 Internal Server Error — unexpected server failure */
class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, false);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableError,
  RateLimitError,
  InternalError,
};
