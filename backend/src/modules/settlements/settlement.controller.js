/**
 * @fileoverview Settlement reconciliation controller — HTTP handlers.
 * @module modules/settlements/settlement.controller
 */

const settlementService = require('./settlement.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');
const { BadRequestError } = require('../../utils/errors');

/**
 * Resolve the tenant outlet id from body/query/user, requiring it to be present.
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveOutletId(req) {
  const outletId = req.body?.outlet_id || req.query?.outlet_id || req.user?.outlet_id;
  if (!outletId) {
    throw new BadRequestError('outlet_id is required');
  }
  return outletId;
}

const settlementController = {
  /** GET /api/settlements */
  async list(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;

      const { rows, total } = await settlementService.list(outletId, {
        provider: req.query.provider,
        status: req.query.status,
        from: req.query.from,
        to: req.query.to,
        page,
        limit,
      });

      return sendPaginated(res, rows, total, page, limit, 'Settlements retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /** GET /api/settlements/stats */
  async stats(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const data = await settlementService.stats(outletId, {
        from: req.query.from,
        to: req.query.to,
      });
      return sendSuccess(res, data, 'Settlement stats retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /** GET /api/settlements/:id */
  async getOne(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const data = await settlementService.getOne(req.params.id, outletId);
      return sendSuccess(res, data, 'Settlement retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /** POST /api/settlements */
  async create(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const data = await settlementService.create(outletId, req.body, req.user);
      return sendCreated(res, data, 'Settlement imported');
    } catch (err) {
      return next(err);
    }
  },

  /** POST /api/settlements/:id/lines */
  async addLines(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const data = await settlementService.addLines(
        req.params.id,
        outletId,
        req.body.lines,
        req.user
      );
      return sendSuccess(res, data, 'Lines added');
    } catch (err) {
      return next(err);
    }
  },

  /** POST /api/settlements/:id/reconcile */
  async reconcile(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const data = await settlementService.reconcile(req.params.id, outletId, req.user);
      return sendSuccess(res, data, 'Settlement reconciled');
    } catch (err) {
      return next(err);
    }
  },

  /** POST /api/settlements/:id/close */
  async close(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const data = await settlementService.close(req.params.id, outletId, req.user);
      return sendSuccess(res, data, 'Settlement closed');
    } catch (err) {
      return next(err);
    }
  },

  /** DELETE /api/settlements/:id */
  async remove(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const data = await settlementService.remove(req.params.id, outletId, req.user);
      return sendSuccess(res, data, 'Settlement deleted');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = settlementController;
