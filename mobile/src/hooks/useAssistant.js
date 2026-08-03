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
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';
import { buildAskPayload, extractAnswer, errorText, EXAMPLE_PROMPTS } from '../lib/assistant';

// Re-export the pure helpers so existing imports from this hook keep working.
export { buildAskPayload, extractAnswer, errorText, EXAMPLE_PROMPTS };

let _seq = 0;
const nextId = () => `m${++_seq}`;

export function useAssistant() {
  const { outletId } = useOutlet();
  const [messages, setMessages] = useState([]); // { id, role: 'user'|'bot', text, action?, tool? }
  const [resolved, setResolved] = useState({}); // message id → 'done' | 'cancelled' | 'pending'

  const askM = useMutation({
    mutationFn: ({ q, history }) => api.post('/assistant/ask', buildAskPayload(q, outletId, history)),
    onSuccess: (res) =>
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text: extractAnswer(res) || "Sorry, I couldn't answer that one.", tool: res?.data?.tool ?? null, action: res?.data?.action ?? null, clarify: res?.data?.clarify ?? null }]),
    onError: (e) =>
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text: errorText(e) }]),
  });

  // Confirm + run a previewed write action (preview → approve → run).
  const actM = useMutation({
    mutationFn: ({ token }) => api.post('/assistant/act', { token, ...(outletId ? { outlet_id: outletId } : {}) }),
    onSuccess: (res) => setMessages((m) => [...m, { id: nextId(), role: 'bot', text: extractAnswer(res) || 'Done.' }]),
    onError: (e) => setMessages((m) => [...m, { id: nextId(), role: 'bot', text: errorText(e) }]),
  });

  const confirmAction = useCallback((id, token) => {
    setResolved((r) => (r[id] ? r : { ...r, [id]: 'pending' }));
    actM.mutate({ token }, { onSettled: () => setResolved((r) => ({ ...r, [id]: 'done' })) });
  }, [actM]);
  const cancelAction = useCallback((id) => {
    setResolved((r) => (r[id] ? r : { ...r, [id]: 'cancelled' }));
    setMessages((m) => [...m, { id: nextId(), role: 'bot', text: 'Okay — cancelled. Nothing was changed.' }]);
  }, []);

  const send = useCallback(
    (q) => {
      const t = String(q ?? '').trim();
      if (!t || askM.isPending) return;
      // Recent turns (before this one) → history, so follow-ups keep context.
      const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text, ...(m.tool ? { tool: m.tool } : {}) }));
      setMessages((m) => [...m, { id: nextId(), role: 'user', text: t }]);
      askM.mutate({ q: t, history });
    },
    [askM, messages],
  );

  // Proactive alerts — what needs the owner's attention right now.
  const alertsQuery = useQuery({
    queryKey: ['assistant-alerts', outletId],
    queryFn: () => api.get('/assistant/alerts', outletId ? { params: { outlet_id: outletId } } : undefined),
    enabled: !!outletId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const alerts = alertsQuery.data?.data?.alerts || [];

  // Personalized shortcuts — this owner's most-asked questions.
  const shortcutsQuery = useQuery({
    queryKey: ['assistant-shortcuts', outletId],
    queryFn: () => api.get('/assistant/shortcuts', outletId ? { params: { outlet_id: outletId } } : undefined),
    enabled: !!outletId,
    staleTime: 5 * 60_000,
  });
  const shortcuts = shortcutsQuery.data?.data?.shortcuts || [];

  const reset = useCallback(() => { setMessages([]); setResolved({}); }, []);

  return { messages, send, reset, isPending: askM.isPending, examples: EXAMPLE_PROMPTS, resolved, confirmAction, cancelAction, isActing: actM.isPending, alerts, shortcuts };
}
