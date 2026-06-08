/**
 * @fileoverview Backfill default Subscriptions for HeadOffices that have none active.
 *
 * The self-serve Subscription page calls GET /api/ho/my-subscription, which
 * returns `subscription: null` for any HeadOffice without an active Subscription
 * row, rendering an empty/error state. This script gives every such HeadOffice a
 * default subscription on the correct regional BillingPlan (seeded in P4).
 *
 * Selection: for each HeadOffice with NO Subscription where
 * is_deleted=false AND status='active', pick the default BillingPlan for the
 * head office's region (region match, is_active=true, is_deleted=false), choosing
 * the lowest sort_order (tie-break: lowest base_monthly_fee). If no plan exists
 * for the region, the head office is SKIPPED and logged.
 *
 * The Subscription `amount` is sourced from the chosen plan's `base_monthly_fee`
 * (BillingPlan has no single "price" column; it is a metered model whose recurring
 * fee lives in base_monthly_fee — confirmed against schema.prisma & prisma/seed.js).
 *
 * Idempotent: re-running skips head offices that already have an active sub.
 *
 * Usage:
 *   node scripts/backfill-subscriptions.js            # dry-run (default, zero writes)
 *   node scripts/backfill-subscriptions.js --apply    # perform creates
 *   node scripts/backfill-subscriptions.js --apply --force   # allow writes against prod-looking DATABASE_URL
 */

require('dotenv').config();
const { getDbClient } = require('../src/config/database');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');

/** Looks-like-production guard on the DATABASE_URL connection string. */
function looksLikeProd() {
  const url = (process.env.DATABASE_URL || '').toLowerCase();
  return url.includes('render.com') || url.includes('prod') || url.includes('production');
}

/**
 * Choose the default BillingPlan for a region.
 * Lowest sort_order wins; tie-break on lowest base_monthly_fee.
 * @param {Array} plans plans already filtered to the region
 * @returns {object|undefined}
 */
function pickPlan(plans) {
  return plans
    .slice()
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return Number(a.base_monthly_fee) - Number(b.base_monthly_fee);
    })[0];
}

async function main() {
  const prisma = getDbClient();

  if (APPLY && looksLikeProd() && !FORCE) {
    console.error(
      'Refusing to WRITE: DATABASE_URL looks like production. Re-run with --force to override.'
    );
    process.exit(1);
  }

  console.log(APPLY ? '=== APPLY mode (writes enabled) ===' : '=== DRY-RUN (no writes) ===');

  // Load all active, non-deleted plans once and group by region.
  const plans = await prisma.billingPlan.findMany({
    where: { is_active: true, is_deleted: false },
  });
  const plansByRegion = plans.reduce((acc, p) => {
    (acc[p.region] = acc[p.region] || []).push(p);
    return acc;
  }, {});

  // Head offices lacking an active, non-deleted subscription.
  const headOffices = await prisma.headOffice.findMany({
    where: {
      is_deleted: false,
      subscriptions: {
        none: { is_deleted: false, status: 'active' },
      },
    },
    select: { id: true, name: true, region: true, currency: true },
  });

  console.log(`Head offices without an active subscription: ${headOffices.length}\n`);

  const planned = [];
  const skipped = [];

  for (const ho of headOffices) {
    const regionPlans = plansByRegion[ho.region] || [];
    const plan = pickPlan(regionPlans);
    if (!plan) {
      skipped.push(ho);
      console.log(`  SKIP  ${ho.id}  "${ho.name}"  region=${ho.region}  (no active plan for region)`);
      continue;
    }
    planned.push({ ho, plan });
    console.log(
      `  PLAN  ${ho.id}  "${ho.name}"  region=${ho.region}  ->  ${plan.name}  amount=${plan.base_monthly_fee} ${ho.currency}`
    );
  }

  console.log(
    `\nSummary: ${planned.length} to backfill, ${skipped.length} skipped (no regional plan).`
  );

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to create subscriptions.');
    return;
  }

  let ok = 0;
  let failed = 0;
  const now = new Date();
  const expires = new Date(now.getTime());
  expires.setMonth(expires.getMonth() + 1); // monthly billing cycle

  for (const { ho, plan } of planned) {
    try {
      await prisma.subscription.create({
        data: {
          head_office_id: ho.id,
          plan_id: plan.id,
          plan_name: plan.name,
          amount: plan.base_monthly_fee,
          status: 'active',
          billing_cycle: 'monthly',
          starts_at: now,
          expires_at: expires,
          region: ho.region,
          currency: ho.currency,
        },
      });
      ok += 1;
      console.log(`  OK    ${ho.id}  "${ho.name}"`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL  ${ho.id}  "${ho.name}"  ${err.message}`);
    }
  }

  console.log(`\nApply complete: ${ok} created, ${failed} failed, ${skipped.length} skipped.`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getDbClient().$disconnect();
    } catch (_) {
      /* ignore disconnect errors */
    }
  });
