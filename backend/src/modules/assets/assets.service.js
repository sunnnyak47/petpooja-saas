/**
 * assets.service.js
 *
 * Fixed-asset register and straight-line depreciation for the AU restaurant
 * POS. Each monthly depreciation run posts a balanced journal entry:
 *   Dr 720 Depreciation Expense
 *   Cr 620 Accumulated Depreciation
 *
 * Prisma Decimals arrive as strings/Decimal objects so we always wrap with
 * Number() before arithmetic and round money to 2 dp.
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const posting = require('../accounting/accounting.posting.service');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Last day of the month for a 'YYYY-MM' period, normalised to UTC midnight so
// it maps cleanly onto a @db.Date column.
function lastDayOfPeriod(period) {
  const [year, month] = period.split('-').map((p) => parseInt(p, 10));
  // Day 0 of the next month == last day of this month.
  return new Date(Date.UTC(year, month, 0));
}

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------
async function ensureAssetAccounts(outletId) {
  const prisma = getDbClient();

  const accounts = [
    { code: '720', name: 'Depreciation Expense', type: 'EXPENSE', subtype: 'operating' },
    { code: '620', name: 'Accumulated Depreciation', type: 'ASSET', subtype: 'fixed_asset' },
  ];

  for (const acct of accounts) {
    await prisma.chartAccount.upsert({
      where: { outlet_id_code: { outlet_id: outletId, code: acct.code } },
      update: {
        name: acct.name,
        type: acct.type,
        subtype: acct.subtype,
        is_active: true,
        is_deleted: false,
      },
      create: {
        outlet_id: outletId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        subtype: acct.subtype,
        gst: false,
      },
    });
  }

  return { ensured: accounts.map((a) => a.code) };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function listAssets(outletId) {
  const prisma = getDbClient();
  return prisma.fixedAsset.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { created_at: 'desc' },
  });
}

async function createAsset(
  outletId,
  { name, category, purchase_date, cost, salvage_value, useful_life_months, method }
) {
  const prisma = getDbClient();

  if (!name || String(name).trim() === '') {
    throw new Error('createAsset: name is required');
  }
  const costNum = Number(cost);
  if (!Number.isFinite(costNum) || costNum <= 0) {
    throw new Error('createAsset: cost must be a positive number');
  }
  if (!purchase_date) {
    throw new Error('createAsset: purchase_date is required');
  }
  const purchaseDate = new Date(purchase_date);
  if (Number.isNaN(purchaseDate.getTime())) {
    throw new Error('createAsset: purchase_date is invalid');
  }

  const salvageNum = round2(salvage_value || 0);
  const lifeMonths = parseInt(useful_life_months, 10) || 0;

  return prisma.fixedAsset.create({
    data: {
      outlet_id: outletId,
      name: String(name).trim(),
      category: category || null,
      purchase_date: purchaseDate,
      cost: round2(costNum),
      salvage_value: salvageNum,
      useful_life_months: lifeMonths,
      method: method || 'straight_line',
      accumulated_depreciation: 0,
      is_disposed: false,
    },
  });
}

async function updateAsset(outletId, id, patch = {}) {
  const prisma = getDbClient();

  const existing = await prisma.fixedAsset.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!existing) {
    throw new Error('updateAsset: asset not found');
  }

  const data = {};
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.category !== undefined) data.category = patch.category || null;
  if (patch.salvage_value !== undefined) data.salvage_value = round2(patch.salvage_value || 0);
  if (patch.useful_life_months !== undefined) {
    data.useful_life_months = parseInt(patch.useful_life_months, 10) || 0;
  }
  if (patch.is_disposed !== undefined) data.is_disposed = Boolean(patch.is_disposed);

  return prisma.fixedAsset.update({
    where: { id },
    data,
  });
}

async function deleteAsset(outletId, id) {
  const prisma = getDbClient();

  const existing = await prisma.fixedAsset.findFirst({
    where: { id, outlet_id: outletId, is_deleted: false },
  });
  if (!existing) {
    throw new Error('deleteAsset: asset not found');
  }

  await prisma.fixedAsset.update({
    where: { id },
    data: { is_deleted: true },
  });
  return { deleted: true, id };
}

// ---------------------------------------------------------------------------
// Depreciation
// ---------------------------------------------------------------------------
function monthlyDepreciation(asset) {
  const cost = Number(asset.cost) || 0;
  const salvage = Number(asset.salvage_value) || 0;
  const life = parseInt(asset.useful_life_months, 10) || 0;
  if (life <= 0) return 0;
  const depreciable = cost - salvage;
  if (depreciable <= 0) return 0;
  return round2(depreciable / life);
}

async function runDepreciation(outletId, period, createdBy) {
  if (!period || !PERIOD_RE.test(period)) {
    throw new Error("runDepreciation: period must be 'YYYY-MM'");
  }

  const prisma = getDbClient();
  const entryDate = lastDayOfPeriod(period);

  const assets = await prisma.fixedAsset.findMany({
    where: { outlet_id: outletId, is_deleted: false, is_disposed: false },
  });

  let assetsDepreciated = 0;
  let totalAmount = 0;

  for (const asset of assets) {
    try {
      const cost = Number(asset.cost) || 0;
      const salvage = Number(asset.salvage_value) || 0;
      const accumulated = Number(asset.accumulated_depreciation) || 0;
      const maxDepreciable = round2(cost - salvage);

      const remaining = round2(maxDepreciable - accumulated);
      if (remaining <= 0) continue;

      // Skip if an entry already exists for this asset/period.
      const existing = await prisma.depreciationEntry.findUnique({
        where: { asset_id_period: { asset_id: asset.id, period } },
      });
      if (existing) continue;

      // Cap so accumulated never exceeds cost - salvage.
      let amount = monthlyDepreciation(asset);
      if (amount <= 0) continue;
      if (amount > remaining) amount = remaining;
      amount = round2(amount);
      if (amount <= 0) continue;

      await ensureAssetAccounts(outletId);

      const journal = await posting.postJournal(outletId, {
        entry_date: entryDate,
        // source_id must be a valid UUID column; put the period in `source` so the
        // (source, source_id) idempotency key stays unique per asset per month.
        source: `depr-${period}`,
        source_id: asset.id,
        reference: period,
        memo: `Depreciation ${period} — ${asset.name}`,
        created_by: createdBy || null,
        lines: [
          { account_code: '720', debit: amount, credit: 0, description: `Depreciation ${period}` },
          { account_code: '620', debit: 0, credit: amount, description: `Depreciation ${period}` },
        ],
      });

      await prisma.depreciationEntry.create({
        data: {
          asset_id: asset.id,
          outlet_id: outletId,
          period,
          amount,
          journal_entry_id: journal && journal.id ? journal.id : null,
        },
      });

      await prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { accumulated_depreciation: round2(accumulated + amount) },
      });

      assetsDepreciated += 1;
      totalAmount = round2(totalAmount + amount);
    } catch (err) {
      // Defensive: one asset failing should not abort the whole run.
      logger.error(
        `runDepreciation: failed for asset ${asset.id} (outlet ${outletId}, period ${period}): ${err.message}`
      );
    }
  }

  return { period, assets_depreciated: assetsDepreciated, total_amount: totalAmount };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
async function getAssetRegister(outletId) {
  const prisma = getDbClient();

  const assets = await prisma.fixedAsset.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: { created_at: 'desc' },
  });

  let totalCost = 0;
  let totalAccumulated = 0;
  let totalBookValue = 0;

  const rows = assets.map((a) => {
    const cost = round2(a.cost);
    const accumulated = round2(a.accumulated_depreciation);
    const bookValue = round2(cost - accumulated);

    totalCost = round2(totalCost + cost);
    totalAccumulated = round2(totalAccumulated + accumulated);
    totalBookValue = round2(totalBookValue + bookValue);

    return {
      id: a.id,
      name: a.name,
      category: a.category,
      purchase_date: a.purchase_date,
      method: a.method,
      useful_life_months: a.useful_life_months,
      is_disposed: a.is_disposed,
      cost,
      accumulated_depreciation: accumulated,
      book_value: bookValue,
    };
  });

  return {
    assets: rows,
    totals: {
      cost: totalCost,
      accumulated_depreciation: totalAccumulated,
      book_value: totalBookValue,
    },
  };
}

module.exports = {
  ensureAssetAccounts,
  listAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  monthlyDepreciation,
  runDepreciation,
  getAssetRegister,
};
