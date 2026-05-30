/**
 * One-shot: soft-delete every order that the Live Orders tab (/running-orders)
 * would render. The tab fetches /orders?status=created,confirmed,held,billed.
 *
 * Soft-delete = is_deleted = true + status = cancelled.
 * Reversible by flipping is_deleted back to false.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  const LIVE_STATUSES = ['created', 'confirmed', 'held', 'billed'];

  const where = {
    status: { in: LIVE_STATUSES },
    is_deleted: false,
  };

  const before = await prisma.order.groupBy({
    by: ['status'], where, _count: { _all: true },
  });
  const total = before.reduce((s, r) => s + r._count._all, 0);

  console.log('Live-tab orders found:');
  before.forEach(r => console.log(`  ${r.status.padEnd(12)} ${r._count._all}`));
  console.log(`  TOTAL:        ${total}`);

  if (total === 0) {
    console.log('Nothing to clear.');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.order.updateMany({
    where,
    data: { is_deleted: true, status: 'cancelled', updated_at: new Date() },
  });
  console.log(`\nSoft-deleted ${result.count} order(s).`);

  await prisma.$disconnect();
})().catch(err => {
  console.error('Clear failed:', err.message);
  process.exit(1);
});
