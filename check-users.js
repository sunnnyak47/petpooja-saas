const prisma = require('./backend/src/config/database').getDbClient();

async function checkUsers() {
  try {
    const users = await prisma.user.findMany({
      where: { is_deleted: false },
      select: { email: true, phone: true, full_name: true }
    });
    console.log('--- ACTIVE USERS ---');
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
