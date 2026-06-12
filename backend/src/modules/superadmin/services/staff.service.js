/**
 * @fileoverview SuperAdmin — platform staff management.
 *
 * Platform staff are outlet-less Users (head_office_id = NULL) linked via a
 * UserRole (outlet_id = NULL) to a PLATFORM role. This module lets a holder of
 * `sa.staff.manage` (super_admin) create staff, change their role, reset their
 * login, and deactivate them — with safety rails so the platform can never be
 * locked out (the last active super_admin can't be demoted, deactivated, or
 * deleted; you can't deactivate your own account).
 *
 * @module modules/superadmin/services/staff.service
 */

const crypto = require('crypto');
const {
  superadminService, prisma, bcrypt, logger,
  NotFoundError, BadRequestError, ConflictError,
} = require('./_shared');
const {
  PLATFORM_ROLES, ASSIGNABLE_PLATFORM_ROLES, isPlatformRole,
} = require('../platform-rbac');

/** Generate a readable one-time temp password the staff member resets on first login. */
function genTempPassword() {
  return `Tmp-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Find a user's PLATFORM role grant (outlet-less), or null. */
async function findPlatformGrant(userId) {
  const grants = await prisma.userRole.findMany({
    where: { user_id: userId, outlet_id: null, is_deleted: false },
    include: { role: true },
  });
  return grants.find((g) => g.role && isPlatformRole(g.role.name)) || null;
}

/** Count ACTIVE super_admin staff (used to prevent platform lockout). */
async function countActiveSuperAdmins() {
  return prisma.user.count({
    where: {
      is_deleted: false,
      is_active: true,
      user_roles: { some: { is_deleted: false, outlet_id: null, role: { name: 'super_admin' } } },
    },
  });
}

async function writeAudit(actor, action, staffUser, extra = {}) {
  await prisma.auditLog.create({
    data: {
      user_id: actor?.id || null,
      action,
      entity_type: 'platform_staff',
      entity_id: staffUser?.id || null,
      new_values: { staff_email: staffUser?.email, by: actor?.email || 'super_admin', ...extra },
    },
  }).catch(() => null);
}

Object.assign(superadminService, {
  /** Available platform roles + their preset permissions (for the management UI). */
  async listPlatformRoles() {
    return ASSIGNABLE_PLATFORM_ROLES;
  },

  /** List all platform staff (active + deactivated, excluding hard-deleted). */
  async listStaff() {
    const grants = await prisma.userRole.findMany({
      where: {
        outlet_id: null,
        is_deleted: false,
        role: { name: { in: PLATFORM_ROLES } },
        user: { is_deleted: false },
      },
      include: {
        role: { select: { name: true, display_name: true } },
        user: {
          select: {
            id: true, full_name: true, email: true, phone: true,
            is_active: true, last_login_at: true, created_at: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    // One row per user (a user should hold a single platform role; first wins).
    const seen = new Set();
    const rows = [];
    for (const g of grants) {
      if (!g.user || seen.has(g.user.id)) continue;
      seen.add(g.user.id);
      rows.push({
        id: g.user.id,
        full_name: g.user.full_name,
        email: g.user.email,
        phone: g.user.phone,
        role: g.role.name,
        role_display: g.role.display_name,
        is_active: g.user.is_active,
        last_login_at: g.user.last_login_at,
        created_at: g.user.created_at,
      });
    }
    return rows;
  },

  /**
   * Create a new platform staff member.
   * @param {{full_name:string, email:string, phone:string, role:string}} input
   * @param {{id:string, email:string}} actor
   * @returns {Promise<{id:string, email:string, role:string, temp_password:string}>}
   */
  async createStaff(input, actor) {
    const full_name = String(input.full_name || '').trim();
    const email = String(input.email || '').toLowerCase().trim();
    const phone = String(input.phone || '').trim();
    const role = String(input.role || '').trim();

    if (!full_name || !email || !phone || !role) {
      throw new BadRequestError('full_name, email, phone and role are required');
    }
    if (!isPlatformRole(role)) {
      throw new BadRequestError(`Invalid platform role: ${role}`);
    }

    const roleRow = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRow) throw new BadRequestError(`Role "${role}" is not seeded`);

    // Uniqueness — email and phone are globally unique on User.
    const clash = await prisma.user.findFirst({
      where: { is_deleted: false, OR: [{ email }, { phone }] },
      select: { email: true, phone: true },
    });
    if (clash) {
      throw new ConflictError(
        clash.email === email ? 'A user with this email already exists' : 'A user with this phone already exists'
      );
    }

    const tempPassword = genTempPassword();
    const password_hash = await bcrypt.hash(tempPassword, 12);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          full_name,
          email,
          phone,
          password_hash,
          is_active: true,
          is_email_verified: true,
          is_phone_verified: true,
          // head_office_id intentionally NULL — platform staff are not tenant users.
        },
      });
      await tx.userRole.create({
        data: { user_id: user.id, role_id: roleRow.id, outlet_id: null, is_primary: true },
      });
      return user;
    });

    await writeAudit(actor, 'SUPERADMIN_STAFF_CREATED', created, { role });
    logger.info('SuperAdmin created platform staff', { email, role, by: actor?.email });
    return { id: created.id, email: created.email, role, temp_password: tempPassword };
  },

  /**
   * Update a staff member's role and/or active status.
   * @param {string} id
   * @param {{role?:string, is_active?:boolean}} changes
   * @param {{id:string, email:string}} actor
   */
  async updateStaff(id, changes, actor) {
    const grant = await findPlatformGrant(id);
    if (!grant) throw new NotFoundError('Platform staff member not found');

    const user = await prisma.user.findFirst({ where: { id, is_deleted: false } });
    if (!user) throw new NotFoundError('Platform staff member not found');

    const currentRole = grant.role.name;
    const newRole = changes.role !== undefined ? String(changes.role).trim() : undefined;
    const newActive = changes.is_active;

    if (newRole !== undefined && !isPlatformRole(newRole)) {
      throw new BadRequestError(`Invalid platform role: ${newRole}`);
    }

    // Lockout guards — never strip the last active super_admin.
    const demotingLastSA = currentRole === 'super_admin' && newRole && newRole !== 'super_admin';
    const deactivatingSA = currentRole === 'super_admin' && newActive === false;
    if (demotingLastSA || deactivatingSA) {
      const activeSAs = await countActiveSuperAdmins();
      if (activeSAs <= 1) {
        throw new BadRequestError('Cannot demote or deactivate the last active super admin');
      }
    }
    if (newActive === false && id === actor?.id) {
      throw new BadRequestError('You cannot deactivate your own account');
    }

    await prisma.$transaction(async (tx) => {
      if (newRole && newRole !== currentRole) {
        const roleRow = await tx.role.findUnique({ where: { name: newRole } });
        if (!roleRow) throw new BadRequestError(`Role "${newRole}" is not seeded`);
        await tx.userRole.update({ where: { id: grant.id }, data: { role_id: roleRow.id } });
      }
      if (typeof newActive === 'boolean') {
        await tx.user.update({
          where: { id },
          data: newActive
            ? { is_active: true, failed_login_attempts: 0, locked_until: null }
            : { is_active: false },
        });
      }
    });

    await writeAudit(actor, 'SUPERADMIN_STAFF_UPDATED', user, {
      role_from: currentRole,
      role_to: newRole || currentRole,
      ...(typeof newActive === 'boolean' ? { is_active: newActive } : {}),
    });
    logger.info('SuperAdmin updated platform staff', { id, by: actor?.email });
    return { id, role: newRole || currentRole, is_active: typeof newActive === 'boolean' ? newActive : user.is_active };
  },

  /** Reset & unlock a staff member's login, returning a one-time temp password. */
  async resetStaffPassword(id, actor) {
    const grant = await findPlatformGrant(id);
    if (!grant) throw new NotFoundError('Platform staff member not found');
    const user = await prisma.user.findFirst({ where: { id, is_deleted: false } });
    if (!user) throw new NotFoundError('Platform staff member not found');

    const tempPassword = genTempPassword();
    const password_hash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.update({
      where: { id },
      data: { password_hash, failed_login_attempts: 0, locked_until: null, is_active: true },
    });

    await writeAudit(actor, 'SUPERADMIN_STAFF_PASSWORD_RESET', user);
    logger.info('SuperAdmin reset platform staff login', { id, by: actor?.email });
    return { email: user.email, temp_password: tempPassword };
  },

  /** Deactivate a staff member (reversible — re-enable via updateStaff). */
  async deactivateStaff(id, actor) {
    if (id === actor?.id) throw new BadRequestError('You cannot deactivate your own account');

    const grant = await findPlatformGrant(id);
    if (!grant) throw new NotFoundError('Platform staff member not found');
    const user = await prisma.user.findFirst({ where: { id, is_deleted: false } });
    if (!user) throw new NotFoundError('Platform staff member not found');

    if (grant.role.name === 'super_admin') {
      const activeSAs = await countActiveSuperAdmins();
      if (activeSAs <= 1) throw new BadRequestError('Cannot deactivate the last active super admin');
    }

    await prisma.user.update({ where: { id }, data: { is_active: false } });
    await writeAudit(actor, 'SUPERADMIN_STAFF_DEACTIVATED', user);
    logger.info('SuperAdmin deactivated platform staff', { id, by: actor?.email });
    return { id, is_active: false };
  },
});
