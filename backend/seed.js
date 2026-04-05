require('dotenv').config();
const { getDbClient } = require('./src/config/database');
const bcrypt = require('bcrypt');

async function seed() {
  const prisma = getDbClient();
  try {
    const hashedPassword = await bcrypt.hash('Admin@12345', 12);
    
    // Create role
    let role = await prisma.role.findFirst({ where: { name: 'super_admin' } });
    if (!role) {
      role = await prisma.role.create({ data: { name: 'super_admin', display_name: 'Super Admin', description: 'System Administrator' } });
    }

    // Create user
    let user = await prisma.user.findFirst({ where: { email: 'admin@petpooja.com' } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          full_name: 'System Admin',
          email: 'admin@petpooja.com',
          phone: '9999999999',
          password_hash: hashedPassword,
        }
      });
    }

    // Create a demo outlet to test POS
    let outlet = await prisma.outlet.findFirst({ where: { code: 'DEMO01' } });
    if (!outlet) {
      outlet = await prisma.outlet.create({
        data: {
          name: 'Petpooja Demo Restaurant',
          code: 'DEMO01',
          city: 'Mumbai',
          state: 'MH',
          address_line1: 'Bandra West',
          pincode: '400050',
          phone: '9876543210'
        }
      });
    }

    // Create user role mapped to outlet
    const ur = await prisma.userRole.findFirst({ where: { user_id: user.id, role_id: role.id } });
    if (ur) {
      await prisma.userRole.update({ where: { id: ur.id }, data: { outlet_id: outlet.id } });
    } else {
      await prisma.userRole.create({ data: { user_id: user.id, role_id: role.id, outlet_id: outlet.id } });
    }

    console.log('✅ Seed completed: admin@petpooja.com | Admin@12345');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
