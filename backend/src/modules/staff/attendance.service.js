/**
 * @fileoverview Staff attendance — clock in/out, OTP-based clocking, shifts,
 * and shift/attendance reports. Extracted from staff.service.js.
 * @module modules/staff/attendance.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { BadRequestError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');
const { notDeleted } = require('../../utils/prismaHelpers');

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
      where: notDeleted({ user_id: userId, outlet_id: outletId, clock_out: null }),
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
      where: notDeleted({ user_id: userId, outlet_id: outletId, clock_out: null }),
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
    const where = notDeleted({ outlet_id: outletId });
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
      where: notDeleted({ outlet_id: outletId }),
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
    where: notDeleted({
      outlet_id: outletId,
      clock_in: { gte: from, lte: to },
      ...(query.user_id ? { user_id: query.user_id } : {}),
    }),
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

module.exports = {
  clockIn,
  clockOut,
  getAttendance,
  listShifts,
  createShift,
  generateClockOTP,
  verifyClockOTP,
  getShiftReport,
};
