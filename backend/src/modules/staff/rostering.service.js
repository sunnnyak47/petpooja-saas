/**
 * @fileoverview Professional Rostering Service — Australian franchise shift management
 */
const prisma = require('../../config/database').getDbClient();
const { NotFoundError, BadRequestError } = require('../../utils/errors');
// Reused for cross-tenant (head-office) ownership checks on write paths. Safe to
// require here — staff.service does not depend on this module, so there is no cycle.
const { assertOutletInTenant } = require('./staff.service');

const rosteringService = {
  // ── Roster CRUD ──────────────────────────────────────────────────────
  async createRoster(outletId, { name, start_date, end_date, notes }, createdBy) {
    return prisma.roster.create({
      data: {
        outlet_id: outletId,
        name,
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        notes: notes || null,
        created_by: createdBy,
        status: 'draft',
      },
      include: { assignments: { include: { staff: { select: { id: true, full_name: true, avatar_url: true } } } } }
    });
  },

  async listRosters(outletId, { from, to, status }) {
    const where = { outlet_id: outletId };
    if (from) where.start_date = { gte: new Date(from) };
    if (to) where.end_date = { lte: new Date(to) };
    if (status) where.status = status;
    return prisma.roster.findMany({
      where,
      include: {
        creator: { select: { id: true, full_name: true } },
        assignments: {
          include: { staff: { select: { id: true, full_name: true, avatar_url: true } } }
        }
      },
      orderBy: { start_date: 'desc' }
    });
  },

  async getRosterById(rosterId, outletId) {
    return prisma.roster.findFirst({
      where: { id: rosterId, outlet_id: outletId },
      include: {
        creator: { select: { id: true, full_name: true } },
        assignments: {
          include: { staff: { select: { id: true, full_name: true, avatar_url: true } } },
          orderBy: [{ date: 'asc' }, { start_time: 'asc' }]
        }
      }
    });
  },

  async updateRoster(rosterId, outletId, data) {
    // Scope the mutation by outlet_id (like publishRoster/getRosterById) and 404 on
    // miss — keying solely on id let any tenant edit another outlet's roster (IDOR).
    const r = await prisma.roster.updateMany({
      where: { id: rosterId, outlet_id: outletId },
      data: { ...data, updated_at: new Date() }
    });
    if (r.count === 0) throw new NotFoundError('Roster not found');
    return this.getRosterById(rosterId, outletId);
  },

  async publishRoster(rosterId, outletId) {
    const roster = await prisma.roster.findFirst({
      where: { id: rosterId, outlet_id: outletId },
      include: { _count: { select: { assignments: true } } },
    });
    if (!roster) throw new NotFoundError('Roster not found');
    if (roster._count.assignments === 0) throw new BadRequestError('Cannot publish empty roster');
    return prisma.roster.update({
      where: { id: rosterId },
      data: { status: 'published', updated_at: new Date() }
    });
  },

  async deleteRoster(rosterId, outletId) {
    // Verify the roster belongs to this outlet before deleting — keying solely on id
    // let any tenant delete another outlet's roster (IDOR).
    const roster = await prisma.roster.findFirst({ where: { id: rosterId, outlet_id: outletId } });
    if (!roster) throw new NotFoundError('Roster not found');
    await prisma.rosterAssignment.deleteMany({ where: { roster_id: rosterId } });
    return prisma.roster.delete({ where: { id: rosterId } });
  },

  // ── Assignments ──────────────────────────────────────────────────────
  async addAssignment(rosterId, { staff_id, date, start_time, end_time, role_label, notes }, user) {
    // Tenant guard: resolve the roster's owning outlet and assert it belongs to the
    // caller's tenant — blocks cross-tenant assignment writes by raw roster id (IDOR).
    const roster = await prisma.roster.findFirst({ where: { id: rosterId }, select: { outlet_id: true } });
    if (!roster) throw new NotFoundError('Roster not found');
    await assertOutletInTenant(roster.outlet_id, user);
    return prisma.rosterAssignment.create({
      data: {
        roster_id: rosterId,
        staff_id,
        date: new Date(date),
        start_time,
        end_time,
        role_label: role_label || null,
        notes: notes || null,
        status: 'assigned',
      },
      include: { staff: { select: { id: true, full_name: true, avatar_url: true } } }
    });
  },

  async updateAssignment(assignmentId, data, user) {
    // Tenant guard: resolve the parent roster's outlet and assert tenant ownership
    // before mutating — blocks cross-tenant edits of assignments by raw id (IDOR).
    const existing = await prisma.rosterAssignment.findFirst({
      where: { id: assignmentId },
      select: { roster: { select: { outlet_id: true } } },
    });
    if (!existing) throw new NotFoundError('Assignment not found');
    await assertOutletInTenant(existing.roster.outlet_id, user);
    return prisma.rosterAssignment.update({
      where: { id: assignmentId },
      data,
      include: { staff: { select: { id: true, full_name: true, avatar_url: true } } }
    });
  },

  async deleteAssignment(assignmentId, user) {
    // Tenant guard: same ownership check before deleting an assignment by raw id.
    const existing = await prisma.rosterAssignment.findFirst({
      where: { id: assignmentId },
      select: { roster: { select: { outlet_id: true } } },
    });
    if (!existing) throw new NotFoundError('Assignment not found');
    await assertOutletInTenant(existing.roster.outlet_id, user);
    return prisma.rosterAssignment.delete({ where: { id: assignmentId } });
  },

  // ── Staff Availability ───────────────────────────────────────────────
  async setAvailability(staffId, { day_of_week, available, start_time, end_time, notes }, user) {
    // Tenant guard: staffAvailability has no outlet column, so resolve the staff's
    // outlet via their userRole and assert tenant ownership — blocks writing another
    // tenant's availability by raw staff id (IDOR).
    const roleRow = await prisma.userRole.findFirst({
      where: { user_id: staffId, is_deleted: false },
      select: { outlet_id: true },
    });
    if (!roleRow) throw new NotFoundError('Staff not found');
    await assertOutletInTenant(roleRow.outlet_id, user);
    return prisma.staffAvailability.upsert({
      where: { staff_id_day_of_week: { staff_id: staffId, day_of_week } },
      create: { staff_id: staffId, day_of_week, available, start_time, end_time, notes },
      update: { available, start_time, end_time, notes }
    });
  },

  async getAvailability(staffId) {
    return prisma.staffAvailability.findMany({
      where: { staff_id: staffId },
      orderBy: { day_of_week: 'asc' }
    });
  },

  async getAvailableStaff(outletId, date) {
    const dayOfWeek = new Date(date).getDay();
    // Get all active staff for this outlet
    const staffRoles = await prisma.userRole.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      include: {
        user: {
          select: { id: true, full_name: true, avatar_url: true, is_active: true },
        }
      }
    });
    const staffIds = [...new Set(staffRoles.filter(r => r.user.is_active).map(r => r.user_id))];

    // Get availability for that day
    const avails = await prisma.staffAvailability.findMany({
      where: { staff_id: { in: staffIds }, day_of_week: dayOfWeek }
    });
    const availMap = Object.fromEntries(avails.map(a => [a.staff_id, a]));

    return staffIds.map(sid => {
      const user = staffRoles.find(r => r.user_id === sid)?.user;
      const avail = availMap[sid];
      return {
        ...user,
        available: avail ? avail.available : true, // default available if no record
        preferred_start: avail?.start_time,
        preferred_end: avail?.end_time,
      };
    }).filter(s => s.available);
  },

  // ── Certifications ───────────────────────────────────────────────────
  async addCertification(outletId, staffId, data, user) {
    // Tenant guard: assert the target outlet belongs to the caller's tenant before
    // creating a cert there — blocks writing certs into a foreign outlet (IDOR).
    await assertOutletInTenant(outletId, user);
    return prisma.staffCertification.create({
      data: {
        outlet_id: outletId,
        staff_id: staffId,
        cert_type: data.cert_type,
        provider: data.provider || null,
        issue_date: new Date(data.issue_date),
        expiry_date: new Date(data.expiry_date),
        cert_number: data.cert_number || null,
      }
    });
  },

  async getCertifications(staffId) {
    return prisma.staffCertification.findMany({
      where: { staff_id: staffId, is_active: true },
      orderBy: { expiry_date: 'asc' }
    });
  },

  async getExpiringCertifications(outletId, withinDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    return prisma.staffCertification.findMany({
      where: {
        outlet_id: outletId,
        is_active: true,
        expiry_date: { lte: cutoff }
      },
      include: {
        staff: { select: { id: true, full_name: true, avatar_url: true } }
      },
      orderBy: { expiry_date: 'asc' }
    });
  },

  async updateCertification(certId, data, user) {
    // Tenant guard: resolve the cert's outlet and assert tenant ownership before
    // mutating — blocks editing another tenant's certification by raw id (IDOR).
    const cert = await prisma.staffCertification.findFirst({
      where: { id: certId },
      select: { outlet_id: true },
    });
    if (!cert) throw new NotFoundError('Certification not found');
    await assertOutletInTenant(cert.outlet_id, user);
    return prisma.staffCertification.update({ where: { id: certId }, data });
  },

  async getAllOutletCertifications(outletId) {
    return prisma.staffCertification.findMany({
      where: { outlet_id: outletId, is_active: true },
      include: {
        staff: { select: { id: true, full_name: true, avatar_url: true } }
      },
      orderBy: { expiry_date: 'asc' }
    });
  }
};

module.exports = rosteringService;
