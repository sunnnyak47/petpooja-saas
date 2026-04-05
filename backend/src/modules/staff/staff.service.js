/**
 * @fileoverview Staff service — profiles, shifts, attendance, permissions.
 * @module modules/staff/staff.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');

/**
 * Lists staff members for an outlet with profiles and roles.
 * @param {string} outletId - Outlet UUID
 * @param {object} [query] - Filters (department, search, page, limit)
 * @returns {Promise<{staff: object[], total: number, page: number, limit: number}>}
 */
async function listStaff(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset, sort, order } = parsePagination(query);
    const where = { outlet_id: outletId, is_deleted: false };
    if (query.department) where.department = query.department;
    if (query.search) {
      where.user = {
        OR: [
          { full_name: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      };
    }

    const [staff, total] = await Promise.all([
      prisma.staffProfile.findMany({
        where, skip: offset, take: limit,
        orderBy: { created_at: sort === 'created_at' ? order : 'desc' },
        include: {
          user: {
            select: {
              id: true, full_name: true, email: true, phone: true,
              is_active: true, last_login_at: true,
              user_roles: {
                where: { is_deleted: false },
                include: { role: { select: { name: true, display_name: true } } },
              },
            },
          },
        },
      }),
      prisma.staffProfile.count({ where }),
    ]);

    return { staff, total, page, limit };
  } catch (error) {
    logger.error('List staff failed', { error: error.message });
    throw error;
  }
}

/**
 * Creates or updates a staff profile for a user at an outlet.
 * @param {string} userId - User UUID
 * @param {string} outletId - Outlet UUID
 * @param {object} data - Staff profile data
 * @returns {Promise<object>}
 */
async function upsertStaffProfile(userId, outletId, data) {
  const prisma = getDbClient();
  try {
    const profile = await prisma.staffProfile.upsert({
      where: { user_id_outlet_id: { user_id: userId, outlet_id: outletId } },
      create: {
        user_id: userId, outlet_id: outletId,
        employee_code: data.employee_code, department: data.department,
        designation: data.designation, manager_pin: data.manager_pin,
        hourly_rate: data.hourly_rate, monthly_salary: data.monthly_salary,
        emergency_contact: data.emergency_contact, blood_group: data.blood_group,
        join_date: data.join_date ? new Date(data.join_date) : null,
      },
      update: {
        employee_code: data.employee_code,
        department: data.department,
        designation: data.designation,
        manager_pin: data.manager_pin,
        hourly_rate: data.hourly_rate,
        monthly_salary: data.monthly_salary,
        emergency_contact: data.emergency_contact,
        blood_group: data.blood_group,
        join_date: data.join_date ? new Date(data.join_date) : null,
        is_deleted: data.is_deleted
      },
      include: {
        user: { select: { full_name: true, phone: true, email: true } },
      },
    });
    return profile;
  } catch (error) {
    logger.error('Upsert staff profile failed', { error: error.message });
    throw error;
  }
}

/**
 * Verifies a manager PIN for administrative actions.
 * @param {string} outletId - Outlet UUID
 * @param {string} pin - 4-6 digit PIN
 * @returns {Promise<object|null>} Staff profile if valid
 */
async function verifyManagerPIN(outletId, pin) {
  const prisma = getDbClient();
  try {
    const staff = await prisma.staffProfile.findFirst({
      where: { outlet_id: outletId, manager_pin: pin, is_deleted: false },
      include: { user: { select: { id: true, full_name: true } } }
    });
    return staff;
  } catch (error) { throw error; }
}

/**
 * Complex: Creates a new User AND their Staff Profile in one go.
 */
async function createStaffWithUser(outletId, data) {
  const prisma = getDbClient();
  try {
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(data.password || 'Staff@123', 12);
    
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          full_name: data.full_name,
          email: data.email,
          phone: data.phone,
          password_hash: passwordHash,
        }
      });
      
      const profile = await tx.staffProfile.create({
        data: {
          user_id: user.id,
          outlet_id: outletId,
          employee_code: data.employee_code,
          department: data.department,
          designation: data.designation,
          manager_pin: data.manager_pin,
          join_date: data.join_date ? new Date(data.join_date) : new Date(),
        }
      });
      
      // Assign Role
      const role = await tx.role.findFirst({ where: { name: data.role || 'staff' } });
      if (role) {
        await tx.userRole.create({
          data: { user_id: user.id, role_id: role.id, outlet_id: outletId, is_primary: true }
        });
      }
      
      return { ...profile, user };
    });
  } catch (error) { throw error; }
}

/**
 * Records clock-in for a staff member.
 * @param {string} userId - User UUID
 * @param {string} outletId - Outlet UUID
 * @param {object} [data] - Optional (shift_id, latitude, longitude)
 * @returns {Promise<object>} Attendance record
 */
async function clockIn(userId, outletId, data = {}) {
  const prisma = getDbClient();
  try {
    const existingOpen = await prisma.attendanceLog.findFirst({
      where: { user_id: userId, outlet_id: outletId, clock_out: null, is_deleted: false },
    });
    if (existingOpen) {
      throw new BadRequestError('Already clocked in. Please clock out first.');
    }

    const attendance = await prisma.attendanceLog.create({
      data: {
        user_id: userId, outlet_id: outletId,
        shift_id: data.shift_id || null,
        clock_in: new Date(),
        clock_in_lat: data.latitude || null,
        clock_in_lng: data.longitude || null,
      },
    });

    logger.info('Staff clocked in', { userId, outletId });
    return attendance;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Records clock-out and calculates hours worked.
 * @param {string} userId - User UUID
 * @param {string} outletId - Outlet UUID
 * @param {object} [data] - Optional (latitude, longitude, notes)
 * @returns {Promise<object>} Updated attendance record
 */
async function clockOut(userId, outletId, data = {}) {
  const prisma = getDbClient();
  try {
    const attendance = await prisma.attendanceLog.findFirst({
      where: { user_id: userId, outlet_id: outletId, clock_out: null, is_deleted: false },
      orderBy: { clock_in: 'desc' },
    });
    if (!attendance) {
      throw new BadRequestError('No active clock-in found. Please clock in first.');
    }

    const clockOut = new Date();
    const hoursWorked = (clockOut - new Date(attendance.clock_in)) / 3600000;
    const standardHours = 8;
    const isOvertime = hoursWorked > standardHours;
    const overtimeHours = isOvertime ? hoursWorked - standardHours : 0;

    const updated = await prisma.attendanceLog.update({
      where: { id: attendance.id },
      data: {
        clock_out: clockOut,
        clock_out_lat: data.latitude || null,
        clock_out_lng: data.longitude || null,
        hours_worked: Math.round(hoursWorked * 100) / 100,
        is_overtime: isOvertime,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
        notes: data.notes || null,
      },
    });

    logger.info('Staff clocked out', { userId, hoursWorked: updated.hours_worked });
    return updated;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw error;
  }
}

/**
 * Gets attendance records for a staff member over a date range.
 * @param {string} outletId - Outlet UUID
 * @param {object} query - Filters (user_id, from, to, page, limit)
 * @returns {Promise<{records: object[], total: number, summary: object}>}
 */
async function getAttendance(outletId, query = {}) {
  const prisma = getDbClient();
  try {
    const { page, limit, offset } = parsePagination(query);
    const where = { outlet_id: outletId, is_deleted: false };
    if (query.user_id) where.user_id = query.user_id;
    if (query.from && query.to) {
      where.clock_in = { gte: new Date(query.from), lte: new Date(query.to) };
    }

    const [records, total] = await Promise.all([
      prisma.attendanceLog.findMany({
        where, skip: offset, take: limit,
        orderBy: { clock_in: 'desc' },
        include: {
          user: { select: { full_name: true, phone: true } },
          shift: { select: { name: true } },
        },
      }),
      prisma.attendanceLog.count({ where }),
    ]);

    const totalHours = records.reduce((sum, r) => sum + (Number(r.hours_worked) || 0), 0);
    const totalOT = records.reduce((sum, r) => sum + (Number(r.overtime_hours) || 0), 0);

    return {
      records, total, page, limit,
      summary: {
        total_days: records.filter((r) => r.clock_out).length,
        total_hours: Math.round(totalHours * 100) / 100,
        overtime_hours: Math.round(totalOT * 100) / 100,
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Lists available shifts for an outlet.
 * @param {string} outletId - Outlet UUID
 * @returns {Promise<object[]>}
 */
async function listShifts(outletId) {
  const prisma = getDbClient();
  try {
    return await prisma.staffShift.findMany({
      where: { outlet_id: outletId, is_deleted: false },
      orderBy: { start_time: 'asc' },
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Creates a shift for an outlet.
 * @param {object} data - {outlet_id, name, start_time, end_time}
 * @returns {Promise<object>}
 */
async function createShift(data) {
  const prisma = getDbClient();
  try {
    return await prisma.staffShift.create({ data });
  } catch (error) {
    throw error;
  }
}

/**
 * Gets staff performance metrics based on orders handled.
 */
async function getStaffPerformance(outletId, from, to) {
  const prisma = getDbClient();
  try {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const result = await prisma.order.groupBy({
      by: ['staff_id'],
      where: {
        outlet_id: outletId,
        is_deleted: false,
        created_at: { gte: fromDate, lte: toDate },
        status: 'paid'
      },
      _count: { id: true },
      _sum: { grand_total: true, discount_amount: true }
    });

    const staffIds = result.map(n => n.staff_id).filter(Boolean);
    const staffMembers = await prisma.user.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, full_name: true }
    });

    return result.map(r => {
      const user = staffMembers.find(u => u.id === r.staff_id);
      return {
        name: user?.full_name || 'POS / Self Service',
        orders: r._count.id,
        revenue: Number(r._sum.grand_total || 0),
        discounts: Number(r._sum.discount_amount || 0),
        avg_order: r._count.id > 0 ? Number(r._sum.grand_total || 0) / r._count.id : 0
      };
    }).sort((a,b)=>b.revenue - a.revenue);
  } catch (error) { throw error; }
}

module.exports = {
  listStaff, upsertStaffProfile, verifyManagerPIN, createStaffWithUser,
  clockIn, clockOut, getAttendance, getStaffPerformance,
  listShifts, createShift,
};
