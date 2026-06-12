/**
 * @fileoverview Credit Note controller — HTTP handlers.
 * @module modules/financial-docs/creditnote.controller
 */

const creditNoteService = require('./creditnote.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');
const { BadRequestError } = require('../../utils/errors');

/**
 * Resolve the effective outlet for the request.
 * enforceOutletScope already injects outlet_id for non-owner roles; owners may
 * supply it via body/query. Throws if none is resolvable.
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveOutletId(req) {
  const outletId = req.body?.outlet_id || req.query?.outlet_id || req.user?.outlet_id;
  if (!outletId) {
    throw new BadRequestError('outlet_id is required (pass it as a query/body param)');
  }
  return outletId;
}

const creditNoteController = {
  /** GET /api/credit-notes */
  async list(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const { status, q, from, to, page, limit } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 50;

      const { rows, total } = await creditNoteService.list(outletId, {
        status,
        q,
        from,
        to,
        page: pageNum,
        limit: limitNum,
      });

      return sendPaginated(res, rows, total, pageNum, limitNum, 'Credit notes retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /** GET /api/credit-notes/stats */
  async stats(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const { from, to } = req.query;
      const data = await creditNoteService.stats(outletId, { from, to });
      return sendSuccess(res, data, 'Credit note stats retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /** GET /api/credit-notes/:id */
  async getOne(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const note = await creditNoteService.getOne(req.params.id, outletId);
      return sendSuccess(res, note, 'Credit note retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /** POST /api/credit-notes */
  async create(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const note = await creditNoteService.create(outletId, req.body, req.user);
      return sendCreated(res, note, 'Credit note issued');
    } catch (err) {
      return next(err);
    }
  },

  /** POST /api/credit-notes/:id/cancel */
  async cancel(req, res, next) {
    try {
      const outletId = resolveOutletId(req);
      const note = await creditNoteService.cancel(req.params.id, outletId, req.user, req.body.reason);
      return sendSuccess(res, note, 'Credit note cancelled');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = creditNoteController;
