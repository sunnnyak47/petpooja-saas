const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_DEFS,
} = require('../src/modules/superadmin/platform-rbac');
const prisma = new PrismaClient();

async function main() {
  console.log('🏁 Starting Cloud Seed: Forging Master Keys...');

  // 1. Create Core Roles
  const roles = [
    { name: 'super_admin', display_name: 'Super Admin', description: 'Global Software Owner' },
    { name: 'owner', display_name: 'Restaurant Owner', description: 'Owner of one or more outlets' },
    { name: 'manager', display_name: 'Outlet Manager', description: 'Manages a specific restaurant outlet' },
    { name: 'cashier', display_name: 'Cashier', description: 'Handles POS billing' }
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: role,
      create: { ...role, is_system: true }
    });
  }
  console.log('✅ Core Roles Created.');

  // 1b. Platform (SuperAdmin) RBAC — scoped roles + permission catalog.
  //     Lets platform access be handed to staff with least privilege.
  //     Data-only (no schema change): reuses roles / permissions / role_permissions.
  for (const def of PLATFORM_ROLE_DEFS) {
    await prisma.role.upsert({
      where: { name: def.name },
      update: { display_name: def.display_name, description: def.description, is_system: true, is_deleted: false },
      create: { name: def.name, display_name: def.display_name, description: def.description, is_system: true },
    });
  }

  const permByKey = {};
  for (const perm of PLATFORM_PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { display_name: perm.display_name, module: 'platform', description: perm.description, is_deleted: false },
      create: { key: perm.key, display_name: perm.display_name, module: 'platform', description: perm.description },
    });
    permByKey[perm.key] = row.id;
  }

  for (const def of PLATFORM_ROLE_DEFS) {
    const roleRow = await prisma.role.findUnique({ where: { name: def.name } });
    if (!roleRow) continue;
    // Desired set for this platform role.
    const desiredIds = def.permissions.map((k) => permByKey[k]).filter(Boolean);
    // Add/ensure the desired grants (idempotent).
    for (const permission_id of desiredIds) {
      await prisma.rolePermission.upsert({
        where: { role_id_permission_id: { role_id: roleRow.id, permission_id } },
        update: { is_deleted: false },
        create: { role_id: roleRow.id, permission_id },
      });
    }
    // Revoke any platform-permission grants that are no longer in the preset
    // (keeps presets authoritative across redeploys without touching tenant perms).
    const staleIds = Object.values(permByKey).filter((id) => !desiredIds.includes(id));
    if (staleIds.length) {
      await prisma.rolePermission.deleteMany({
        where: { role_id: roleRow.id, permission_id: { in: staleIds } },
      });
    }
  }
  console.log('✅ Platform RBAC seeded (roles: super_admin, platform_admin, platform_support, platform_billing, platform_readonly).');

  // 2. Master SuperAdmin owner account.
  //    Credentials are sourced from the environment so NO real password is ever
  //    committed to source control. The defaults below are LOCAL-ONLY fallbacks.
  //    In production set: SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (and optionally
  //    SUPERADMIN_PHONE). The existing owner account is updated IN PLACE so the
  //    login simply changes — no duplicate accounts, no phone collisions.
  const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || 'admin@petpooja.com').toLowerCase().trim();
  const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Petpooja@2026';
  const SUPERADMIN_PHONE = (process.env.SUPERADMIN_PHONE || '9999999999').trim();
  const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);

  const saRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });

  // Find-or-create the SuperAdmin user BY EMAIL — never RENAME another account into
  // SUPERADMIN_EMAIL. The old code renamed the legacy super_admin's email to
  // SUPERADMIN_EMAIL, which collides with the @unique email when SUPERADMIN_EMAIL
  // already exists (e.g. a restaurant owner signed up with it) — the update then
  // failed and left super_admin on the legacy account while SUPERADMIN_EMAIL stayed
  // a plain owner (403 on every super-admin page).
  let admin = await prisma.user.findFirst({ where: { email: SUPERADMIN_EMAIL } });
  if (admin) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: {
        password_hash: passwordHash,
        ...(process.env.SUPERADMIN_PHONE ? { phone: SUPERADMIN_PHONE } : {}),
        failed_login_attempts: 0, locked_until: null, is_active: true, is_deleted: false,
      },
    });
  } else {
    admin = await prisma.user.create({
      data: {
        full_name: 'Global Software Owner',
        email: SUPERADMIN_EMAIL,
        phone: SUPERADMIN_PHONE,
        password_hash: passwordHash,
        is_active: true,
        is_email_verified: true,
        is_phone_verified: true,
      },
    });
  }

  // Login builds the JWT from the is_primary role, so super_admin MUST be primary.
  // 1) Demote all of this user's roles (a prior 'owner' signup role must not win).
  await prisma.userRole.updateMany({ where: { user_id: admin.id }, data: { is_primary: false } });
  // 2) Grant/repair the platform super_admin role (outlet_id null) as PRIMARY.
  const saGrant = await prisma.userRole.findFirst({ where: { user_id: admin.id, role_id: saRole.id, outlet_id: null } });
  if (saGrant) {
    await prisma.userRole.update({ where: { id: saGrant.id }, data: { is_primary: true, is_deleted: false } });
  } else {
    await prisma.userRole.create({ data: { user_id: admin.id, role_id: saRole.id, is_primary: true, outlet_id: null } });
  }
  // 3) Demote every OTHER platform super_admin (e.g. legacy admin@petpooja.com) so
  //    there is exactly one platform owner = SUPERADMIN_EMAIL.
  const demoted = await prisma.userRole.updateMany({
    where: { role_id: saRole.id, outlet_id: null, is_deleted: false, user_id: { not: admin.id } },
    data: { is_deleted: true },
  });

  console.log(`🏆 SuperAdmin owner ready: ${SUPERADMIN_EMAIL} (password from SUPERADMIN_PASSWORD env); demoted ${demoted.count} legacy super_admin(s)`);

  // 4. Default usage-based billing plans (editable data, NOT hardcoded in app).
  //    These are launch defaults — tune rate_rules / percentages per advisor input.
  //    rate_rules.channels keys the per-channel fee; `default` is the fallback.
  const billingPlans = [
    {
      code: 'IN_USAGE_STD',
      name: 'India — Usage Standard',
      description: 'Per-transaction software fee. 1.75% on online orders, flat ₹2/order dine-in. First 50 transactions/month free.',
      region: 'IN',
      currency: 'INR',
      txn_fee_percent: 1.75,
      flat_fee_per_txn: 0,
      channels: ['online', 'dine_in', 'takeaway', 'qr', 'zomato', 'swiggy'],
      free_txns_monthly: 50,
      base_monthly_fee: 0,
      monthly_min_fee: 499,
      monthly_cap_fee: null,
      rate_rules: {
        channels: {
          online: { percent: 1.75, flat: 0 },
          zomato: { percent: 1.75, flat: 0 },
          swiggy: { percent: 1.75, flat: 0 },
          qr: { percent: 1.75, flat: 0 },
          dine_in: { percent: 0, flat: 2 },
          takeaway: { percent: 0, flat: 2 },
          default: { percent: 1.75, flat: 0 }
        }
      },
      tax_percent: 18,
      tax_label: 'GST',
      max_outlets: null,
      max_users: null,
      features: {},
      sort_order: 10
    },
    {
      code: 'AU_USAGE_STD',
      name: 'Australia — Usage Standard',
      description: 'Per-transaction software fee of 0.9% across all channels with an A$0.10 floor. First 50 transactions/month free.',
      region: 'AU',
      currency: 'AUD',
      txn_fee_percent: 0.9,
      flat_fee_per_txn: 0,
      channels: ['online', 'dine_in', 'takeaway', 'qr'],
      free_txns_monthly: 50,
      base_monthly_fee: 0,
      monthly_min_fee: 15,
      monthly_cap_fee: null,
      rate_rules: {
        channels: {
          default: { percent: 0.9, flat: 0, min_fee: 0.1 }
        }
      },
      tax_percent: 10,
      tax_label: 'GST',
      max_outlets: null,
      max_users: null,
      features: {},
      sort_order: 20
    }
  ];

  for (const plan of billingPlans) {
    await prisma.billingPlan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan
    });
  }
  console.log('✅ Default billing plans seeded (IN_USAGE_STD, AU_USAGE_STD).');
}

main()
  .catch((e) => {
    console.error('❌ Seed Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
