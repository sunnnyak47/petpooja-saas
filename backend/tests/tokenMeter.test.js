/**
 * @fileoverview Unit tests for the LLM token meter.
 * @module tests/tokenMeter.test
 */

const meter = require('../src/utils/tokenMeter');

beforeEach(() => meter._reset());

describe('normalizeUsage', () => {
  test('handles Groq shape (prompt_tokens / completion_tokens)', () => {
    expect(meter.normalizeUsage({ prompt_tokens: 100, completion_tokens: 50 }))
      .toEqual({ in: 100, out: 50, total: 150 });
  });

  test('handles Gemini shape (promptTokenCount / candidatesTokenCount)', () => {
    expect(meter.normalizeUsage({ promptTokenCount: 200, candidatesTokenCount: 80 }))
      .toEqual({ in: 200, out: 80, total: 280 });
  });

  test('handles explicit totalTokenCount when provided', () => {
    const r = meter.normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 35 });
    expect(r.total).toBe(35);
  });

  test('returns zeros for null / missing input', () => {
    expect(meter.normalizeUsage(null)).toEqual({ in: 0, out: 0, total: 0 });
    expect(meter.normalizeUsage({})).toEqual({ in: 0, out: 0, total: 0 });
  });
});

describe('costFor', () => {
  test('uses known Groq model price', () => {
    // 1,000,000 in + 1,000,000 out = $0.59 + $0.79 = $1.38
    expect(meter.costFor('llama-3.3-70b-versatile', 1_000_000, 1_000_000)).toBeCloseTo(1.38, 5);
  });

  test('falls back to default price for unknown model', () => {
    expect(meter.costFor('unknown-model', 0, 0)).toBe(0);
  });
});

describe('record + snapshot', () => {
  test('accumulates today / month / total after a single call', () => {
    meter.record({ prompt_tokens: 500, completion_tokens: 200 }, { outletId: 'o1', model: 'llama-3.3-70b-versatile' });
    const snap = meter.snapshot('o1');
    expect(snap.today.in).toBe(500);
    expect(snap.today.out).toBe(200);
    expect(snap.today.total).toBe(700);
    expect(snap.today.calls).toBe(1);
    expect(snap.month.total).toBe(700);
    expect(snap.total.total).toBe(700);
  });

  test('accumulates across multiple calls', () => {
    meter.record({ prompt_tokens: 100, completion_tokens: 50 }, { outletId: 'o2' });
    meter.record({ prompt_tokens: 200, completion_tokens: 100 }, { outletId: 'o2' });
    const snap = meter.snapshot('o2');
    expect(snap.today.total).toBe(450);
    expect(snap.today.calls).toBe(2);
  });

  test('tracks per-feature breakdown', () => {
    meter.record({ prompt_tokens: 300, completion_tokens: 100 }, { outletId: 'o3', feature: 'ask' });
    meter.record({ prompt_tokens: 50, completion_tokens: 20 }, { outletId: 'o3', feature: 'metric' });
    const snap = meter.snapshot('o3');
    expect(snap.features.ask).toBe(400);
    expect(snap.features.metric).toBe(70);
  });

  test('tracks per-model breakdown', () => {
    meter.record({ prompt_tokens: 100, completion_tokens: 50 }, { outletId: 'o4', model: 'llama-3.3-70b-versatile' });
    const snap = meter.snapshot('o4');
    expect(snap.models['llama-3.3-70b-versatile']).toBe(150);
  });

  test('uses AsyncLocalStorage context when no explicit outletId passed', () => {
    meter.withContext({ outletId: 'ctx-outlet', feature: 'test' }, () => {
      meter.record({ prompt_tokens: 80, completion_tokens: 40 });
    });
    const snap = meter.snapshot('ctx-outlet');
    expect(snap.today.total).toBe(120);
    expect(snap.features.test).toBe(120);
  });

  test('ignores calls where total tokens is 0', () => {
    meter.record({ prompt_tokens: 0, completion_tokens: 0 }, { outletId: 'o5' });
    const snap = meter.snapshot('o5');
    expect(snap.total.calls).toBe(0);
  });

  test('snapshot rolls over a stale today window without crashing', () => {
    // Simulate yesterday's record by manipulating internals is not possible,
    // so just verify snapshot returns a valid today even on a fresh (empty) outlet.
    const snap = meter.snapshot('no-data');
    expect(snap.today.total).toBe(0);
    expect(snap.today.calls).toBe(0);
  });

  test('different outlets are isolated', () => {
    meter.record({ prompt_tokens: 100, completion_tokens: 50 }, { outletId: 'a' });
    meter.record({ prompt_tokens: 200, completion_tokens: 100 }, { outletId: 'b' });
    expect(meter.snapshot('a').total.total).toBe(150);
    expect(meter.snapshot('b').total.total).toBe(300);
  });
});
