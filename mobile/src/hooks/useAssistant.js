/**
 * useAssistant — client for the read-only AI assistant (feature parity with the
 * web's floating "Ask" panel).
 *
 * Talks to POST /assistant/ask { question, outlet_id } and shows the grounded
 * answer. The assistant is READ-ONLY on the backend — it can look up sales,
 * stock, menu, customers, forecasts etc. but can never change anything.
 *
 * The mobile api interceptor returns the response BODY, so a successful call
 * resolves to { success, data: { answer, ... }, message } — the answer is at
 * res.data.answer. Pure helpers below are unit-tested (no React / RN imports).
 */
import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';
import { buildAskPayload, extractAnswer, errorText, EXAMPLE_PROMPTS } from '../lib/assistant';

// Re-export the pure helpers so existing imports from this hook keep working.
export { buildAskPayload, extractAnswer, errorText, EXAMPLE_PROMPTS };

let _seq = 0;
const nextId = () => `m${++_seq}`;

export function useAssistant() {
  const { outletId } = useOutlet();
  const [messages, setMessages] = useState([]); // { id, role: 'user'|'bot', text }

  const askM = useMutation({
    mutationFn: (q) => api.post('/assistant/ask', buildAskPayload(q, outletId)),
    onSuccess: (res) =>
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text: extractAnswer(res) || "Sorry, I couldn't answer that one." }]),
    onError: (e) =>
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text: errorText(e) }]),
  });

  const send = useCallback(
    (q) => {
      const t = String(q ?? '').trim();
      if (!t || askM.isPending) return;
      setMessages((m) => [...m, { id: nextId(), role: 'user', text: t }]);
      askM.mutate(t);
    },
    [askM],
  );

  const reset = useCallback(() => setMessages([]), []);

  return { messages, send, reset, isPending: askM.isPending, examples: EXAMPLE_PROMPTS };
}
