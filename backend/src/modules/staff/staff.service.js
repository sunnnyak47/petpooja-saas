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

// ─────────────────────────────────────────────────────────────────
// OTP-BASED CLOCK IN/OUT
// ─────────────────────────────────────────────────────────────────

/**
 * Generates a 6-digit OTP for a staff member to clock in or out.
 * OTP expires in 5 minutes.
 */
async function generateClockOTP(userId, outletId, action) {
  const prisma = getDbClient();
  if (!['clock_in', 'clock_out'].includes(action)) throw new BadRequestError('Invalid action');

  // Invalidate old OTPs
  await prisma.attendanceOTP.updateMany({
    where: { user_id: userId, outlet_id: outletId, action, used: false },
    data: { used: true },
  });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  await prisma.attendanceOTP.create({
    data: { user_id: userId, outlet_id: outletId, otp, action, expires_at },
  });

  logger.info('Clock OTP generated', { userId, action });
  return { otp, expires_at, action };
}

/**
 * Verifies an OTP and performs clock-in or clock-out.
 */
async function verifyClockOTP(userId, outletId, otp, action) {
  const prisma = getDbClient();

  const record = await prisma.attendanceOTP.findFirst({
    where: { user_id: userId, outlet_id: outletId, otp, action, used: false },
  });

  if (!record) throw new BadRequestError('Invalid OTP');
  if (new Date() > record.expires_at) throw new BadRequestError('OTP expired. Please generate a new one.');

  // Mark OTP used
  await prisma.attendanceOTP.update({ where: { id: record.id }, data: { used: true } });

  // Perform the action
  if (action === 'clock_in') return clockIn(userId, outletId, {});
  return clockOut(userId, outletId, {});
}

// ─────────────────────────────────────────────────────────────────
// SHIFT REPORTS
// ─────────────────────────────────────────────────────────────────

/**
 * Generates a shift/attendance report for a date range.
 * Groups by staff member, calculates totals.
 */
async function getShiftReport(outletId, query = {}) {
  const prisma = getDbClient();
  const from = query.from ? new Date(query.from) : new Date(new Date().setDate(1)); // Start of month
  const to = query.to ? new Date(query.to) : new Date();
  to.setHours(23, 59, 59, 999);

  const logs = await prisma.attendanceLog.findMany({
    where: {
      outlet_id: outletId,
      is_deleted: false,
      clock_in: { gte: from, lte: to },
      ...(query.user_id ? { user_id: query.user_id } : {}),
    },
    include: {
      user: { select: { id: true, full_name: true, phone: true } },
      shift: { select: { name: true, start_time: true, end_time: true } },
    },
    orderBy: { clock_in: 'asc' },
  });

  // Group by user
  const byUser = {};
  for (const log of logs) {
    const uid = log.user_id;
    if (!byUser[uid]) {
      byUser[uid] = {
        user_id: uid,
        name: log.user?.full_name || 'Unknown',
        phone: log.user?.phone || '',
        days_present: 0,
        total_hours: 0,
        overtime_hours: 0,
        late_count: 0,
        logs: [],
      };
    }
    if (log.clock_out) byUser[uid].days_present += 1;
    byUser[uid].total_hours += Number(log.hours_worked || 0);
    byUser[uid].overtime_hours += Number(log.overtime_hours || 0);
    byUser[uid].logs.push({
      date: log.clock_in.toISOString().split('T')[0],
      clock_in: log.clock_in,
      clock_out: log.clock_out,
      hours: Number(log.hours_worked || 0),
      overtime: Number(log.overtime_hours || 0),
      shift: log.shift?.name || '—',
      is_overtime: log.is_overtime,
    });
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    staff: Object.values(byUser).map((s) => ({
      ...s,
      total_hours: Math.round(s.total_hours * 100) / 100,
      overtime_hours: Math.round(s.overtime_hours * 100) / 100,
    })),
    summary: {
      total_staff: Object.keys(byUser).length,
      total_logs: logs.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// SALARY CALCULATION
// ─────────────────────────────────────────────────────────────────

/**
 * Calculates salary for a staff member for a given month/year.
 * Uses attendance logs + StaffProfile salary settings.
 * Saves/updates a SalaryRecord.
 */
async function calculateSalary(userId, outletId, month, year) {
  const prisma = getDbClient();

  // Get staff profile
  const profile = await prisma.staffProfile.findFirst({
    where: { user_id: userId, outlet_id: outletId, is_deleted: false },
    include: { user: { select: { full_name: true } } },
  });
  if (!profile) throw new NotFoundError('Staff profile not found');

  // Date range for the month
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59); // Last day of month

  // Working days in month (Mon–Sat = 6 days/week, approximate)
  const daysInMonth = new Date(year, month, 0).getDate();
  const workingDays = Math.round(daysInMonth * (26 / 31)); // ~26 working days/month

  const logs = await prisma.attendanceLog.findMany({
    where: {
      user_id: userId,
      outlet_id: outletId,
      is_deleted: false,
      clock_in: { gte: from, lte: to },
      clock_out: { not: null },
    },
  });

  const presentDays = logs.length;
  const absentDays = Math.max(0, workingDays - presentDays);
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked || 0), 0);
  const overtimeHours = logs.reduce((s, l) => s + Number(l.overtime_hours || 0), 0);

  // Salary calculation
  const monthlySalary = Number(profile.monthly_salary || 0);
  const hourlyRate = Number(profile.hourly_rate || 0);

  let basicSalary = 0;
  let overtimePay = 0;

  if (monthlySalary > 0) {
    // Pro-rate by attendance
    basicSalary = workingDays > 0 ? (monthlySalary / workingDays) * presentDays : 0;
    // Overtime: 1.5x hourly rate (derived from monthly / 26 days / 8 hrs)
    const derivedHourly = monthlySalary / workingDays / 8;
    overtimePay = overtimeHours * derivedHourly * 1.5;
  } else if (hourlyRate > 0) {
    basicSalary = totalHours * hourlyRate;
    overtimePay = overtimeHours * hourlyRate * 0.5; // Extra 0.5x for OT
  }

  const netSalary = Math.round((basicSalary + overtimePay) * 100) / 100;

  // Upsert salary record
  const existing = await prisma.salaryRecord.findFirst({
    where: { user_id: userId, outlet_id: outletId, month, year, is_deleted: false },
  });

  const data = {
    working_days: workingDays,
    present_days: presentDays,
    absent_days: absentDays,
    total_hours: Math.round(totalHours * 100) / 100,
    overtime_hours: Math.round(overtimeHours * 100) / 100,
    basic_salary: Math.round(basicSalary * 100) / 100,
    overtime_pay: Math.round(overtimePay * 100) / 100,
    deductions: 0,
    bonus: existing ? Number(existing.bonus) : 0,
    net_salary: netSalary,
    status: existing?.status === 'paid' ? 'paid' : 'draft',
  };

  let record;
  if (existing) {
    record = await prisma.salaryRecord.update({ where: { id: existing.id }, data });
  } else {
    record = await prisma.salaryRecord.create({
      data: { user_id: userId, outlet_id: outletId, month, year, ...data },
    });
  }

  return { ...record, staff_name: profile.user?.full_name, designation: profile.designation };
}

/**
 * Lists salary records for an outlet.
 */
async function listSalaryRecords(outletId, query = {}) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId, is_deleted: false };
  if (query.month) where.month = parseInt(query.month);
  if (query.year) where.year = parseInt(query.year);
  if (query.status) where.status = query.status;
  if (query.user_id) where.user_id = query.user_id;

  const records = await prisma.salaryRecord.findMany({
    where,
    include: {
      user: { select: { full_name: true, phone: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { created_at: 'desc' }],
  });

  return records.map((r) => ({
    ...r,
    staff_name: r.user?.full_name,
    phone: r.user?.phone,
  }));
}

/**
 * Marks a salary record as paid.
 */
async function markSalaryPaid(id, bonus = 0) {
  const prisma = getDbClient();
  const record = await prisma.salaryRecord.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('Salary record not found');
  const netSalary = Number(record.basic_salary) + Number(record.overtime_pay) + Number(bonus) - Number(record.deductions);
  return prisma.salaryRecord.update({
    where: { id },
    data: { status: 'paid', paid_at: new Date(), bonus: Number(bonus), net_salary: netSalary },
    include: { user: { select: { full_name: true } } },
  });
}

/**
 * Bulk calculate salary for all staff in an outlet for a month/year.
 */
async function bulkCalculateSalary(outletId, month, year) {
  const prisma = getDbClient();
  const profiles = await prisma.staffProfile.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    select: { user_id: true },
  });

  const results = [];
  for (const p of profiles) {
    try {
      const rec = await calculateSalary(p.user_id, outletId, month, year);
      results.push(rec);
    } catch (e) {
      logger.warn('Salary calc failed for user', { user_id: p.user_id, error: e.message });
    }
  }
  return results;
}

module.exports = {
  listStaff, upsertStaffProfile, verifyManagerPIN, createStaffWithUser,
  clockIn, clockOut, getAttendance, getStaffPerformance,
  listShifts, createShift,
  generateClockOTP, verifyClockOTP,
  getShiftReport,
  calculateSalary, listSalaryRecords, markSalaryPaid, bulkCalculateSalary,
};
