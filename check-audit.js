const prisma = require('./backend/src/config/database').getDbClient();

async function checkAudit() {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 20
    });
    console.log('--- RECENT AUDIT LOGS ---');
    console.log(JSON.stringify(logs, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAudit();
