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
import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Audio } from 'expo-av';
import api from '../lib/api';
import { useOutlet } from '../context/OutletContext';
import { buildAskPayload, extractAnswer, errorText, EXAMPLE_PROMPTS } from '../lib/assistant';

// Re-export the pure helpers so existing imports from this hook keep working.
export { buildAskPayload, extractAnswer, errorText, EXAMPLE_PROMPTS };

let _seq = 0;
const nextId = () => `m${++_seq}`;

export function useAssistant() {
  const { outletId } = useOutlet();
  // message: { id, role: 'user'|'bot', text, action?, tool? }.
  // action is stored verbatim from res.data.action, so a batch preview
  // ({ name:'batch', token, summary, warn, items:[{summary,warn},…] }) carries its
  // items straight through to the screen; a single action has no items (or length 1).
  const [messages, setMessages] = useState([]);
  const [resolved, setResolved] = useState({}); // message id → 'done' | 'cancelled' | 'pending'

  const askM = useMutation({
    mutationFn: ({ q, history }) => api.post('/assistant/ask', buildAskPayload(q, outletId, history)),
    onSuccess: (res) =>
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text: extractAnswer(res) || "Sorry, I couldn't answer that one.", tool: res?.data?.tool ?? null, action: res?.data?.action ?? null, clarify: res?.data?.clarify ?? null }]),
    onError: (e) =>
      setMessages((m) => [...m, { id: nextId(), role: 'bot', text: errorText(e) }]),
  });

  // Confirm + run a previewed write action (preview → approve → run). Transport is
  // identical for single and batch: POST /assistant/act { token }. A batch token runs
  // every sub-action server-side and the reply reports per-item success/failure.
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

  // ── Voice input ────────────────────────────────────────────────────────────
  // Mirror the web panel: press the mic to record a spoken question, press again
  // to stop → the clip is uploaded to POST /voice-pos/transcribe (Groq Whisper,
  // multipart field "audio") and the returned text fills the input. Read-only —
  // this only turns speech into the text the owner would have typed.
  const recordingRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Start capturing mic audio. Returns true once recording; false if permission
  // was denied or the recorder couldn't start (screen degrades gracefully).
  const startRecording = useCallback(async () => {
    if (isRecording || recordingRef.current) return false;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm?.granted) return false;
      // iOS needs record mode enabled (and to play through the silent switch).
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      return true;
    } catch (_) {
      recordingRef.current = null;
      setIsRecording(false);
      return false;
    }
  }, [isRecording]);

  // Stop recording, upload the clip and resolve to the transcribed text (''
  // on any failure). Always tears the recorder down so the mic is released.
  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!recording) return '';
    let uri = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch (_) { /* already stopped / never started */ }
    // Restore normal audio mode so later playback isn't stuck in record mode.
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_) {}
    if (!uri) return '';
    setIsTranscribing(true);
    try {
      const form = new FormData();
      // RN multipart: append the file as { uri, name, type }. HIGH_QUALITY
      // records .m4a on both iOS and Android.
      form.append('audio', { uri, name: 'question.m4a', type: 'audio/m4a' });
      // The api interceptor returns the response BODY → { success, data:{ text }, message }.
      const res = await api.post('/voice-pos/transcribe', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return String(res?.data?.text ?? '').trim();
    } catch (_) {
      return '';
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const reset = useCallback(() => { setMessages([]); setResolved({}); }, []);

  return { messages, send, reset, isPending: askM.isPending, examples: EXAMPLE_PROMPTS, resolved, confirmAction, cancelAction, isActing: actM.isPending, alerts, shortcuts, isRecording, isTranscribing, startRecording, stopRecording };
}
