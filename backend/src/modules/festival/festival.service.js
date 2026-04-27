/**
 * @fileoverview Hyperlocal Festival Mode Service.
 * Detects upcoming festivals by region/country, auto-suggests menus,
 * themes, offers. State-specific: Onam → Sadhya, Lohri → Punjabi specials, etc.
 * @module modules/festival/festival.service
 */

const { getDbClient } = require('../../config/database');
const logger = require('../../config/logger');
const { NotFoundError, BadRequestError } = require('../../utils/errors');
const { generateCalendar, INDIA_REGIONS, AU_REGIONS } = require('./festival.data');

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

/**
 * Get today in YYYY-MM-DD (IST for IN, AEST for AU).
 */
function todayStr(country) {
  const tz = country === 'AU' ? 'Australia/Sydney' : 'Asia/Kolkata';
  return new Date().toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD
}

/**
 * Days between today and a future date.
 */
function daysUntil(dateStr, country) {
  const today = new Date(todayStr(country));
  const target = new Date(dateStr);
  return Math.ceil((target - today) / 86400000);
}

/**
 * Get the upcoming festivals for a country+region within a look-ahead window.
 */
function getUpcomingFestivals(country, regionCode, daysAhead = 30) {
  const today = todayStr(country);
  const year  = new Date(today).getFullYear();

  // generate current year + next year to handle year-end wrap
  const cal = [
    ...generateCalendar(year),
    ...generateCalendar(year + 1),
  ];

  return cal
    .filter(f => {
      // Country match
      if (f.country !== 'BOTH' && f.country !== country) return false;
      // Region match
      const inRegion = !regionCode ||
        f.regions.includes('all') ||
        f.regions.includes(regionCode);
      if (!inRegion) return false;
      // Date window: started recently (up to 2 days ago) or upcoming
      const dtl = daysUntil(f.start, country);
      const dte = daysUntil(f.end, country);
      return dte >= -1 && dtl <= daysAhead;
    })
    .map(f => ({
      ...f,
      days_until_start: daysUntil(f.start, country),
      days_until_end:   daysUntil(f.end, country),
      is_ongoing:       daysUntil(f.start, country) <= 0 && daysUntil(f.end, country) >= 0,
      urgency: daysUntil(f.start, country) <= 3 ? 'high' : daysUntil(f.start, country) <= 7 ? 'medium' : 'low',
    }))
    .sort((a, b) => a.days_until_start - b.days_until_start);
}

/* ─────────────────────────────────────────────────────────────
   OUTLET CONTEXT
───────────────────────────────────────────────────────────── */

async function getOutletContext(outletId) {
  const prisma = getDbClient();
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, name: true, city: true, state: true, country: true },
  });
  if (!outlet) throw new NotFoundError('Outlet not found');
  return outlet;
}

/* ─────────────────────────────────────────────────────────────
   DETECT
───────────────────────────────────────────────────────────── */

/**
 * Detect upcoming festivals for an outlet based on its region.
 * Returns master calendar data enriched with outlet-level config if any.
 */
async function detectFestivals(outletId, daysAhead = 45) {
  const outlet  = await getOutletContext(outletId);
  const country = (outlet.country || 'IN').toUpperCase().slice(0,2);
  const region  = (outlet.state || '').toUpperCase();

  const upcoming = getUpcomingFestivals(country, region, daysAhead);

  // Fetch outlet-specific saved configs
  const prisma = getDbClient();
  const saved  = await prisma.festivalMode.findMany({
    where: { outlet_id: outletId },
  });
  const savedMap = Object.fromEntries(saved.map(s => [s.festival_key, s]));

  return {
    outlet: { id: outlet.id, name: outlet.name, country, region },
    upcoming: upcoming.map(f => ({
      ...f,
      saved_config: savedMap[f.key] || null,
      is_configured: !!savedMap[f.key],
    })),
    regions: country === 'AU' ? AU_REGIONS : INDIA_REGIONS,
    today: todayStr(country),
  };
}

/* ─────────────────────────────────────────────────────────────
   ACTIVATE / CONFIGURE
───────────────────────────────────────────────────────────── */

/**
 * Save (create or update) a festival config for an outlet.
 * Activating one deactivates all others.
 */
async function saveFestivalConfig(outletId, festivalKey, data) {
  const prisma  = getDbClient();
  const outlet  = await getOutletContext(outletId);
  const country = (outlet.country || 'IN').toUpperCase().slice(0,2);
  const region  = (outlet.state || '').toUpperCase();

  // Find master definition
  const cal = generateCalendar(new Date().getFullYear());
  const def = cal.find(f => f.key === festivalKey);
  if (!def) throw new BadRequestError(`Unknown festival key: ${festivalKey}`);

  const existing = await prisma.festivalMode.findFirst({
    where: { outlet_id: outletId, festival_key: festivalKey },
  });

  const payload = {
    outlet_id:       outletId,
    festival_key:    festivalKey,
    festival_name:   data.festival_name || def.name,
    country:         country,
    region:          region,
    start_date:      new Date(data.start_date || def.start),
    end_date:        new Date(data.end_date || def.end),
    is_active:       data.is_active ?? false,
    special_mode:    data.special_mode || def.special_mode || null,
    theme:           data.theme || def.theme,
    menu_suggestions: data.menu_suggestions || def.suggested_items,
    offer_structure: data.offer_structure || def.offer_structure,
    custom_banner:   data.custom_banner || def.theme?.banner || null,
  };

  let config;
  if (existing) {
    config = await prisma.festivalMode.update({ where: { id: existing.id }, data: payload });
  } else {
    config = await prisma.festivalMode.create({ data: payload });
  }

  logger.info('Festival config saved', { outletId, festivalKey, is_active: config.is_active });
  return config;
}

/**
 * Toggle a festival mode ON (deactivates others) or OFF.
 */
async function toggleFestivalMode(outletId, configId) {
  const prisma = getDbClient();
  const config = await prisma.festivalMode.findFirst({
    where: { id: configId, outlet_id: outletId },
  });
  if (!config) throw new NotFoundError('Festival config not found');

  const newActive = !config.is_active;

  if (newActive) {
    // Deactivate all others first
    await prisma.festivalMode.updateMany({
      where: { outlet_id: outletId, id: { not: configId } },
      data: { is_active: false },
    });
  }

  const updated = await prisma.festivalMode.update({
    where: { id: configId },
    data: { is_active: newActive },
  });

  logger.info('Festival mode toggled', { outletId, configId, is_active: newActive });
  return updated;
}

/**
 * Get the currently active festival mode for an outlet (for POS integration).
 */
async function getActiveFestivalMode(outletId) {
  const prisma = getDbClient();
  const active = await prisma.festivalMode.findFirst({
    where: { outlet_id: outletId, is_active: true },
  });
  if (!active) return null;

  // Enrich with master data
  const cal = generateCalendar(new Date().getFullYear());
  const def = cal.find(f => f.key === active.festival_key);

  return {
    ...active,
    master: def || null,
    decor_tips: def?.decor_tips || [],
    menu_tags: def?.menu_tags || [],
    category: def?.category || 'general',
  };
}

/**
 * List all saved festival configs for an outlet.
 */
async function listConfigs(outletId) {
  const prisma = getDbClient();
  return prisma.festivalMode.findMany({
    where: { outlet_id: outletId },
    orderBy: { start_date: 'asc' },
  });
}

/**
 * Delete a festival config.
 */
async function deleteConfig(outletId, configId) {
  const prisma = getDbClient();
  const config = await prisma.festivalMode.findFirst({ where: { id: configId, outlet_id: outletId } });
  if (!config) throw new NotFoundError('Festival config not found');
  await prisma.festivalMode.delete({ where: { id: configId } });
  return { deleted: true };
}

/* ─────────────────────────────────────────────────────────────
   MENU SUGGESTIONS
───────────────────────────────────────────────────────────── */

/**
 * Match festival suggested items against the outlet's actual menu.
 */
async function getMenuSuggestions(outletId, festivalKey) {
  const prisma  = getDbClient();
  const cal     = generateCalendar(new Date().getFullYear());
  const def     = cal.find(f => f.key === festivalKey);
  if (!def) throw new BadRequestError('Unknown festival');

  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      where: { outlet_id: outletId, is_active: true, is_deleted: false },
      select: { id: true, name: true, base_price: true, category_id: true, food_type: true, tags: true, is_bestseller: true },
    }),
    prisma.menuCategory.findMany({
      where: { outlet_id: outletId, is_active: true, is_deleted: false },
      select: { id: true, name: true },
    }),
  ]);

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  // Score items: +3 if name fuzzy matches suggested, +2 if tag matches, +1 if category matches
  const tagSet = new Set((def.menu_tags || []).map(t => t.toLowerCase()));

  function fuzzMatch(a, b) {
    const la = a.toLowerCase(), lb = b.toLowerCase();
    return la.includes(lb) || lb.includes(la) ||
      la.split(' ').some(w => lb.includes(w)) ||
      lb.split(' ').some(w => la.includes(w));
  }

  const scored = items.map(item => {
    let score = 0;
    const itemTags = Array.isArray(item.tags) ? item.tags.map(t => String(t).toLowerCase()) : [];
    const catName  = catMap[item.category_id] || '';

    // Name match against suggested_items
    const nameMatch = def.suggested_items.some(s => fuzzMatch(item.name, s));
    if (nameMatch) score += 3;

    // Tag match
    if (itemTags.some(t => tagSet.has(t))) score += 2;

    // Category match
    if (tagSet.has(catName.toLowerCase())) score += 1;

    return { ...item, category_name: catName, relevance_score: score };
  });

  const matched   = scored.filter(i => i.relevance_score > 0).sort((a,b) => b.relevance_score - a.relevance_score);
  const suggested = def.suggested_items; // items from master data not yet on menu

  return {
    festival: { key: def.key, name: def.name, special_mode: def.special_mode },
    menu_matches:    matched,
    suggested_items: suggested,
    decor_tips:      def.decor_tips,
    offer_suggestion: def.offer_structure,
    theme:           def.theme,
    total_matched:   matched.length,
    total_menu:      items.length,
  };
}

/* ─────────────────────────────────────────────────────────────
   ALL FESTIVALS MASTER LIST
───────────────────────────────────────────────────────────── */

function getMasterCalendar(country, year) {
  const Y = year || new Date().getFullYear();
  const cal = generateCalendar(Y);
  if (!country) return cal;
  return cal.filter(f => f.country === country || f.country === 'BOTH');
}

module.exports = {
  detectFestivals,
  saveFestivalConfig,
  toggleFestivalMode,
  getActiveFestivalMode,
  listConfigs,
  deleteConfig,
  getMenuSuggestions,
  getMasterCalendar,
};
