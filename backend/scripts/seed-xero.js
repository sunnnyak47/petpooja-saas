/**
 * Seed script: Import Xero sample data into PetPooja database
 *
 * Reads full_dataset.json and populates:
 *   - xero_connections  (1 row)
 *   - xero_accounts     (31 rows)
 *   - xero_transactions (5,426 rows)
 *
 * Usage:  node scripts/seed-xero.js
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DATA_PATH = path.join(
  require('os').homedir(),
  'Downloads',
  'full_dataset.json'
);

const BATCH_SIZE = 500;

async function main() {
  // ── 1. Load dataset ────────────────────────────────────────────────
  console.log(`Reading ${DATA_PATH} ...`);
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Data file not found: ${DATA_PATH}`);
  }
  const dataset = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

  const accountCount = dataset.chart_of_accounts.length;
  const txnCount = dataset.transactions.length;
  console.log(
    `Loaded: restaurant="${dataset.restaurant.name}", ` +
      `${accountCount} accounts, ${txnCount} transactions`
  );

  // ── 2. Find first active outlet ────────────────────────────────────
  const outlet = await prisma.outlet.findFirst({
    where: { is_deleted: false },
  });
  if (!outlet) {
    throw new Error('No active outlet found in database. Seed outlets first.');
  }
  console.log(`Using outlet: "${outlet.name}" (${outlet.id})`);

  // ── 3. Clean up existing Xero data for this outlet ─────────────────
  const existing = await prisma.xeroConnection.findFirst({
    where: { outlet_id: outlet.id, is_deleted: false },
  });

  if (existing) {
    console.log('Existing XeroConnection found — cleaning up...');
    // Delete in dependency order: transactions -> accounts -> connection
    const delTxn = await prisma.xeroTransaction.deleteMany({
      where: { connection_id: existing.id },
    });
    console.log(`  Deleted ${delTxn.count} transactions`);

    const delAcct = await prisma.xeroAccount.deleteMany({
      where: { connection_id: existing.id },
    });
    console.log(`  Deleted ${delAcct.count} accounts`);

    await prisma.xeroConnection.delete({ where: { id: existing.id } });
    console.log('  Deleted XeroConnection');
  }

  // ── 4. Create XeroConnection ───────────────────────────────────────
  process.stdout.write('Seeding XeroConnection... ');
  const connection = await prisma.xeroConnection.create({
    data: {
      outlet_id: outlet.id,
      org_name: dataset.restaurant.name,
      abn: dataset.restaurant.abn,
      address: dataset.restaurant.address,
      currency: 'AUD',
      country_code: 'AU',
      timezone: 'Australia/Perth',
      is_connected: true,
      last_synced: new Date(),
    },
  });
  console.log('done');

  // ── 5. Bulk-insert XeroAccounts ────────────────────────────────────
  process.stdout.write(`Seeding ${accountCount} accounts... `);
  const accountData = dataset.chart_of_accounts.map((acct) => ({
    connection_id: connection.id,
    code: String(acct.code),
    name: acct.name,
    type: acct.type,
    category: acct.category,
  }));

  await prisma.xeroAccount.createMany({ data: accountData });
  console.log('done');

  // ── 6. Bulk-insert XeroTransactions in batches ─────────────────────
  const totalBatches = Math.ceil(txnCount / BATCH_SIZE);
  console.log(
    `Seeding ${txnCount} transactions... (${totalBatches} batches of ${BATCH_SIZE})`
  );

  let insertedTotal = 0;

  for (let i = 0; i < totalBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, txnCount);
    const batch = dataset.transactions.slice(start, end);

    const batchData = batch.map((txn) => ({
      connection_id: connection.id,
      transaction_ref: txn.transaction_id,
      date: new Date(txn.date),
      type: txn.type,
      reference: txn.reference || null,
      account_code: String(txn.account_code),
      account_name: txn.account_name,
      account_type: txn.account_type,
      category: txn.category,
      description: txn.description || null,
      contact: txn.contact || null,
      amount_incl_gst: txn.amount_incl_gst,
      gst: txn.gst,
      net_amount: txn.net_amount,
      currency: txn.currency || 'AUD',
    }));

    const result = await prisma.xeroTransaction.createMany({ data: batchData });
    insertedTotal += result.count;

    process.stdout.write(`  batch ${i + 1}/${totalBatches}... `);
    console.log(`${result.count} rows`);
  }

  console.log('done');

  // ── 7. Summary ─────────────────────────────────────────────────────
  console.log('\n=== Seed Summary ===');
  console.log(`  XeroConnection : 1  (id: ${connection.id})`);
  console.log(`  XeroAccounts   : ${accountCount}`);
  console.log(`  XeroTransactions: ${insertedTotal}`);
  console.log('====================\n');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
