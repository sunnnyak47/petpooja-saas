/**
 * @fileoverview Staff payroll — salary calculation from attendance + profile
 * settings, salary record listing, and payout marking. Extracted from
 * staff.service.js.
 * @module modules/staff/payroll.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError } = require('../../utils/errors');
const { notDeleted } = require('../../utils/prismaHelpers');

/**
 * Calculates salary for a staff member for a given month/year.
 * Uses attendance logs + StaffProfile salary settings.
 * Saves/updates a SalaryRecord.
 */
async function calculateSalary(userId, outletId, month, year) {
  const prisma = getDbClient();

  // Get staff profile
  const profile = await prisma.staffProfile.findFirst({
    where: notDeleted({ user_id: userId, outlet_id: outletId }),
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
    where: notDeleted({
      user_id: userId,
      outlet_id: outletId,
      clock_in: { gte: from, lte: to },
      clock_out: { not: null },
    }),
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

  // Upsert salary record
  const existing = await prisma.salaryRecord.findFirst({
    where: notDeleted({ user_id: userId, outlet_id: outletId, month, year }),
  });

  const existingBonus = existing ? Number(existing.bonus || 0) : 0;
  const netSalary = Math.round((basicSalary + overtimePay + existingBonus) * 100) / 100;

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
  const where = notDeleted({ outlet_id: outletId });
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
    where: notDeleted({ outlet_id: outletId }),
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
  calculateSalary,
  listSalaryRecords,
  markSalaryPaid,
  bulkCalculateSalary,
};
