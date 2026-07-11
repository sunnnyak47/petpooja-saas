/**
 * Unit tests for the pure transforms in src/hooks/useStaffChat.js.
 * Only the deterministic helpers are exercised (no network / react-query).
 */

// Mock the network + token modules so importing the hook module is side-effect free.
jest.mock('../src/lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../src/lib/tokenStore', () => ({
  __esModule: true,
  getAccessToken: jest.fn().mockResolvedValue('test-token'),
}));
// OutletContext (a transitive import of the hook module) pulls in AsyncStorage —
// mock it so importing the pure helpers stays side-effect free under jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(null),
  },
}));

import {
  normalizeMessage,
  extractMessages,
  sortByCreatedAsc,
  mergeMessages,
  isMine,
  formatMessageTime,
  dayLabel,
  groupMessagesByDay,
  makeOptimisticMessage,
  chatKey,
} from '../src/hooks/useStaffChat';

const T = (iso) => new Date(iso).toISOString();

describe('normalizeMessage', () => {
  test('returns null for junk', () => {
    expect(normalizeMessage(null)).toBeNull();
    expect(normalizeMessage(42)).toBeNull();
  });

  test('stringifies ids and defaults fields', () => {
    const n = normalizeMessage({ id: 7, user_id: 3, body: 'hi', created_at: T('2026-07-10T10:00:00Z') });
    expect(n.id).toBe('7');
    expect(n.user_id).toBe('3');
    expect(n.user_name).toBe('Staff');
    expect(n.body).toBe('hi');
    expect(n.pending).toBe(false);
  });

  test('accepts _id and preserves pending flag', () => {
    const n = normalizeMessage({ _id: 'abc', body: 'x', pending: true });
    expect(n.id).toBe('abc');
    expect(n.pending).toBe(true);
  });

  test('coerces non-string body to empty string', () => {
    expect(normalizeMessage({ id: 1, body: undefined }).body).toBe('');
  });
});

describe('extractMessages', () => {
  const rows = [
    { id: 2, body: 'second', created_at: T('2026-07-10T10:05:00Z') },
    { id: 1, body: 'first', created_at: T('2026-07-10T10:00:00Z') },
  ];

  test('reads {data:{items}} envelope and sorts oldest-first', () => {
    const out = extractMessages({ data: { items: rows } });
    expect(out.map((m) => m.body)).toEqual(['first', 'second']);
  });

  test('reads {data:[]} shape', () => {
    expect(extractMessages({ data: rows })).toHaveLength(2);
  });

  test('reads raw array', () => {
    expect(extractMessages(rows)).toHaveLength(2);
  });

  test('returns [] for empty/unknown shapes', () => {
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages({})).toEqual([]);
    expect(extractMessages({ data: { items: 'nope' } })).toEqual([]);
  });
});

describe('sortByCreatedAsc', () => {
  test('orders by timestamp then id', () => {
    const a = { id: 'a', created_at: T('2026-07-10T10:00:00Z') };
    const b = { id: 'b', created_at: T('2026-07-10T09:00:00Z') };
    expect([a, b].sort(sortByCreatedAsc)[0].id).toBe('b');
  });

  test('stable tiebreak on equal timestamps', () => {
    const same = T('2026-07-10T10:00:00Z');
    const a = { id: 'a', created_at: same };
    const z = { id: 'z', created_at: same };
    expect([z, a].sort(sortByCreatedAsc).map((m) => m.id)).toEqual(['a', 'z']);
  });
});

describe('mergeMessages', () => {
  test('dedupes by id, server (confirmed) wins over pending', () => {
    const local = [{ id: '1', body: 'pending', pending: true, created_at: T('2026-07-10T10:00:00Z') }];
    const server = [{ id: '1', body: 'confirmed', created_at: T('2026-07-10T10:00:00Z') }];
    const merged = mergeMessages(server, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe('confirmed');
    expect(merged[0].pending).toBe(false);
  });

  test('keeps distinct ids, oldest-first', () => {
    const merged = mergeMessages(
      [{ id: '2', body: 'b', created_at: T('2026-07-10T11:00:00Z') }],
      [{ id: '1', body: 'a', created_at: T('2026-07-10T10:00:00Z') }],
    );
    expect(merged.map((m) => m.id)).toEqual(['1', '2']);
  });

  test('ignores rows without ids', () => {
    expect(mergeMessages([{ body: 'no id' }], [])).toHaveLength(0);
  });
});

describe('isMine', () => {
  const msg = { user_id: '42' };
  test('matches across string/number ids', () => {
    expect(isMine(msg, 42)).toBe(true);
    expect(isMine(msg, '42')).toBe(true);
  });
  test('false for other user or missing id', () => {
    expect(isMine(msg, 7)).toBe(false);
    expect(isMine(msg, null)).toBe(false);
    expect(isMine(null, 42)).toBe(false);
  });
});

describe('formatMessageTime', () => {
  test('formats a 12h clock with AM/PM', () => {
    const d = new Date(2026, 6, 10, 15, 7); // 3:07 PM local
    expect(formatMessageTime(d)).toBe('3:07 PM');
  });
  test('midnight renders as 12:xx AM', () => {
    const d = new Date(2026, 6, 10, 0, 5);
    expect(formatMessageTime(d)).toBe('12:05 AM');
  });
  test('invalid date -> empty string', () => {
    expect(formatMessageTime('not-a-date')).toBe('');
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 6, 10, 12, 0);
  test('Today / Yesterday', () => {
    expect(dayLabel(new Date(2026, 6, 10, 8, 0), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 6, 9, 23, 0), now)).toBe('Yesterday');
  });
  test('older dates render as "D Mon"', () => {
    expect(dayLabel(new Date(2026, 6, 3, 8, 0), now)).toBe('3 Jul');
  });
  test('invalid -> empty', () => {
    expect(dayLabel('nope', now)).toBe('');
  });
});

describe('groupMessagesByDay', () => {
  const now = new Date(2026, 6, 10, 12, 0);
  test('injects a separator when the day changes', () => {
    const msgs = [
      normalizeMessage({ id: '1', body: 'a', created_at: new Date(2026, 6, 9, 10, 0).toISOString() }),
      normalizeMessage({ id: '2', body: 'b', created_at: new Date(2026, 6, 10, 10, 0).toISOString() }),
      normalizeMessage({ id: '3', body: 'c', created_at: new Date(2026, 6, 10, 11, 0).toISOString() }),
    ];
    const rows = groupMessagesByDay(msgs, now);
    const types = rows.map((r) => r.type);
    // day(Yesterday), msg, day(Today), msg, msg
    expect(types).toEqual(['day', 'msg', 'day', 'msg', 'msg']);
    expect(rows[0].label).toBe('Yesterday');
    expect(rows[2].label).toBe('Today');
  });

  test('empty input -> empty output', () => {
    expect(groupMessagesByDay([], now)).toEqual([]);
  });
});

describe('makeOptimisticMessage', () => {
  test('produces a pending, normalized row with an id', () => {
    const m = makeOptimisticMessage({ body: 'hey', userId: 5, userName: 'Sam', outletId: 'o1' });
    expect(m.pending).toBe(true);
    expect(m.body).toBe('hey');
    expect(m.user_id).toBe('5');
    expect(m.user_name).toBe('Sam');
    expect(typeof m.id).toBe('string');
    expect(m.id).toMatch(/^optimistic-/);
  });
});

describe('chatKey', () => {
  test('is stable and outlet-scoped', () => {
    expect(chatKey('o1')).toEqual(['staff-chat', 'o1', 100]);
    expect(chatKey('o1', 50)).toEqual(['staff-chat', 'o1', 50]);
  });
});
