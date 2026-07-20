/**
 * Unit tests for the pure Devices & Security helpers (lib/devices). No React /
 * RN / network — locks the /auth/sessions + /auth/login-history contract the
 * screen depends on.
 */
import {
  extractSessions, extractHistory, lastLoginAt, otherSessionsCount,
  deviceLabel, deviceIconName, sessionTime, historyTime, actionLabel, timeAgo,
} from '../src/lib/devices';

const BODY = {
  success: true,
  data: {
    sessions: [
      { sid: 'a', is_current: true, ip: '1.1.1.1', device_label: 'iPhone', device_type: 'mobile', signed_in_at: '2026-07-20T00:00:00Z' },
      { sid: 'b', is_current: false, ip: '2.2.2.2', device_label: 'Chrome on Mac', device_type: 'desktop', signed_in_at: '2026-07-19T00:00:00Z' },
    ],
    active_count: 2,
    last_login_at: '2026-07-20T00:00:00Z',
  },
  message: 'ok',
};

describe('extractors accept the api BODY or a raw payload', () => {
  test('extractSessions', () => {
    expect(extractSessions(BODY)).toHaveLength(2);
    expect(extractSessions(BODY.data)).toHaveLength(2); // raw payload too
    expect(extractSessions(null)).toEqual([]);
    expect(extractSessions({})).toEqual([]);
  });
  test('extractHistory', () => {
    expect(extractHistory({ data: { items: [{ action: 'LOGIN' }] } })).toHaveLength(1);
    expect(extractHistory({ items: [] })).toEqual([]);
    expect(extractHistory(undefined)).toEqual([]);
  });
  test('lastLoginAt', () => {
    expect(lastLoginAt(BODY)).toBe('2026-07-20T00:00:00Z');
    expect(lastLoginAt({})).toBeNull();
  });
});

describe('otherSessionsCount', () => {
  test('counts only non-current sessions that have a sid', () => {
    expect(otherSessionsCount(extractSessions(BODY))).toBe(1);
    expect(otherSessionsCount([{ sid: 'x', is_current: false }, { is_current: false }])).toBe(1); // no sid → not revocable
    expect(otherSessionsCount([])).toBe(0);
    expect(otherSessionsCount(null)).toBe(0);
  });
});

describe('deviceLabel + deviceIconName', () => {
  test('deviceLabel falls back to a friendly default', () => {
    expect(deviceLabel({ device_label: 'iPad' })).toBe('iPad');
    expect(deviceLabel({ device_label: '   ' })).toBe('Unknown device');
    expect(deviceLabel({})).toBe('Unknown device');
    expect(deviceLabel(null)).toBe('Unknown device');
  });
  test('deviceIconName maps types to Ionicons', () => {
    expect(deviceIconName('mobile')).toBe('phone-portrait-outline');
    expect(deviceIconName('tablet')).toBe('tablet-portrait-outline');
    expect(deviceIconName('desktop')).toBe('desktop-outline');
    expect(deviceIconName('pos')).toBe('card-outline');
    expect(deviceIconName('anything-else')).toBe('help-circle-outline');
    expect(deviceIconName(undefined)).toBe('help-circle-outline');
  });
});

describe('time + action helpers', () => {
  test('sessionTime / historyTime pick the right field', () => {
    expect(sessionTime({ signed_in_at: 'X' })).toBe('X');
    expect(sessionTime({ last_active_at: 'Y' })).toBe('Y');
    expect(sessionTime({})).toBeNull();
    expect(historyTime({ at: 'Z' })).toBe('Z');
    expect(historyTime({})).toBeNull();
  });
  test('actionLabel humanises audit actions', () => {
    expect(actionLabel('LOGIN')).toBe('Signed in');
    expect(actionLabel('USER_LOGOUT')).toBe('Signed out');
    expect(actionLabel('')).toBe('');
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
