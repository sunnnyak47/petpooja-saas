/**
 * Unit tests for the pure transforms in useIntegrations — the platform
 * normalisation, config merge, region filtering, accounting card builder,
 * relative-time formatter, push-result summariser and roll-up counts the
 * Integrations Hub relies on. No React, no network: deterministic in → out.
 */

// api is imported by the hook module; mock it so importing pure helpers is safe.
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

// The hook transitively imports OutletContext → AsyncStorage (a native module).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import {
  normalizePlatform,
  buildAggregatorCard,
  buildAggregatorCards,
  buildAccountingCards,
  groupIntegrations,
  computeSummary,
  formatRelativeTime,
  summarizePushResult,
  INTEGRATION_TYPES,
} from '../src/hooks/useIntegrations';

const PLATFORMS = () => [
  { id: 'swiggy', name: 'Swiggy', region: 'IN', color: '#FC8019', commission: 0.18 },
  { id: 'zomato', name: 'Zomato', region: 'IN', color: '#E23744', commission: 0.15 },
  { id: 'ubereats', name: 'Uber Eats', region: 'AU', color: '#06C167', commission: 0.3 },
  { id: 'doordash', name: 'DoorDash AU', region: 'AU', color: '#FF3008', commission: 0.2 },
];

describe('normalizePlatform', () => {
  it('normalizes a raw platform def and uppercases region', () => {
    const p = normalizePlatform({ id: 'swiggy', name: 'Swiggy', region: 'in', color: '#FC8019', commission: 0.18 });
    expect(p).toMatchObject({ id: 'swiggy', name: 'Swiggy', region: 'IN', commission: 0.18 });
    expect(typeof p.icon).toBe('string');
  });

  it('falls back sanely on missing fields', () => {
    const p = normalizePlatform({});
    expect(p.id).toBe('platform');
    expect(p.name).toBe('platform');
    expect(p.region).toBe('IN');
    expect(p.commission).toBeNull();
  });

  it('coerces a non-numeric commission to null', () => {
    expect(normalizePlatform({ id: 'x', commission: 'abc' }).commission).toBeNull();
  });
});

describe('buildAggregatorCard', () => {
  it('treats enabled=true as connected', () => {
    const card = buildAggregatorCard(normalizePlatform(PLATFORMS()[0]), {
      enabled: true,
      store_id: 'S1',
      last_menu_push: '2026-07-10T10:00:00Z',
    });
    expect(card.connected).toBe(true);
    expect(card.configured).toBe(true);
    expect(card.canSync).toBe(true);
    expect(card.storeId).toBe('S1');
    expect(card.lastSync).toBe('2026-07-10T10:00:00Z');
    expect(card.type).toBe(INTEGRATION_TYPES.AGGREGATOR);
  });

  it('accepts the stringified "true" the backend stores', () => {
    const card = buildAggregatorCard(normalizePlatform(PLATFORMS()[0]), { enabled: 'true' });
    expect(card.connected).toBe(true);
  });

  it('configured-but-disabled is not connected and cannot sync', () => {
    const card = buildAggregatorCard(normalizePlatform(PLATFORMS()[0]), { enabled: false, api_key: 'k' });
    expect(card.connected).toBe(false);
    expect(card.configured).toBe(true);
    expect(card.canSync).toBe(false);
  });

  it('empty config → not connected, not configured', () => {
    const card = buildAggregatorCard(normalizePlatform(PLATFORMS()[0]), {});
    expect(card.connected).toBe(false);
    expect(card.configured).toBe(false);
    expect(card.storeId).toBeNull();
  });
});

describe('buildAggregatorCards (region filter + sort)', () => {
  const platforms = PLATFORMS().map(normalizePlatform);

  it('IN outlet only sees IN platforms', () => {
    const cards = buildAggregatorCards(platforms, {}, false);
    expect(cards.map((c) => c.id).sort()).toEqual(['swiggy', 'zomato']);
    expect(cards.every((c) => c.region === 'IN')).toBe(true);
  });

  it('AU outlet only sees AU platforms', () => {
    const cards = buildAggregatorCards(platforms, {}, true);
    expect(cards.map((c) => c.id).sort()).toEqual(['doordash', 'ubereats']);
  });

  it('connected channels sort ahead of unconnected', () => {
    const configs = { zomato: { enabled: true }, swiggy: {} };
    const cards = buildAggregatorCards(platforms, configs, false);
    expect(cards[0].id).toBe('zomato');
    expect(cards[0].connected).toBe(true);
  });

  it('configured-but-paused sorts ahead of untouched', () => {
    const configs = { swiggy: { api_key: 'k' } }; // configured, not enabled
    const cards = buildAggregatorCards(platforms, configs, false);
    expect(cards[0].id).toBe('swiggy');
    expect(cards[0].configured).toBe(true);
    expect(cards[0].connected).toBe(false);
  });
});

describe('buildAccountingCards (region-aware)', () => {
  it('AU shows Xero (live) + MYOB', () => {
    const cards = buildAccountingCards(true, {
      xero: { connected: true, org_name: 'Acme Pty', last_sync: '2026-07-09T00:00:00Z', invoices_exported: 12 },
    });
    const ids = cards.map((c) => c.id);
    expect(ids).toContain('xero');
    expect(ids).toContain('myob');
    expect(ids).not.toContain('tally');
    const xero = cards.find((c) => c.id === 'xero');
    expect(xero.connected).toBe(true);
    expect(xero.orgName).toBe('Acme Pty');
    expect(xero.invoicesExported).toBe(12);
    expect(cards.every((c) => c.type === INTEGRATION_TYPES.ACCOUNTING)).toBe(true);
  });

  it('AU Xero not connected when status is falsy', () => {
    const cards = buildAccountingCards(true, { xero: { connected: false, message: 'not connected' } });
    const xero = cards.find((c) => c.id === 'xero');
    expect(xero.connected).toBe(false);
    expect(xero.statusMessage).toBe('not connected');
  });

  it('IN shows Tally only, connected when mappings exist', () => {
    const cards = buildAccountingCards(false, { tallyConfigured: true });
    expect(cards.map((c) => c.id)).toEqual(['tally']);
    expect(cards[0].connected).toBe(true);
    expect(cards[0].webConfigured).toBe(true);
  });

  it('IN Tally not connected when unconfigured', () => {
    const cards = buildAccountingCards(false, {});
    expect(cards[0].connected).toBe(false);
  });
});

describe('groupIntegrations', () => {
  it('drops empty sections', () => {
    const aggs = buildAggregatorCards(PLATFORMS().map(normalizePlatform), {}, false);
    const sections = groupIntegrations(aggs, []);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe(INTEGRATION_TYPES.AGGREGATOR);
  });

  it('keeps both sections when both have data', () => {
    const aggs = buildAggregatorCards(PLATFORMS().map(normalizePlatform), {}, false);
    const acct = buildAccountingCards(false, {});
    const sections = groupIntegrations(aggs, acct);
    expect(sections.map((s) => s.key)).toEqual([INTEGRATION_TYPES.AGGREGATOR, INTEGRATION_TYPES.ACCOUNTING]);
  });
});

describe('computeSummary', () => {
  it('counts connected / not-connected / syncable', () => {
    const platforms = PLATFORMS().map(normalizePlatform);
    const aggs = buildAggregatorCards(platforms, { swiggy: { enabled: true } }, false);
    const acct = buildAccountingCards(false, { tallyConfigured: false });
    const sum = computeSummary(aggs, acct);
    expect(sum.total).toBe(3); // swiggy + zomato + tally
    expect(sum.connected).toBe(1); // swiggy
    expect(sum.notConnected).toBe(2);
    expect(sum.syncable).toBe(1); // only enabled aggregators
    expect(sum.aggregatorsConnected).toBe(1);
  });

  it('handles empty input', () => {
    expect(computeSummary([], [])).toEqual({
      total: 0,
      connected: 0,
      notConnected: 0,
      aggregatorsConnected: 0,
      syncable: 0,
    });
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-10T12:00:00Z').getTime();

  it('returns null for empty/invalid input', () => {
    expect(formatRelativeTime(null, now)).toBeNull();
    expect(formatRelativeTime('not-a-date', now)).toBeNull();
  });

  it('buckets recent times as just now', () => {
    expect(formatRelativeTime('2026-07-10T11:59:40Z', now)).toBe('just now');
  });

  it('formats minutes, hours and days', () => {
    expect(formatRelativeTime('2026-07-10T11:30:00Z', now)).toBe('30m ago');
    expect(formatRelativeTime('2026-07-10T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-07-08T12:00:00Z', now)).toBe('2d ago');
  });

  it('formats weeks and months', () => {
    expect(formatRelativeTime('2026-06-26T12:00:00Z', now)).toBe('2w ago');
    expect(formatRelativeTime('2026-05-01T12:00:00Z', now)).toBe('2mo ago');
  });

  it('a future timestamp reads as just now', () => {
    expect(formatRelativeTime('2026-07-10T12:30:00Z', now)).toBe('just now');
  });
});

describe('summarizePushResult', () => {
  it('empty result → no channels message', () => {
    expect(summarizePushResult([])).toMatchObject({ total: 0, ok: 0, failed: 0 });
    expect(summarizePushResult({ data: [] }).total).toBe(0);
  });

  it('all-success across an array', () => {
    const r = summarizePushResult([{ platform: 'swiggy', success: true }, { platform: 'zomato' }]);
    expect(r).toMatchObject({ total: 2, ok: 2, failed: 0 });
    expect(r.message).toMatch(/pushed to 2 channels/i);
  });

  it('unwraps a {data:[...]} envelope and counts failures', () => {
    const r = summarizePushResult({
      data: [{ platform: 'swiggy', success: true }, { platform: 'zomato', success: false }, { platform: 'x', error: 'boom' }],
    });
    expect(r).toMatchObject({ total: 3, ok: 1, failed: 2 });
    expect(r.message).toMatch(/1 of 3/);
  });
});
