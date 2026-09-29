/**
 * @fileoverview Unit tests for utils/regionCurrency — the write-time
 * region ↔ currency consistency guard (AU ⇒ AUD, IN ⇒ INR) that prevents the
 * "AU outlet with INR currency" drift scripts/fix-region-currency.js used to
 * repair after the fact.
 * @module tests/region-currency.test
 */

const mockWarn = jest.fn();
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: (...a) => mockWarn(...a), error: () => {}, debug: () => {} }));

const {
  REGION_CURRENCY,
  REGION_TIMEZONE,
  regionFromCountry,
  enforceHeadOffice,
  enforceOutlet,
} = require('../src/utils/regionCurrency');

beforeEach(() => mockWarn.mockClear());

describe('regionFromCountry', () => {
  test('maps country names and codes to enforced regions', () => {
    expect(regionFromCountry('Australia')).toBe('AU');
    expect(regionFromCountry('australia')).toBe('AU');
    expect(regionFromCountry('AU')).toBe('AU');
    expect(regionFromCountry('India')).toBe('IN');
    expect(regionFromCountry('IN')).toBe('IN');
  });

  test('unknown / non-string countries map to null (unenforced)', () => {
    expect(regionFromCountry('United States')).toBeNull();
    expect(regionFromCountry(undefined)).toBeNull();
    expect(regionFromCountry(null)).toBeNull();
    expect(regionFromCountry(42)).toBeNull();
  });
});

describe('enforceHeadOffice', () => {
  test('create: AU region with INR currency is corrected to AUD + warned', () => {
    const data = { name: 'Chain', region: 'AU', currency: 'INR' };
    enforceHeadOffice(data, { isCreate: true });
    expect(data.currency).toBe('AUD');
    expect(mockWarn).toHaveBeenCalled();
  });

  test('create: AU region without currency gets AUD, AU timezone and country_code defaults', () => {
    const data = { name: 'Chain', region: 'AU' };
    enforceHeadOffice(data, { isCreate: true });
    expect(data.currency).toBe('AUD');
    expect(data.timezone).toBe(REGION_TIMEZONE.AU);
    expect(data.country_code).toBe('AU');
    expect(mockWarn).not.toHaveBeenCalled(); // filling a blank is not a correction
  });

  test('create: no region defaults to IN ⇒ INR (schema default made explicit)', () => {
    const data = { name: 'Chain' };
    enforceHeadOffice(data, { isCreate: true });
    expect(data.currency).toBe('INR');
    expect(data.timezone).toBe(REGION_TIMEZONE.IN);
  });

  test('create: explicitly provided timezone is never overwritten', () => {
    const data = { region: 'AU', timezone: 'Australia/Perth' };
    enforceHeadOffice(data, { isCreate: true });
    expect(data.timezone).toBe('Australia/Perth');
    expect(data.currency).toBe('AUD');
  });

  test('update: currency-only write against a known AU row is corrected', () => {
    const data = { currency: 'INR' };
    enforceHeadOffice(data, { knownRegion: 'AU' });
    expect(data.currency).toBe('AUD');
    expect(mockWarn).toHaveBeenCalled();
  });

  test('update: currency write with unknown existing region is left alone', () => {
    const data = { currency: 'USD' };
    enforceHeadOffice(data, { knownRegion: null });
    expect(data.currency).toBe('USD');
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('update: region change pins the matching currency', () => {
    const data = { region: 'AU' };
    enforceHeadOffice(data, {});
    expect(data.currency).toBe('AUD');
  });

  test('unenforced regions (US etc.) are untouched', () => {
    const data = { region: 'US', currency: 'USD' };
    enforceHeadOffice(data, { isCreate: true });
    expect(data.currency).toBe('USD');
    expect(data.timezone).toBeUndefined();
  });

  test('unwraps Prisma { set: … } update shape', () => {
    const data = { region: { set: 'AU' }, currency: { set: 'INR' } };
    enforceHeadOffice(data, {});
    expect(data.currency).toBe('AUD');
  });
});

describe('enforceOutlet', () => {
  test('create: country Australia with INR currency is corrected to AUD + warned', () => {
    const data = { name: 'Store', country: 'Australia', currency: 'INR' };
    enforceOutlet(data, { isCreate: true });
    expect(data.currency).toBe('AUD');
    expect(mockWarn).toHaveBeenCalled();
  });

  test('create: parent head-office region fills country/currency/timezone when payload has none', () => {
    const data = { name: 'Store' };
    enforceOutlet(data, { isCreate: true, knownRegion: 'AU' });
    expect(data.currency).toBe('AUD');
    expect(data.country).toBe('Australia');
    expect(data.timezone).toBe(REGION_TIMEZONE.AU);
  });

  test('create: no country and no known region ⇒ untouched (schema defaults apply)', () => {
    const data = { name: 'Store' };
    enforceOutlet(data, { isCreate: true });
    expect(data.currency).toBeUndefined();
  });

  test('update: currency-only write against a known IN outlet is corrected', () => {
    const data = { currency: 'AUD' };
    enforceOutlet(data, { knownRegion: 'IN' });
    expect(data.currency).toBe('INR');
    expect(mockWarn).toHaveBeenCalled();
  });

  test('update: unenforced country is untouched', () => {
    const data = { country: 'United States', currency: 'USD' };
    enforceOutlet(data, {});
    expect(data.currency).toBe('USD');
  });

  test('constants: only AU and IN are enforced', () => {
    expect(REGION_CURRENCY).toEqual({ AU: 'AUD', IN: 'INR' });
  });
});
