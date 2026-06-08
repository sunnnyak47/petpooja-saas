/**
 * One-off maintenance: correct stale `currency` values that disagree with `region`.
 *
 * Some AU-region rows have currency 'INR' (a data-entry inconsistency). The app
 * mostly drives behavior off `region`, but the stale `currency` value leaks into
 * the Settings UI. This script normalizes currency to match region:
 *   - region 'AU' && currency != 'AUD'  ->  'AUD'
 *   - region 'IN' && currency != 'INR'  ->  'INR'
 * Any other region is left untouched. Idempotent: the WHERE clause filters on the
 * mismatched currency, so a second run changes nothing.
 *
 * Covered models: HeadOffice, Outlet, Subscription, BillingPlan.
 *
 * Usage:
 *   node scripts/fix-region-currency.js            # dry-run (default): preview only, ZERO writes
 *   node scripts/fix-region-currency.js --apply    # perform the updates
 *   node scripts/fix-region-currency.js --apply --force  # override the production-DB guard
 */

require('dotenv').config();
const { getDbClient } = require('../src/config/database');

// Map: model name -> Prisma delegate accessor
const MODELS = ['headOffice', 'outlet', 'subscription', 'billingPlan'];

// region -> the currency it must have
const REGION_CURRENCY = {
  AU: 'AUD',
  IN: 'INR',
};

const PROD_MARKERS = ['render.com', 'prod', 'production'];

function looksLikeProd(databaseUrl) {
  if (!databaseUrl) return false;
  const lower = databaseUrl.toLowerCase();
  return PROD_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Build the WHERE clause for a given region: rows in that region whose currency
 * does not already equal the target currency.
 */
function mismatchWhere(region, targetCurrency) {
  return { region, currency: { not: targetCurrency } };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');

  const isProd = looksLikeProd(process.env.DATABASE_URL);
  if (isProd) {
    if (apply && !force) {
      console.error(
        '\n*** REFUSING TO RUN ***\n' +
          'DATABASE_URL looks like a PRODUCTION database. --apply requires --force.\n'
      );
      process.exit(2);
    }
    console.warn(
      '\n[WARNING] DATABASE_URL looks like a PRODUCTION database. ' +
        (apply ? 'Proceeding because --force was passed.' : 'Read-only preview only.') +
        '\n'
    );
  }

  console.log(apply ? '=== APPLY MODE (writes enabled) ===' : '=== DRY-RUN (no writes) ===');

  const prisma = getDbClient();

  try {
    let grandTotal = 0;

    for (const modelName of MODELS) {
      const delegate = prisma[modelName];
      if (!delegate) {
        console.warn(`  [skip] Prisma delegate "${modelName}" not found.`);
        continue;
      }

      for (const [region, targetCurrency] of Object.entries(REGION_CURRENCY)) {
        const where = mismatchWhere(region, targetCurrency);

        if (apply) {
          const result = await delegate.updateMany({
            where,
            data: { currency: targetCurrency },
          });
          if (result.count > 0) {
            grandTotal += result.count;
            console.log(
              `  [${modelName}] region=${region}: updated ${result.count} row(s) -> ${targetCurrency}`
            );
          }
        } else {
          const rows = await delegate.findMany({
            where,
            select: { id: true, region: true, currency: true },
          });
          for (const row of rows) {
            grandTotal += 1;
            console.log(
              `  [${modelName}] id=${row.id} region=${row.region} ` +
                `currency=${row.currency} -> ${targetCurrency}`
            );
          }
        }
      }
    }

    console.log(
      `\n${apply ? 'Updated' : 'Would update'} ${grandTotal} row(s) total` +
        (apply ? '.' : '. Re-run with --apply to write.')
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fix-region-currency failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
