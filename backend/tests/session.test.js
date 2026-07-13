/**
 * @fileoverview Unit tests for the Devices & Security session service.
 * Covers the User-Agent parser and the AuditLog-derived active-session logic
 * (collapse by sid, exclude ended/revoked, synthesize the current device).
 * Prisma and Redis are mocked so these run without a DB/Redis.
 * @module tests/session.test
 */

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockPrisma = {
  auditLog: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
  },
};
const revoked = new Set();
const mockRedis = {
  get: jest.fn(async (key) => (revoked.has(key) ? 'revoked' : null)),
  setex: jest.fn(async (key) => { revoked.add(key); return 'OK'; }),
  del: jest.fn(async () => 0),
};

jest.mock('../src/config/database', () => ({ getDbClient: () => mockPrisma }));
jest.mock('../src/config/redis', () => ({ getRedisClient: () => mockRedis }));
jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));

const session = require('../src/modules/auth/session.service');

const UA_CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_ELECTRON = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) MS-RM System/2.0.191 Chrome/120 Electron/28.0.0 Safari/537.36';

beforeEach(() => {
  revoked.clear();
  mockPrisma.auditLog.findMany.mockReset();
  mockPrisma.auditLog.count.mockReset();
  mockPrisma.auditLog.create.mockClear();
  mockRedis.get.mockClear();
  mockRedis.setex.mockClear();
});

describe('describeDevice — User-Agent parsing', () => {
  test('Chrome on Windows desktop', () => {
    const d = session.describeDevice(UA_CHROME_WIN);
    expect(d.browser).toBe('Chrome');
    expect(d.os).toBe('Windows 10/11');
    expect(d.type).toBe('desktop');
    expect(d.isApp).toBe(false);
  });

  test('Safari on iPhone → mobile, iOS (not macOS)', () => {
    const d = session.describeDevice(UA_IPHONE);
    expect(d.browser).toBe('Safari');
    expect(d.os).toBe('iOS');
    expect(d.type).toBe('mobile');
  });

  test('our Electron desktop app is detected as an app', () => {
    const d = session.describeDevice(UA_ELECTRON);
    expect(d.isApp).toBe(true);
    expect(d.type).toBe('app');
    expect(d.label).toMatch(/MS-RM Desktop App/);
  });

  test('empty UA → Unknown device', () => {
    const d = session.describeDevice('');
    expect(d.label).toBe('Unknown device');
    expect(d.type).toBe('unknown');
  });
});

describe('listActiveSessions — derive from audit rows', () => {
  test('collapses by sid, drops ended sessions, marks current', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'USER_LOGIN', ip_address: '1.1.1.1', user_agent: UA_CHROME_WIN, metadata: { sid: 'A' }, created_at: new Date('2026-07-10T09:00:00Z') },
      { action: 'USER_LOGIN', ip_address: '2.2.2.2', user_agent: UA_IPHONE, metadata: { sid: 'B' }, created_at: new Date('2026-07-11T09:00:00Z') },
      { action: 'USER_LOGOUT', ip_address: '2.2.2.2', user_agent: UA_IPHONE, metadata: { sid: 'B' }, created_at: new Date('2026-07-11T10:00:00Z') },
    ]);

    const sessions = await session.listActiveSessions('user-1', 'A', {});
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sid).toBe('A');
    expect(sessions[0].is_current).toBe(true);
    expect(sessions[0].browser).toBe('Chrome');
  });

  test('excludes revoked sessions and synthesizes the current device', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'USER_LOGIN', ip_address: '1.1.1.1', user_agent: UA_CHROME_WIN, metadata: { sid: 'A' }, created_at: new Date('2026-07-10T09:00:00Z') },
    ]);
    revoked.add('revsid:A'); // sid A revoked in Redis

    const sessions = await session.listActiveSessions('user-1', 'A', { ip: '9.9.9.9', user_agent: UA_IPHONE });
    // A is filtered out; since the current sid isn't represented, a synthetic
    // "this device" entry is added from the request context.
    expect(sessions).toHaveLength(1);
    expect(sessions[0].is_current).toBe(true);
    expect(sessions[0].synthetic).toBe(true);
    expect(sessions[0].browser).toBe('Safari');
  });

  test('ignores legacy rows without a sid', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'USER_LOGIN', ip_address: '1.1.1.1', user_agent: UA_CHROME_WIN, metadata: null, created_at: new Date('2026-07-10T09:00:00Z') },
    ]);
    const sessions = await session.listActiveSessions('user-1', null, { ip: '1.1.1.1', user_agent: UA_CHROME_WIN });
    // Only the synthesized current device (legacy row can't be tracked).
    expect(sessions).toHaveLength(1);
    expect(sessions[0].synthetic).toBe(true);
  });
});

describe('revokeSession — ownership guard', () => {
  test('revokes a sid that belongs to the user', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'USER_LOGIN', user_agent: UA_CHROME_WIN, metadata: { sid: 'A' }, created_at: new Date() },
    ]);
    const res = await session.revokeSession('user-1', 'A', { ip: '1.1.1.1' });
    expect(res.revoked).toBe(true);
    expect(mockRedis.setex).toHaveBeenCalledWith('revsid:A', expect.any(Number), 'revoked');
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  test('refuses to revoke a sid the user does not own', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'USER_LOGIN', user_agent: UA_CHROME_WIN, metadata: { sid: 'A' }, created_at: new Date() },
    ]);
    const res = await session.revokeSession('user-1', 'SOMEONE_ELSE', { ip: '1.1.1.1' });
    expect(res.revoked).toBe(false);
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });
});

describe('logoutOtherDevices', () => {
  test('revokes every active session except the current one', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'USER_LOGIN', user_agent: UA_CHROME_WIN, metadata: { sid: 'A' }, created_at: new Date('2026-07-10T09:00:00Z') },
      { action: 'USER_LOGIN', user_agent: UA_IPHONE, metadata: { sid: 'B' }, created_at: new Date('2026-07-11T09:00:00Z') },
      { action: 'USER_LOGIN', user_agent: UA_ELECTRON, metadata: { sid: 'C' }, created_at: new Date('2026-07-12T09:00:00Z') },
    ]);
    const res = await session.logoutOtherDevices('user-1', 'A', { ip: '1.1.1.1' });
    expect(res.count).toBe(2); // B and C revoked, A kept
    expect(mockRedis.setex).toHaveBeenCalledWith('revsid:B', expect.any(Number), 'revoked');
    expect(mockRedis.setex).toHaveBeenCalledWith('revsid:C', expect.any(Number), 'revoked');
    expect(mockRedis.setex).not.toHaveBeenCalledWith('revsid:A', expect.any(Number), 'revoked');
  });
});

describe('getLoginHistory', () => {
  test('maps rows to login/logout entries with pagination', async () => {
    mockPrisma.auditLog.count.mockResolvedValue(2);
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: '1', action: 'USER_LOGIN', ip_address: '1.1.1.1', user_agent: UA_CHROME_WIN, created_at: new Date('2026-07-12T09:00:00Z') },
      { id: '2', action: 'USER_LOGOUT', ip_address: '1.1.1.1', user_agent: UA_CHROME_WIN, created_at: new Date('2026-07-12T08:00:00Z') },
    ]);
    const res = await session.getLoginHistory('user-1', { limit: 25, page: 1 });
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].action).toBe('login');
    expect(res.items[1].action).toBe('logout');
    expect(res.has_more).toBe(false);
  });
});
