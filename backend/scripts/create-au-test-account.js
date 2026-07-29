/**
 * create-au-test-account.js — one-shot provisioner for an Australian test tenant.
 *
 * Creates (idempotently) a full, LOGIN-READY Australian restaurant so the desktop
 * app / web app can be tested against production:
 *   • HeadOffice   — region AU, currency AUD, timezone Australia/Sydney, PRO plan
 *   • Owner user   — email/phone/password (owner role, primary), is_active
 *   • Outlet       — country Australia, AUD, Sydney tz, with a code
 *   • Menu         — 3 categories + a handful of AUD items (10% GST) so POS shows data
 *   • Tables       — 6 dine-in tables so the Tables/offline screens have content
 *
 * Run it in the backend's own environment (it uses DATABASE_URL from env):
 *   Render dashboard → backend service → Shell:
 *     node scripts/create-au-test-account.js
 *   or locally with a prod connection string:
 *     DATABASE_URL="postgres://…" node backend/scripts/create-au-test-account.js
 *
 * Credentials come from env (nothing secret is committed). Any not provided are
 * defaulted / randomly generated and PRINTED once at the end:
 *   AU_OWNER_EMAIL     (default au.owner@msrm.com.au)
 *   AU_OWNER_PHONE     (default +61400000001)
 *   AU_OWNER_NAME      (default "AU Demo Owner")
 *   AU_OWNER_PASSWORD  (default: a strong random password, printed below)
 *   AU_RESTAURANT_NAME (default "MS-RM Demo AU")
 *
 * Re-running is safe: if the owner email already exists, the script just resets
 * that account's password (and unlocks it) and prints the new credentials.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

/** Strong random password that satisfies the app's complexity rule
 *  (>=1 lower, upper, digit, special; 8–50 chars). */
function genPassword() {
  return `Aa1@${crypto.randomBytes(6).toString('hex')}`; // e.g. Aa1@9f3c0b7a2e11
}

const EMAIL = (process.env.AU_OWNER_EMAIL || 'au.owner@msrm.com.au').toLowerCase().trim();
const PHONE = (process.env.AU_OWNER_PHONE || '+61400000001').trim();
const OWNER_NAME = process.env.AU_OWNER_NAME || 'AU Demo Owner';
const PASSWORD = process.env.AU_OWNER_PASSWORD || genPassword();
const RESTAURANT = process.env.AU_RESTAURANT_NAME || 'MS-RM Demo AU';
const CITY = 'Sydney';

const AU = {
  region: 'AU',
  currency: 'AUD',
  timezone: 'Australia/Sydney',
  country_code: 'AU',
  country: 'Australia',
  regulations_profile: 'AUSTRALIA',
};

const CATEGORIES = [
  {
    name: 'Starters',
    items: [
      { name: 'Garlic Bread', base_price: 8.5, food_type: 'veg' },
      { name: 'Chicken Wings', base_price: 14.0, food_type: 'non_veg' },
      { name: 'Loaded Fries', base_price: 12.0, food_type: 'veg' },
    ],
  },
  {
    name: 'Mains',
    items: [
      { name: 'Margherita Pizza', base_price: 18.0, food_type: 'veg' },
      { name: 'Beef Burger', base_price: 22.5, food_type: 'non_veg' },
      { name: 'Grilled Barramundi', base_price: 32.0, food_type: 'non_veg' },
      { name: 'Veggie Pasta', base_price: 19.5, food_type: 'veg' },
    ],
  },
  {
    name: 'Drinks',
    items: [
      { name: 'Flat White', base_price: 5.0, food_type: 'veg' },
      { name: 'Sparkling Water', base_price: 4.5, food_type: 'veg' },
      { name: 'House Lemonade', base_price: 6.0, food_type: 'veg' },
    ],
  },
];

async function seedMenuAndTables(tx, outletId) {
  let itemCount = 0;
  for (let c = 0; c < CATEGORIES.length; c++) {
    const cat = CATEGORIES[c];
    const category = await tx.menuCategory.create({
      data: { outlet_id: outletId, name: cat.name, display_order: c, is_active: true },
    });
    for (let i = 0; i < cat.items.length; i++) {
      const it = cat.items[i];
      await tx.menuItem.create({
        data: {
          outlet_id: outletId,
          category_id: category.id,
          name: it.name,
          base_price: it.base_price,
          food_type: it.food_type,
          gst_rate: 10.0, // Australian GST
          kitchen_station: cat.name === 'Drinks' ? 'BAR' : 'KITCHEN',
          display_order: i,
          is_active: true,
          is_available: true,
        },
      });
      itemCount++;
    }
  }

  for (let t = 1; t <= 6; t++) {
    await tx.table.create({
      data: {
        outlet_id: outletId,
        table_number: String(t),
        seating_capacity: t <= 2 ? 2 : t <= 4 ? 4 : 6,
        status: 'available',
        display_order: t,
      },
    });
  }
  return { itemCount, tableCount: 6 };
}

async function main() {
  console.log('\n──────────────────────────────────────────────');
  console.log('  MS-RM · Create Australian test account');
  console.log('──────────────────────────────────────────────');

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: EMAIL }, { phone: PHONE }], is_deleted: false },
  });

  const password_hash = await bcrypt.hash(PASSWORD, 12);

  if (existing) {
    // Idempotent path: reset the existing account so you get known, working creds.
    await prisma.user.update({
      where: { id: existing.id },
      data: { password_hash, is_active: true, failed_login_attempts: 0, locked_until: null },
    });
    console.log('\n⚠  An account already existed for that email/phone — reset its password instead.');
    console.log('\n  LOGIN (existing account, password reset):');
    console.log('    Email    :', existing.email);
    console.log('    Password :', PASSWORD);
    console.log('\n  (If this is not the account you wanted, re-run with a different AU_OWNER_EMAIL.)\n');
    return;
  }

  const ownerRole =
    (await prisma.role.findFirst({ where: { name: 'owner' } })) ||
    (await prisma.role.create({ data: { name: 'owner', display_name: 'Restaurant Owner', is_system: true } }));

  const result = await prisma.$transaction(async (tx) => {
    const headOffice = await tx.headOffice.create({
      data: {
        name: RESTAURANT,
        legal_name: RESTAURANT,
        contact_email: EMAIL,
        contact_phone: PHONE,
        whatsapp_number: PHONE,
        is_active: true,
        language: 'en',
        plan: 'PRO',
        region: AU.region,
        currency: AU.currency,
        timezone: AU.timezone,
        country_code: AU.country_code,
        regulations_profile: AU.regulations_profile,
        metadata: { order_types: ['dine_in', 'takeaway', 'delivery'] },
      },
    });

    const user = await tx.user.create({
      data: {
        full_name: OWNER_NAME,
        email: EMAIL,
        phone: PHONE,
        password_hash,
        head_office_id: headOffice.id,
        is_active: true,
      },
    });

    const code = `${RESTAURANT.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'AUD'}${Math.floor(1000 + Math.random() * 9000)}`;
    const outlet = await tx.outlet.create({
      data: {
        head_office_id: headOffice.id,
        name: `${RESTAURANT} - ${CITY}`,
        code,
        type: 'restaurant',
        city: CITY,
        phone: PHONE,
        email: EMAIL,
        country: AU.country,
        currency: AU.currency,
        timezone: AU.timezone,
        tables_count: 6,
        is_active: true,
      },
    });

    await tx.userRole.create({
      data: { user_id: user.id, role_id: ownerRole.id, outlet_id: outlet.id, is_primary: true },
    });

    const seeded = await seedMenuAndTables(tx, outlet.id);

    // 30-day trial-style subscription so plan gating is satisfied.
    await tx.subscription.create({
      data: {
        head_office_id: headOffice.id,
        plan_name: 'PRO',
        status: 'active',
        amount: 0,
        starts_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billing_cycle: 'annual',
      },
    }).catch((e) => console.warn('  (subscription create skipped:', e.message, ')'));

    return { headOffice, user, outlet, seeded };
  });

  console.log('\n✅ Australian test tenant created.\n');
  console.log('  Restaurant :', result.headOffice.name, `(region ${AU.region}, ${AU.currency}, ${AU.timezone})`);
  console.log('  Outlet     :', result.outlet.name, `(code ${result.outlet.code})`);
  console.log('  Seeded     :', `${result.seeded.itemCount} menu items, ${result.seeded.tableCount} tables`);
  console.log('\n  ── LOGIN DETAILS ─────────────────────────────');
  console.log('    Email    :', result.user.email);
  console.log('    Password :', PASSWORD);
  console.log('    Role     : owner');
  console.log('  ──────────────────────────────────────────────');
  console.log('\n  Log in ONLINE the first time so the desktop app caches this');
  console.log('  outlet\'s menu/tables into local SQLite; then it works offline.');
  console.log('  Change the password after first login (Settings → Security).\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Failed to create AU test account:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
