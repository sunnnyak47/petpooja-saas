/**
 * @fileoverview Own-delivery dispatch controller — thin HTTP handlers that
 * delegate to dispatch.service and shape standard API responses.
 * @module modules/delivery/dispatch.controller
 */

const service = require('./dispatch.service');
const { sendSuccess, sendCreated } = require('../../utils/response');
const logger = require('../../config/logger');

/** Resolves the tenant outlet id from body, query, or the authenticated user. */
function resolveOutletId(req) {
  return req.body?.outlet_id || req.query?.outlet_id || req.user?.outlet_id;
}

/** POST /api/delivery/quote — get a courier quote (not persisted). */
async function quote(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const result = await service.getQuote(outletId, req.body);
    sendSuccess(res, result, 'Quote retrieved');
  } catch (err) {
    next(err);
  }
}

/** POST /api/delivery — create (book) a courier delivery. */
async function create(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const dispatch = await service.createDelivery(outletId, req.body, req.user);
    sendCreated(res, dispatch, 'Delivery requested');
  } catch (err) {
    next(err);
  }
}

/** GET /api/delivery — list dispatches for the outlet. */
async function list(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const { rows, total } = await service.list(outletId, {
      provider: req.query.provider,
      status: req.query.status,
      page,
      limit,
    });
    sendSuccess(res, rows, 'Dispatches retrieved', {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/delivery/:id — fetch a single dispatch. */
async function getOne(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const dispatch = await service.getOne(req.params.id, outletId);
    sendSuccess(res, dispatch, 'Dispatch retrieved');
  } catch (err) {
    next(err);
  }
}

/** POST /api/delivery/:id/cancel — cancel a dispatch. */
async function cancel(req, res, next) {
  try {
    const outletId = resolveOutletId(req);
    const dispatch = await service.cancel(req.params.id, outletId, req.user);
    sendSuccess(res, dispatch, 'Delivery canceled');
  } catch (err) {
    next(err);
  }
}

/** POST /api/delivery/webhook/:provider — public provider callback (never throws). */
async function webhook(req, res) {
  const { provider } = req.params;
  let payload = req.body;
  // express.raw delivers a Buffer; parse it leniently. A bad body is still acked.
  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString('utf8') || '{}');
    } catch (_) {
      payload = {};
    }
  }
  try {
    await service.handleWebhook(provider, payload);
  } catch (err) {
    logger.error('Delivery webhook controller error (acked anyway)', { provider, error: err.message });
  }
  // Always 200 so the provider stops retrying.
  res.status(200).json({ success: true, message: 'received' });
}

module.exports = { quote, create, list, getOne, cancel, webhook };
