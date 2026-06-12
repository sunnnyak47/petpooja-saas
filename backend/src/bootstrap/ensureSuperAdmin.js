/**
 * @fileoverview Ensure the platform SuperAdmin owner login on server boot.
 *
 * This is an OPT-IN safety net that runs only when BOTH `SUPERADMIN_EMAIL` and
 * `SUPERADMIN_PASSWORD` are present in the environment. It guarantees the owner
 * login is correct on every boot, independent of whether the deploy's build
 * step ran `prisma/seed.js` — so changing the SuperAdmin password is just:
 * set the env vars → restart.
 *
 * It only ever touches the single MASTER owner account (the configured email or
 * the legacy `admin@petpooja.com`); it never disturbs additional platform_staff
 * super_admins created via the Platform Staff UI. Failures are logged, never fatal.
 *
 * @module bootstrap/ensureSuperAdmin
 */

const bcrypt = require('bcrypt');
const prisma = require('../config/database').getDbClient();
const logger = require('../config/logger');

async function ensureSuperAdmin() {
  const email = (process.env.SUPERADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD || '';
  // Opt-in only — do nothing unless both are explicitly configured.
  if (!email || !password) return;

  try {
    const saRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });
    if (!saRole) {
      logger.warn('ensureSuperAdmin: super_admin role not seeded yet — skipping');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // The master owner = the configured email, or the legacy default — and it
    // must currently hold the platform super_admin role. Never another staff SA.
    const master = await prisma.user.findFirst({
      where: {
        is_deleted: false,
        OR: [{ email }, { email: 'admin@petpooja.com' }],
        user_roles: { some: { is_deleted: false, outlet_id: null, role: { name: 'super_admin' } } },
      },
    });

    if (master) {
      await prisma.user.update({
        where: { id: master.id },
        data: {
          email,
          password_hash: passwordHash,
          ...(process.env.SUPERADMIN_PHONE ? { phone: String(process.env.SUPERADMIN_PHONE).trim() } : {}),
          is_active: true, is_deleted: false, failed_login_attempts: 0, locked_until: null,
        },
      });
      logger.info(`ensureSuperAdmin: owner login set to ${email}`);
    } else {
      const created = await prisma.user.create({
        data: {
          full_name: 'Global Software Owner',
          email,
          phone: String(process.env.SUPERADMIN_PHONE || '9999999999').trim(),
          password_hash: passwordHash,
          is_active: true, is_email_verified: true, is_phone_verified: true,
        },
      });
      await prisma.userRole.create({
        data: { user_id: created.id, role_id: saRole.id, outlet_id: null, is_primary: true },
      });
      logger.info(`ensureSuperAdmin: owner login created -> ${email}`);
    }
  } catch (err) {
    logger.error('ensureSuperAdmin failed (non-fatal):', err.message);
  }
}

module.exports = { ensureSuperAdmin };
