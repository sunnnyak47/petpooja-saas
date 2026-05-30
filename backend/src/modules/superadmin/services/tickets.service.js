/**
 * @fileoverview SuperAdmin — support tickets (stored as a JSON array in
 * SystemConfig, preserved as-is). Augments the shared superadminService
 * singleton.
 * @module modules/superadmin/services/tickets.service
 */

const {
  superadminService, prisma, NotFoundError,
} = require('./_shared');

Object.assign(superadminService, {
  // SUPPORT TICKETS
  TICKETS_KEY: 'support_tickets',

  async _loadTickets() {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: superadminService.TICKETS_KEY } });
    if (!cfg) return [];
    try { return JSON.parse(cfg.value); } catch { return []; }
  },

  async _saveTickets(tickets) {
    await prisma.systemConfig.upsert({
      where: { key: superadminService.TICKETS_KEY },
      update: { value: JSON.stringify(tickets) },
      create: { key: superadminService.TICKETS_KEY, value: JSON.stringify(tickets) },
    });
  },

  async getTickets({ status, priority, search } = {}) {
    let tickets = await superadminService._loadTickets();
    if (status && status !== 'ALL') tickets = tickets.filter(t => t.status === status);
    if (priority && priority !== 'ALL') tickets = tickets.filter(t => t.priority === priority);
    if (search) {
      const q = search.toLowerCase();
      tickets = tickets.filter(t => t.chain_name?.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q));
    }
    return tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async createTicket({ chain_id, chain_name, subject, body, priority = 'MEDIUM', email }) {
    const tickets = await superadminService._loadTickets();
    const ticket = {
      id: `TKT-${Date.now().toString(36).toUpperCase()}`,
      chain_id, chain_name, subject, body, priority, email,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null,
      replies: [],
    };
    await superadminService._saveTickets([ticket, ...tickets]);
    return ticket;
  },

  async updateTicket(id, { status, priority, notes }) {
    const tickets = await superadminService._loadTickets();
    const idx = tickets.findIndex(t => t.id === id);
    if (idx === -1) throw new NotFoundError('Ticket not found');
    tickets[idx] = {
      ...tickets[idx],
      ...(status && { status }),
      ...(priority && { priority }),
      ...(notes !== undefined && { internal_notes: notes }),
      updated_at: new Date().toISOString(),
      ...(status === 'RESOLVED' && !tickets[idx].resolved_at ? { resolved_at: new Date().toISOString() } : {}),
    };
    await superadminService._saveTickets(tickets);
    return tickets[idx];
  },

  async replyToTicket(id, { from, body }) {
    const tickets = await superadminService._loadTickets();
    const idx = tickets.findIndex(t => t.id === id);
    if (idx === -1) throw new NotFoundError('Ticket not found');
    const reply = { id: `RPL-${Date.now()}`, from, body, created_at: new Date().toISOString() };
    tickets[idx].replies = [...(tickets[idx].replies || []), reply];
    tickets[idx].updated_at = new Date().toISOString();
    if (from === 'admin' && tickets[idx].status === 'OPEN') tickets[idx].status = 'IN_PROGRESS';
    await superadminService._saveTickets(tickets);
    return tickets[idx];
  },
});

module.exports = superadminService;
