/**
 * Unit tests for the pure Settlements helpers (lib/settlements). No React / RN /
 * network — locks the /settlements contract (list + stats + detail) the screen
 * depends on. Modelled on __tests__/devices.test.js.
 */
import {
  extractSettlements,
  extractTotal,
  extractStats,
  extractSettlement,
  extractLines,
  totalSettled,
  pendingCount,
  settlementCount,
  summarizeRows,
  settlementAmount,
  settlementDate,
  settlementRef,
  providerLabel,
  providerIconName,
  statusMeta,
  matchStatusMeta,
  lineTypeLabel,
  titleCase,
  matchesSettlement,
  filterSettlements,
  formatMoney,
  fmtDate,
  timeAgo,
  round2,
  EMPTY_STATS,
} from '../src/lib/settlements';

// sendPaginated body → { success, data: rows[], message, meta:{ total, page, limit } }
const LIST_BODY = {
  success: true,
  message: 'Settlements retrieved',
  data: [
    { id: 's1', provider: 'razorpay', reference: 'RZP-1', status: 'matched', net_amount: 1000, variance_amount: 0, currency: 'INR', settlement_date: '2026-07-19T00:00:00Z' },
    { id: 's2', provider: 'upi', reference: 'UPI-9', status: 'open', net_amount: 500.5, variance_amount: 12.34, currency: 'INR', settlement_date: '2026-07-18T00:00:00Z' },
    { id: 's3', provider: 'bank', reference: null, status: 'variance', net_amount: 250, variance_amount: -5, currency: 'INR', settlement_date: '2026-07-17T00:00:00Z' },
  ],
  meta: { total: 42, page: 1, limit: 50, totalPages: 1 },
};

// sendSuccess body → { success, data:{...}, message }
const STATS_BODY = {
  success: true,
  message: 'Settlement stats retrieved',
  data: {
    total: 42,
    by_status: { open: 5, matched: 30, variance: 4, closed: 3 },
    total_net: 123456.78,
    total_variance: 210.5,
  },
};

const DETAIL_BODY = {
  success: true,
  message: 'Settlement retrieved',
  data: {
    id: 's1',
    provider: 'razorpay',
    status: 'matched',
    currency: 'INR',
    net_amount: 1000,
    gross_amount: 1050,
    fees: 50,
    lines: [
      { id: 'l1', type: 'payment', amount: 600, match_status: 'matched', transaction_id: 'txn_1' },
      { id: 'l2', type: 'refund', amount: 100, match_status: 'unmatched', transaction_id: null },
    ],
  },
};

describe('extractors accept the api BODY or a raw payload', () => {
  test('extractSettlements from paginated body, raw array, and {rows|items}', () => {
    expect(extractSettlements(LIST_BODY)).toHaveLength(3);
    expect(extractSettlements(LIST_BODY.data)).toHaveLength(3); // raw array
    expect(extractSettlements({ data: { rows: [{ id: 'x' }] } })).toHaveLength(1);
    expect(extractSettlements({ data: { items: [{ id: 'y' }] } })).toHaveLength(1);
    expect(extractSettlements({ items: [{ id: 'z' }] })).toHaveLength(1);
    expect(extractSettlements(null)).toEqual([]);
    expect(extractSettlements({})).toEqual([]);
    expect(extractSettlements({ data: null })).toEqual([]);
  });

  test('extractTotal prefers meta.total, falls back to row count', () => {
    expect(extractTotal(LIST_BODY, extractSettlements(LIST_BODY))).toBe(42);
    expect(extractTotal({ data: [{ id: 'a' }, { id: 'b' }] })).toBe(2);
    expect(extractTotal({}, [{ id: 'a' }])).toBe(1);
    expect(extractTotal(null)).toBe(0);
  });

  test('extractStats is always fully shaped and numeric', () => {
    const st = extractStats(STATS_BODY);
    expect(st.total).toBe(42);
    expect(st.by_status).toEqual({ open: 5, matched: 30, variance: 4, closed: 3 });
    expect(st.total_net).toBe(123456.78);
    expect(st.total_variance).toBe(210.5);
    // raw payload too
    expect(extractStats(STATS_BODY.data).total).toBe(42);
    // malformed → zeroed shape (never throws)
    expect(extractStats(null)).toEqual(EMPTY_STATS);
    expect(extractStats({})).toEqual(EMPTY_STATS);
    expect(extractStats({ data: { total: 'x', by_status: null } })).toEqual(EMPTY_STATS);
    expect(extractStats([1, 2, 3])).toEqual(EMPTY_STATS);
  });

  test('extractSettlement returns the object or null', () => {
    expect(extractSettlement(DETAIL_BODY).id).toBe('s1');
    expect(extractSettlement(DETAIL_BODY.data).id).toBe('s1'); // raw payload
    expect(extractSettlement(null)).toBeNull();
    expect(extractSettlement([1, 2])).toBeNull();
    expect(extractSettlement({ data: [1] })).toBeNull();
  });

  test('extractLines from body or from a settlement object', () => {
    expect(extractLines(DETAIL_BODY)).toHaveLength(2);
    expect(extractLines(DETAIL_BODY.data)).toHaveLength(2);
    expect(extractLines({ lines: [{ id: 'a' }] })).toHaveLength(1);
    expect(extractLines(null)).toEqual([]);
    expect(extractLines({})).toEqual([]);
  });
});

describe('derived stat helpers', () => {
  const st = extractStats(STATS_BODY);
  test('totalSettled / pendingCount / settlementCount', () => {
    expect(totalSettled(st)).toBe(123456.78);
    expect(pendingCount(st)).toBe(9); // open(5) + variance(4)
    expect(settlementCount(st)).toBe(42);
  });
  test('tolerate missing stats', () => {
    expect(totalSettled(null)).toBe(0);
    expect(pendingCount(undefined)).toBe(0);
    expect(settlementCount({})).toBe(0);
  });
  test('summarizeRows derives a stats shape from a row set', () => {
    const sum = summarizeRows(extractSettlements(LIST_BODY));
    expect(sum.total).toBe(3);
    expect(sum.by_status).toEqual({ open: 1, matched: 1, variance: 1, closed: 0 });
    expect(sum.total_net).toBe(1750.5); // 1000 + 500.5 + 250
    expect(sum.total_variance).toBe(7.34); // 0 + 12.34 - 5
    expect(summarizeRows(null)).toEqual({ total: 0, by_status: { open: 0, matched: 0, variance: 0, closed: 0 }, total_net: 0, total_variance: 0 });
  });
});

describe('field accessors', () => {
  test('settlementAmount reads net_amount, NaN-safe', () => {
    expect(settlementAmount({ net_amount: 12.5 })).toBe(12.5);
    expect(settlementAmount({ net_amount: 'nope' })).toBe(0);
    expect(settlementAmount({})).toBe(0);
    expect(settlementAmount(null)).toBe(0);
  });
  test('settlementDate prefers settlement_date then created_at', () => {
    expect(settlementDate({ settlement_date: 'A', created_at: 'B' })).toBe('A');
    expect(settlementDate({ created_at: 'B' })).toBe('B');
    expect(settlementDate({})).toBeNull();
  });
  test('settlementRef falls back to a short id, never blank when id present', () => {
    expect(settlementRef({ reference: 'RZP-1' })).toBe('RZP-1');
    expect(settlementRef({ reference: '  ', id: 'abcdef123456' })).toBe('abcdef12');
    expect(settlementRef({ id: 'abcdef123456' })).toBe('abcdef12');
    expect(settlementRef({})).toBe('');
  });
});

describe('label + tone maps', () => {
  test('providerLabel', () => {
    expect(providerLabel('razorpay')).toBe('Razorpay');
    expect(providerLabel('card_acquirer')).toBe('Card acquirer');
    expect(providerLabel('upi')).toBe('UPI');
    expect(providerLabel('bank')).toBe('Bank transfer');
    expect(providerLabel('manual')).toBe('Manual');
    expect(providerLabel('some_gateway')).toBe('Some gateway');
    expect(providerLabel(undefined)).toBe('Unknown');
  });
  test('providerIconName maps to Ionicons', () => {
    expect(providerIconName('razorpay')).toBe('flash-outline');
    expect(providerIconName('card_acquirer')).toBe('card-outline');
    expect(providerIconName('upi')).toBe('phone-portrait-outline');
    expect(providerIconName('bank')).toBe('business-outline');
    expect(providerIconName('manual')).toBe('create-outline');
    expect(providerIconName('other')).toBe('cash-outline');
    expect(providerIconName(undefined)).toBe('cash-outline');
  });
  test('statusMeta label + tone', () => {
    expect(statusMeta('open')).toEqual({ label: 'Open', tone: 'warning' });
    expect(statusMeta('matched')).toEqual({ label: 'Matched', tone: 'success' });
    expect(statusMeta('variance')).toEqual({ label: 'Variance', tone: 'error' });
    expect(statusMeta('closed')).toEqual({ label: 'Closed', tone: 'muted' });
    expect(statusMeta('weird')).toEqual({ label: 'Weird', tone: 'muted' });
    expect(statusMeta(undefined)).toEqual({ label: 'Unknown', tone: 'muted' });
  });
  test('matchStatusMeta label + tone', () => {
    expect(matchStatusMeta('matched')).toEqual({ label: 'Matched', tone: 'success' });
    expect(matchStatusMeta('mismatch')).toEqual({ label: 'Mismatch', tone: 'error' });
    expect(matchStatusMeta('unmatched')).toEqual({ label: 'Unmatched', tone: 'warning' });
    expect(matchStatusMeta(undefined)).toEqual({ label: 'Unmatched', tone: 'muted' });
  });
  test('lineTypeLabel + titleCase', () => {
    expect(lineTypeLabel('payment')).toBe('Payment');
    expect(lineTypeLabel('chargeback')).toBe('Chargeback');
    expect(lineTypeLabel(undefined)).toBe('Payment');
    expect(titleCase('card_acquirer')).toBe('Card acquirer');
    expect(titleCase('')).toBe('');
    expect(titleCase(null)).toBe('');
  });
});

describe('filters', () => {
  const rows = extractSettlements(LIST_BODY);
  test('matchesSettlement blank query matches all; matches provider/ref/status', () => {
    expect(matchesSettlement(rows[0], '')).toBe(true);
    expect(matchesSettlement(rows[0], 'razor')).toBe(true);
    expect(matchesSettlement(rows[0], 'RZP')).toBe(true);
    expect(matchesSettlement(rows[0], 'matched')).toBe(true);
    expect(matchesSettlement(rows[0], 'zzz')).toBe(false);
    expect(matchesSettlement({}, 'anything')).toBe(false);
  });
  test('filterSettlements by status + provider + query', () => {
    expect(filterSettlements(rows, {})).toHaveLength(3);
    expect(filterSettlements(rows, { status: 'open' })).toHaveLength(1);
    expect(filterSettlements(rows, { provider: 'bank' })).toHaveLength(1);
    expect(filterSettlements(rows, { status: 'matched', provider: 'razorpay' })).toHaveLength(1);
    expect(filterSettlements(rows, { q: 'upi' })).toHaveLength(1);
    expect(filterSettlements(rows, { status: 'closed' })).toHaveLength(0);
    expect(filterSettlements(null, {})).toEqual([]);
  });
});

describe('formatters', () => {
  test('round2', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2('nope')).toBe(0);
    expect(round2(null)).toBe(0);
    expect(round2(250)).toBe(250);
  });
  test('formatMoney is currency-aware and NaN-safe', () => {
    expect(formatMoney('INR', 100)).toContain('100');
    expect(typeof formatMoney('AUD', 5)).toBe('string');
    expect(formatMoney('INR', 'x')).toContain('0'); // NaN → 0
    expect(formatMoney(undefined, 1)).toContain('1'); // defaults currency, no throw
  });
  test('fmtDate empty on missing / invalid, string otherwise', () => {
    expect(fmtDate(null)).toBe('');
    expect(fmtDate('')).toBe('');
    expect(fmtDate('not-a-date')).toBe('');
    expect(typeof fmtDate('2026-07-20T00:00:00Z')).toBe('string');
    expect(fmtDate('2026-07-20T00:00:00Z').length).toBeGreaterThan(0);
  });
  test('timeAgo is deterministic with an injected now', () => {
    const now = Date.parse('2026-07-20T12:00:00Z');
    expect(timeAgo('2026-07-20T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-07-20T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-07-20T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-07-18T12:00:00Z', now)).toBe('2d ago');
    expect(timeAgo('2026-05-20T12:00:00Z', now)).toBe('2mo ago');
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo('not-a-date', now)).toBe('');
  });
});
