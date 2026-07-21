/**
 * Unit tests for the pure Accounting helpers (lib/accounting). No React / RN /
 * network — locks the /accounting owner-dashboard + profit-loss + bas +
 * receivables-aging contract the read-only screen depends on.
 */
import {
  toNumber, round2,
  extractDashboard, hasBooks, buildKpis, unpaidCaption,
  extractProfitLoss, extractBas, taxLabel,
  extractReceivables, receivablesItems, normalizeReceivable,
  agingBucket, receivableSeverity, overdueTotal, sortReceivables, topReceivables,
  formatDeltaPct, deltaTone, dueInLabel, timeAgo,
} from '../src/lib/accounting';

// A representative owner-dashboard body (as the api interceptor returns it).
const DASH_BODY = {
  success: true,
  data: {
    currency: 'AUD',
    region: 'AU',
    outlet_name: 'Bondi Kitchen',
    has_data: true,
    period: { month_label: 'July 2026', from: '2026-07-01', to: '2026-07-20' },
    profit: { this_month: 4200.5, prev_month: 3750, delta_pct: 12, is_up: true, revenue: 18000, gross_profit: 9000 },
    tax: { amount: 1450.25, net_gst: 1450.25, payable: true, quarter_label: 'Jul–Sep 2026', due_date: '2026-10-28', period_from: '2026-07-01', period_to: '2026-09-30' },
    receivables: { total: 980.4, count: 3, overdue: 220 },
    payables: { total: 640, count: 2 },
    expenses: { top: [{ code: '400', name: 'Wages', amount: 5000 }, { code: '410', name: 'Rent', amount: 2000 }], total: 9000 },
    generated_at: '2026-07-20T09:00:00Z',
  },
  message: 'ok',
};

const RECV_BODY = {
  success: true,
  data: {
    as_of: '2026-07-20T00:00:00Z',
    buckets: { '0-30': 300, '31-60': 200, '61-90': 100, '90+': 380.4 },
    total: 980.4,
    items: [
      { ref: 'ORD-1', customer: 'Acme Cafe', date: '2026-07-18', amount: 300, days: 2 },
      { ref: 'ORD-2', customer: 'Beta Diner', date: '2026-06-01', amount: 200, days: 49 },
      { ref: 'ORD-3', customer: null, date: '2026-04-01', amount: 480.4, days: 110 },
    ],
  },
  message: 'ok',
};

const PL_BODY = {
  data: {
    from: '2026-07-01', to: '2026-07-20',
    revenue: { accounts: [{ code: '200', name: 'Sales', amount: 18000 }], total: 18000 },
    expenses: { accounts: [{ code: '300', name: 'COGS', amount: 9000 }], total: 9000 },
    cogs_total: 9000, gross_profit: 9000, net_profit: 4200.5,
  },
};

const BAS_BODY = {
  data: {
    from: '2026-07-01', to: '2026-09-30',
    G1_total_sales: 19800, G11_purchases: 9900,
    gst_on_sales_1A: 1800, gst_on_purchases_1B: 349.75,
    net_gst: 1450.25, payable: true, period_label: '…',
  },
};

describe('primitives', () => {
  test('toNumber coerces / falls back', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber(null)).toBe(0);
    expect(toNumber('nope', 7)).toBe(7);
    expect(toNumber(undefined, -1)).toBe(-1);
  });
  test('round2 rounds to 2dp and never returns NaN', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2('3.14159')).toBe(3.14);
    expect(round2(null)).toBe(0);
    expect(round2('abc')).toBe(0);
  });
});

describe('extractDashboard accepts the api BODY or a raw payload', () => {
  test('normalises a full body', () => {
    const d = extractDashboard(DASH_BODY);
    expect(d.currency).toBe('AUD');
    expect(d.region).toBe('AU');
    expect(d.outlet_name).toBe('Bondi Kitchen');
    expect(d.has_data).toBe(true);
    expect(d.profit.this_month).toBe(4200.5);
    expect(d.profit.is_up).toBe(true);
    expect(d.profit.delta_pct).toBe(12);
    expect(d.tax.amount).toBe(1450.25);
    expect(d.tax.payable).toBe(true);
    expect(d.receivables.count).toBe(3);
    expect(d.payables.total).toBe(640);
    expect(d.expenses.top).toHaveLength(2);
  });
  test('accepts a raw payload too', () => {
    expect(extractDashboard(DASH_BODY.data).outlet_name).toBe('Bondi Kitchen');
  });
  test('null / empty / malformed → safe defaults, no throw', () => {
    const d = extractDashboard(null);
    expect(d.currency).toBe('AUD');
    expect(d.has_data).toBe(false);
    expect(d.tax).toBeNull();
    expect(d.profit.this_month).toBe(0);
    expect(d.profit.delta_pct).toBeNull();
    expect(d.profit.is_up).toBeNull();
    expect(d.receivables.total).toBe(0);
    expect(d.expenses.top).toEqual([]);
    expect(extractDashboard({}).has_data).toBe(false);
    expect(extractDashboard({ data: { expenses: { top: 'bad' } } }).expenses.top).toEqual([]);
  });
});

describe('hasBooks', () => {
  test('reflects has_data', () => {
    expect(hasBooks(extractDashboard(DASH_BODY))).toBe(true);
    expect(hasBooks(extractDashboard(null))).toBe(false);
    expect(hasBooks(null)).toBe(false);
  });
});

describe('buildKpis', () => {
  test('produces exactly the four cards in order', () => {
    const kpis = buildKpis(extractDashboard(DASH_BODY));
    expect(kpis.map((k) => k.key)).toEqual(['profit', 'revenue', 'bas', 'receivables']);
    const [profit, revenue, bas, recv] = kpis;
    expect(profit.amount).toBe(4200.5);
    expect(profit.tone).toBe('positive');
    expect(profit.caption).toBe('+12%');
    expect(revenue.amount).toBe(18000);
    expect(bas.label).toBe('BAS / GST due');
    expect(bas.amount).toBe(1450.25);
    expect(bas.due).toBe('2026-10-28');
    expect(recv.amount).toBe(980.4);
    expect(recv.caption).toBe('3 unpaid');
  });
  test('negative profit reads as a negative tone', () => {
    const d = extractDashboard({ data: { profit: { this_month: -50 } } });
    expect(buildKpis(d)[0].tone).toBe('negative');
  });
  test('no dashboard → four zeroed cards without throwing', () => {
    const kpis = buildKpis(null);
    expect(kpis).toHaveLength(4);
    expect(kpis[0].amount).toBe(0);
    expect(kpis[2].label).toBe('BAS / GST');
    expect(kpis[3].caption).toBe('None outstanding');
  });
});

describe('unpaidCaption', () => {
  test('pluralises and handles empty', () => {
    expect(unpaidCaption(1)).toBe('1 unpaid');
    expect(unpaidCaption(4)).toBe('4 unpaid');
    expect(unpaidCaption(0)).toBe('None outstanding');
    expect(unpaidCaption(null)).toBe('None outstanding');
    expect(unpaidCaption(-3)).toBe('None outstanding');
  });
});

describe('extractProfitLoss', () => {
  test('normalises totals + keeps accounts', () => {
    const pl = extractProfitLoss(PL_BODY);
    expect(pl.revenue).toBe(18000);
    expect(pl.expenses).toBe(9000);
    expect(pl.grossProfit).toBe(9000);
    expect(pl.netProfit).toBe(4200.5);
    expect(pl.revenueAccounts).toHaveLength(1);
  });
  test('null / empty → zeros + empty arrays', () => {
    const pl = extractProfitLoss(null);
    expect(pl.revenue).toBe(0);
    expect(pl.netProfit).toBe(0);
    expect(pl.revenueAccounts).toEqual([]);
    expect(pl.expenseAccounts).toEqual([]);
  });
});

describe('extractBas + taxLabel', () => {
  test('normalises net GST + abs amount', () => {
    const bas = extractBas(BAS_BODY);
    expect(bas.netGst).toBe(1450.25);
    expect(bas.amount).toBe(1450.25);
    expect(bas.payable).toBe(true);
    expect(bas.gstOnSales).toBe(1800);
  });
  test('a refund (negative net GST) → positive abs amount, payable false', () => {
    const bas = extractBas({ data: { net_gst: -300, payable: false } });
    expect(bas.netGst).toBe(-300);
    expect(bas.amount).toBe(300);
    expect(bas.payable).toBe(false);
  });
  test('null → zeros, payable defaults true', () => {
    const bas = extractBas(null);
    expect(bas.amount).toBe(0);
    expect(bas.payable).toBe(true);
  });
  test('taxLabel copy', () => {
    expect(taxLabel({ payable: true })).toBe('BAS / GST due');
    expect(taxLabel({ payable: false })).toBe('GST refund');
    expect(taxLabel(null)).toBe('BAS / GST');
  });
});

describe('receivables extraction', () => {
  test('receivablesItems accepts body or payload', () => {
    expect(receivablesItems(RECV_BODY)).toHaveLength(3);
    expect(receivablesItems(RECV_BODY.data)).toHaveLength(3);
    expect(receivablesItems(null)).toEqual([]);
    expect(receivablesItems({})).toEqual([]);
  });
  test('extractReceivables normalises total + buckets + items', () => {
    const r = extractReceivables(RECV_BODY);
    expect(r.total).toBe(980.4);
    expect(r.buckets['90+']).toBe(380.4);
    expect(r.items).toHaveLength(3);
    expect(r.items[2].customer).toBe('Walk-in customer'); // null customer defaulted
  });
  test('extractReceivables tolerates missing buckets/items', () => {
    const r = extractReceivables({ data: { total: 5 } });
    expect(r.total).toBe(5);
    expect(r.buckets).toEqual({ '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });
    expect(r.items).toEqual([]);
  });
  test('normalizeReceivable clamps negatives + coerces', () => {
    const n = normalizeReceivable({ ref: 42, amount: '12.5', days: -3 });
    expect(n.ref).toBe('42');
    expect(n.amount).toBe(12.5);
    expect(n.days).toBe(0);
    expect(n.customer).toBe('Walk-in customer');
    expect(normalizeReceivable({}).ref).toBe('');
  });
});

describe('aging buckets + severity', () => {
  test('agingBucket boundaries', () => {
    expect(agingBucket(0)).toBe('0-30');
    expect(agingBucket(30)).toBe('0-30');
    expect(agingBucket(31)).toBe('31-60');
    expect(agingBucket(60)).toBe('31-60');
    expect(agingBucket(90)).toBe('61-90');
    expect(agingBucket(91)).toBe('90+');
    expect(agingBucket('bad')).toBe('0-30');
  });
  test('receivableSeverity maps to tone + label', () => {
    expect(receivableSeverity(2)).toEqual({ key: 'current', tone: 'positive', label: 'Current' });
    expect(receivableSeverity(49).tone).toBe('neutral');
    expect(receivableSeverity(70).tone).toBe('negative');
    expect(receivableSeverity(200)).toEqual({ key: 'critical', tone: 'negative', label: '90+ days' });
  });
  test('overdueTotal sums the aged buckets only', () => {
    expect(overdueTotal({ '0-30': 300, '31-60': 200, '61-90': 100, '90+': 380.4 })).toBe(680.4);
    expect(overdueTotal(null)).toBe(0);
    expect(overdueTotal({})).toBe(0);
  });
});

describe('sort + top receivables', () => {
  const items = extractReceivables(RECV_BODY).items;
  test('sortReceivables puts most-overdue first', () => {
    const sorted = sortReceivables(items);
    expect(sorted.map((i) => i.days)).toEqual([110, 49, 2]);
    expect(sortReceivables(null)).toEqual([]);
  });
  test('sort breaks day-ties by amount', () => {
    const tie = sortReceivables([
      { days: 10, amount: 5 }, { days: 10, amount: 50 }, { days: 10, amount: 20 },
    ]);
    expect(tie.map((i) => i.amount)).toEqual([50, 20, 5]);
  });
  test('topReceivables slices without mutating', () => {
    const top = topReceivables(items, 2);
    expect(top).toHaveLength(2);
    expect(top[0].days).toBe(110);
    expect(items).toHaveLength(3); // original untouched
    expect(topReceivables([], 5)).toEqual([]);
  });
});

describe('formatters', () => {
  test('formatDeltaPct', () => {
    expect(formatDeltaPct(12)).toBe('+12%');
    expect(formatDeltaPct(-8)).toBe('-8%');
    expect(formatDeltaPct(0)).toBe('0%');
    expect(formatDeltaPct(null)).toBe('—');
    expect(formatDeltaPct(undefined)).toBe('—');
  });
  test('deltaTone', () => {
    expect(deltaTone(true)).toBe('positive');
    expect(deltaTone(false)).toBe('negative');
    expect(deltaTone(null)).toBe('neutral');
  });
  test('dueInLabel is deterministic with an injected now', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(dueInLabel('2026-10-28', now)).toBe('In 8 days');
    expect(dueInLabel('2026-10-21', now)).toBe('In 1 day');
    expect(dueInLabel('2026-10-20', now)).toBe('Due today');
    expect(dueInLabel('2026-10-18', now)).toBe('2 days overdue');
    expect(dueInLabel('2026-10-19', now)).toBe('1 day overdue');
    expect(dueInLabel(null, now)).toBe('');
    expect(dueInLabel('not-a-date', now)).toBe('');
  });
  test('timeAgo is deterministic with an injected now', () => {
    const now = Date.parse('2026-07-20T12:00:00Z');
    expect(timeAgo('2026-07-20T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-07-20T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-07-20T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-07-18T12:00:00Z', now)).toBe('2d ago');
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo('not-a-date', now)).toBe('');
  });
});
