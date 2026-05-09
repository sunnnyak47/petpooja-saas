/**
 * @fileoverview Audit trail middleware.
 * Intercepts POST/PUT/PATCH/DELETE responses to record who changed what and when.
 * Non-blocking: audit failures are logged but never crash the request.
 * @module middleware/audit
 */

const { getDbClient } = require('../config/database');
const logger = require('../config/logger');

/**
 * Maps HTTP method to a human-readable action verb.
 * @param {string} method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @returns {string} Action verb for the audit log
 */
function mapMethodToAction(method) {
  switch (method.toUpperCase()) {
    case 'POST':   return 'create';
    case 'PUT':    return 'update';
    case 'PATCH':  return 'update';
    case 'DELETE': return 'delete';
    default:       return method.toLowerCase();
  }
}

/**
 * Extracts the entity ID from the response body or request params.
 * Tries multiple common patterns to find the ID.
 * @param {object} body - Response body (parsed JSON)
 * @param {object} params - Express request params
 * @returns {string|null} UUID string or null
 */
function extractEntityId(body, params) {
  // From response: body.data.id (most common pattern in this codebase)
  if (body?.data?.id) return body.data.id;
  // From URL params: /api/orders/:id
  if (params?.id) return params.id;
  // From URL params: /api/inventory/:itemId (alias route)
  if (params?.itemId) return params.itemId;
  // From URL params: /api/menu/items/:id/variants
  if (params?.menuItemId) return params.menuItemId;
  return null;
}

/**
 * Validates whether a string looks like a UUID.
 * @param {string} value
 * @returns {boolean}
 */
function isValidUuid(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Builds a sanitized copy of the request body for audit storage.
 * Strips sensitive fields that should never be logged.
 * @param {object} body - Request body
 * @returns {object} Sanitized body
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return {};
  const sanitized = { ...body };
  const sensitiveKeys = ['password', 'password_hash', 'token', 'secret', 'credit_card', 'card_number', 'cvv', 'pin'];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

/**
 * Express middleware factory that creates an audit trail for mutation requests.
 * Only logs when the response indicates success (2xx status, success: true).
 *
 * @param {string} entityType - The type of entity being audited (e.g. 'order', 'payment', 'inventory', 'menu', 'staff')
 * @returns {import('express').RequestHandler} Express middleware
 *
 * @example
 *   router.post('/', authenticate, auditLog('order'), orderController.createOrder);
 *   router.patch('/:id', authenticate, auditLog('menu'), menuController.updateMenuItem);
 */
function auditLog(entityType) {
  return (req, res, next) => {
    // Only audit mutation methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
      return next();
    }

    // Capture the original res.json to intercept the response
    const originalJson = res.json.bind(res);

    res.json = function auditInterceptor(body) {
      // Restore original immediately to prevent double-interception
      res.json = originalJson;

      // Only audit successful responses (2xx + success flag)
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false;

      if (isSuccess) {
        // Fire-and-forget: run audit insert asynchronously after response
        setImmediate(async () => {
          try {
            const prisma = getDbClient();
            const entityId = extractEntityId(body, req.params);

            await prisma.auditLog.create({
              data: {
                outlet_id: req.user?.outlet_id && isValidUuid(req.user.outlet_id) ? req.user.outlet_id : null,
                user_id:   req.user?.id && isValidUuid(req.user.id) ? req.user.id : null,
                entity_type: entityType,
                entity_id: entityId && isValidUuid(entityId) ? entityId : null,
                action: mapMethodToAction(req.method),
                new_values: sanitizeBody(req.body),
                metadata: {
                  params: req.params,
                  query: req.query,
                  path: req.originalUrl,
                  method: req.method,
                  status_code: res.statusCode,
                },
                ip_address: (req.ip || req.connection?.remoteAddress || '').substring(0, 45),
                user_agent: req.get('user-agent')?.substring(0, 500) || null,
              },
            });
          } catch (err) {
            // Non-blocking: log the failure but never crash the request
            logger.warn('Audit log write failed', {
              error: err.message,
              entity_type: entityType,
              path: req.originalUrl,
              method: req.method,
            });
          }
        });
      }

      // Always send the original response
      return originalJson(body);
    };

    next();
  };
}

module.exports = { auditLog };
