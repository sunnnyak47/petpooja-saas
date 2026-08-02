/**
 * assistant — pure helpers for the read-only AI assistant client.
 *
 * No React / RN / api imports, so the request/response contract can be
 * unit-tested deterministically. Consumed by src/hooks/useAssistant.js.
 */

// Friendly starter questions — mirror the assistant's read-only tools.
export const EXAMPLE_PROMPTS = [
  'How much did we sell today?',
  "What are today's top-selling items?",
  'What’s the sales forecast for tomorrow?',
  'Which items are low on stock?',
  'Who are my top customers?',
  'Any open purchase orders?',
];

/** Build the /assistant/ask body, scoping to the selected outlet when present.
 *  Optionally includes recent chat turns as `history` (bounded to the last 6) so
 *  the assistant handles follow-ups; bot turns keep their `tool` tag. The server
 *  sanitizes + bounds this, so passing a rough array is safe. */
export function buildAskPayload(question, outletId, history) {
  const q = String(question ?? '').trim();
  const payload = { question: q };
  if (outletId) payload.outlet_id = outletId;
  if (Array.isArray(history) && history.length) {
    payload.history = history
      .slice(-6)
      .map((m) => {
        const role = m && (m.role === 'bot' || m.role === 'assistant') ? m.role : 'user';
        const text = String((m && (m.text ?? m.content)) || '').trim();
        const e = { role, text };
        if (m && typeof m.tool === 'string' && m.tool) e.tool = m.tool;
        return e;
      })
      .filter((m) => m.text);
  }
  return payload;
}

/**
 * Pull the answer text out of the API body. The mobile api interceptor returns
 * the response BODY ({ success, data: { answer }, message }), but tolerate a raw
 * { answer } too. Returns null when there's no usable answer.
 */
export function extractAnswer(res) {
  const answer = res?.data?.answer ?? res?.answer;
  return typeof answer === 'string' && answer.trim() ? answer.trim() : null;
}

/** A friendly message from an error (prefers the server's message). */
export function errorText(e) {
  return e?.response?.data?.message || "I couldn't answer that right now — please try again.";
}
