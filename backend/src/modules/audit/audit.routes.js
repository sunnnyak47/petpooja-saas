/**
 * @fileoverview Audit log routes — admin-only endpoint for viewing audit trail entries.
 * @module modules/audit/audit.routes
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { getDbClient } = require('../../config/database');
const { sendPaginated, sendError, sendSuccess } = require('../../utils/response');
const logger = require('../../config/logger');

/**
 * GET /api/audit-logs
 * Returns paginated audit log entries scoped to the user's outlet.
 * Supports filtering by entity_type, action, user_id, entity_id, and date range.
 *
 * Query params:
 *   page       - Page number (default: 1)
 *   limit      - Items per page (default: 50, max: 200)
 *   entity_type - Filter by entity type (e.g. 'order', 'menu', 'inventory')
 *   action     - Filter by action (e.g. 'create', 'update', 'delete')
 *   user_id    - Filter by user who performed the action
 *   entity_id  - Filter by specific entity ID
 *   start_date - Filter entries from this date (ISO 8601)
 *   end_date   - Filter entries until this date (ISO 8601)
 */
router.get('/', authenticate, enforceOutletScope, async (req, res) => {
  try {
    const prisma = getDbClient();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    // Build filter conditions
    const where = {
      is_deleted: false,
    };

    // Scope to outlet (non-superadmins see only their outlet)
    if (req.user.outlet_id) {
      where.outlet_id = req.user.outlet_id;
    }

    if (req.query.entity_type) {
      where.entity_type = req.query.entity_type;
    }
    if (req.query.action) {
      where.action = req.query.action;
    }
    if (req.query.user_id) {
      where.user_id = req.query.user_id;
    }
    if (req.query.entity_id) {
      where.entity_id = req.query.entity_id;
    }

    // Date range filtering
    if (req.query.start_date || req.query.end_date) {
      where.created_at = {};
      if (req.query.start_date) {
        where.created_at.gte = new Date(req.query.start_date);
      }
      if (req.query.end_date) {
        where.created_at.lte = new Date(req.query.end_date);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    sendPaginated(res, logs, total, page, limit, 'Audit logs retrieved');
  } catch (err) {
    logger.error('Failed to fetch audit logs', { error: err.message });
    sendError(res, 500, 'Failed to fetch audit logs');
  }
});

/**
 * GET /api/audit-logs/entity/:entityType/:entityId
 * Returns all audit entries for a specific entity (e.g. a particular order).
 * Useful for viewing the complete change history of a single record.
 */
router.get('/entity/:entityType/:entityId', authenticate, enforceOutletScope, async (req, res) => {
  try {
    const prisma = getDbClient();
    const { entityType, entityId } = req.params;

    const where = {
      entity_type: entityType,
      entity_id: entityId,
      is_deleted: false,
    };

    // Scope to outlet for non-superadmins
    if (req.user.outlet_id) {
      where.outlet_id = req.user.outlet_id;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    });

    sendSuccess(res, logs, `Audit history for ${entityType} ${entityId}`);
  } catch (err) {
    logger.error('Failed to fetch entity audit history', { error: err.message });
    sendError(res, 500, 'Failed to fetch entity audit history');
  }
});

module.exports = router;
