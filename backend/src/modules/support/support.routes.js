/**
 * @fileoverview OWNER-side support routes (SA-006). Mounted at /api/support.
 * Normal (owner/staff) auth — tickets are tenant-scoped to req.user.head_office_id
 * inside the controller.
 * @module modules/support/support.routes
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const supportController = require('./support.controller');
const { createTicketSchema, replyTicketSchema } = require('./support.validation');

router.use(authenticate);

router.get('/tickets', supportController.listMyTickets);
router.post('/tickets', validate(createTicketSchema), supportController.createMyTicket);
router.post('/tickets/:id/reply', validate(replyTicketSchema), supportController.replyMyTicket);

module.exports = router;
