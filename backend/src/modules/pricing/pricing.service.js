/**
 * @fileoverview Dynamic Pricing Engine Service.
 * Evaluates time / day / weather / season rules against menu items
 * and returns computed prices in real-time.
 * @module modules/pricing/pricing.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');

/* ─────────────────────────────────────────────────────────────
   SEASON DETECTION  (based on India's 3-season calendar)
───────────────────────────────────────────────────────────── */
function detectSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 6 && month <= 9)  return 'monsoon';
  if (month >= 3 && month <= 5)  return 'summer';
  if (month >= 10 && month <= 2) return 'winter';
  return 'winter';
}

/* ─────────────────────────────────────────────────────────────
   TIME / DAY HELPERS
───────────────────────────────────────────────────────────── */
function nowIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return {
    hour: ist.getHours(),
    minute: ist.getMinutes(),
    dayOfWeek: ist.getDay(),         // 0 = Sun
    timeStr: `${String(ist.getHours()).padStart(2,'0')}:${String(ist.getMinutes()).padStart(2,'0')}`,
  };
}

function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function inTimeWindow(start, end, currentTime) {
  if (!start || !end) return true;
  const cur = timeToMins(currentTime);
  const s   = timeToMins(start);
  const e   = timeToMins(end);
  return e > s ? (cur >= s && cur <= e) : (cur >= s || cur <= e); // crosses midnight
}

function dayMatches(daysArray, dayOfWeek) {
  if (!daysArray || !Array.isArray(daysArray) || daysArray.length === 0) return true;
  return daysArray.includes(dayOfWeek);
}

/* ─────────────────────────────────────────────────────────────
   RULE EVALUATION
───────────────────────────────────────────────────────────── */

/**
 * Evaluates whether a pricing rule is currently active.
 * @param {object} rule  - PricingRule row
 * @param {object} ctx   - { timeStr, dayOfWeek, season, weather }
 */
function isRuleActive(rule, ctx) {
  const now = new Date();

  // Date validity window
  if (rule.valid_from && new Date(rule.valid_from) > now) return false;
  if (rule.valid_until && new Date(rule.valid_until) < now) return false;

  // Time window
  if (rule.time_start && rule.time_end) {
    if (!inTimeWindow(rule.time_start, rule.time_end, ctx.timeStr)) return false;
  }

  // Day of week
  const days = rule.days_of_week;
  if (Array.isArray(days) && days.length > 0) {
    if (!days.includes(ctx.dayOfWeek)) return false;
  }

  // Season
  if (rule.season_trigger && rule.season_trigger !== 'any') {
    if (rule.season_trigger !== ctx.season) return false;
  }

  // Weather (passed from frontend or auto-detected by location)
  if (rule.weather_trigger && rule.weather_trigger !== 'any') {
    if (!ctx.weather || rule.weather_trigger !== ctx.weather) return false;
  }

  return true;
}

/**
 * Checks if a menu item is targeted by a rule.
 */
function itemMatchesTarget(rule, item) {
  const target = rule.item_target || 'all';
  if (target === 'all') return true;

  const ids = Array.isArray(rule.target_ids) ? rule.target_ids : [];

  if (target === 'category') return ids.includes(item.category_id);
  if (target === 'specific') return ids.includes(item.id);

  if (target === 'slow_movers') {
    // Items with < 5 orders in past 7 days (marked via is_bestseller = false)
    return !item.is_bestseller;
  }
  if (target === 'bestsellers') return item.is_bestseller;

  if (target === 'tag') {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    return tags.includes(rule.target_tag);
  }

  return false;
}

/**
 * Compute the adjusted price for an item given a rule.
 */
function applyRule(rule, basePrice) {
  const val = Number(rule.action_value);
  let adjusted = basePrice;

  if (rule.action_type === 'discount') {
    if (rule.action_unit === 'percent') {
      let disc = basePrice * (val / 100);
      if (rule.max_discount_amt) disc = Math.min(disc, Number(rule.max_discount_amt));
      adjusted = Math.max(0, basePrice - disc);
    } else {
      adjusted = Math.max(0, basePrice - val);
    }
  } else if (rule.action_type === 'surcharge') {
    if (rule.action_unit === 'percent') {
      adjusted = basePrice + basePrice * (val / 100);
    } else {
      adjusted = basePrice + val;
    }
  } else if (rule.action_type === 'fixed_price') {
    adjusted = val;
  }

  return Math.round(adjusted * 100) / 100;
}

/* ─────────────────────────────────────────────────────────────
   RULE CRUD
───────────────────────────────────────────────────────────── */

async function listRules(outletId) {
  const prisma = getDbClient();
  return prisma.pricingRule.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    orderBy: [{ priority: 'asc' }, { created_at: 'desc' }],
  });
}

async function getRule(id, outletId) {
  const prisma = getDbClient();
  const rule = await prisma.pricingRule.findFirst({ where: { id, outlet_id: outletId, is_deleted: false } });
  if (!rule) throw new NotFoundError('Pricing rule not found');
  return rule;
}

async function createRule(outletId, data) {
  const prisma = getDbClient();
  const rule = await prisma.pricingRule.create({
    data: {
      outlet_id: outletId,
      name: data.name,
      description: data.description || null,
      is_active: data.is_active ?? true,
      priority: data.priority ?? 10,
      trigger_type: data.trigger_type,
      time_start: data.time_start || null,
      time_end: data.time_end || null,
      days_of_week: data.days_of_week || [],
      weather_trigger: data.weather_trigger || null,
      season_trigger: data.season_trigger || null,
      item_target: data.item_target || 'all',
      target_ids: data.target_ids || [],
      target_tag: data.target_tag || null,
      action_type: data.action_type,
      action_value: data.action_value,
      action_unit: data.action_unit || 'percent',
      max_discount_amt: data.max_discount_amt || null,
      min_order_value: data.min_order_value || null,
      valid_from: data.valid_from ? new Date(data.valid_from) : null,
      valid_until: data.valid_until ? new Date(data.valid_until) : null,
    },
  });
  logger.info('Pricing rule created', { id: rule.id, name: rule.name });
  return rule;
}

async function updateRule(id, outletId, data) {
  const prisma = getDbClient();
  await getRule(id, outletId);
  const rule = await prisma.pricingRule.update({
    where: { id },
    data: {
      ...data,
      days_of_week: data.days_of_week ?? undefined,
      target_ids:   data.target_ids   ?? undefined,
      valid_from:   data.valid_from   ? new Date(data.valid_from)  : undefined,
      valid_until:  data.valid_until  ? new Date(data.valid_until) : undefined,
    },
  });
  return rule;
}

async function deleteRule(id, outletId) {
  const prisma = getDbClient();
  await getRule(id, outletId);
  return prisma.pricingRule.update({ where: { id }, data: { is_deleted: true } });
}

async function toggleRule(id, outletId) {
  const prisma = getDbClient();
  const rule = await getRule(id, outletId);
  return prisma.pricingRule.update({ where: { id }, data: { is_active: !rule.is_active } });
}

/* ─────────────────────────────────────────────────────────────
   LIVE PRICE COMPUTATION  (core engine)
───────────────────────────────────────────────────────────── */

/**
 * Returns the currently active rules and computed prices for all menu items.
 * Called by POS on every load + every 60s refresh.
 * @param {string} outletId
 * @param {string} [weather]  - optional: 'rain' | 'sunny' | 'cold' | 'hot'
 */
async function computeLivePrices(outletId, weather) {
  const prisma = getDbClient();

  const [rules, items] = await Promise.all([
    prisma.pricingRule.findMany({
      where: { outlet_id: outletId, is_active: true, is_deleted: false },
      orderBy: { priority: 'asc' },
    }),
    prisma.menuItem.findMany({
      where: { outlet_id: outletId, is_active: true, is_deleted: false },
      select: {
        id: true, name: true, base_price: true, category_id: true,
        is_bestseller: true, food_type: true, tags: true,
      },
    }),
  ]);

  const ctx = {
    ...nowIST(),
    season: detectSeason(),
    weather: weather || null,
  };

  const activeRules = rules.filter(r => isRuleActive(r, ctx));

  // Build price map: item_id → { adjusted_price, rule, saving, pct_change }
  const priceMap = {};
  for (const item of items) {
    const base = Number(item.base_price);
    let adjusted = base;
    let appliedRule = null;

    for (const rule of activeRules) {
      if (itemMatchesTarget(rule, item)) {
        adjusted = applyRule(rule, base);
        appliedRule = rule;
        break; // first matching rule by priority wins
      }
    }

    priceMap[item.id] = {
      item_id:       item.id,
      name:          item.name,
      base_price:    base,
      active_price:  adjusted,
      saving:        Math.round((base - adjusted) * 100) / 100,
      pct_change:    base > 0 ? Math.round(((adjusted - base) / base) * 100) : 0,
      rule_applied:  appliedRule ? { id: appliedRule.id, name: appliedRule.name, action_type: appliedRule.action_type } : null,
    };
  }

  return {
    price_map: priceMap,
    active_rules: activeRules.map(r => ({
      id: r.id, name: r.name, trigger_type: r.trigger_type,
      action_type: r.action_type, action_value: Number(r.action_value), action_unit: r.action_unit,
      item_target: r.item_target,
    })),
    context: ctx,
    total_items_affected: Object.values(priceMap).filter(p => p.saving !== 0).length,
  };
}

/**
 * Log a pricing rule application (called when POS adds item to cart).
 */
async function logApplication(ruleId, outletId, menuItemId, originalPrice, appliedPrice) {
  const prisma = getDbClient();
  await prisma.pricingRuleApplication.create({
    data: {
      rule_id: ruleId,
      outlet_id: outletId,
      menu_item_id: menuItemId,
      original_price: originalPrice,
      applied_price: appliedPrice,
      saving: originalPrice - appliedPrice,
    },
  }).catch(() => {}); // non-blocking
}

/**
 * Analytics — how much each rule saved / surged.
 */
async function getRuleAnalytics(outletId, from, to) {
  const prisma = getDbClient();
  const where = { outlet_id: outletId };
  if (from || to) {
    where.applied_at = {};
    if (from) where.applied_at.gte = new Date(from);
    if (to)   where.applied_at.lte = new Date(to);
  }

  const [apps, byRule] = await Promise.all([
    prisma.pricingRuleApplication.aggregate({
      where,
      _count: { id: true },
      _sum: { saving: true },
    }),
    prisma.pricingRuleApplication.groupBy({
      by: ['rule_id'],
      where,
      _count: { id: true },
      _sum: { saving: true },
    }),
  ]);

  const rules = await prisma.pricingRule.findMany({
    where: { outlet_id: outletId, is_deleted: false },
    select: { id: true, name: true, action_type: true },
  });
  const ruleMap = Object.fromEntries(rules.map(r => [r.id, r]));

  return {
    total_applications: apps._count.id || 0,
    total_saving: apps._sum.saving || 0,
    by_rule: byRule.map(b => ({
      rule_id: b.rule_id,
      rule_name: ruleMap[b.rule_id]?.name || 'Unknown',
      action_type: ruleMap[b.rule_id]?.action_type,
      applications: b._count.id,
      total_saving: b._sum.saving || 0,
    })),
  };
}

/* ─────────────────────────────────────────────────────────────
   SEED DEFAULTS (called once per outlet on first setup)
───────────────────────────────────────────────────────────── */
async function seedDefaultRules(outletId) {
  const prisma = getDbClient();
  const existing = await prisma.pricingRule.count({ where: { outlet_id: outletId, is_deleted: false } });
  if (existing > 0) return [];

  const defaults = [
    {
      outlet_id: outletId,
      name: 'Lunch Happy Hour',
      description: 'Auto 10% off on slow-moving items between 12pm–3pm',
      trigger_type: 'time_slot',
      time_start: '12:00', time_end: '15:00',
      days_of_week: [1,2,3,4,5], // Mon–Fri
      item_target: 'slow_movers',
      action_type: 'discount', action_value: 10, action_unit: 'percent',
      priority: 10, is_active: true,
    },
    {
      outlet_id: outletId,
      name: 'Friday Night Surge',
      description: 'Auto 15% surcharge on bestsellers Friday 7pm–11pm',
      trigger_type: 'day_of_week',
      time_start: '19:00', time_end: '23:00',
      days_of_week: [5], // Friday
      item_target: 'bestsellers',
      action_type: 'surcharge', action_value: 15, action_unit: 'percent',
      priority: 5, is_active: true,
    },
    {
      outlet_id: outletId,
      name: 'Monsoon Hot Beverages Promo',
      description: 'Promote hot beverages during monsoon season with 20% off',
      trigger_type: 'weather',
      season_trigger: 'monsoon',
      item_target: 'tag',
      target_tag: 'hot_beverage',
      action_type: 'discount', action_value: 20, action_unit: 'percent',
      priority: 8, is_active: true,
    },
    {
      outlet_id: outletId,
      name: 'Weekend Breakfast Deal',
      description: 'Flat ₹30 off on all items Saturday & Sunday 8am–11am',
      trigger_type: 'time_slot',
      time_start: '08:00', time_end: '11:00',
      days_of_week: [6, 0], // Sat, Sun
      item_target: 'all',
      action_type: 'discount', action_value: 30, action_unit: 'flat',
      priority: 20, is_active: false,
    },
    {
      outlet_id: outletId,
      name: 'Summer Coolers Boost',
      description: 'Cold drinks & juices auto-discounted 12% during summer',
      trigger_type: 'weather',
      season_trigger: 'summer',
      item_target: 'tag',
      target_tag: 'cold_beverage',
      action_type: 'discount', action_value: 12, action_unit: 'percent',
      priority: 9, is_active: true,
    },
  ];

  const created = await prisma.pricingRule.createMany({ data: defaults });
  logger.info('Seeded default pricing rules', { outletId, count: created.count });
  return defaults;
}

module.exports = {
  listRules, getRule, createRule, updateRule, deleteRule, toggleRule,
  computeLivePrices, logApplication, getRuleAnalytics, seedDefaultRules,
  detectSeason, nowIST,
};
