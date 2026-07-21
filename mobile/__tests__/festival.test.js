/**
 * Unit tests for the pure Festival Mode helpers (lib/festival). No React / RN /
 * network — locks the /festival contract the screen depends on.
 */
import {
  extractConfigs, extractMaster, extractActive,
  configId, configKey, festivalName, isConfigActive, festivalEmoji,
  activeConfigId, countActive, sortConfigs,
  formatDateRange, configDateRange, offerOf, formatOfferValue, offerHeadline,
  festivalStatus, statusMeta, timeUntil, upcomingFromMaster, toggleBody,
} from '../src/lib/festival';

const CFG = (over = {}) => ({
  id: 'c1', festival_key: 'diwali', festival_name: 'Diwali', is_active: false,
  start_date: '2026-10-20', end_date: '2026-10-22',
  offer_structure: { type: 'surcharge', label: 'Festive uplift', value: 26, unit: 'percent', min_order: 500 },
  theme: { emoji: '🪔' }, ...over,
});

describe('extractors accept body or raw payload', () => {
  test('extractConfigs / extractMaster', () => {
    expect(extractConfigs({ data: [CFG()] })).toHaveLength(1);
    expect(extractConfigs([CFG()])).toHaveLength(1);
    expect(extractConfigs({ data: { items: [CFG()] } })).toHaveLength(1);
    expect(extractConfigs(null)).toEqual([]);
    expect(extractMaster({ data: [{ key: 'x' }] })).toHaveLength(1);
    expect(extractMaster(undefined)).toEqual([]);
  });
  test('extractActive returns the config or null (data:null must not fall back)', () => {
    expect(extractActive({ data: CFG() })).toMatchObject({ id: 'c1' });
    expect(extractActive({ success: true, data: null })).toBeNull();
    expect(extractActive({ data: [CFG()] })).toBeNull(); // an array is not an active config
    expect(extractActive({ data: { nope: 1 } })).toBeNull(); // no id/key/name
  });
});

describe('identity + labels', () => {
  test('configId / configKey / festivalName / isConfigActive / festivalEmoji', () => {
    expect(configId(CFG())).toBe('c1');
    expect(configId({})).toBeNull();
    expect(configKey(CFG())).toBe('diwali');
    expect(configKey({ key: 'holi' })).toBe('holi');
    expect(festivalName(CFG())).toBe('Diwali');
    expect(festivalName({})).toBe('Festival');
    expect(isConfigActive(CFG({ is_active: true }))).toBe(true);
    expect(isConfigActive(CFG())).toBe(false);
    expect(festivalEmoji(CFG())).toBe('🪔');
    expect(festivalEmoji({})).toBe('🎉');
  });
});

describe('list-level helpers', () => {
  const list = [CFG({ id: 'a', is_active: false }), CFG({ id: 'b', is_active: true }), CFG({ id: 'c', is_active: false })];
  test('activeConfigId / countActive', () => {
    expect(activeConfigId(list)).toBe('b');
    expect(activeConfigId([])).toBeNull();
    expect(countActive(list)).toBe(1);
    expect(countActive(null)).toBe(0);
  });
  test('sortConfigs orders by start date ascending', () => {
    const out = sortConfigs([CFG({ id: 'late', start_date: '2026-12-01' }), CFG({ id: 'early', start_date: '2026-01-01' })]);
    expect(out.map((c) => c.id)).toEqual(['early', 'late']);
  });
});

describe('dates + offers', () => {
  test('formatDateRange (UTC, collapses single day)', () => {
    expect(formatDateRange('2026-10-20', '2026-10-22')).toBe('20 Oct – 22 Oct');
    expect(formatDateRange('2026-01-26', '2026-01-26')).toBe('26 Jan');
    expect(formatDateRange(null, null)).toBe('');
    expect(configDateRange(CFG())).toBe('20 Oct – 22 Oct');
  });
  test('offerOf / formatOfferValue / offerHeadline', () => {
    expect(offerOf(CFG())).toEqual({ type: 'surcharge', label: 'Festive uplift', value: 26, unit: 'percent', minOrder: 500 });
    expect(offerOf({})).toBeNull();
    expect(formatOfferValue(CFG())).toBe('26%');
    expect(formatOfferValue({})).toBe('');
    expect(offerHeadline(CFG())).toBe('Festive uplift');
    expect(offerHeadline(CFG({ offer_structure: { type: 'flat_discount', value: 5 } }))).toBe('flat discount');
  });
});

describe('status + relative time (injected now)', () => {
  const now = Date.parse('2026-10-21T00:00:00Z');
  test('festivalStatus', () => {
    expect(festivalStatus(CFG(), now)).toBe('ongoing');
    expect(festivalStatus(CFG(), Date.parse('2026-10-10T00:00:00Z'))).toBe('upcoming');
    expect(festivalStatus(CFG(), Date.parse('2026-11-01T00:00:00Z'))).toBe('ended');
    expect(festivalStatus({}, now)).toBe('unknown');
  });
  test('statusMeta', () => {
    expect(statusMeta('ongoing')).toEqual({ label: 'Ongoing', tone: 'success' });
    expect(statusMeta('nope')).toEqual({ label: '', tone: 'muted' });
  });
  test('timeUntil', () => {
    expect(timeUntil('2026-10-21', now)).toBe('today');
    expect(timeUntil('2026-10-22', now)).toBe('tomorrow');
    expect(timeUntil('2026-10-20', now)).toBe('yesterday');
    expect(timeUntil('2026-10-24', now)).toBe('in 3d');
    expect(timeUntil('', now)).toBe('');
  });
  test('upcomingFromMaster keeps not-yet-ended, soonest first, capped', () => {
    const master = [
      { key: 'past', start: '2026-01-01', end: '2026-01-02' },
      { key: 'soon', start: '2026-10-25', end: '2026-10-26' },
      { key: 'later', start: '2026-12-01', end: '2026-12-02' },
    ];
    expect(upcomingFromMaster(master, now, 5).map((f) => f.key)).toEqual(['soon', 'later']);
    expect(upcomingFromMaster(master, now, 1).map((f) => f.key)).toEqual(['soon']);
  });
});

test('toggleBody always carries outlet_id', () => {
  expect(toggleBody('O1')).toEqual({ outlet_id: 'O1' });
});
