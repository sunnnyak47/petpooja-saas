/**
 * @fileoverview Unit tests for assistant.push — the alerts→push bridge.
 * Mocks global.fetch + the in-memory push-token store (integration.routes), and
 * stubs the alert/digest sources, so nothing hits the network or the DB. Verifies
 * severity filtering, single vs multi-alert payload shaping, the dedup cooldown,
 * outlet targeting through the real push.service, and the runAlertPush fan-out.
 * @module tests/assistant-push.test
 */

jest.mock('../src/config/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));

// Token store standing in for integration.routes' in-memory Map.
const mockRegistry = new Map();
jest.mock('../src/modules/integrations/integration.routes', () => ({
  getPushTokenRegistry: () => mockRegistry,
}));

// Stub the alert + digest sources so we don't load the DB / reports chain.
const mockComputeAlerts = jest.fn();
jest.mock('../src/modules/assistant/assistant.alerts', () => ({ computeAlerts: (...a) => mockComputeAlerts(...a) }));

const mockListDigestOutlets = jest.fn();
jest.mock('../src/modules/assistant/assistant.digest', () => ({
  listDigestOutlets: (...a) => mockListDigestOutlets(...a),
  ctxFor: (outlet) => ({ role: 'owner', outletId: outlet.id, permissions: [], currency: outlet.currency || 'AUD' }),
}));

const assistantPush = require('../src/modules/assistant/assistant.push');

const TOK = (n) => `ExponentPushToken[${n}]`;
const HIGH = (key, title) => ({ key, severity: 'high', title: title || key, message: `${key} message`, cta: 'Inventory' });
const MED = (key) => ({ key, severity: 'medium', title: key, message: `${key} message` });

function mockFetchCapture() {
  const bodies = [];
  global.fetch = jest.fn(async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push({ url, body });
    return { json: async () => ({ data: body.map(() => ({ status: 'ok' })) }) };
  });
  return bodies;
}

beforeEach(() => {
  mockRegistry.clear();
  assistantPush._resetDedup();
  mockComputeAlerts.mockReset();
  mockListDigestOutlets.mockReset();
  global.fetch = undefined;
});

describe('selectPushable', () => {
  test('keeps only high severity by default, drops medium/low', () => {
    const out = assistantPush.selectPushable('O1', [HIGH('a'), MED('b'), { key: 'c', severity: 'low' }]);
    expect(out.map((a) => a.key)).toEqual(['a']);
  });

  test('respects a custom minSeverity', () => {
    const out = assistantPush.selectPushable('O1', [HIGH('a'), MED('b')], { minSeverity: 'medium' });
    expect(out.map((a) => a.key).sort()).toEqual(['a', 'b']);
  });

  test('handles a null / non-array alert list safely', () => {
    expect(assistantPush.selectPushable('O1', null)).toEqual([]);
    expect(assistantPush.selectPushable('O1', undefined)).toEqual([]);
  });
});

describe('buildAlertPayload', () => {
  test('single alert → its own title + message', () => {
    const p = assistantPush.buildAlertPayload([HIGH('low_stock', '3 items running low')], { outletId: 'O1', outletName: 'Cafe' });
    expect(p.title).toBe('3 items running low');
    expect(p.body).toBe('low_stock message');
    expect(p.data).toMatchObject({ type: 'assistant_alert', outletId: 'O1', outletName: 'Cafe', count: 1, keys: ['low_stock'], severity: 'high' });
  });

  test('multiple alerts → count headline + titles as body', () => {
    const p = assistantPush.buildAlertPayload([HIGH('low_stock', 'Low stock'), HIGH('fraud_open', 'Fraud alert')], { outletId: 'O1' });
    expect(p.title).toBe('2 alerts need your attention');
    expect(p.body).toBe('Low stock · Fraud alert');
    expect(p.data.count).toBe(2);
    expect(p.data.keys).toEqual(['low_stock', 'fraud_open']);
  });
});

describe('sendAlertPush', () => {
  test('pushes a high-severity alert to the outlet devices via Expo', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    mockRegistry.set('u2', { token: TOK('2'), outlet_id: 'O1' });
    mockRegistry.set('u3', { token: TOK('3'), outlet_id: 'O2' }); // other outlet
    const bodies = mockFetchCapture();

    const res = await assistantPush.sendAlertPush({ id: 'O1', name: 'Cafe' }, [HIGH('low_stock', 'Low stock')]);

    expect(res).toMatchObject({ pushed: true, sent: 2, keys: ['low_stock'] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const sent = bodies[0].body;
    expect(sent.map((m) => m.to).sort()).toEqual([TOK('1'), TOK('2')]);
    expect(sent[0]).toMatchObject({ title: 'Low stock', data: { type: 'assistant_alert', keys: ['low_stock'] } });
  });

  test('accepts a bare outlet id string as the target', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    mockFetchCapture();
    const res = await assistantPush.sendAlertPush('O1', [HIGH('fraud_open')]);
    expect(res.pushed).toBe(true);
    expect(res.sent).toBe(1);
  });

  test('no pushable (only medium/low) → no fetch, reason nothing_pushable', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    global.fetch = jest.fn();
    const res = await assistantPush.sendAlertPush({ id: 'O1' }, [MED('sales_soft')]);
    expect(res).toMatchObject({ pushed: false, reason: 'nothing_pushable' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('missing outlet → safe no-op', async () => {
    global.fetch = jest.fn();
    const res = await assistantPush.sendAlertPush(null, [HIGH('a')]);
    expect(res).toMatchObject({ pushed: false, reason: 'no_outlet' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('dedup: same alert within cooldown is suppressed, then pushes after the window', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    const bodies = mockFetchCapture();
    const t0 = 1_000_000;

    const first = await assistantPush.sendAlertPush('O1', [HIGH('low_stock')], { nowMs: t0 });
    expect(first.pushed).toBe(true);

    // Same alert 1h later → suppressed (default 12h cooldown).
    const again = await assistantPush.sendAlertPush('O1', [HIGH('low_stock')], { nowMs: t0 + 3_600_000 });
    expect(again).toMatchObject({ pushed: false, reason: 'nothing_pushable' });

    // 13h later → cooldown elapsed, pushes again.
    const later = await assistantPush.sendAlertPush('O1', [HIGH('low_stock')], { nowMs: t0 + 13 * 3_600_000 });
    expect(later.pushed).toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(2); // first + later, not the suppressed one
    expect(bodies).toHaveLength(2);
  });

  test('a brand-new high alert still pushes even while another is in cooldown', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    mockFetchCapture();
    const t0 = 2_000_000;
    await assistantPush.sendAlertPush('O1', [HIGH('low_stock')], { nowMs: t0 });
    const res = await assistantPush.sendAlertPush('O1', [HIGH('low_stock'), HIGH('fraud_open')], { nowMs: t0 + 60_000 });
    expect(res.pushed).toBe(true);
    expect(res.keys).toEqual(['fraud_open']); // low_stock still cooling down
  });

  test('no registered devices → pushed:true, sent:0, and dedup is still recorded', async () => {
    global.fetch = jest.fn(); // no tokens → push.service never fetches
    const t0 = 3_000_000;
    const res = await assistantPush.sendAlertPush('O1', [HIGH('low_stock')], { nowMs: t0 });
    expect(res).toMatchObject({ pushed: true, sent: 0, keys: ['low_stock'] });
    expect(global.fetch).not.toHaveBeenCalled();

    // Recorded → an immediate re-run is suppressed (no repeated recompute/attempt).
    const again = await assistantPush.sendAlertPush('O1', [HIGH('low_stock')], { nowMs: t0 + 60_000 });
    expect(again.pushed).toBe(false);
  });
});

describe('runAlertPush', () => {
  test('computes + pushes high alerts across all eligible outlets', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    mockRegistry.set('u2', { token: TOK('2'), outlet_id: 'O2' });
    mockListDigestOutlets.mockResolvedValue([
      { id: 'O1', name: 'A', currency: 'AUD' },
      { id: 'O2', name: 'B', currency: 'INR' },
    ]);
    mockComputeAlerts
      .mockResolvedValueOnce([HIGH('low_stock'), MED('m')]) // O1 → 1 pushable
      .mockResolvedValueOnce([MED('m2')]);                  // O2 → nothing pushable
    const bodies = mockFetchCapture();

    const res = await assistantPush.runAlertPush({ now: new Date('2026-08-03T10:00:00Z') });

    expect(res).toMatchObject({ outlets: 2, pushedOutlets: 1, sent: 1 });
    expect(bodies).toHaveLength(1); // only O1 pushed
    expect(bodies[0].body[0].to).toBe(TOK('1'));
  });

  test('an outlet whose alert computation throws never breaks the others', async () => {
    mockRegistry.set('u1', { token: TOK('1'), outlet_id: 'O1' });
    mockListDigestOutlets.mockResolvedValue([
      { id: 'Obad' },
      { id: 'O1', name: 'A' },
    ]);
    mockComputeAlerts
      .mockRejectedValueOnce(new Error('boom')) // Obad
      .mockResolvedValueOnce([HIGH('fraud_open')]); // O1
    mockFetchCapture();

    const res = await assistantPush.runAlertPush();
    expect(res.pushedOutlets).toBe(1);
    expect(res.sent).toBe(1);
  });

  test('no outlets → clean zero result, no fetch', async () => {
    mockListDigestOutlets.mockResolvedValue([]);
    global.fetch = jest.fn();
    const res = await assistantPush.runAlertPush();
    expect(res).toMatchObject({ outlets: 0, pushedOutlets: 0, sent: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
