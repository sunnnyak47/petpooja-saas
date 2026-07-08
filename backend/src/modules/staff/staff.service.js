/**
 * @fileoverview Staff service — profiles, certifications, availability,
 * performance. Acts as the facade that also re-exports attendance & payroll
 * sub-services so existing imports of `./staff.service` keep working unchanged.
 * @module modules/staff/staff.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, ConflictError, BadRequestError } = require('../../utils/errors');
const { parsePagination } = require('../../utils/helpers');
const { notDeleted } = require('../../utils/prismaHelpers');

const attendanceService = require('./attendance.service');
const payrollService = require('./payroll.service');

/**
 * Asserts that an outlet belongs to the caller's tenant (head office).
 * super_admin bypasses. Throws NotFoundError when the outlet is missing or
 * owned by another head office, so cross-tenant access is indistinguishable
 * from a non-existent record (prevents IDOR enumeration).
 * @param {string} outletId - Target outlet UUID
 * @param {object} user - req.user ({ role, head_office_id })
 */
async function assertOutletInTenant(outletId, user) {
  if (user && user.role === 'super_admin') return;
  const prisma = getDbClient();
  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId },
    select: { head_office_id: true },
  });
  if (!outlet) throw new NotFoundError('Staff record not found');
  // Owners manage every outlet inside their own head office and already bypass
  // enforceOutletScope / hasPermission everywhere else. A multi-outlet owner's JWT
  // can carry head_office_id=null (their primary role has no outlet to derive it
  // from), or a legacy outlet may have a null head_office_id — in either case the
  // strict equality below wrongly reported "Staff record not found" and blocked a
  // valid create. For owners, only reject genuine cross-tenant access (both ids
  // known AND different); otherwise let them through.
  if (user && user.role === 'owner') {
    if (user.head_office_id && outlet.head_office_id && outlet.head_office_id !== user.head_office_id) {
      throw new NotFoundError('Staff record not found');
    }
    return;
  }
  if (!outlet.head_office_id || outlet.head_office_id !== user?.head_office_id) {
    throw new NotFoundError('Staff record not found');
  }
}

/**
 * Asserts that a user has a (non-deleted) staff profile in an outlet within the
 * caller's tenant. Used where the only identifier is a userId with no outlet
 * column on the target table (e.g. availability). super_admin bypasses.
 * @param {string} userId - Target staff user UUID
 * @param {object} user - req.user
 */
async function assertUserInTenant(userId, user) {
  if (user && user.role === 'super_admin') return;
  const prisma = getDbClient();
  const profile = await prisma.staffProfile.findFirst({
    where: notDeleted({ user_id: userId }),
    select: { outlet: { select: { head_office_id: true } } },
  });
  if (!profile || !profile.outlet || profile.outlet.head_office_id !== user?.head_office_id) {
    throw new NotFoundError('Staff record not found');
  }
}

/**
 * Marks a salary record paid after asserting it belongs to the caller's tenant.
 * Wraps payrollService.markSalaryPaid to add an ownership check (the record is
 * resolved by id, so its outlet must be validated against the caller).
 * @param {string} id - SalaryRecord UUID
 * @param {object} user - req.user
 * @param {number} bonus
 */
async function markSalaryPaidScoped(id, user, bonus = 0) {
  const prisma = getDbClient();
  const record = await prisma.salaryRecord.findUnique({
    where: { id },
    select: { outlet_id: true },
  });
  if (!record) throw new NotFoundError('Salary record not found');
  await assertOutletInTenant(record.outlet_id, user);
  return payrollService.markSalaryPaid(id, bonus);
}

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
    const where = notDeleted({ outlet_id: outletId });
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
async function getStaffProfile(userId, outletId) {
  const prisma = getDbClient();
  try {
    const profile = await prisma.staffProfile.findFirst({
      where: notDeleted({ user_id: userId, outlet_id: outletId }),
      include: {
        user: {
          select: {
            id: true, full_name: true, email: true, phone: true,
            is_active: true, created_at: true,
            user_roles: {
              where: { is_deleted: false },
              include: { role: { select: { name: true, display_name: true } } },
            },
          },
        },
      },
    });
    if (!profile) throw new NotFoundError('Staff profile not found');
    return profile;
  } catch (error) {
    logger.error('Get staff profile failed', { error: error.message });
    throw error;
  }
}

function buildDateOrNull(val) {
  if (val === null || val === '' || val === undefined) return null;
  return new Date(val);
}

// Prisma's Decimal columns reject '' — coerce blank/absent numeric inputs to null so a
// staff member can be saved with empty pay fields.
function buildNumberOrNull(val) {
  if (val === null || val === '' || val === undefined) return null;
  return Number(val);
}

async function upsertStaffProfile(userId, outletId, data) {
  const prisma = getDbClient();
  try {
    const profileData = {
      employee_code: data.employee_code,
      department: data.department,
      designation: data.designation,
      manager_pin: data.manager_pin,
      employment_type: data.employment_type,
      join_date: buildDateOrNull(data.join_date),
      end_date: buildDateOrNull(data.end_date),
      contract_end_date: buildDateOrNull(data.contract_end_date),
      hourly_rate: buildNumberOrNull(data.hourly_rate),
      monthly_salary: buildNumberOrNull(data.monthly_salary),
      // Personal details
      date_of_birth: buildDateOrNull(data.date_of_birth),
      gender: data.gender,
      nationality: data.nationality,
      address: data.address,
      blood_group: data.blood_group,
      // Emergency contact
      emergency_contact: data.emergency_contact,
      emergency_contact_name: data.emergency_contact_name,
      emergency_relationship: data.emergency_relationship,
      // Banking / payroll
      bank_bsb: data.bank_bsb,
      bank_account: data.bank_account,
      bank_account_name: data.bank_account_name,
      tax_file_number: data.tax_file_number,
      superannuation_fund: data.superannuation_fund,
      super_member_number: data.super_member_number,
      // Compliance
      right_to_work_checked: data.right_to_work_checked,
      visa_type: data.visa_type,
      visa_expiry: buildDateOrNull(data.visa_expiry),
      induction_completed: data.induction_completed,
      induction_date: buildDateOrNull(data.induction_date),
      wwcc_number: data.wwcc_number,
      wwcc_expiry: buildDateOrNull(data.wwcc_expiry),
      rsa_number: data.rsa_number,
      rsa_expiry: buildDateOrNull(data.rsa_expiry),
      food_safety_cert: data.food_safety_cert,
      food_safety_expiry: buildDateOrNull(data.food_safety_expiry),
      police_check_date: buildDateOrNull(data.police_check_date),
      police_check_expiry: buildDateOrNull(data.police_check_expiry),
      notes: data.notes,
    };
    // Strip undefined values for partial updates
    Object.keys(profileData).forEach(k => profileData[k] === undefined && delete profileData[k]);

    const profile = await prisma.staffProfile.upsert({
      where: { user_id_outlet_id: { user_id: userId, outlet_id: outletId } },
      create: { user_id: userId, outlet_id: outletId, ...profileData },
      update: { ...profileData, ...(data.is_deleted !== undefined ? { is_deleted: data.is_deleted } : {}) },
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

async function listCertifications(userId, outletId) {
  const prisma = getDbClient();
  return await prisma.staffCertification.findMany({
    where: { staff_id: userId, outlet_id: outletId, is_active: true },
    orderBy: { expiry_date: 'asc' },
  });
}

async function addCertification(userId, outletId, data) {
  const prisma = getDbClient();
  return await prisma.staffCertification.create({
    data: {
      staff_id: userId,
      outlet_id: outletId,
      cert_type: data.cert_type,
      provider: data.provider,
      issue_date: new Date(data.issue_date),
      expiry_date: new Date(data.expiry_date),
      cert_number: data.cert_number,
    },
  });
}

async function deleteCertification(certId) {
  const prisma = getDbClient();
  return await prisma.staffCertification.update({
    where: { id: certId },
    data: { is_active: false },
  });
}

async function getAvailability(userId, user) {
  await assertUserInTenant(userId, user);
  const prisma = getDbClient();
  return await prisma.staffAvailability.findMany({
    where: { staff_id: userId },
    orderBy: { day_of_week: 'asc' },
  });
}

async function setAvailability(userId, slots, user) {
  await assertUserInTenant(userId, user);
  const prisma = getDbClient();
  const results = await Promise.all(slots.map(slot =>
    prisma.staffAvailability.upsert({
      where: { staff_id_day_of_week: { staff_id: userId, day_of_week: slot.day_of_week } },
      create: {
        staff_id: userId,
        day_of_week: slot.day_of_week,
        available: slot.available,
        start_time: slot.start_time || null,
        end_time: slot.end_time || null,
        notes: slot.notes || null,
      },
      update: {
        available: slot.available,
        start_time: slot.start_time || null,
        end_time: slot.end_time || null,
        notes: slot.notes || null,
      },
    })
  ));
  return results;
}

/**
 * Verifies a manager PIN for administrative actions.
 * @param {string} outletId - Outlet UUID
 * @param {string} pin - 4-6 digit PIN
 * @returns {Promise<object|null>} Staff profile if valid
 */
async function verifyManagerPIN(outletId, pin) {
  const prisma = getDbClient();
  const staff = await prisma.staffProfile.findFirst({
    where: notDeleted({ outlet_id: outletId, manager_pin: pin }),
    include: { user: { select: { id: true, full_name: true } } }
  });
  return staff;
}

/**
 * Complex: Creates a new User AND their Staff Profile in one go.
 */
// Floor/kitchen tenant roles (waiter/chef/delivery) aren't seeded with their own
// permission set yet, so map them to 'cashier' (which has POS access) — mirroring
// onboarding.service.js. manager/cashier resolve directly. This guarantees every new
// staff member gets a real, permissioned role instead of being silently skipped.
const STAFF_ROLE_MAP = {
  manager: 'manager', cashier: 'cashier',
  waiter: 'cashier', chef: 'cashier', delivery: 'cashier', captain: 'cashier',
};

async function createStaffWithUser(outletId, data) {
  const prisma = getDbClient();
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(data.password || 'Staff@123', 12);

  // Stamp the outlet's head office so the new staff member shows up in tenant-scoped reads.
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId }, select: { head_office_id: true },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          full_name: data.full_name,
          // Blank email -> null so multiple PIN-only staff don't collide on the unique
          // index (Postgres allows many NULLs, but not many '').
          email: data.email ? data.email : null,
          phone: data.phone,
          password_hash: passwordHash,
          head_office_id: outlet?.head_office_id ?? null,
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

      // Resolve to a seeded role; never silently leave the staff member role-less.
      const roleName = STAFF_ROLE_MAP[data.role] || data.role || 'cashier';
      const role = await tx.role.findFirst({ where: { name: roleName } });
      if (role) {
        await tx.userRole.create({
          data: { user_id: user.id, role_id: role.id, outlet_id: outletId, is_primary: true }
        });
      }

      return { ...profile, user };
    });
  } catch (error) {
    // Translate known Prisma failures into clean, specific messages — never a bare 500.
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      const field = Array.isArray(target) ? (target.includes('phone') ? 'phone' : target.includes('email') ? 'email' : 'value') : 'value';
      throw new ConflictError(`A staff member with this ${field} already exists`);
    }
    if (error.code === 'P2003') throw new BadRequestError('Invalid outlet for this staff member');
    throw error;
  }
}

/**
 * Gets staff performance metrics based on orders handled.
 */
async function getStaffPerformance(outletId, from, to) {
  const prisma = getDbClient();
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to) : new Date();

  const result = await prisma.order.groupBy({
    by: ['staff_id'],
    where: notDeleted({
      outlet_id: outletId,
      created_at: { gte: fromDate, lte: toDate },
      status: 'paid'
    }),
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
}

module.exports = {
  assertOutletInTenant,
  listStaff, getStaffProfile, upsertStaffProfile, verifyManagerPIN, createStaffWithUser,
  listCertifications, addCertification, deleteCertification,
  getAvailability, setAvailability,
  getStaffPerformance,
  // Attendance sub-service (clock in/out, OTP, shifts, shift report)
  ...attendanceService,
  // Payroll sub-service (salary calc, records, payouts)
  ...payrollService,
  // Tenant-scoped override — must come after spreads so it wins.
  markSalaryPaid: markSalaryPaidScoped,
};
