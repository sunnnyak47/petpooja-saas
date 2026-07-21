/**
 * Unit tests for the pure Dynamic Pricing helpers (lib/dynamic-pricing). No React
 * / RN / network — locks the /pricing/rules + /pricing/live + /pricing/analytics
 * contract the screen depends on, incl. the discount|surcharge|fixed_price and
 * numeric|string days_of_week field-name drift between the service and its Joi
 * validation.
 */
import {
  extractRules, extractLiveRules, extractContext, liveAffectedCount,
  extractAnalytics, liveRuleIdSet,
  ruleId, ruleName, isRuleActive,
  actionKind, isPercent, adjustmentValue, adjustmentLabel, adjustmentColor,
  triggerLabel, triggerIconName, daysLabel, timeWindowLabel, seasonLabel,
  targetLabel, conditionSummary, liveContextLabel,
  matchesRule, filterRules, summarizeRules, timeAgo,
} from '../src/lib/dynamic-pricing';

// A rule as the service/seed actually stores it (discount + percent + numeric days).
const RULE_A = {
  id: 'r1', name: 'Lunch Happy Hour', description: '10% off slow movers',
  is_active: true, trigger_type: 'time_slot', time_start: '12:00', time_end: '15:00',
  days_of_week: [1, 2, 3, 4, 5], item_target: 'slow_movers',
  action_type: 'discount', action_value: 10, action_unit: 'percent',
};
const RULE_B = {
  id: 'r2', name: 'Friday Night Surge', is_active: false,
  trigger_type: 'day_of_week', time_start: '19:00', time_end: '23:00',
  days_of_week: [5], item_target: 'bestsellers',
  action_type: 'surcharge', action_value: 15, action_unit: 'percent',
};
const RULE_C = { // flat discount + fixed price naming from Joi validation
  id: 'r3', name: 'Weekend Breakfast', is_active: true,
  trigger_type: 'time_slot', item_target: 'all',
  action_type: 'discount', action_value: 30, action_unit: 'flat',
};

const RULES_BODY = { success: true, data: [RULE_A, RULE_B, RULE_C], message: 'ok' };

const LIVE_BODY = {
  success: true,
  data: {
    price_map: { i1: { active_price: 90 } },
    active_rules: [
      { id: 'r1', name: 'Lunch Happy Hour', trigger_type: 'time_slot', action_type: 'discount', action_value: 10, action_unit: 'percent', item_target: 'slow_movers' },
    ],
    context: { timeStr: '14:30', dayOfWeek: 3, season: 'winter', weather: null },
    total_items_affected: 4,
  },
  message: 'ok',
};

const ANALYTICS_BODY = {
  success: true,
  data: {
    total_applications: 12,
    total_saving: 340.5,
    by_rule: [{ rule_id: 'r1', rule_name: 'Lunch Happy Hour', action_type: 'discount', applications: 12, total_saving: 340.5 }],
  },
  message: 'ok',
};

describe('extractors accept the api BODY or a raw payload', () => {
  test('extractRules', () => {
    expect(extractRules(RULES_BODY)).toHaveLength(3);
    expect(extractRules(RULES_BODY.data)).toHaveLength(3); // raw array too
    expect(extractRules({ data: { items: [RULE_A] } })).toHaveLength(1);
    expect(extractRules({ rules: [RULE_A, RULE_B] })).toHaveLength(2);
    expect(extractRules(null)).toEqual([]);
    expect(extractRules({})).toEqual([]);
    expect(extractRules({ data: null })).toEqual([]);
  });

  test('extractLiveRules', () => {
    expect(extractLiveRules(LIVE_BODY)).toHaveLength(1);
    expect(extractLiveRules(LIVE_BODY.data)).toHaveLength(1); // raw payload
    expect(extractLiveRules([RULE_A])).toHaveLength(1);       // already an array
    expect(extractLiveRules(null)).toEqual([]);
    expect(extractLiveRules({})).toEqual([]);
  });

  test('extractContext + liveAffectedCount', () => {
    expect(extractContext(LIVE_BODY)).toEqual({ timeStr: '14:30', dayOfWeek: 3, season: 'winter', weather: null });
    expect(extractContext(null)).toBeNull();
    expect(extractContext([])).toBeNull();
    expect(extractContext({})).toBeNull();
    expect(liveAffectedCount(LIVE_BODY)).toBe(4);
    expect(liveAffectedCount({})).toBe(0);
    expect(liveAffectedCount(null)).toBe(0);
  });

  test('extractAnalytics is always shaped', () => {
    expect(extractAnalytics(ANALYTICS_BODY)).toEqual({
      total_applications: 12, total_saving: 340.5,
      by_rule: [{ rule_id: 'r1', rule_name: 'Lunch Happy Hour', action_type: 'discount', applications: 12, total_saving: 340.5 }],
    });
    expect(extractAnalytics(null)).toEqual({ total_applications: 0, total_saving: 0, by_rule: [] });
    expect(extractAnalytics({})).toEqual({ total_applications: 0, total_saving: 0, by_rule: [] });
    expect(extractAnalytics({ data: { by_rule: 'nope' } }).by_rule).toEqual([]);
  });

  test('liveRuleIdSet — for badging the rules list', () => {
    const set = liveRuleIdSet(LIVE_BODY);
    expect(set.has('r1')).toBe(true);
    expect(set.has('r2')).toBe(false);
    expect(liveRuleIdSet(null).size).toBe(0);
    expect(liveRuleIdSet({}).size).toBe(0);
  });
});

describe('identity helpers', () => {
  test('ruleId coerces / tolerates 0 and missing', () => {
    expect(ruleId(RULE_A)).toBe('r1');
    expect(ruleId({ id: 0 })).toBe('0');
    expect(ruleId({})).toBe('');
    expect(ruleId(null)).toBe('');
  });
  test('ruleName never blank', () => {
    expect(ruleName(RULE_A)).toBe('Lunch Happy Hour');
    expect(ruleName({ name: '   ' })).toBe('Untitled rule');
    expect(ruleName({})).toBe('Untitled rule');
    expect(ruleName(null)).toBe('Untitled rule');
  });
  test('isRuleActive', () => {
    expect(isRuleActive(RULE_A)).toBe(true);
    expect(isRuleActive(RULE_B)).toBe(false);
    expect(isRuleActive({})).toBe(false);
    expect(isRuleActive(null)).toBe(false);
  });
});

describe('action / adjustment normalisation (both naming schemes)', () => {
  test('actionKind maps service AND validation names', () => {
    expect(actionKind(RULE_A)).toBe('discount');
    expect(actionKind(RULE_B)).toBe('surcharge');
    expect(actionKind({ action_type: 'fixed_price' })).toBe('fixed');
    expect(actionKind({ action_type: 'percentage_off' })).toBe('discount');
    expect(actionKind({ action_type: 'price_increase' })).toBe('surcharge');
    expect(actionKind({ action_type: 'price_decrease' })).toBe('discount');
    expect(actionKind({})).toBe('other');
  });
  test('isPercent handles percent + percentage + flat', () => {
    expect(isPercent(RULE_A)).toBe(true);
    expect(isPercent({ action_unit: 'percentage' })).toBe(true);
    expect(isPercent(RULE_C)).toBe(false);
    expect(isPercent({})).toBe(false);
  });
  test('adjustmentValue never NaN', () => {
    expect(adjustmentValue(RULE_A)).toBe(10);
    expect(adjustmentValue({ action_value: '15' })).toBe(15);
    expect(adjustmentValue({ action_value: 'x' })).toBe(0);
    expect(adjustmentValue({})).toBe(0);
    expect(adjustmentValue(null)).toBe(0);
  });
  test('adjustmentLabel is sign-aware, uses injected money formatter', () => {
    const money = (v) => `$${Number(v).toFixed(2)}`;
    expect(adjustmentLabel(RULE_A)).toBe('-10%');           // discount percent
    expect(adjustmentLabel(RULE_B)).toBe('+15%');           // surcharge percent
    expect(adjustmentLabel(RULE_C, money)).toBe('-$30.00'); // flat discount w/ money
    expect(adjustmentLabel(RULE_C)).toBe('-30');            // flat discount w/o money
    expect(adjustmentLabel({ action_type: 'fixed_price', action_value: 99 }, money)).toBe('= $99.00');
    expect(adjustmentLabel({ action_value: 5, action_unit: 'percent' })).toBe('5%'); // unknown kind → no sign
  });
  test('adjustmentColor uses the theme object', () => {
    const colors = { success: '#0f0', error: '#f00', accent: '#00f' };
    expect(adjustmentColor(RULE_A, colors)).toBe('#0f0');
    expect(adjustmentColor(RULE_B, colors)).toBe('#f00');
    expect(adjustmentColor({ action_type: 'fixed_price' }, colors)).toBe('#00f');
    expect(adjustmentColor({}, colors)).toBe('#00f'); // other → accent
    expect(typeof adjustmentColor(RULE_A)).toBe('string'); // falls back w/o colors
  });
});

describe('trigger / condition labels', () => {
  test('triggerLabel', () => {
    expect(triggerLabel('time_slot')).toBe('Time of day');
    expect(triggerLabel('time_of_day')).toBe('Time of day');
    expect(triggerLabel('day_of_week')).toBe('Day of week');
    expect(triggerLabel('weather')).toBe('Weather');
    expect(triggerLabel('season')).toBe('Season');
    expect(triggerLabel('demand')).toBe('Demand');
    expect(triggerLabel('manual')).toBe('Manual');
    expect(triggerLabel('some_custom')).toBe('Some Custom');
    expect(triggerLabel('')).toBe('Custom');
    expect(triggerLabel(undefined)).toBe('Custom');
  });
  test('triggerIconName maps to Ionicons', () => {
    expect(triggerIconName('time_slot')).toBe('time-outline');
    expect(triggerIconName('day_of_week')).toBe('calendar-outline');
    expect(triggerIconName('weather')).toBe('rainy-outline');
    expect(triggerIconName('season')).toBe('leaf-outline');
    expect(triggerIconName('demand')).toBe('trending-up-outline');
    expect(triggerIconName('manual')).toBe('hand-left-outline');
    expect(triggerIconName('whatever')).toBe('pricetag-outline');
    expect(triggerIconName(undefined)).toBe('pricetag-outline');
  });
  test('daysLabel handles numeric AND string days', () => {
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Mon, Tue, Wed, Thu, Fri');
    expect(daysLabel([0, 6])).toBe('Sun, Sat');
    expect(daysLabel(['mon', 'wed', 'fri'])).toBe('Mon, Wed, Fri');
    expect(daysLabel([])).toBe('Every day');
    expect(daysLabel(null)).toBe('Every day');
    expect(daysLabel(['bogus'])).toBe('Every day');
  });
  test('timeWindowLabel', () => {
    expect(timeWindowLabel(RULE_A)).toBe('12:00–15:00');
    expect(timeWindowLabel(RULE_C)).toBe('All day');
    expect(timeWindowLabel({})).toBe('All day');
  });
  test('seasonLabel drops any / blank', () => {
    expect(seasonLabel('monsoon')).toBe('Monsoon');
    expect(seasonLabel('any')).toBe('');
    expect(seasonLabel('')).toBe('');
    expect(seasonLabel(null)).toBe('');
  });
  test('targetLabel', () => {
    expect(targetLabel({ item_target: 'all' })).toBe('All items');
    expect(targetLabel({ item_target: 'slow_movers' })).toBe('Slow movers');
    expect(targetLabel({ item_target: 'bestsellers' })).toBe('Bestsellers');
    expect(targetLabel({ item_target: 'category' })).toBe('By category');
    expect(targetLabel({ item_target: 'tag', target_tag: 'hot_beverage' })).toBe('Hot Beverage');
    expect(targetLabel({ item_target: 'tag' })).toBe('Tagged items');
    expect(targetLabel({})).toBe('All items');
  });
  test('conditionSummary joins the relevant parts', () => {
    expect(conditionSummary(RULE_A)).toBe('12:00–15:00 · Mon, Tue, Wed, Thu, Fri · Slow movers');
    expect(conditionSummary(RULE_C)).toBe('All items');
    expect(conditionSummary({ season_trigger: 'monsoon', item_target: 'all' })).toBe('Monsoon · All items');
    expect(conditionSummary({})).toBe('All items');
  });
  test('liveContextLabel', () => {
    expect(liveContextLabel(LIVE_BODY)).toBe('14:30 · Winter');
    expect(liveContextLabel({ data: { context: { timeStr: '09:00', season: 'summer', weather: 'hot' } } })).toBe('09:00 · Summer · Hot');
    expect(liveContextLabel(null)).toBe('');
    expect(liveContextLabel({})).toBe('');
  });
});

describe('list transforms', () => {
  const rows = [RULE_A, RULE_B, RULE_C];
  test('matchesRule over name / description / trigger / target', () => {
    expect(matchesRule(RULE_A, '')).toBe(true);
    expect(matchesRule(RULE_A, 'lunch')).toBe(true);
    expect(matchesRule(RULE_A, 'slow')).toBe(true);      // target
    expect(matchesRule(RULE_B, 'day of week')).toBe(true); // trigger label
    expect(matchesRule(RULE_A, 'zzz')).toBe(false);
  });
  test('filterRules by status + query', () => {
    expect(filterRules(rows, {})).toHaveLength(3);
    expect(filterRules(rows, { status: 'active' })).toHaveLength(2);
    expect(filterRules(rows, { status: 'inactive' })).toHaveLength(1);
    expect(filterRules(rows, { q: 'friday' })).toHaveLength(1);
    expect(filterRules(rows, { status: 'active', q: 'lunch' })).toHaveLength(1);
    expect(filterRules(null, {})).toEqual([]);
  });
  test('summarizeRules', () => {
    expect(summarizeRules(rows)).toEqual({ total: 3, active: 2, inactive: 1 });
    expect(summarizeRules([])).toEqual({ total: 0, active: 0, inactive: 0 });
    expect(summarizeRules(null)).toEqual({ total: 0, active: 0, inactive: 0 });
  });
});

describe('timeAgo is deterministic with an injected now', () => {
  const now = Date.parse('2026-07-20T12:00:00Z');
  test('buckets', () => {
    expect(timeAgo('2026-07-20T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-07-20T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-07-20T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-07-18T12:00:00Z', now)).toBe('2d ago');
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo('not-a-date', now)).toBe('');
  });
});
