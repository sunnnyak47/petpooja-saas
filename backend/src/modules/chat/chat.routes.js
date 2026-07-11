/**
 * @fileoverview Staff Chat (internal messaging) routes.
 * Mounted at /api/chat by app.js, so paths resolve to:
 *   GET  /api/chat/messages?outlet_id=&limit=
 *   POST /api/chat/messages { outlet_id, body }
 *
 * @module modules/chat/chat.routes
 */

const express = require('express');
const router = express.Router();

const { authenticate } = require('../../middleware/auth.middleware');
const { hasPermission, enforceOutletScope } = require('../../middleware/rbac.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { listMessagesSchema, createMessageSchema } = require('./chat.validation');
const controller = require('./chat.controller');

// Broad, shared permission also used by neighbour modules (expenses GET). Owners
// and managers bypass permission checks in rbac.middleware.
const CHAT_ACCESS = hasPermission('VIEW_REPORTS');

/** GET /api/chat/messages — list outlet messages (oldest-first). */
router.get(
  '/messages',
  authenticate,
  CHAT_ACCESS,
  enforceOutletScope,
  validate(listMessagesSchema, 'query'),
  controller.listMessages,
);

/** POST /api/chat/messages — send a message to the outlet. */
router.post(
  '/messages',
  authenticate,
  CHAT_ACCESS,
  enforceOutletScope,
  validate(createMessageSchema, 'body'),
  controller.createMessage,
);

module.exports = router;
