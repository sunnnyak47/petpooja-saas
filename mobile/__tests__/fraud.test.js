/**
 * Unit tests for the pure Fraud & Risk helpers (lib/fraud). No React / RN /
 * network — locks the /fraud/alerts + /fraud/stats + /fraud/staff-risks contract
 * the screen depends on. Modelled on devices.test.js.
 */
import {
  extractAlerts, extractAlertsMeta, extractStats, extractStaffRisks,
  SEVERITY_ORDER, severityColor, severityLabel, severityRank,
  alertTypeLabel, alertTypeIcon,
  alertAmount, alertStaffName, alertTime, isUnread,
  filterAlerts, sortAlerts,
  severityCount, severityBreakdown, unreadCount,
  riskLevelColor, riskLevelLabel,
  timeAgo,
} from '../src/lib/fraud';

// Shape mirrors sendSuccess(listAlerts(...)) → { data: { items, total, ... } }.
const ALERTS_BODY = {
  success: true,
  data: {
    items: [
      {
        id: 'a1', alert_type: 'VOID_ABUSE', severity: 'high', risk_score: 79,
        title: 'Ravi voided 4 orders', is_read: false, is_dismissed: false, is_resolved: false,
        created_at: '2026-07-20T11:00:00Z',
        staff: { id: 's1', full_name: 'Ravi K' },
        evidence: { staff_name: 'Ravi K', void_count: 4, total_voided: 3200 },
      },
      {
        id: 'a2', alert_type: 'QUICK_CANCEL', severity: 'low', risk_score: 40,
        title: 'Meera quick-cancelled 2 orders', is_read: true, is_dismissed: false, is_resolved: false,
        created_at: '2026-07-20T09:00:00Z',
        staff: { id: 's2', full_name: 'Meera' },
        evidence: { staff_name: 'Meera', count: 2 },
      },
    ],
    total: 2, page: 1, limit: 20, pages: 1,
  },
  message: 'Fraud alerts retrieved',
};

const STATS_BODY = {
  success: true,
  data: {
    total: 5, unread: 3,
    by_severity: { critical: 1, high: 2, low: 2 },
    by_type: [{ type: 'VOID_ABUSE', count: 2 }, { type: 'DISCOUNT_ABUSE', count: 1 }],
    trend_7d: [{ day: '2026-07-19', count: 2 }],
  },
  message: 'Fraud stats retrieved',
};

const STAFF_BODY = {
  success: true,
  data: [
    { id: 's1', full_name: 'Ravi K', role: 'waiter', alert_count: 3, unresolved: 2, max_risk_score: 79, risk_level: 'medium', alert_types: ['VOID_ABUSE'] },
    { id: 's2', full_name: 'Meera', role: 'cashier', alert_count: 0, unresolved: 0, max_risk_score: 0, risk_level: 'clean', alert_types: [] },
  ],
  message: 'Staff risk profiles retrieved',
};

describe('extractors accept the api BODY or a raw payload', () => {
  test('extractAlerts', () => {
    expect(extractAlerts(ALERTS_BODY)).toHaveLength(2);
    expect(extractAlerts(ALERTS_BODY.data)).toHaveLength(2); // raw payload too
    expect(extractAlerts([{ id: 'x' }])).toHaveLength(1);     // bare array
    expect(extractAlerts(null)).toEqual([]);
    expect(extractAlerts({})).toEqual([]);
    expect(extractAlerts({ data: {} })).toEqual([]);
  });

  test('extractAlertsMeta gives safe defaults', () => {
    expect(extractAlertsMeta(ALERTS_BODY)).toEqual({ total: 2, page: 1, limit: 20, pages: 1 });
    expect(extractAlertsMeta(null)).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
    expect(extractAlertsMeta({})).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  test('extractStats normalises every field', () => {
    const s = extractStats(STATS_BODY);
    expect(s.total).toBe(5);
    expect(s.unread).toBe(3);
    expect(s.by_severity).toEqual({ critical: 1, high: 2, low: 2 });
    expect(s.by_type).toHaveLength(2);
    expect(s.trend_7d).toHaveLength(1);
    expect(extractStats(STATS_BODY.data).total).toBe(5); // raw payload
    expect(extractStats(null)).toEqual({ total: 0, unread: 0, by_severity: {}, by_type: [], trend_7d: [] });
    expect(extractStats({ data: { by_severity: 'nope', by_type: 'nope' } })).toEqual({
      total: 0, unread: 0, by_severity: {}, by_type: [], trend_7d: [],
    });
  });

  test('extractStaffRisks', () => {
    expect(extractStaffRisks(STAFF_BODY)).toHaveLength(2);
    expect(extractStaffRisks(STAFF_BODY.data)).toHaveLength(2);
    expect(extractStaffRisks({ data: { items: [{ id: 'z' }] } })).toHaveLength(1);
    expect(extractStaffRisks(null)).toEqual([]);
    expect(extractStaffRisks({})).toEqual([]);
  });
});

describe('severity mapping', () => {
  test('SEVERITY_ORDER is high→low', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'high', 'medium', 'low']);
  });
  test('severityColor', () => {
    expect(severityColor('critical')).toBe('#dc2626');
    expect(severityColor('HIGH')).toBe('#ea580c'); // case-insensitive
    expect(severityColor('medium')).toBe('#d97706');
    expect(severityColor('low')).toBe('#2563eb');
    expect(severityColor('mystery')).toBe('#64748b');
    expect(severityColor(undefined)).toBe('#64748b');
  });
  test('severityLabel', () => {
    expect(severityLabel('critical')).toBe('Critical');
    expect(severityLabel('low')).toBe('Low');
    expect(severityLabel('')).toBe('Unknown');
    expect(severityLabel(null)).toBe('Unknown');
  });
  test('severityRank orders correctly', () => {
    expect(severityRank('critical')).toBe(4);
    expect(severityRank('high')).toBe(3);
    expect(severityRank('medium')).toBe(2);
    expect(severityRank('low')).toBe(1);
    expect(severityRank('junk')).toBe(0);
    expect(severityRank(undefined)).toBe(0);
  });
});

describe('alert type mapping', () => {
  test('alertTypeLabel known + fallback', () => {
    expect(alertTypeLabel('EXCESSIVE_CANCELLATIONS')).toBe('Excessive cancellations');
    expect(alertTypeLabel('KOT_WITHOUT_BILL')).toBe('KOT without bill');
    expect(alertTypeLabel('REFUND_PATTERN')).toBe('Refund pattern');
    expect(alertTypeLabel('SOME_NEW_RULE')).toBe('Some New Rule'); // title-cased fallback
    expect(alertTypeLabel('')).toBe('Alert');
    expect(alertTypeLabel(undefined)).toBe('Alert');
  });
  test('alertTypeIcon known + fallback', () => {
    expect(alertTypeIcon('VOID_ABUSE')).toBe('trash-outline');
    expect(alertTypeIcon('LATE_NIGHT_ANOMALY')).toBe('moon-outline');
    expect(alertTypeIcon('unknown')).toBe('alert-circle-outline');
    expect(alertTypeIcon(undefined)).toBe('alert-circle-outline');
  });
});

describe('per-alert accessors', () => {
  const rows = extractAlerts(ALERTS_BODY);
  test('alertAmount pulls money from evidence, else null', () => {
    expect(alertAmount(rows[0])).toBe(3200);        // total_voided
    expect(alertAmount(rows[1])).toBeNull();          // quick-cancel has no money
    expect(alertAmount({ evidence: { total_amount: 900 } })).toBe(900);
    expect(alertAmount({ evidence: { total_refunded: 150 } })).toBe(150);
    expect(alertAmount({ evidence: { total_voided: 0 } })).toBeNull(); // 0 is not "at risk"
    expect(alertAmount({ evidence: {} })).toBeNull();
    expect(alertAmount({})).toBeNull();
    expect(alertAmount(null)).toBeNull();
  });
  test('alertStaffName prefers joined staff, then evidence, then fallback', () => {
    expect(alertStaffName(rows[0])).toBe('Ravi K');
    expect(alertStaffName({ evidence: { staff_name: 'Sam' } })).toBe('Sam');
    expect(alertStaffName({ staff: { full_name: '  ' }, evidence: { staff_name: 'Sam' } })).toBe('Sam');
    expect(alertStaffName({})).toBe('Unknown staff');
    expect(alertStaffName(null)).toBe('Unknown staff');
  });
  test('alertTime + isUnread', () => {
    expect(alertTime(rows[0])).toBe('2026-07-20T11:00:00Z');
    expect(alertTime({})).toBeNull();
    expect(isUnread(rows[0])).toBe(true);
    expect(isUnread(rows[1])).toBe(false);
    expect(isUnread(null)).toBe(false);
  });
});

describe('filtering + sorting', () => {
  const rows = extractAlerts(ALERTS_BODY);
  test('filterAlerts all vs unread', () => {
    expect(filterAlerts(rows, 'all')).toHaveLength(2);
    expect(filterAlerts(rows, 'unread')).toHaveLength(1);
    expect(filterAlerts(rows, 'unread')[0].id).toBe('a1');
    expect(filterAlerts(null, 'all')).toEqual([]);
    expect(filterAlerts(rows)).toHaveLength(2); // default = all
  });
  test('sortAlerts: severity desc then newest first', () => {
    const shuffled = [
      { id: 'lowNew', severity: 'low', created_at: '2026-07-20T12:00:00Z' },
      { id: 'critOld', severity: 'critical', created_at: '2026-07-19T00:00:00Z' },
      { id: 'critNew', severity: 'critical', created_at: '2026-07-20T00:00:00Z' },
    ];
    const out = sortAlerts(shuffled).map((a) => a.id);
    expect(out).toEqual(['critNew', 'critOld', 'lowNew']);
    expect(sortAlerts(null)).toEqual([]);
    // does not mutate input
    expect(shuffled[0].id).toBe('lowNew');
  });
});

describe('stats-derived helpers', () => {
  const stats = extractStats(STATS_BODY);
  test('severityCount', () => {
    expect(severityCount(stats, 'critical')).toBe(1);
    expect(severityCount(stats, 'high')).toBe(2);
    expect(severityCount(stats, 'medium')).toBe(0); // absent
    expect(severityCount(null, 'high')).toBe(0);
  });
  test('severityBreakdown drops zeros, keeps order + colour', () => {
    const b = severityBreakdown(stats);
    expect(b.map((r) => r.severity)).toEqual(['critical', 'high', 'low']); // medium=0 dropped
    expect(b[0]).toEqual({ severity: 'critical', label: 'Critical', count: 1, color: '#dc2626' });
    expect(severityBreakdown({})).toEqual([]);
    expect(severityBreakdown(null)).toEqual([]);
  });
  test('unreadCount prefers server number, else counts rows', () => {
    expect(unreadCount(stats)).toBe(3);
    expect(unreadCount({}, extractAlerts(ALERTS_BODY))).toBe(1); // no unread field → count rows
    expect(unreadCount(null, [])).toBe(0);
  });
});

describe('staff risk presentation', () => {
  test('riskLevelColor', () => {
    expect(riskLevelColor('high')).toBe('#dc2626');
    expect(riskLevelColor('medium')).toBe('#d97706');
    expect(riskLevelColor('low')).toBe('#2563eb');
    expect(riskLevelColor('clean')).toBe('#16a34a');
    expect(riskLevelColor('???')).toBe('#64748b');
  });
  test('riskLevelLabel', () => {
    expect(riskLevelLabel('high')).toBe('High risk');
    expect(riskLevelLabel('clean')).toBe('Clean');
    expect(riskLevelLabel('')).toBe('Unknown');
  });
});

describe('timeAgo is deterministic with an injected now', () => {
  const now = Date.parse('2026-07-20T12:00:00Z');
  test('buckets', () => {
    expect(timeAgo('2026-07-20T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-07-20T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-07-20T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-07-18T12:00:00Z', now)).toBe('2d ago');
    expect(timeAgo('2026-05-20T12:00:00Z', now)).toBe('2mo ago');
    expect(timeAgo(null, now)).toBe('');
    expect(timeAgo('not-a-date', now)).toBe('');
  });
});
