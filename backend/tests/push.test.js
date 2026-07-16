/**
 * @fileoverview Unit tests for the Expo push sender (push.service).
 * Mocks global.fetch + the token mockRegistry — no network. Verifies token
 * validation, chunking to Expo's 100/req cap, message shape, outlet/user
 * targeting, and that failures never throw (fire-and-forget contract).
 * @module tests/push.test
 */

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));

// Injectable in-memory mockRegistry standing in for integration.routes' Map.
const mockRegistry = new Map();
jest.mock('../src/modules/integrations/integration.routes', () => ({
  getPushTokenRegistry: () => mockRegistry,
}));

const push = require('../src/modules/notifications/push.service');

const TOK = (n) => `ExponentPushToken[${n}]`;

function mockFetchOnce(handler) {
  global.fetch = jest.fn(async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (handler) handler(url, body, opts);
    return { json: async () => ({ data: body.map(() => ({ status: 'ok' })) }) };
  });
}

beforeEach(() => {
  mockRegistry.clear();
  global.fetch = undefined;
});

describe('isValidExpoToken', () => {
  test('accepts well-formed Expo tokens, rejects junk', () => {
    expect(push.isValidExpoToken(TOK('abc'))).toBe(true);
    expect(push.isValidExpoToken('FCM:xyz')).toBe(false);
    expect(push.isValidExpoToken('ExponentPushToken[]')).toBe(false);
    expect(push.isValidExpoToken('')).toBe(false);
    expect(push.isValidExpoToken(null)).toBe(false);
    expect(push.isValidExpoToken(undefined)).toBe(false);
  });
});

describe('sendExpoPush', () => {
  test('no-ops (no fetch) when there are no valid tokens', async () => {
    global.fetch = jest.fn();
    const res = await push.sendExpoPush([{ to: 'not-a-token', title: 'x', body: 'y' }]);
    expect(res).toEqual({ sent: 0, tickets: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('posts to Expo with a well-formed message body', async () => {
    let seenUrl, seenBody;
    mockFetchOnce((url, body) => { seenUrl = url; seenBody = body; });
    const res = await push.sendExpoPush(push.buildMessages([TOK('a')], { title: 'Hi', body: 'There', data: { type: 'x' } }));
    expect(seenUrl).toBe(push.EXPO_PUSH_URL);
    expect(seenBody).toHaveLength(1);
    expect(seenBody[0]).toMatchObject({ to: TOK('a'), title: 'Hi', body: 'There', sound: 'default', data: { type: 'x' } });
    expect(res.sent).toBe(1);
    expect(res.tickets).toHaveLength(1);
  });

  test('chunks into requests of at most MAX_PER_REQUEST (100)', async () => {
    const calls = [];
    mockFetchOnce((url, body) => calls.push(body.length));
    const tokens = Array.from({ length: 230 }, (_, i) => TOK(i));
    const res = await push.sendExpoPush(push.buildMessages(tokens, { title: 't', body: 'b' }));
    expect(res.sent).toBe(230);
    expect(global.fetch).toHaveBeenCalledTimes(3); // 100 + 100 + 30
    expect(calls).toEqual([100, 100, 30]);
  });

  test('a fetch rejection never throws and is counted as attempted', async () => {
    global.fetch = jest.fn(async () => { throw new Error('network down'); });
    const res = await push.sendExpoPush(push.buildMessages([TOK('a')], { title: 't', body: 'b' }));
    expect(res.sent).toBe(1);
    expect(res.tickets).toEqual([]); // no tickets, but no throw
  });
});

describe('sendToOutlet', () => {
  test('targets only devices watching that outlet, dedupes, honours excludeUserId', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    mockRegistry.set('u2', { token: TOK('2'), outlet_id: 'O1' });
    mockRegistry.set('u3', { token: TOK('3'), outlet_id: 'O2' }); // other outlet — skip
    mockRegistry.set('u4', { token: 'garbage', outlet_id: 'O1' }); // invalid token — skip
    let sentTo = [];
    mockFetchOnce((url, body) => { sentTo = body.map((m) => m.to); });

    const res = await push.sendToOutlet('O1', { title: 'New order', body: 'x' }, { excludeUserId: 'u2' });
    expect(res.sent).toBe(1);
    expect(sentTo).toEqual([TOK('1')]); // u2 excluded, u3 other outlet, u4 invalid
  });

  test('no mockRegistry entries for the outlet → no fetch, sent 0', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'OTHER' });
    global.fetch = jest.fn();
    const res = await push.sendToOutlet('O1', { title: 't', body: 'b' });
    expect(res.sent).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('missing outletId is a safe no-op', async () => {
    global.fetch = jest.fn();
    expect(await push.sendToOutlet(undefined, { title: 't', body: 'b' })).toEqual({ sent: 0, tickets: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('sendToUsers', () => {
  test('resolves tokens for the given user ids only', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    mockRegistry.set('u2', { token: TOK('2'), outlet_id: 'O1' });
    let sentTo = [];
    mockFetchOnce((url, body) => { sentTo = body.map((m) => m.to); });

    const res = await push.sendToUsers(['u1', 'u-missing'], { title: 'Hi', body: 'x' });
    expect(res.sent).toBe(1);
    expect(sentTo).toEqual([TOK('1')]);
  });

  test('empty / non-array user list is a safe no-op', async () => {
    global.fetch = jest.fn();
    expect(await push.sendToUsers([], { title: 't', body: 'b' })).toEqual({ sent: 0, tickets: [] });
    expect(await push.sendToUsers(null, { title: 't', body: 'b' })).toEqual({ sent: 0, tickets: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
