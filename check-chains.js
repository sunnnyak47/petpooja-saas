const prisma = require('./backend/src/config/database').getDbClient();

async function checkChains() {
  try {
    const chains = await prisma.headOffice.findMany({
      include: {
        _count: { select: { outlets: true } },
        users: { select: { email: true, full_name: true } }
      }
    });
    console.log('--- HEAD OFFICES ---');
    console.log(JSON.stringify(chains, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkChains();
