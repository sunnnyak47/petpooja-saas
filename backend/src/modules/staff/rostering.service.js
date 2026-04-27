/**
 * @fileoverview Professional Rostering Service — Australian franchise shift management
 */
const prisma = require('../../config/database').getDbClient();

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
    return prisma.roster.update({
      where: { id: rosterId },
      data: { ...data, updated_at: new Date() },
      include: { assignments: true }
    });
  },

  async publishRoster(rosterId, outletId) {
    const roster = await prisma.roster.findFirst({ where: { id: rosterId, outlet_id: outletId } });
    if (!roster) throw new Error('Roster not found');
    if (roster.assignments?.length === 0) throw new Error('Cannot publish empty roster');
    return prisma.roster.update({
      where: { id: rosterId },
      data: { status: 'published', updated_at: new Date() }
    });
  },

  async deleteRoster(rosterId, outletId) {
    await prisma.rosterAssignment.deleteMany({ where: { roster_id: rosterId } });
    return prisma.roster.delete({ where: { id: rosterId } });
  },

  // ── Assignments ──────────────────────────────────────────────────────
  async addAssignment(rosterId, { staff_id, date, start_time, end_time, role_label, notes }) {
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

  async updateAssignment(assignmentId, data) {
    return prisma.rosterAssignment.update({
      where: { id: assignmentId },
      data,
      include: { staff: { select: { id: true, full_name: true, avatar_url: true } } }
    });
  },

  async deleteAssignment(assignmentId) {
    return prisma.rosterAssignment.delete({ where: { id: assignmentId } });
  },

  // ── Staff Availability ───────────────────────────────────────────────
  async setAvailability(staffId, { day_of_week, available, start_time, end_time, notes }) {
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
  async addCertification(outletId, staffId, data) {
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

  async updateCertification(certId, data) {
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
