/**
 * @fileoverview Staff Chat controllers — thin HTTP layer over chat.service.
 * @module modules/chat/chat.controller
 */

const chatService = require('./chat.service');
const { sendSuccess, sendCreated } = require('../../utils/response');
const logger = require('../../config/logger');

/**
 * GET /api/chat/messages?outlet_id=&limit=
 * Returns messages oldest-first for the outlet. outlet_id is guaranteed present
 * and scoped by enforceOutletScope + Joi validation upstream.
 */
async function listMessages(req, res, next) {
  try {
    const { outlet_id, limit } = req.query;
    const items = await chatService.listMessages(outlet_id, limit);
    sendSuccess(res, { items, count: items.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/chat/messages { outlet_id, body }
 * Persists a message stamped with the sender's id + name, then best-effort
 * broadcasts it for realtime delivery.
 */
async function createMessage(req, res, next) {
  try {
    const { outlet_id, body } = req.body;
    const message = await chatService.createMessage(outlet_id, req.user, body);
    logger.info('Staff chat message created', {
      id: message.id, outlet_id, user_id: req.user.id,
    });
    sendCreated(res, message, 'Message sent');
  } catch (err) {
    next(err);
  }
}

module.exports = { listMessages, createMessage };
