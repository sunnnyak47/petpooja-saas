const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
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

  // 2. Create the Master SuperAdmin User
  const passwordHash = await bcrypt.hash('Petpooja@2026', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@petpooja.com' },
    update: {},
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
}

main()
  .catch((e) => {
    console.error('❌ Seed Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
