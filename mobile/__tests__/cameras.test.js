/**
 * Unit tests for the pure transforms behind useCameras. These cover the logic
 * that actually matters for the CCTV feature: per-outlet storage keying, URL
 * validation, immutable CRUD, snapshot cache-busting, and safe parsing.
 */
import {
  storageKey,
  isValidUrl,
  validateCamera,
  makeCamera,
  upsertCamera,
  removeCamera,
  bustCache,
  parseCameras,
} from '../src/hooks/useCameras';

// The hook module imports AsyncStorage at the top; mock it so requiring the
// module never touches native storage during these pure-logic tests.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

describe('storageKey', () => {
  test('scopes the key by outletId', () => {
    expect(storageKey('42')).toBe('cctv_cameras_v1:42');
    expect(storageKey(7)).toBe('cctv_cameras_v1:7');
  });

  test('two different outlets never collide', () => {
    expect(storageKey('a')).not.toBe(storageKey('b'));
  });

  test('falls back to a default bucket for null/empty outletId', () => {
    expect(storageKey(null)).toBe('cctv_cameras_v1:default');
    expect(storageKey('')).toBe('cctv_cameras_v1:default');
    expect(storageKey(undefined)).toBe('cctv_cameras_v1:default');
  });
});

describe('isValidUrl', () => {
  test('accepts rtsp/http/https', () => {
    expect(isValidUrl('rtsp://192.168.1.10:554/stream')).toBe(true);
    expect(isValidUrl('rtsps://cam.local/s1')).toBe(true);
    expect(isValidUrl('http://cam/snapshot.jpg')).toBe(true);
    expect(isValidUrl('https://cam/snapshot.jpg')).toBe(true);
  });

  test('rejects junk, wrong scheme, or non-strings', () => {
    expect(isValidUrl('ftp://cam/x')).toBe(false);
    expect(isValidUrl('192.168.1.10')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl(null)).toBe(false);
    expect(isValidUrl(123)).toBe(false);
  });
});

describe('validateCamera', () => {
  test('valid when name + stream url present', () => {
    const { valid, errors } = validateCamera({
      name: 'Kitchen',
      streamUrl: 'rtsp://cam/1',
    });
    expect(valid).toBe(true);
    expect(errors).toEqual({});
  });

  test('requires a name', () => {
    const { valid, errors } = validateCamera({ streamUrl: 'rtsp://cam/1' });
    expect(valid).toBe(false);
    expect(errors.name).toBeDefined();
  });

  test('requires a valid stream url', () => {
    expect(validateCamera({ name: 'A', streamUrl: '' }).errors.streamUrl).toBeDefined();
    expect(validateCamera({ name: 'A', streamUrl: 'nope' }).errors.streamUrl).toBeDefined();
  });

  test('snapshot url optional but validated when present', () => {
    expect(
      validateCamera({ name: 'A', streamUrl: 'rtsp://c/1', snapshotUrl: '' }).valid
    ).toBe(true);
    expect(
      validateCamera({ name: 'A', streamUrl: 'rtsp://c/1', snapshotUrl: 'bad' }).errors
        .snapshotUrl
    ).toBeDefined();
    expect(
      validateCamera({
        name: 'A',
        streamUrl: 'rtsp://c/1',
        snapshotUrl: 'http://c/s.jpg',
      }).valid
    ).toBe(true);
  });

  test('trims whitespace before validating', () => {
    expect(validateCamera({ name: '   ', streamUrl: 'rtsp://c/1' }).valid).toBe(false);
  });
});

describe('makeCamera', () => {
  test('normalizes and assigns an id + createdAt', () => {
    const cam = makeCamera({ name: '  Front  ', streamUrl: '  rtsp://c/1 ' });
    expect(cam.name).toBe('Front');
    expect(cam.streamUrl).toBe('rtsp://c/1');
    expect(cam.id).toMatch(/^cam_/);
    expect(cam.createdAt).toBeTruthy();
  });

  test('empty snapshot becomes null', () => {
    expect(makeCamera({ name: 'A', streamUrl: 'rtsp://c/1' }).snapshotUrl).toBeNull();
    expect(
      makeCamera({ name: 'A', streamUrl: 'rtsp://c/1', snapshotUrl: '  ' }).snapshotUrl
    ).toBeNull();
  });

  test('preserves an existing id (edit path)', () => {
    expect(makeCamera({ id: 'cam_x', name: 'A', streamUrl: 'rtsp://c/1' }).id).toBe('cam_x');
  });

  test('generates unique ids', () => {
    const a = makeCamera({ name: 'A', streamUrl: 'rtsp://c/1' });
    const b = makeCamera({ name: 'B', streamUrl: 'rtsp://c/2' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('upsertCamera', () => {
  const base = [
    { id: '1', name: 'A', streamUrl: 'rtsp://c/1', createdAt: 't1' },
    { id: '2', name: 'B', streamUrl: 'rtsp://c/2', createdAt: 't2' },
  ];

  test('appends a new camera', () => {
    const next = upsertCamera(base, { id: '3', name: 'C', streamUrl: 'rtsp://c/3' });
    expect(next).toHaveLength(3);
    expect(next[2].id).toBe('3');
  });

  test('replaces an existing camera and keeps original createdAt', () => {
    const next = upsertCamera(base, {
      id: '1',
      name: 'A2',
      streamUrl: 'rtsp://c/9',
      createdAt: 'tX',
    });
    expect(next).toHaveLength(2);
    expect(next[0].name).toBe('A2');
    expect(next[0].createdAt).toBe('t1'); // preserved
  });

  test('does not mutate the input array', () => {
    upsertCamera(base, { id: '3', name: 'C', streamUrl: 'rtsp://c/3' });
    expect(base).toHaveLength(2);
  });

  test('handles a non-array input gracefully', () => {
    expect(upsertCamera(undefined, { id: '1' })).toHaveLength(1);
  });
});

describe('removeCamera', () => {
  const base = [
    { id: '1', name: 'A' },
    { id: '2', name: 'B' },
  ];

  test('removes by id', () => {
    const next = removeCamera(base, '1');
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('2');
  });

  test('no-op for a missing id', () => {
    expect(removeCamera(base, 'nope')).toHaveLength(2);
  });

  test('does not mutate the input array', () => {
    removeCamera(base, '1');
    expect(base).toHaveLength(2);
  });
});

describe('bustCache', () => {
  test('adds a _t param when no query string exists', () => {
    expect(bustCache('http://cam/s.jpg', 123)).toBe('http://cam/s.jpg?_t=123');
  });

  test('appends with & when a query already exists', () => {
    expect(bustCache('http://cam/s.jpg?x=1', 123)).toBe('http://cam/s.jpg?x=1&_t=123');
  });

  test('returns null for empty input', () => {
    expect(bustCache('')).toBeNull();
    expect(bustCache(null)).toBeNull();
  });

  test('successive ticks produce different urls', () => {
    expect(bustCache('http://cam/s.jpg', 1)).not.toBe(bustCache('http://cam/s.jpg', 2));
  });
});

describe('parseCameras', () => {
  test('parses a valid JSON array', () => {
    expect(parseCameras('[{"id":"1"}]')).toEqual([{ id: '1' }]);
  });

  test('returns [] for null/empty/malformed', () => {
    expect(parseCameras(null)).toEqual([]);
    expect(parseCameras('')).toEqual([]);
    expect(parseCameras('{not json')).toEqual([]);
  });

  test('returns [] when JSON is not an array', () => {
    expect(parseCameras('{"id":"1"}')).toEqual([]);
    expect(parseCameras('42')).toEqual([]);
  });
});
