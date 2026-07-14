/**
 * Unit tests for the pure helpers in useCreditNotes — filtering, formatting,
 * summary counts and the create-payload builder/validator. No React, no
 * network: deterministic in → out.
 */

// The hook imports OutletContext → AsyncStorage and the api client; mock them so
// importing the pure helpers is safe.
jest.mock('../src/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import {
  creditNoteNumber,
  matchesCreditNote,
  filterCreditNotes,
  formatMoney,
  summarizeCounts,
  buildCreatePayload,
  CN_STATUS,
} from '../src/hooks/useCreditNotes';

const ROWS = [
  { id: '1', credit_note_no: 'CN-001', status: 'issued', total_amount: 50, currency: 'AUD', customer_name: 'Asha', reason: 'Spilled coffee' },
  { id: '2', credit_note_no: 'CN-002', status: 'cancelled', total_amount: 20, currency: 'AUD', customer_name: 'Ben', reason: 'Mistake' },
  { id: '3', credit_note_no: 'CN-003', status: 'issued', total_amount: 12.5, currency: 'AUD', customer_name: 'Cara', reason: 'Wrong dish' },
];

describe('creditNoteNumber', () => {
  test('prefers credit_note_no, falls back gracefully', () => {
    expect(creditNoteNumber({ credit_note_no: 'CN-9' })).toBe('CN-9');
    expect(creditNoteNumber({ id: 'x' })).toBe('x');
    expect(creditNoteNumber({})).toBe('');
  });
});

describe('matchesCreditNote', () => {
  test('matches number / customer / reason, case-insensitive', () => {
    expect(matchesCreditNote(ROWS[0], '')).toBe(true);
    expect(matchesCreditNote(ROWS[0], 'cn-001')).toBe(true);
    expect(matchesCreditNote(ROWS[0], 'asha')).toBe(true);
    expect(matchesCreditNote(ROWS[0], 'coffee')).toBe(true);
    expect(matchesCreditNote(ROWS[0], 'zzz')).toBe(false);
  });
});

describe('filterCreditNotes', () => {
  test('by status', () => {
    expect(filterCreditNotes(ROWS, { status: 'issued' })).toHaveLength(2);
    expect(filterCreditNotes(ROWS, { status: 'cancelled' })).toHaveLength(1);
    expect(filterCreditNotes(ROWS, { status: 'all' })).toHaveLength(3);
  });
  test('status + query together', () => {
    const r = filterCreditNotes(ROWS, { status: 'issued', q: 'cara' });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('3');
  });
});

describe('formatMoney', () => {
  test('AUD and INR', () => {
    expect(formatMoney('AUD', 50)).toMatch(/\$\s?50/);
    expect(formatMoney('INR', 50)).toMatch(/₹\s?50/);
    expect(formatMoney(undefined, 0)).toMatch(/0/);
  });
});

describe('summarizeCounts', () => {
  test('issued / cancelled / total', () => {
    expect(summarizeCounts(ROWS)).toEqual({ issued: 2, cancelled: 1, total: 3 });
    expect(summarizeCounts([])).toEqual({ issued: 0, cancelled: 0, total: 0 });
  });
});

describe('buildCreatePayload', () => {
  test('rejects non-positive amounts', () => {
    expect(buildCreatePayload({ total_amount: 0 }).ok).toBe(false);
    expect(buildCreatePayload({ total_amount: -5 }).ok).toBe(false);
    expect(buildCreatePayload({ total_amount: 'abc' }).ok).toBe(false);
  });
  test('builds a rounded payload with trimmed optional fields', () => {
    const r = buildCreatePayload({ total_amount: '12.349', reason: '  refund ', customer_name: ' Asha ', customer_phone: '' });
    expect(r.ok).toBe(true);
    expect(r.payload.total_amount).toBe(12.35);
    expect(r.payload.reason).toBe('refund');
    expect(r.payload.customer_name).toBe('Asha');
    expect(r.payload).not.toHaveProperty('customer_phone'); // blank omitted
  });
});

test('CN_STATUS constants', () => {
  expect(CN_STATUS).toEqual({ ISSUED: 'issued', CANCELLED: 'cancelled' });
});
