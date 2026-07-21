/**
 * dynamic-pricing — pure helpers for the Dynamic Pricing screen (mobile).
 *
 * Mirrors the backend Dynamic Pricing Engine (backend/src/modules/pricing/*).
 * No React / RN / api / expo imports, so the contract is unit-testable. Consumed
 * by src/hooks/useDynamicPricing.js and app/(tabs)/dynamic-pricing.jsx.
 *
 * The mobile api interceptor returns the response BODY ({ success, data, message }),
 * so every extractor accepts EITHER the api body OR a raw payload.
 *
 * Backend contract (source of truth = pricing.routes.js + pricing.service.js):
 *   GET  /pricing/rules?outlet_id=  → data: PricingRule[]
 *   GET  /pricing/live?outlet_id=   → data: { price_map, active_rules[], context, total_items_affected }
 *   GET  /pricing/analytics?outlet_id= → data: { total_applications, total_saving, by_rule[] }
 *   POST /pricing/rules/:id/toggle  { outlet_id } → data: <updated rule>
 *
 * Field-name drift: the service/seed store action_type as discount|surcharge|
 * fixed_price and action_unit as percent|flat, while the Joi validation names
 * them price_increase|price_decrease|percentage_off|fixed_price / percentage.
 * days_of_week can be numeric (0=Sun) OR short strings ('mon'). Helpers below
 * normalise all of these so the screen never has to care.
 */

function payload(body) {
  return body?.data ?? body ?? null;
}

/* ─── Extractors ──────────────────────────────────────────────────────────── */

/** All pricing rules for the outlet. */
export function extractRules(body) {
  const p = payload(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.rules)) return p.rules;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

/** Rules applying RIGHT NOW (the "Live now" list). */
export function extractLiveRules(body) {
  const p = payload(body);
  if (Array.isArray(p)) return p;
  if (Array.isArray(p?.active_rules)) return p.active_rules;
  return [];
}

/** The live-engine context ({ timeStr, dayOfWeek, season, weather, ... }) or null. */
export function extractContext(body) {
  const p = payload(body);
  return p && typeof p === 'object' && !Array.isArray(p) ? (p.context ?? null) : null;
}

/** How many menu items currently have an adjusted price. */
export function liveAffectedCount(body) {
  const p = payload(body);
  const n = Number(p?.total_items_affected);
  return Number.isFinite(n) ? n : 0;
}

/** Normalised analytics summary, always shaped, never throws. */
export function extractAnalytics(body) {
  const p = payload(body) || {};
  return {
    total_applications: Number(p.total_applications) || 0,
    total_saving: Number(p.total_saving) || 0,
    by_rule: Array.isArray(p.by_rule) ? p.by_rule : [],
  };
}

/** Set of rule ids that are live right now — for badging the rules list. */
export function liveRuleIdSet(body) {
  const set = new Set();
  for (const r of extractLiveRules(body)) {
    const id = ruleId(r);
    if (id) set.add(id);
  }
  return set;
}

/* ─── Identity ────────────────────────────────────────────────────────────── */

export function ruleId(rule) {
  const id = rule?.id;
  return id === 0 ? '0' : (id ? String(id) : '');
}

export function ruleName(rule) {
  const n = rule?.name && String(rule.name).trim();
  return n || 'Untitled rule';
}

export function isRuleActive(rule) {
  return !!rule?.is_active;
}

/* ─── Action / adjustment normalisation ───────────────────────────────────── */

/** discount | surcharge | fixed | other — tolerant of both naming schemes. */
export function actionKind(rule) {
  const t = String(rule?.action_type || '').toLowerCase();
  if (t === 'fixed_price' || t === 'fixed') return 'fixed';
  if (t === 'surcharge' || t === 'price_increase' || t === 'increase') return 'surcharge';
  if (t === 'discount' || t === 'percentage_off' || t === 'price_decrease' || t === 'decrease') return 'discount';
  return 'other';
}

/** True when the adjustment is a percentage (vs a flat amount). */
export function isPercent(rule) {
  return String(rule?.action_unit || '').toLowerCase().startsWith('perc');
}

/** The numeric magnitude of the adjustment (never NaN). */
export function adjustmentValue(rule) {
  const v = Number(rule?.action_value);
  return Number.isFinite(v) ? v : 0;
}

/**
 * A compact, sign-aware adjustment label.
 *   discount 10%  → "-10%"      surcharge 15% → "+15%"
 *   flat discount → "-<money>"  fixed price   → "= <money>"
 * `fmtMoney` is an optional injected currency formatter (the screen passes fmt);
 * without it the raw number is used, keeping this pure + unit-testable.
 */
export function adjustmentLabel(rule, fmtMoney) {
  const kind = actionKind(rule);
  const value = adjustmentValue(rule);
  const money = typeof fmtMoney === 'function' ? (v) => String(fmtMoney(v)) : (v) => String(v);
  if (kind === 'fixed') return `= ${money(value)}`;
  const sign = kind === 'surcharge' ? '+' : kind === 'discount' ? '-' : '';
  if (isPercent(rule)) return `${sign}${value}%`;
  return `${sign}${money(value)}`;
}

/** Semantic colour for an adjustment; `colors` is a plain theme object. */
export function adjustmentColor(rule, colors = {}) {
  const kind = actionKind(rule);
  if (kind === 'surcharge') return colors.error || '#dc2626';
  if (kind === 'discount') return colors.success || '#16a34a';
  return colors.accent || '#2563eb';
}

/* ─── Trigger / condition labels ──────────────────────────────────────────── */

export function triggerLabel(triggerType) {
  switch (String(triggerType || '').toLowerCase()) {
    case 'time_slot':
    case 'time_of_day': return 'Time of day';
    case 'day_of_week': return 'Day of week';
    case 'weather': return 'Weather';
    case 'season': return 'Season';
    case 'demand': return 'Demand';
    case 'manual': return 'Manual';
    default: return titleCase(triggerType) || 'Custom';
  }
}

export function triggerIconName(triggerType) {
  switch (String(triggerType || '').toLowerCase()) {
    case 'time_slot':
    case 'time_of_day': return 'time-outline';
    case 'day_of_week': return 'calendar-outline';
    case 'weather': return 'rainy-outline';
    case 'season': return 'leaf-outline';
    case 'demand': return 'trending-up-outline';
    case 'manual': return 'hand-left-outline';
    default: return 'pricetag-outline';
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** "Mon, Tue, Wed" from numeric (0=Sun) OR short-string days; empty → "Every day". */
export function daysLabel(days) {
  if (!Array.isArray(days) || days.length === 0) return 'Every day';
  const names = days
    .map((d) => {
      if (typeof d === 'number') return DAY_NAMES[d] ?? null;
      const idx = DAY_KEYS.indexOf(String(d).slice(0, 3).toLowerCase());
      return idx >= 0 ? DAY_NAMES[idx] : null;
    })
    .filter(Boolean);
  return names.length ? names.join(', ') : 'Every day';
}

/** "12:00–15:00" when both bounds present, else "All day". */
export function timeWindowLabel(rule) {
  const s = rule?.time_start;
  const e = rule?.time_end;
  return s && e ? `${s}–${e}` : 'All day';
}

export function seasonLabel(season) {
  const s = String(season || '').toLowerCase();
  if (!s || s === 'any') return '';
  return titleCase(s);
}

/** Who a rule targets. */
export function targetLabel(rule) {
  const t = String(rule?.item_target || 'all').toLowerCase();
  switch (t) {
    case 'all': return 'All items';
    case 'category': return 'By category';
    case 'specific':
    case 'item': return 'Specific items';
    case 'slow_movers': return 'Slow movers';
    case 'bestsellers': return 'Bestsellers';
    case 'tag': {
      const tag = rule?.target_tag && String(rule.target_tag).trim();
      return tag ? titleCase(tag) : 'Tagged items';
    }
    default: return titleCase(t) || 'All items';
  }
}

/** One compact human condition string for the rule card. */
export function conditionSummary(rule = {}) {
  const parts = [];
  if (rule.time_start && rule.time_end) parts.push(timeWindowLabel(rule));
  if (Array.isArray(rule.days_of_week) && rule.days_of_week.length > 0) {
    parts.push(daysLabel(rule.days_of_week));
  }
  const season = seasonLabel(rule.season_trigger);
  if (season) parts.push(season);
  const weather = rule.weather_trigger && String(rule.weather_trigger).toLowerCase();
  if (weather && weather !== 'any') parts.push(titleCase(weather));
  parts.push(targetLabel(rule));
  return parts.join(' · ');
}

/** "14:30 · Winter" from a live context, or ''. */
export function liveContextLabel(body) {
  const ctx = extractContext(body);
  if (!ctx) return '';
  const bits = [];
  if (ctx.timeStr) bits.push(String(ctx.timeStr));
  const season = seasonLabel(ctx.season);
  if (season) bits.push(season);
  if (ctx.weather) bits.push(titleCase(ctx.weather));
  return bits.join(' · ');
}

/* ─── List transforms ─────────────────────────────────────────────────────── */

/** Free-text match over name / description / trigger. Blank query matches all. */
export function matchesRule(rule = {}, q = '') {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [rule.name, rule.description, triggerLabel(rule.trigger_type), targetLabel(rule)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

/** Filter by status ('all'|'active'|'inactive') + free-text query. */
export function filterRules(rows = [], { q = '', status = 'all' } = {}) {
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    if (status === 'active' && !isRuleActive(r)) return false;
    if (status === 'inactive' && isRuleActive(r)) return false;
    return matchesRule(r, q);
  });
}

/** { total, active, inactive } counts from a rule set. */
export function summarizeRules(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const active = list.filter(isRuleActive).length;
  return { total: list.length, active, inactive: list.length - active };
}

/* ─── Time ────────────────────────────────────────────────────────────────── */

/** Compact relative time. `now` is injectable for deterministic tests. */
export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/* ─── internal ────────────────────────────────────────────────────────────── */

function titleCase(v) {
  const s = String(v || '').trim().replace(/[_-]+/g, ' ');
  if (!s) return '';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
