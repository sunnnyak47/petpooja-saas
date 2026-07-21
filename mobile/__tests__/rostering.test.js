/**
 * Unit tests for the pure Rostering helpers (lib/rostering). No React / RN /
 * network — locks the /rostering contract the screen depends on.
 */
import {
  extractRosters, extractAvailableStaff, assignmentsOf,
  dayKey, formatDayLabel, formatDateRange, formatTime, formatShift, preferredWindow,
  staffName, roleLabel, personName, rosterStatusMeta, initials,
  isAvailable, availableOnly, pickCurrentRoster, groupAssignmentsByDay, summarizeRoster,
  isPublished, canPublish, todayKey, timeAgo,
} from '../src/lib/rostering';

const ASG = (over = {}) => ({ id: 'a1', staff_id: 's1', date: '2026-07-21', start_time: '09:00', end_time: '17:00', role_label: 'Barista', staff: { id: 's1', full_name: 'Ada Lovelace' }, ...over });
const ROSTER = (over = {}) => ({ id: 'r1', name: 'Week 30', status: 'draft', start_date: '2026-07-20', end_date: '2026-07-26', assignments: [ASG()], ...over });

describe('extractors', () => {
  test('extractRosters / extractAvailableStaff accept body, raw, {items}, {rosters}/{staff}', () => {
    expect(extractRosters({ data: [ROSTER()] })).toHaveLength(1);
    expect(extractRosters([ROSTER()])).toHaveLength(1);
    expect(extractRosters({ data: { rosters: [ROSTER()] } })).toHaveLength(1);
    expect(extractRosters(null)).toEqual([]);
    expect(extractAvailableStaff({ data: { staff: [{ id: 's1' }] } })).toHaveLength(1);
    expect(extractAvailableStaff(undefined)).toEqual([]);
  });
  test('assignmentsOf always returns an array', () => {
    expect(assignmentsOf(ROSTER())).toHaveLength(1);
    expect(assignmentsOf({})).toEqual([]);
    expect(assignmentsOf(null)).toEqual([]);
  });
});

describe('date / time formatting (UTC → deterministic)', () => {
  test('dayKey normalises to YYYY-MM-DD', () => {
    expect(dayKey('2026-07-21')).toBe('2026-07-21');
    expect(dayKey('2026-07-21T09:00:00Z')).toBe('2026-07-21');
    expect(dayKey('')).toBe('');
    expect(dayKey('rubbish')).toBe('');
  });
  test('formatDayLabel / formatDateRange', () => {
    expect(formatDayLabel('2026-07-21')).toBe('Tue 21 Jul');
    expect(formatDayLabel('')).toBe('');
    expect(formatDateRange('2026-07-20', '2026-07-26')).toBe('Mon 20 Jul – Sun 26 Jul');
  });
  test('formatTime / formatShift / preferredWindow', () => {
    expect(formatTime('9:00')).toBe('09:00');
    expect(formatTime('17:30:00')).toBe('17:30');
    expect(formatTime(null)).toBe('');
    expect(formatShift(ASG())).toBe('09:00 – 17:00');
    expect(formatShift({})).toBe('—');
    expect(preferredWindow({ preferred_start: '08:00', preferred_end: '12:00' })).toBe('08:00 – 12:00');
    expect(preferredWindow({})).toBe('Any time');
  });
});

describe('labels / status / initials', () => {
  test('names default sensibly', () => {
    expect(staffName(ASG())).toBe('Ada Lovelace');
    expect(staffName({})).toBe('Unassigned');
    expect(roleLabel(ASG())).toBe('Barista');
    expect(roleLabel({})).toBe('Staff');
    expect(personName({ full_name: 'Grace Hopper' })).toBe('Grace Hopper');
    expect(personName({})).toBe('Staff member');
  });
  test('rosterStatusMeta', () => {
    expect(rosterStatusMeta('published')).toMatchObject({ label: 'Published' });
    expect(rosterStatusMeta('weird')).toMatchObject({ label: 'weird' });
  });
  test('initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Cher')).toBe('CH');
    expect(initials('')).toBe('?');
  });
});

describe('availability', () => {
  test('available unless explicitly false', () => {
    expect(isAvailable({ available: true })).toBe(true);
    expect(isAvailable({})).toBe(true);
    expect(isAvailable({ available: false })).toBe(false);
    expect(isAvailable(null)).toBe(false);
    expect(availableOnly([{ available: true }, { available: false }, {}])).toHaveLength(2);
  });
});

describe('selection / grouping / summary', () => {
  test('pickCurrentRoster prefers the span covering now, else newest', () => {
    const now = Date.parse('2026-07-22T00:00:00Z');
    const covering = ROSTER({ id: 'now', start_date: '2026-07-20', end_date: '2026-07-26' });
    const old = ROSTER({ id: 'old', start_date: '2026-06-01', end_date: '2026-06-07' });
    expect(pickCurrentRoster([old, covering], now).id).toBe('now');
    expect(pickCurrentRoster([old], now).id).toBe('old'); // fallback = newest
    expect(pickCurrentRoster([], now)).toBeNull();
  });
  test('groupAssignmentsByDay groups + sorts by day then start time', () => {
    const groups = groupAssignmentsByDay([
      ASG({ id: 'b', date: '2026-07-21', start_time: '12:00' }),
      ASG({ id: 'a', date: '2026-07-21', start_time: '09:00' }),
      ASG({ id: 'c', date: '2026-07-20', start_time: '08:00' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-07-20', '2026-07-21']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['a', 'b']); // 09:00 before 12:00
  });
  test('summarizeRoster counts shifts, distinct staff + days', () => {
    const r = ROSTER({ assignments: [
      ASG({ staff: { id: 's1' }, date: '2026-07-20' }),
      ASG({ staff: { id: 's1' }, date: '2026-07-21' }),
      ASG({ staff: { id: 's2' }, date: '2026-07-21' }),
    ] });
    expect(summarizeRoster(r)).toEqual({ shifts: 3, staff: 2, days: 2 });
  });
});

describe('publish guards', () => {
  test('isPublished / canPublish mirror the backend rule', () => {
    expect(isPublished(ROSTER({ status: 'published' }))).toBe(true);
    expect(isPublished(ROSTER())).toBe(false);
    expect(canPublish(ROSTER({ status: 'draft', assignments: [ASG()] }))).toBe(true);
    expect(canPublish(ROSTER({ status: 'draft', assignments: [] }))).toBe(false); // empty → no
    expect(canPublish(ROSTER({ status: 'published', assignments: [ASG()] }))).toBe(false);
  });
});

describe('todayKey / timeAgo', () => {
  test('todayKey is a YYYY-MM-DD string', () => {
    expect(todayKey(Date.parse('2026-07-21T06:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('timeAgo (timezone-independent diff)', () => {
    const now = Date.parse('2026-07-21T12:00:00Z');
    expect(timeAgo('2026-07-21T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-07-21T11:30:00Z', now)).toBe('30m ago');
    expect(timeAgo('2026-07-21T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo(null, now)).toBe('');
  });
});
