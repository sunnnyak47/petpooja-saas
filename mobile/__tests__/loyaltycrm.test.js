/**
 * Unit tests for the Loyalty & CRM pure transforms (src/hooks/useLoyaltyCrm.js).
 * Only the deterministic, side-effect-free helpers are exercised — the
 * react-query hooks are not invoked here, so we mock the api + OutletContext
 * modules to keep the import graph clean.
 */
jest.mock('../src/lib/api', () => ({ __esModule: true, default: {} }));
jest.mock('../src/context/OutletContext', () => ({
  useOutlet: () => ({ outletId: 'test-outlet' }),
}));

import {
  num,
  unwrapList,
  unwrapObj,
  normalizeCrm,
  daysUntilBirthday,
  birthdayLabel,
  formatDob,
  buildBirthdayRows,
  pointsBalance,
  topLoyaltyMembers,
  configToForm,
  formToConfigPayload,
  campaignStatusMeta,
  audienceLabel,
  buildCampaignRow,
  buildCampaignRows,
  buildCampaignPayload,
  LOYALTY_FIELDS,
  CAMPAIGN_TYPES,
  SEGMENTS,
} from '../src/hooks/useLoyaltyCrm';

// A fixed "now" so birthday math is deterministic: 10 Mar 2026.
const NOW = new Date(2026, 2, 10); // month is 0-based → March

describe('num', () => {
  test('coerces Decimal strings and guards non-finite', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(Infinity)).toBe(0);
  });
});

describe('unwrapList', () => {
  test('unwraps the { data: [...] } envelope', () => {
    expect(unwrapList({ success: true, data: [1, 2] })).toEqual([1, 2]);
  });
  test('accepts a bare array and paginated items', () => {
    expect(unwrapList([3, 4])).toEqual([3, 4]);
    expect(unwrapList({ data: { items: [5] } })).toEqual([5]);
    expect(unwrapList({ items: [6] })).toEqual([6]);
  });
  test('returns [] for null / object payloads', () => {
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ data: { total_customers: 1 } })).toEqual([]);
  });
});

describe('unwrapObj', () => {
  test('unwraps the { data: {...} } envelope', () => {
    expect(unwrapObj({ success: true, data: { total_customers: 5 } })).toEqual({
      total_customers: 5,
    });
  });
  test('returns the raw object when there is no data envelope', () => {
    expect(unwrapObj({ total_customers: 3 })).toEqual({ total_customers: 3 });
    expect(unwrapObj(null)).toBeNull();
  });
});

describe('normalizeCrm', () => {
  const dashboard = {
    total_customers: 120,
    segments: { new: 30, regular: 40, vip: 15, lapsed: 35 },
    loyalty_stats: {
      total_points_outstanding: 5000,
      total_points_earned: 12000,
      total_points_redeemed: 7000,
    },
  };

  test('flattens KPIs and derives active / at-risk', () => {
    const k = normalizeCrm(dashboard);
    expect(k.totalCustomers).toBe(120);
    expect(k.newCount).toBe(30);
    expect(k.activeCount).toBe(55); // regular + vip
    expect(k.atRiskCount).toBe(35); // lapsed
    expect(k.pointsOutstanding).toBe(5000);
    expect(k.pointsEarned).toBe(12000);
    expect(k.pointsRedeemed).toBe(7000);
  });

  test('is defensive against a missing / empty payload', () => {
    const k = normalizeCrm(null);
    expect(k.totalCustomers).toBe(0);
    expect(k.activeCount).toBe(0);
    expect(k.atRiskCount).toBe(0);
    expect(k.pointsOutstanding).toBe(0);
  });
});

describe('daysUntilBirthday', () => {
  test('0 on the birthday itself', () => {
    expect(daysUntilBirthday('1990-03-10', NOW)).toBe(0);
  });
  test('counts forward to an upcoming birthday this year', () => {
    expect(daysUntilBirthday('1985-03-14', NOW)).toBe(4);
  });
  test('rolls over to next year for a passed birthday', () => {
    // 9 Mar already passed → next is 9 Mar 2027 = 364 days away.
    expect(daysUntilBirthday('2000-03-09', NOW)).toBe(364);
  });
  test('tolerates ISO datetime strings and Date objects', () => {
    expect(daysUntilBirthday('1990-03-14T00:00:00.000Z', NOW)).toBe(4);
  });
  test('null for a missing / invalid date', () => {
    expect(daysUntilBirthday(null, NOW)).toBeNull();
    expect(daysUntilBirthday('not-a-date', NOW)).toBeNull();
  });
});

describe('birthdayLabel', () => {
  test('maps day counts to human labels', () => {
    expect(birthdayLabel(0)).toBe('Today');
    expect(birthdayLabel(1)).toBe('Tomorrow');
    expect(birthdayLabel(5)).toBe('In 5 days');
    expect(birthdayLabel(null)).toBe('');
  });
});

describe('formatDob', () => {
  test('renders a locale-independent short date', () => {
    expect(formatDob('1990-03-14')).toBe('Mar 14');
    expect(formatDob('2001-12-01')).toBe('Dec 1');
    expect(formatDob(null)).toBe('');
  });
});

describe('buildBirthdayRows', () => {
  const list = [
    { id: 'c1', full_name: 'Zoe', phone: '111', date_of_birth: '1990-03-20' }, // 10 days
    { id: 'c2', full_name: 'Amy', phone: '222', date_of_birth: '1990-03-10' }, // today
    { id: 'c3', full_name: 'Bob', phone: '333', date_of_birth: '1990-03-11' }, // tomorrow
  ];

  test('sorts soonest-first and derives labels', () => {
    const rows = buildBirthdayRows(list, NOW);
    expect(rows.map((r) => r.id)).toEqual(['c2', 'c3', 'c1']);
    expect(rows[0].isToday).toBe(true);
    expect(rows[0].label).toBe('Today');
    expect(rows[1].label).toBe('Tomorrow');
    expect(rows[2].dobLabel).toBe('Mar 20');
  });

  test('handles empty input', () => {
    expect(buildBirthdayRows(null, NOW)).toEqual([]);
  });
});

describe('pointsBalance / topLoyaltyMembers', () => {
  const customers = [
    { id: 'a', full_name: 'High', phone: '1', segment: 'vip', total_spend: '5000', total_visits: 20, loyalty_points: { current_balance: 900 } },
    { id: 'b', full_name: 'Mid', phone: '2', segment: 'regular', total_spend: '2000', total_visits: 8, loyalty_points: { current_balance: 300 } },
    { id: 'c', full_name: 'Zero', phone: '3', segment: 'new', total_spend: '0', total_visits: 0, loyalty_points: { current_balance: 0 } },
  ];

  test('pointsBalance reads nested + flat shapes', () => {
    expect(pointsBalance(customers[0])).toBe(900);
    expect(pointsBalance({ loyalty_balance: '150' })).toBe(150);
    expect(pointsBalance(null)).toBe(0);
  });

  test('sorts by points desc and drops zero-balance members', () => {
    const rows = topLoyaltyMembers(customers);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']); // 'c' dropped
    expect(rows[0].points).toBe(900);
    expect(rows[0].totalSpend).toBe(5000);
    expect(rows[0].visits).toBe(20);
  });

  test('respects the limit and tolerates empty input', () => {
    expect(topLoyaltyMembers(customers, 1).map((r) => r.id)).toEqual(['a']);
    expect(topLoyaltyMembers(null)).toEqual([]);
  });
});

describe('loyalty config form round-trip', () => {
  const cfg = {
    enabled: true,
    earn_rate: 1,
    earn_per_amount: 100,
    redeem_value: 1,
    min_redemption: 100,
    signup_bonus: 50,
    birthday_bonus: 25,
    vip_threshold: 10000,
    vip_multiplier: 2,
    expiry_months: 12,
  };

  test('configToForm stringifies every editable field', () => {
    const form = configToForm(cfg);
    LOYALTY_FIELDS.forEach((f) => {
      expect(form[f.key]).toBe(String(cfg[f.key]));
    });
    expect(configToForm(null).earn_rate).toBe('');
  });

  test('formToConfigPayload coerces to numbers + enabled flag', () => {
    const form = configToForm(cfg);
    const payload = formToConfigPayload(form, true);
    expect(payload.enabled).toBe(true);
    expect(payload.earn_rate).toBe(1);
    expect(payload.vip_threshold).toBe(10000);
    expect(typeof payload.expiry_months).toBe('number');
  });

  test('guards earn_per_amount against zero (divide-by-zero on earn)', () => {
    const payload = formToConfigPayload({ ...configToForm(cfg), earn_per_amount: '0' }, false);
    expect(payload.earn_per_amount).toBe(1);
    expect(payload.enabled).toBe(false);
  });
});

describe('campaignStatusMeta', () => {
  test('maps known statuses to label + tone', () => {
    expect(campaignStatusMeta('sent')).toEqual({ label: 'Sent', tone: 'success' });
    expect(campaignStatusMeta('scheduled')).toEqual({ label: 'Scheduled', tone: 'warning' });
    expect(campaignStatusMeta('failed')).toEqual({ label: 'Failed', tone: 'error' });
  });
  test('falls back to a title-cased draft tone', () => {
    expect(campaignStatusMeta('draft').tone).toBe('textMuted');
    expect(campaignStatusMeta('queued')).toEqual({ label: 'Queued', tone: 'textMuted' });
    expect(campaignStatusMeta(undefined).label).toBe('Draft');
  });
});

describe('audienceLabel', () => {
  test('resolves segment keys and specials', () => {
    expect(audienceLabel('all')).toBe('All customers');
    expect(audienceLabel('vip')).toBe('VIP');
    expect(audienceLabel('birthday')).toBe('Birthday');
    expect(audienceLabel(undefined)).toBe('All customers');
    expect(audienceLabel('mystery')).toBe('mystery');
  });
});

describe('buildCampaignRow(s)', () => {
  const raw = {
    id: 'cmp1',
    name: 'Weekend Feast',
    type: 'whatsapp',
    target_segment: 'vip',
    message_template: 'Enjoy 20% off!',
    total_recipients: '40',
    delivered_count: '38',
    status: 'sent',
    sent_at: '2026-03-01T10:00:00Z',
  };

  test('shapes a raw campaign for the list', () => {
    const row = buildCampaignRow(raw);
    expect(row.name).toBe('Weekend Feast');
    expect(row.audience).toBe('VIP');
    expect(row.recipients).toBe(40);
    expect(row.delivered).toBe(38);
    expect(row.statusLabel).toBe('Sent');
    expect(row.statusTone).toBe('success');
  });

  test('buildCampaignRows maps a list and defaults missing fields', () => {
    const rows = buildCampaignRows([{ id: 'x', status: 'draft' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Untitled campaign');
    expect(rows[0].audience).toBe('All customers');
    expect(buildCampaignRows(null)).toEqual([]);
  });
});

describe('buildCampaignPayload', () => {
  test('builds a valid body, trimming + defaulting', () => {
    const payload = buildCampaignPayload({
      name: '  Diwali Blast  ',
      message: '  Sweet deals inside  ',
      type: 'sms',
    });
    expect(payload).toEqual({
      name: 'Diwali Blast',
      type: 'sms',
      target_segment: 'all',
      message: 'Sweet deals inside',
    });
  });

  test('throws on missing name / message', () => {
    expect(() => buildCampaignPayload({ message: 'hi' })).toThrow('name is required');
    expect(() => buildCampaignPayload({ name: 'Promo' })).toThrow('Message is required');
  });

  test('throws on an invalid channel', () => {
    expect(() => buildCampaignPayload({ name: 'P', message: 'm', type: 'carrier-pigeon' })).toThrow(
      'valid channel',
    );
  });
});

describe('exported constants', () => {
  test('segments, channels and loyalty fields are non-empty', () => {
    expect(SEGMENTS.length).toBeGreaterThan(0);
    expect(CAMPAIGN_TYPES.map((t) => t.key)).toEqual(['sms', 'whatsapp', 'email']);
    expect(LOYALTY_FIELDS.length).toBeGreaterThanOrEqual(9);
  });
});
