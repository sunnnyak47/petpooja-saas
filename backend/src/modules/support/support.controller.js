/**
 * @fileoverview OWNER-side support tickets (SA-006). Restaurant owners can raise
 * and reply to tickets scoped to their own head office; the tickets are stored in
 * the same SystemConfig-backed store the super-admin Support inbox reads, so they
 * surface there automatically (no super-admin change needed).
 * @module modules/support/support.controller
 */
const superadminService = require('../superadmin/superadmin.service');
const { getDbClient } = require('../../config/database');
const { sendSuccess } = require('../../utils/response');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../utils/errors');

const supportController = {
  /** GET /api/support/tickets — the caller's own head-office tickets. */
  async listMyTickets(req, res, next) {
    try {
      const hoId = req.user.head_office_id;
      if (!hoId) return sendSuccess(res, [], 'No head office is associated with this account');
      const all = await superadminService.getTickets({});
      const mine = all.filter((t) => t.chain_id === hoId);
      sendSuccess(res, mine, 'Your support tickets');
    } catch (err) { next(err); }
  },

  /** POST /api/support/tickets — raise a ticket for the caller's head office. */
  async createMyTicket(req, res, next) {
    try {
      const hoId = req.user.head_office_id;
      if (!hoId) throw new BadRequestError('No head office is associated with your account.');
      const prisma = getDbClient();
      const ho = await prisma.headOffice.findUnique({ where: { id: hoId }, select: { name: true } });
      const ticket = await superadminService.createTicket({
        chain_id: hoId,
        chain_name: ho?.name || 'Unknown',
        subject: req.body.subject,
        body: req.body.body,
        priority: req.body.priority || 'MEDIUM',
        email: req.user.email,
      });
      sendSuccess(res, ticket, 'Support ticket raised');
    } catch (err) { next(err); }
  },

  /** POST /api/support/tickets/:id/reply — reply to one of the caller's tickets. */
  async replyMyTicket(req, res, next) {
    try {
      const hoId = req.user.head_office_id;
      const all = await superadminService.getTickets({});
      const ticket = all.find((t) => t.id === req.params.id);
      if (!ticket) throw new NotFoundError('Ticket not found');
      if (ticket.chain_id !== hoId) throw new ForbiddenError('This ticket does not belong to your account.');
      const updated = await superadminService.replyToTicket(req.params.id, { from: 'owner', body: req.body.body });
      sendSuccess(res, updated, 'Reply added');
    } catch (err) { next(err); }
  },
};

module.exports = supportController;
