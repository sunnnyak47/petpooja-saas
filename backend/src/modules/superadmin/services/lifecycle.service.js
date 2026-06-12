/**
 * @fileoverview SuperAdmin — chain lifecycle operations: transfer ownership,
 * soft-delete, restore, and list deleted chains. Augments the shared
 * superadminService singleton.
 *
 * All operations are reversible by design — NO hard deletes. Soft-delete flips
 * `is_deleted`/`is_active` and stamps audit metadata; restore reverses it.
 * Ownership transfer demotes the previous owner to `manager` (access retained,
 * ownership removed) and grants `owner` to the new user, never orphaning a chain.
 *
 * @module modules/superadmin/services/lifecycle.service
 */

const crypto = require('crypto');
const {
  superadminService, prisma, bcrypt, logger,
  NotFoundError, BadRequestError, ConflictError,
} = require('./_shared');

Object.assign(superadminService, {
  /**
   * Transfer ownership of a chain to a different user — either an existing user
   * already under the chain, or a brand-new owner created on the fly. The current
   * owner is demoted to `manager` (keeps access, loses ownership). The new user is
   * granted the `owner` role on the previous owner's outlet.
   *
   * @param {string} headOfficeId
   * @param {{ new_owner_user_id?: string, new_owner?: { full_name: string, email: string, phone: string } }} body
   * @param {string} adminId  acting platform staff user id (or 'sa_root')
   * @param {string} adminEmail
   * @returns {Promise<{ chain: string, previous_owner: string, new_owner: string, temp_password: string|null }>}
   */
  async transferOwnership(headOfficeId, body = {}, adminId, adminEmail) {
    // 1. Load & guard the chain.
    const chain = await prisma.headOffice.findUnique({ where: { id: headOfficeId } });
    if (!chain || chain.is_deleted) throw new NotFoundError('Chain not found');

    // 2. Locate the current owner GRANT (the UserRole with role 'owner' held by a
    //    non-deleted user belonging to this chain).
    const currentGrant = await prisma.userRole.findFirst({
      where: {
        is_deleted: false,
        role: { name: 'owner' },
        user: { head_office_id: headOfficeId, is_deleted: false },
      },
      include: { user: true },
    });
    if (!currentGrant) throw new BadRequestError('Chain has no current owner');

    const previousOwner = currentGrant.user;

    // 3. Resolve the NEW owner.
    const { new_owner_user_id, new_owner } = body;
    let newUser = null;
    let tempPassword = null;
    let createdNew = false;

    if (new_owner_user_id) {
      newUser = await prisma.user.findFirst({ where: { id: new_owner_user_id, is_deleted: false } });
      if (!newUser) throw new BadRequestError('Target user not found');
      if (newUser.head_office_id !== headOfficeId) {
        throw new BadRequestError('Target user does not belong to this chain');
      }
    } else if (new_owner) {
      const email = (new_owner.email || '').toLowerCase().trim();
      const phone = (new_owner.phone || '').trim();

      // Global uniqueness — email and phone must not collide with any live user.
      const clash = await prisma.user.findFirst({
        where: {
          is_deleted: false,
          OR: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
      });
      if (clash) throw new ConflictError('Email or phone already registered');

      tempPassword = `Tmp-${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`;
      const password_hash = await bcrypt.hash(tempPassword, 12);

      newUser = await prisma.user.create({
        data: {
          full_name: new_owner.full_name,
          email,
          phone,
          password_hash,
          head_office_id: headOfficeId,
          is_active: true,
          is_email_verified: true,
          is_phone_verified: true,
        },
      });
      createdNew = true;
    } else {
      throw new BadRequestError('Provide new_owner_user_id or new_owner');
    }

    // 4. No-op guard — the new owner is already the owner.
    if (newUser.id === previousOwner.id) {
      throw new BadRequestError('User is already the owner');
    }

    const ownerOutletId = currentGrant.outlet_id;

    // 5. Atomically demote the old owner and promote the new one.
    await prisma.$transaction(async (tx) => {
      // Ensure both system roles exist.
      let ownerRole = await tx.role.findFirst({ where: { name: 'owner' } });
      if (!ownerRole) {
        ownerRole = await tx.role.create({
          data: { name: 'owner', display_name: 'Restaurant Owner', is_system: true },
        });
      }
      let managerRole = await tx.role.findFirst({ where: { name: 'manager' } });
      if (!managerRole) {
        managerRole = await tx.role.create({
          data: { name: 'manager', display_name: 'Manager', is_system: true },
        });
      }

      // Demote previous owner: their owner grant becomes a manager grant.
      await tx.userRole.update({
        where: { id: currentGrant.id },
        data: { role_id: managerRole.id, is_primary: false },
      });

      // Grant owner to the new user. Reuse an existing grant for this chain if one
      // exists (avoids the (user_id, role_id, outlet_id) unique-constraint clash),
      // otherwise create a fresh owner grant on the previous owner's outlet.
      const existingGrant = await tx.userRole.findFirst({
        where: {
          user_id: newUser.id,
          is_deleted: false,
          outlet_id: ownerOutletId,
        },
      });

      if (existingGrant) {
        await tx.userRole.update({
          where: { id: existingGrant.id },
          data: { role_id: ownerRole.id, is_primary: true },
        });
      } else {
        await tx.userRole.create({
          data: {
            user_id: newUser.id,
            role_id: ownerRole.id,
            outlet_id: ownerOutletId,
            is_primary: true,
          },
        });
      }
    });

    // 6. Audit.
    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: 'CHAIN_OWNER_TRANSFERRED',
        entity_type: 'restaurant',
        entity_id: headOfficeId,
        new_values: {
          from_email: previousOwner.email,
          from_user_id: previousOwner.id,
          to_email: newUser.email,
          to_user_id: newUser.id,
          created_new: createdNew,
        },
      },
    }).catch(() => null);

    logger.info('SuperAdmin transferred chain ownership', {
      head_office_id: headOfficeId,
      from: previousOwner.email,
      to: newUser.email,
      created_new: createdNew,
      by: adminEmail,
    });

    return {
      chain: headOfficeId,
      previous_owner: previousOwner.email,
      new_owner: newUser.email,
      temp_password: tempPassword || null,
    };
  },

  /**
   * Soft-delete a chain: hide it from listings (is_deleted) and block all its
   * logins (is_active:false). Children are intentionally left intact so the chain
   * can be fully restored. NO hard delete, NO cascade.
   *
   * @param {string} headOfficeId
   * @param {string} adminId
   * @param {string} adminEmail
   * @param {string} [reason]
   * @returns {Promise<{ id: string, name: string, is_deleted: boolean, is_active: boolean }>}
   */
  async softDeleteChain(headOfficeId, adminId, adminEmail, reason) {
    const chain = await prisma.headOffice.findUnique({ where: { id: headOfficeId } });
    if (!chain) throw new NotFoundError('Chain not found');
    if (chain.is_deleted) throw new BadRequestError('Chain is already deleted');

    const existingMeta = chain.metadata || {};
    const updated = await prisma.headOffice.update({
      where: { id: headOfficeId },
      data: {
        is_deleted: true,
        is_active: false,
        metadata: {
          ...existingMeta,
          deleted_at: new Date().toISOString(),
          deleted_by: adminEmail || 'super_admin',
          delete_reason: reason || null,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: 'CHAIN_SOFT_DELETED',
        entity_type: 'restaurant',
        entity_id: headOfficeId,
        new_values: { name: chain.name, reason: reason || null },
      },
    }).catch(() => null);

    logger.info('SuperAdmin soft-deleted chain', { head_office_id: headOfficeId, name: chain.name, by: adminEmail });

    return { id: updated.id, name: updated.name, is_deleted: true, is_active: false };
  },

  /**
   * Restore a previously soft-deleted chain: un-hide it and re-enable logins.
   * Clears the delete-stamp metadata and records the restore.
   *
   * @param {string} headOfficeId
   * @param {string} adminId
   * @param {string} adminEmail
   * @returns {Promise<{ id: string, name: string, is_deleted: boolean, is_active: boolean }>}
   */
  async restoreChain(headOfficeId, adminId, adminEmail) {
    const chain = await prisma.headOffice.findUnique({ where: { id: headOfficeId } });
    if (!chain) throw new NotFoundError('Chain not found');
    if (!chain.is_deleted) throw new BadRequestError('Chain is not deleted');

    const existingMeta = chain.metadata || {};
    const updated = await prisma.headOffice.update({
      where: { id: headOfficeId },
      data: {
        is_deleted: false,
        is_active: true,
        metadata: {
          ...existingMeta,
          restored_at: new Date().toISOString(),
          restored_by: adminEmail || 'super_admin',
          deleted_at: null,
          delete_reason: null,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: (adminId && adminId !== 'sa_root') ? adminId : null,
        action: 'CHAIN_RESTORED',
        entity_type: 'restaurant',
        entity_id: headOfficeId,
        new_values: { name: chain.name },
      },
    }).catch(() => null);

    logger.info('SuperAdmin restored chain', { head_office_id: headOfficeId, name: chain.name, by: adminEmail });

    return { id: updated.id, name: updated.name, is_deleted: false, is_active: true };
  },

  /**
   * List all soft-deleted chains with their delete metadata, newest first.
   * @returns {Promise<Array<{ id: string, name: string, region: string, deleted_at: string|null, deleted_by: string|null, reason: string|null }>>}
   */
  async listDeletedChains() {
    const chains = await prisma.headOffice.findMany({
      where: { is_deleted: true },
      select: { id: true, name: true, region: true, metadata: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
    });

    return chains.map((c) => ({
      id: c.id,
      name: c.name,
      region: c.region,
      deleted_at: c.metadata?.deleted_at || null,
      deleted_by: c.metadata?.deleted_by || null,
      reason: c.metadata?.delete_reason || null,
    }));
  },
});

module.exports = superadminService;
