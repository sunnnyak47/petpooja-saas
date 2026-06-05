/**
 * @fileoverview Usage-based SaaS billing — dunning lifecycle.
 *
 * Walks unpaid invoices through overdue → grace → suspend. Runs daily. Every
 * step is per-record guarded so one bad row never aborts the cycle.
 *
 *   issued  + past due_at            → invoice `overdue`, subscription `past_due`,
 *                                       grace_until = now + GRACE_DAYS
 *   past_due + grace_until elapsed   → subscription `grace` (final warning window)
 *   grace    + still unpaid past grace→ subscription `suspended`
 *
 * Suspension is reversed automatically when the invoice is paid
 * (see billing.collection.service#markInvoicePaid).
 *
 * @module modules/headoffice/billing.dunning.service
 */

const cron = require('node-cron');
const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');

const GRACE_DAYS = 7;

/**
 * Runs one dunning pass.
 * @returns {Promise<{overdue:number, graced:number, suspended:number}>}
 */
async function runDunningCycle() {
  const prisma = getDbClient();
  const now = new Date();
  let overdue = 0;
  let graced = 0;
  let suspended = 0;

  // 1. Issued invoices now past their due date → overdue + start the grace clock.
  const dueInvoices = await prisma.subscriptionInvoice.findMany({
    where: { status: 'issued', is_deleted: false, due_at: { lt: now } },
  });
  for (const inv of dueInvoices) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.subscriptionInvoice.update({ where: { id: inv.id }, data: { status: 'overdue' } });
        if (inv.subscription_id) {
          const graceUntil = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
          await tx.subscription.update({
            where: { id: inv.subscription_id },
            data: { status: 'past_due', grace_until: graceUntil },
          });
        }
      });
      overdue += 1;
    } catch (err) {
      logger.error('Dunning overdue step failed', { invoiceId: inv.id, error: err.message });
    }
  }

  // 2. past_due subscriptions whose grace window has elapsed but still have an
  //    unpaid (overdue) invoice → suspend. Otherwise nudge into the grace state.
  const pastDue = await prisma.subscription.findMany({
    where: { is_deleted: false, status: { in: ['past_due', 'grace'] } },
  });
  for (const sub of pastDue) {
    try {
      const unpaid = await prisma.subscriptionInvoice.findFirst({
        where: { subscription_id: sub.id, status: 'overdue', is_deleted: false },
      });
      if (!unpaid) continue; // nothing outstanding; leave for payment hook to clear

      const graceElapsed = sub.grace_until && sub.grace_until < now;
      if (graceElapsed && sub.status !== 'suspended') {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'suspended', suspended_at: now } });
        suspended += 1;
      } else if (sub.status === 'past_due') {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'grace' } });
        graced += 1;
      }
    } catch (err) {
      logger.error('Dunning suspend step failed', { subscriptionId: sub.id, error: err.message });
    }
  }

  logger.info('Dunning cycle complete', { overdue, graced, suspended });
  return { overdue, graced, suspended };
}

// Daily at 01:00 UTC.
cron.schedule('0 1 * * *', async () => {
  try {
    await runDunningCycle();
  } catch (error) {
    logger.error('Dunning cron failed', { error: error.message });
  }
});

module.exports = { runDunningCycle, GRACE_DAYS };
