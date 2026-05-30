/**
 * One-off script: hard-wipe ALL menu data for parav@gmail.com outlet.
 * Sets is_deleted = true on every item, variant, addon group, addon item, combo,
 * and category that belongs to outlet b9a9c4e7-c25f-4840-b5cd-bbb7f89af3c4.
 *
 * Run:  node scripts/wipe_parav_menu.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OUTLET_ID = 'b9a9c4e7-c25f-4840-b5cd-bbb7f89af3c4';

async function main() {
  console.log('=== Wiping menu for outlet:', OUTLET_ID, '===');

  // 1. Count before
  const catsBefore  = await prisma.menuCategory.count({ where: { outlet_id: OUTLET_ID, is_deleted: false } });
  const itemsBefore = await prisma.menuItem.count({ where: { outlet_id: OUTLET_ID, is_deleted: false } });
  console.log(`Before: ${catsBefore} categories, ${itemsBefore} items`);

  // 2. Soft-delete everything (deepest first to avoid FK pain)
  const now = new Date();

  // itemAddon (addons attached to items in this outlet)
  const addonItemsDel = await prisma.itemAddon.updateMany({
    where: {
      menuItem: { outlet_id: OUTLET_ID },
      is_deleted: false,
    },
    data: { is_deleted: true, updated_at: now },
  });
  console.log('Item addons deleted:', addonItemsDel.count);

  // addonGroup
  const addonGroupsDel = await prisma.addonGroup.updateMany({
    where: {
      outlet_id: OUTLET_ID,
      is_deleted: false,
    },
    data: { is_deleted: true, updated_at: now },
  });
  console.log('Addon groups deleted:', addonGroupsDel.count);

  // itemVariant
  const variantsDel = await prisma.itemVariant.updateMany({
    where: {
      menuItem: { outlet_id: OUTLET_ID },
      is_deleted: false,
    },
    data: { is_deleted: true, updated_at: now },
  });
  console.log('Item variants deleted:', variantsDel.count);

  // comboItem
  const combosDel = await prisma.comboItem.updateMany({
    where: {
      menuItem: { outlet_id: OUTLET_ID },
      is_deleted: false,
    },
    data: { is_deleted: true, updated_at: now },
  });
  console.log('Combo items deleted:', combosDel.count);

  // itemCombo (combo definitions)
  const itemCombosDel = await prisma.itemCombo.updateMany({
    where: {
      outlet_id: OUTLET_ID,
      is_deleted: false,
    },
    data: { is_deleted: true, updated_at: now },
  });
  console.log('Item combos deleted:', itemCombosDel.count);

  // menuItem
  const itemsDel = await prisma.menuItem.updateMany({
    where: { outlet_id: OUTLET_ID, is_deleted: false },
    data: { is_deleted: true, updated_at: now },
  });
  console.log('Menu items deleted:', itemsDel.count);

  // menuCategory
  const catsDel = await prisma.menuCategory.updateMany({
    where: { outlet_id: OUTLET_ID, is_deleted: false },
    data: { is_deleted: true, updated_at: now },
  });
  console.log('Menu categories deleted:', catsDel.count);

  // 3. Verify
  const catsAfter  = await prisma.menuCategory.count({ where: { outlet_id: OUTLET_ID, is_deleted: false } });
  const itemsAfter = await prisma.menuItem.count({ where: { outlet_id: OUTLET_ID, is_deleted: false } });
  console.log(`\nAfter: ${catsAfter} categories, ${itemsAfter} items`);

  if (catsAfter === 0 && itemsAfter === 0) {
    console.log('✅ Menu fully wiped — outlet is now empty.');
  } else {
    console.log('⚠️  Some records may remain — check above counts.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
