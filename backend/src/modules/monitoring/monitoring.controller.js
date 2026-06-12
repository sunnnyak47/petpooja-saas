/**
 * @fileoverview HTTP handlers for the monitoring module. Thin layer over the
 * service — validates nothing here (done by middleware) and shapes responses.
 * @module modules/monitoring/monitoring.controller
 */

const monitoringService = require('./monitoring.service');
const { sendSuccess, sendPaginated } = require('../../utils/response');

/** Parse an optional boolean from a query string ('true'/'false'). */
function parseBool(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

const monitoringController = {
  /**
   * POST /report — ingest a client-side crash. Public-ish (optionalAuth):
   * attaches identity/context when the caller is authenticated.
   */
  async report(req, res, next) {
    try {
      const body = req.body || {};
      const user = req.user || {};
      await monitoringService.recordError({
        source: 'frontend',
        level: body.level || 'error',
        message: body.message,
        name: body.name,
        stack: body.stack,
        url: body.url,
        user_agent: req.headers?.['user-agent'],
        request_id: req.id,
        user_id: user.id,
        head_office_id: user.head_office_id,
        outlet_id: user.outlet_id,
        metadata: body.metadata,
      });
      return sendSuccess(res, { ok: true }, 'Report received');
    } catch (err) {
      next(err);
    }
  },

  /** GET /errors — paginated, filtered list. */
  async list(req, res, next) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

      const { rows, total } = await monitoringService.listErrors({
        resolved: parseBool(req.query.resolved),
        source: req.query.source || undefined,
        level: req.query.level || undefined,
        q: req.query.q || undefined,
        page,
        limit,
      });

      return sendPaginated(res, rows, total, page, limit, 'Error logs retrieved');
    } catch (err) {
      next(err);
    }
  },

  /** GET /errors/:id — single error log. */
  async getOne(req, res, next) {
    try {
      const row = await monitoringService.getError(req.params.id);
      return sendSuccess(res, row, 'Error log retrieved');
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /errors/:id/resolve — toggle resolved state. */
  async setResolved(req, res, next) {
    try {
      const resolved = req.body.resolved !== false;
      const row = await monitoringService.setResolved(req.params.id, req.user?.id, resolved);
      return sendSuccess(res, row, resolved ? 'Error resolved' : 'Error re-opened');
    } catch (err) {
      next(err);
    }
  },

  /** GET /stats — dashboard aggregates. */
  async stats(req, res, next) {
    try {
      const data = await monitoringService.getStats();
      return sendSuccess(res, data, 'Stats retrieved');
    } catch (err) {
      next(err);
    }
  },
};

module.exports = monitoringController;
