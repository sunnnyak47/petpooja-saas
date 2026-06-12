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

  // 2. Create the Master SuperAdmin User
  const passwordHash = await bcrypt.hash('Petpooja@2026', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@petpooja.com' },
    update: { password_hash: passwordHash, failed_login_attempts: 0, locked_until: null, is_active: true, is_deleted: false },
    create: {
      full_name: 'Global Software Owner',
      email: 'admin@petpooja.com',
      phone: '9999999999',
      password_hash: passwordHash,
      is_active: true,
      is_email_verified: true,
      is_phone_verified: true
    }
  });

  const saRole = await prisma.role.findUnique({ where: { name: 'super_admin' } });
  
  // 3. Link SuperAdmin Role (Hand-crafted for Cloud Success)
  const existingRole = await prisma.userRole.findFirst({
    where: { 
      user_id: admin.id,
      role_id: saRole.id,
      outlet_id: null
    }
  });

  if (!existingRole) {
    await prisma.userRole.create({
      data: {
        user_id: admin.id,
        role_id: saRole.id,
        is_primary: true,
        outlet_id: null
      }
    });
  }

  console.log('🏆 VICTORY: SuperAdmin Account Created (admin@petpooja.com / Petpooja@2026)');

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
