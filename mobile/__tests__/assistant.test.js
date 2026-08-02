/**
 * Unit tests for the pure assistant helpers (lib/assistant). No React / RN /
 * network — locks the /assistant/ask request + response contract that the
 * mobile chat screen depends on.
 */
import { buildAskPayload, extractAnswer, errorText, EXAMPLE_PROMPTS } from '../src/lib/assistant';

describe('buildAskPayload', () => {
  test('trims the question and includes outlet_id when present', () => {
    expect(buildAskPayload('  how much today?  ', 'O1')).toEqual({ question: 'how much today?', outlet_id: 'O1' });
  });

  test('omits outlet_id when missing/empty', () => {
    expect(buildAskPayload('hi', null)).toEqual({ question: 'hi' });
    expect(buildAskPayload('hi', '')).toEqual({ question: 'hi' });
    expect(buildAskPayload('hi', undefined)).toEqual({ question: 'hi' });
  });

  test('coerces a nullish question to an empty string (server rejects it)', () => {
    expect(buildAskPayload(undefined, 'O1')).toEqual({ question: '', outlet_id: 'O1' });
    expect(buildAskPayload(null, 'O1')).toEqual({ question: '', outlet_id: 'O1' });
  });

  test('omits history when absent or empty', () => {
    expect(buildAskPayload('hi', 'O1')).toEqual({ question: 'hi', outlet_id: 'O1' });
    expect(buildAskPayload('hi', 'O1', [])).toEqual({ question: 'hi', outlet_id: 'O1' });
    expect(buildAskPayload('hi', 'O1', 'nope')).toEqual({ question: 'hi', outlet_id: 'O1' });
  });

  test('normalizes history: bot->bot, content alias, tool tag, last 6, drops empties', () => {
    const raw = [
      { role: 'user', text: 'how many veg items' },
      { role: 'bot', content: 'You have 60 veg.', tool: 'menu_overview' },
      { role: 'user', text: '   ' }, // dropped (empty)
    ];
    expect(buildAskPayload('and non-veg?', 'O1', raw)).toEqual({
      question: 'and non-veg?',
      outlet_id: 'O1',
      history: [
        { role: 'user', text: 'how many veg items' },
        { role: 'bot', text: 'You have 60 veg.', tool: 'menu_overview' },
      ],
    });
  });

  test('caps history to the last 6 turns', () => {
    const raw = Array.from({ length: 12 }, (_, i) => ({ role: 'user', text: `q${i}` }));
    const out = buildAskPayload('x', null, raw);
    expect(out.history).toHaveLength(6);
    expect(out.history[0].text).toBe('q6');
  });
});

describe('extractAnswer', () => {
  test('reads the answer from the api BODY shape { data: { answer } }', () => {
    expect(extractAnswer({ success: true, data: { answer: 'You sold $1,240 today.' }, message: 'ok' })).toBe('You sold $1,240 today.');
  });

  test('tolerates a raw { answer } shape', () => {
    expect(extractAnswer({ answer: 'Top item: Flat White.' })).toBe('Top item: Flat White.');
  });

  test('trims whitespace answers', () => {
    expect(extractAnswer({ data: { answer: '  spaced  ' } })).toBe('spaced');
  });

  test('returns null when there is no usable answer', () => {
    expect(extractAnswer({ data: {} })).toBeNull();
    expect(extractAnswer({ data: { answer: '   ' } })).toBeNull();
    expect(extractAnswer({})).toBeNull();
    expect(extractAnswer(null)).toBeNull();
    expect(extractAnswer(undefined)).toBeNull();
    expect(extractAnswer({ data: { answer: 42 } })).toBeNull();
  });
});

describe('errorText', () => {
  test('prefers the server message', () => {
    expect(errorText({ response: { data: { message: 'Rate limit reached.' } } })).toBe('Rate limit reached.');
  });

  test('falls back to a friendly default', () => {
    expect(errorText(new Error('network'))).toMatch(/couldn't answer/i);
    expect(errorText(undefined)).toMatch(/couldn't answer/i);
  });
});

describe('EXAMPLE_PROMPTS', () => {
  test('is a non-empty list of question strings', () => {
    expect(Array.isArray(EXAMPLE_PROMPTS)).toBe(true);
    expect(EXAMPLE_PROMPTS.length).toBeGreaterThan(2);
    for (const p of EXAMPLE_PROMPTS) expect(typeof p).toBe('string');
  });
});
