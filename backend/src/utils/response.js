/**
 * @fileoverview Standard API response helpers.
 * All API endpoints MUST use these helpers to ensure consistent response format.
 * Format: { success: boolean, data: any, message: string, meta?: object }
 * @module utils/response
 */

/**
 * Sends a success response with status 200.
 * @param {import('express').Response} res - Express response object
 * @param {*} data - Response payload
 * @param {string} [message='Success'] - Human-readable message
 * @param {object} [meta=null] - Optional metadata (pagination, counts)
 * @returns {void}
 */
function sendSuccess(res, data, message = 'Success', meta = null) {
  const response = { success: true, data, message };
  if (meta) {
    response.meta = meta;
  }
  res.status(200).json(response);
}

/**
 * Sends a created response with status 201.
 * @param {import('express').Response} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} [message='Created successfully'] - Human-readable message
 * @returns {void}
 */
function sendCreated(res, data, message = 'Created successfully') {
  res.status(201).json({ success: true, data, message });
}

/**
 * Sends a paginated list response with meta information.
 * @param {import('express').Response} res - Express response object
 * @param {Array} data - Array of items
 * @param {number} total - Total count of items (before pagination)
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {string} [message='Success'] - Human-readable message
 * @returns {void}
 */
function sendPaginated(res, data, total, page, limit, message = 'Success') {
  const totalPages = Math.ceil(total / limit);
  res.status(200).json({
    success: true,
    data,
    message,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
}

/**
 * Sends an error response with appropriate HTTP status.
 * @param {import('express').Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {*} [errors=null] - Validation errors or additional details
 * @returns {void}
 */
function sendError(res, statusCode, message, errors = null) {
  const response = { success: false, data: null, message };
  if (errors) {
    response.errors = errors;
  }
  res.status(statusCode).json(response);
}

module.exports = { sendSuccess, sendCreated, sendPaginated, sendError };
