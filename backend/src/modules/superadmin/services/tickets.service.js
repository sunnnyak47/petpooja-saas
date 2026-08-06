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

  /**
   * Serialize a read-modify-write over the single tickets JSON blob. The three
   * mutators (create/update/reply) previously did an unguarded load-mutate-save,
   * so two concurrent writers could each read the same array and the second
   * upsert would silently clobber the first (lost update). A per-transaction
   * Postgres advisory lock on a constant key forces these to run one at a time
   * cluster-wide; the lock auto-releases on commit/rollback.
   * @param {(tickets: object[]) => { tickets: object[], result: any }} mutate
   */
  async _mutateTickets(mutate) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4210001)`;
      let tickets = [];
      const cfg = await tx.systemConfig.findUnique({ where: { key: superadminService.TICKETS_KEY } });
      if (cfg?.value) { try { tickets = JSON.parse(cfg.value); } catch { tickets = []; } }
      const { tickets: next, result } = mutate(tickets);
      await tx.systemConfig.upsert({
        where: { key: superadminService.TICKETS_KEY },
        update: { value: JSON.stringify(next) },
        create: { key: superadminService.TICKETS_KEY, value: JSON.stringify(next) },
      });
      return result;
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
    // Serialized load-mutate-save so concurrent creates don't clobber each other.
    return superadminService._mutateTickets((tickets) => {
      const ticket = {
        id: `TKT-${Date.now().toString(36).toUpperCase()}`,
        chain_id, chain_name, subject, body, priority, email,
        status: 'OPEN',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        resolved_at: null,
        replies: [],
      };
      return { tickets: [ticket, ...tickets], result: ticket };
    });
  },

  async updateTicket(id, { status, priority, notes }) {
    // Serialized load-mutate-save so a concurrent create/reply isn't lost.
    return superadminService._mutateTickets((tickets) => {
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
      return { tickets, result: tickets[idx] };
    });
  },

  async replyToTicket(id, { from, body }) {
    // Serialized load-mutate-save so a concurrent create/update isn't lost.
    return superadminService._mutateTickets((tickets) => {
      const idx = tickets.findIndex(t => t.id === id);
      if (idx === -1) throw new NotFoundError('Ticket not found');
      const reply = { id: `RPL-${Date.now()}`, from, body, created_at: new Date().toISOString() };
      tickets[idx].replies = [...(tickets[idx].replies || []), reply];
      tickets[idx].updated_at = new Date().toISOString();
      if (from === 'admin' && tickets[idx].status === 'OPEN') tickets[idx].status = 'IN_PROGRESS';
      return { tickets, result: tickets[idx] };
    });
  },
});

module.exports = superadminService;
