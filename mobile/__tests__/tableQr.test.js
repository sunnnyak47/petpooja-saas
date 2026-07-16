/**
 * Unit tests for parseTableQr — the scanned-QR → { outletId, tableId } contract.
 * No camera, no RN. Locks that the scanner accepts BOTH the legacy deep-link
 * AND the web ordering URL the app itself prints (the bug this fixes).
 */
import { parseTableQr } from '../src/lib/tableQr';
import { buildOrderingUrl, WEB_ORDER_BASE } from '../src/hooks/useQrCodes';

// useQrCodes transitively imports useOfflineTables → sqlite / netinfo / api.
jest.mock('../src/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn().mockResolvedValue({ isConnected: true }) } }));
jest.mock('../src/db/sqlite', () => ({ getDb: () => ({ getAllSync: () => [], runSync: () => {} }) }));

describe('parseTableQr — web ordering URL (what the app actually generates)', () => {
  test('parses the hash-routed ordering URL produced by buildOrderingUrl', () => {
    const url = buildOrderingUrl('OUT1', { id: 'tbl-uuid-9', data: { table_number: 5 } });
    // sanity: this is the hash-route form
    expect(url).toBe(`${WEB_ORDER_BASE}/#/order?outlet=OUT1&table=tbl-uuid-9`);
    expect(parseTableQr(url)).toEqual({ outletId: 'OUT1', tableId: 'tbl-uuid-9' });
  });

  test('parses a plain (non-hash) query URL too', () => {
    expect(parseTableQr('https://x.io/order?outlet=O9&table=T1')).toEqual({ outletId: 'O9', tableId: 'T1' });
  });

  test('URL-decodes param values', () => {
    expect(parseTableQr('https://x.io/#/order?outlet=o%20a&table=t%2Fb')).toEqual({ outletId: 'o a', tableId: 't/b' });
  });

  test('order of params does not matter', () => {
    expect(parseTableQr('https://x.io/#/order?table=T1&outlet=O9')).toEqual({ outletId: 'O9', tableId: 'T1' });
  });
});

describe('parseTableQr — legacy deep-link scheme', () => {
  test('petpooja://table/<outlet>/<table>', () => {
    expect(parseTableQr('petpooja://table/OUT1/TBL2')).toEqual({ outletId: 'OUT1', tableId: 'TBL2' });
  });

  test('tolerates a trailing slash / query on the legacy scheme', () => {
    expect(parseTableQr('petpooja://table/OUT1/TBL2/')).toEqual({ outletId: 'OUT1', tableId: 'TBL2' });
  });
});

describe('parseTableQr — rejects non-table QRs', () => {
  test.each([
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    ['https://example.com/', null],           // a URL, but not an ordering link
    ['https://x.io/#/order?outlet=O9', null],  // missing table
    ['https://x.io/#/order?table=T1', null],   // missing outlet
    ['just some text', null],
    ['petpooja://menu/OUT1', null],            // wrong deep-link path
  ])('%s → null', (input) => {
    expect(parseTableQr(input)).toBeNull();
  });
});
