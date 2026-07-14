/**
 * Unit tests for the pure deep-link helpers in useQrCodes — the ordering-URL
 * contract that a scanned QR resolves to. No React, no network. These lock the
 * URL to match the WEB generator exactly (hash route + table_id), so a printed
 * QR always opens the customer ordering page for the right outlet + table.
 */

// The hook transitively imports useOfflineTables → sqlite / NetInfo / api.
// Mock those natives so importing the pure helpers is safe.
jest.mock('../src/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn().mockResolvedValue({ isConnected: true }) } }));
jest.mock('../src/db/sqlite', () => ({ getDb: () => ({ getAllSync: () => [], runSync: () => {} }) }));

import {
  resolveOutletId,
  resolveTableId,
  existingOrderingUrl,
  buildOrderingUrl,
  matchesQuery,
  tableLabel,
  toQrCard,
  buildQrCards,
  WEB_ORDER_BASE,
} from '../src/hooks/useQrCodes';

describe('WEB_ORDER_BASE', () => {
  test('points at the real web origin, not the dead order.msrm fallback', () => {
    expect(WEB_ORDER_BASE).toMatch(/^https:\/\//);
    expect(WEB_ORDER_BASE).not.toMatch(/order\.msrm/);
    expect(WEB_ORDER_BASE).not.toMatch(/\/$/); // trailing slash stripped
  });
});

describe('buildOrderingUrl — matches the web generator exactly', () => {
  test('hash route + table_id (NOT table number)', () => {
    const url = buildOrderingUrl('OUT1', { id: 'tbl-uuid-9', data: { table_number: 5 }, name: 'Table 5' });
    expect(url).toBe(`${WEB_ORDER_BASE}/#/order?outlet=OUT1&table=tbl-uuid-9`);
    expect(url).toContain('/#/order?'); // hash-routed — bare /order would 404
    expect(url).toContain('table=tbl-uuid-9'); // the id, used as table_id when ordering
    expect(url).not.toContain('table=5'); // must NOT be the human number
  });

  test('accepts an outlet object or a bare id', () => {
    expect(buildOrderingUrl({ id: 'O9' }, { id: 'T1' })).toBe(`${WEB_ORDER_BASE}/#/order?outlet=O9&table=T1`);
  });

  test('URL-encodes params', () => {
    const url = buildOrderingUrl('o a', { id: 't/b' });
    expect(url).toContain('outlet=o%20a');
    expect(url).toContain('table=t%2Fb');
  });

  test('prefers a server-issued preset url verbatim', () => {
    expect(buildOrderingUrl('o', { id: 't', qr_url: 'https://short.link/abc' })).toBe('https://short.link/abc');
    expect(buildOrderingUrl('o', { id: 't', data: { ordering_url: 'https://x.io/q' } })).toBe('https://x.io/q');
  });
});

describe('helpers', () => {
  test('resolveOutletId + resolveTableId fall back sanely', () => {
    expect(resolveOutletId({ outlet_id: 'A' })).toBe('A');
    expect(resolveTableId({ id: 'X' })).toBe('X');
    expect(resolveTableId({ table_number: 7 })).toBe('7'); // no id → number keeps URL non-empty
  });

  test('matchesQuery is case-insensitive over number/name/section', () => {
    const t = { data: { table_number: 12 }, name: 'Patio 12', section: 'Garden' };
    expect(matchesQuery(t, '')).toBe(true);
    expect(matchesQuery(t, 'garden')).toBe(true);
    expect(matchesQuery(t, 'patio')).toBe(true);
    expect(matchesQuery(t, 'zzz')).toBe(false);
  });

  test('tableLabel prefers the real number, rejects the "Table <uuid>" cache fallback', () => {
    // real table_number in the data blob → "Table 5"
    expect(tableLabel({ id: 'x', data: { table_number: 5 } })).toBe('Table 5');
    // no number, and name is the cache's uuid fallback → short id, never a raw UUID
    expect(tableLabel({ id: 'abc12345-6789-0000', name: 'Table abc12345-6789-0000' })).toBe('Table abc123');
    // a genuine name is kept
    expect(tableLabel({ name: 'Rooftop 3' })).toBe('Rooftop 3');
  });

  test('toQrCard shows the real table number (from data) + id-based url', () => {
    const card = toQrCard('O1', { id: 'uuid-2', section: 'Rooftop', name: 'Table uuid-2', data: { table_number: 2 } });
    expect(card.number).toBe('2');
    expect(card.name).toBe('Table 2'); // NOT "Table uuid-2"
    expect(card.section).toBe('Rooftop');
    expect(card.url).toBe(`${WEB_ORDER_BASE}/#/order?outlet=O1&table=uuid-2`);
  });

  test('buildQrCards filters by query then maps', () => {
    const tables = [
      { id: 'a', name: 'Table 1', section: 'Main', data: { table_number: 1 } },
      { id: 'b', name: 'Table 2', section: 'Patio', data: { table_number: 2 } },
    ];
    const cards = buildQrCards('O1', tables, 'patio');
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('b');
    expect(cards[0].url).toContain('table=b');
  });
});
