/**
 * @fileoverview Per-channel delivery pricing + margin preview.
 *
 * Restaurants apply a price markup per delivery channel (Uber Eats, DoorDash,
 * Menulog, Swiggy, Zomato) to recover the aggregator's commission. This service
 * stores the markup config per outlet/platform in the `outletSetting` table and
 * computes a true-margin preview against the live menu.
 *
 * Config shape: { type: 'percent' | 'flat', value: number >= 0, enabled: boolean }
 *
 * @module modules/integrations/aggregator.pricing.service
 */

const prisma = require('../../config/database').getDbClient();

/**
 * Aggregator commission rates as a fraction of the channel (gross) price.
 * Declared locally to avoid a require cycle with aggregator.service.
 * @type {Record<string, number>}
 */
const COMMISSION = {
  swiggy: 0.18,
  zomato: 0.15,
  doordash: 0.2,
  menulog: 0.14,
  uber_eats: 0.3,
};

/** Default pricing config when none has been saved. */
const DEFAULT_CONFIG = { type: 'percent', value: 0, enabled: false };

/**
 * Rounds a number to 2 decimal places, guarding against float drift.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Builds the outletSetting key for a platform's markup config.
 * @param {string} platform
 * @returns {string}
 */
function markupKey(platform) {
  return `aggregator_${platform}_markup`;
}

/**
 * Validates and normalises a pricing config. Throws on invalid input.
 * @param {*} config
 * @returns {{ type: 'percent'|'flat', value: number, enabled: boolean }}
 */
function normaliseConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Pricing config is required');
  }
  const { type, value, enabled } = config;
  if (type !== 'percent' && type !== 'flat') {
    throw new Error("Pricing type must be 'percent' or 'flat'");
  }
  const numValue = Number(value);
  if (!Number.isFinite(numValue) || numValue < 0) {
    throw new Error('Pricing value must be a number >= 0');
  }
  return {
    type,
    value: numValue,
    enabled: Boolean(enabled),
  };
}

/**
 * Reads the saved markup config for an outlet/platform.
 * @param {string} outletId
 * @param {string} platform
 * @returns {Promise<{ type:'percent'|'flat', value:number, enabled:boolean }>}
 */
async function getChannelPricing(outletId, platform) {
  const row = await prisma.outletSetting.findFirst({
    where: {
      outlet_id: outletId,
      setting_key: markupKey(platform),
      is_deleted: false,
    },
  });
  if (!row || !row.setting_value) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const parsed = JSON.parse(row.setting_value);
    return normaliseConfig(parsed);
  } catch (_e) {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Persists the markup config for an outlet/platform.
 * Mirrors the find-then-update/create pattern (no generic upsert helper).
 * @param {string} outletId
 * @param {string} platform
 * @param {*} config
 * @returns {Promise<{ type:'percent'|'flat', value:number, enabled:boolean }>}
 */
async function setChannelPricing(outletId, platform, config) {
  const clean = normaliseConfig(config);
  const key = markupKey(platform);
  const value = JSON.stringify(clean);

  const existing = await prisma.outletSetting.findFirst({
    where: { outlet_id: outletId, setting_key: key, is_deleted: false },
  });

  if (existing) {
    await prisma.outletSetting.update({
      where: { id: existing.id },
      data: { setting_value: value },
    });
  } else {
    await prisma.outletSetting.create({
      data: {
        outlet_id: outletId,
        setting_key: key,
        setting_value: value,
        is_deleted: false,
      },
    });
  }
  return clean;
}

/**
 * Applies a markup config to a base price, returning the channel (gross) price.
 * Disabled config → base price unchanged. Result is rounded to 2dp, never < 0.
 * @param {number} basePrice
 * @param {{ type:'percent'|'flat', value:number, enabled:boolean }} config
 * @returns {number}
 */
function applyMarkup(basePrice, config) {
  const base = Number(basePrice) || 0;
  if (!config || !config.enabled) {
    return round2(Math.max(0, base));
  }
  const value = Number(config.value) || 0;
  let price;
  if (config.type === 'percent') {
    price = base * (1 + value / 100);
  } else {
    price = base + value;
  }
  return round2(Math.max(0, price));
}

/**
 * Computes a per-item margin preview for a platform's menu.
 * @param {string} outletId
 * @param {string} platform
 * @returns {Promise<object>}
 */
async function previewChannelMenu(outletId, platform) {
  const cfg = await getChannelPricing(outletId, platform);
  const commissionRate = COMMISSION[platform] || 0;
  const commissionPct = round2(commissionRate * 100);

  const menuItems = await prisma.menuItem.findMany({
    where: { outlet_id: outletId, is_active: true, is_deleted: false },
    orderBy: { name: 'asc' },
  });

  const items = menuItems.map((item) => {
    const basePrice = round2(Number(item.base_price));
    const channelPrice = applyMarkup(basePrice, cfg);
    const platformFee = round2(channelPrice * commissionRate);
    const netPayout = round2(channelPrice - platformFee);
    return {
      id: item.id,
      name: item.name,
      base_price: basePrice,
      channel_price: channelPrice,
      commission_pct: commissionPct,
      platform_fee: platformFee,
      net_payout: netPayout,
      margin_vs_base: round2(netPayout - basePrice),
    };
  });

  const itemCount = items.length;
  const sum = (key) => items.reduce((acc, i) => acc + i[key], 0);
  const avgChannelPrice = itemCount ? round2(sum('channel_price') / itemCount) : 0;
  const avgNetPayout = itemCount ? round2(sum('net_payout') / itemCount) : 0;

  return {
    platform,
    pricing: cfg,
    commission_pct: commissionPct,
    items,
    summary: {
      item_count: itemCount,
      avg_channel_price: avgChannelPrice,
      avg_net_payout: avgNetPayout,
    },
  };
}

module.exports = {
  COMMISSION,
  getChannelPricing,
  setChannelPricing,
  applyMarkup,
  previewChannelMenu,
};
