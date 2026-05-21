/**
 * useVoiceOrder — voice ordering hook for POS page.
 *
 * Multi-turn continuous mode: after the LLM replies, listening auto-restarts
 * so the operator can chain commands ("Add 2 burgers" → "And a coke" →
 * "Make that medium spicy" → "Done") without re-tapping the mic.
 *
 * Settings (synced from localStorage 'msrm_voice_settings'):
 *   language          — recognition + TTS locale (default 'en-IN')
 *   continuousMode    — auto-restart listening after each utterance (default true)
 *   speakResponses    — TTS the LLM reply (default true)
 *   showToasts        — show toast notifications for LLM replies (default true)
 *   silenceTimeoutMs  — auto-stop after this much silence (default 2500)
 *   maxSessionSec     — hard cap on a single mic session (default 60s)
 *   saveHistory       — persist conversation transcripts locally (default true)
 *   wakeOnOpen        — start listening as soon as voice mode is enabled
 *   ttsRate           — speech synthesis rate (default 1.1)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addToCart, clearCart, setOrderType as setReduxOrderType } from '../store/slices/posSlice';
import api from '../lib/api';
import toast from 'react-hot-toast';

// Supported languages for voice recognition
export const VOICE_LANGUAGES = [
  { code: 'en-IN',  label: 'English (India)',    short: 'EN-IN' },
  { code: 'en-AU',  label: 'English (Australia)', short: 'EN-AU' },
  { code: 'en-US',  label: 'English (US)',        short: 'EN-US' },
  { code: 'en-GB',  label: 'English (UK)',        short: 'EN-GB' },
  { code: 'hi-IN',  label: 'Hindi',               short: 'हिंदी' },
  { code: 'pa-IN',  label: 'Punjabi',             short: 'ਪੰਜਾਬੀ' },
  { code: 'ta-IN',  label: 'Tamil',               short: 'தமிழ்' },
  { code: 'te-IN',  label: 'Telugu',              short: 'తెలుగు' },
  { code: 'kn-IN',  label: 'Kannada',             short: 'ಕನ್ನಡ' },
  { code: 'ml-IN',  label: 'Malayalam',           short: 'മലയാളം' },
  { code: 'mr-IN',  label: 'Marathi',             short: 'मराठी' },
  { code: 'gu-IN',  label: 'Gujarati',            short: 'ગુજરાતી' },
  { code: 'bn-IN',  label: 'Bengali',             short: 'বাংলা' },
  { code: 'ur-IN',  label: 'Urdu',                short: 'اردو' },
  { code: 'ar-SA',  label: 'Arabic',              short: 'عربي' },
];

const VOICE_SETTINGS_KEY = 'msrm_voice_settings';
const VOICE_HISTORY_KEY = 'msrm_voice_history';

export const DEFAULT_VOICE_SETTINGS = {
  language: 'en-IN',
  continuousMode: true,
  speakResponses: true,
  showToasts: true,
  silenceTimeoutMs: 2500,
  maxSessionSec: 60,
  saveHistory: true,
  wakeOnOpen: false,
  ttsRate: 1.1,
};

export function loadVoiceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) || '{}');
    return { ...DEFAULT_VOICE_SETTINGS, ...saved };
  } catch { return { ...DEFAULT_VOICE_SETTINGS }; }
}
export function saveVoiceSettings(patch) {
  const cur = loadVoiceSettings();
  const next = { ...cur, ...patch };
  localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
  // Notify subscribers
  window.dispatchEvent(new CustomEvent('voice-settings-changed', { detail: next }));
  return next;
}
export function loadVoiceHistory() {
  try { return JSON.parse(localStorage.getItem(VOICE_HISTORY_KEY) || '[]'); }
  catch { return []; }
}
export function clearVoiceHistory() {
  localStorage.removeItem(VOICE_HISTORY_KEY);
  window.dispatchEvent(new CustomEvent('voice-history-changed'));
}
function appendVoiceHistory(entry) {
  try {
    const cur = loadVoiceHistory();
    cur.unshift({ ...entry, ts: Date.now() });
    // Keep latest 100
    const trimmed = cur.slice(0, 100);
    localStorage.setItem(VOICE_HISTORY_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('voice-history-changed'));
  } catch {}
}

export default function useVoiceOrder(langOverride) {
  const dispatch = useDispatch();
  const { user } = useSelector(s => s.auth);
  const cart = useSelector(s => s.pos.cart);
  const outletId = user?.outlet_id;

  // Live-reloadable settings (subscribe to storage events)
  const [settings, setSettings] = useState(loadVoiceSettings());
  useEffect(() => {
    const onChange = () => setSettings(loadVoiceSettings());
    window.addEventListener('voice-settings-changed', onChange);
    window.addEventListener('storage', (e) => { if (e.key === VOICE_SETTINGS_KEY) onChange(); });
    return () => window.removeEventListener('voice-settings-changed', onChange);
  }, []);

  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [supported, setSupported] = useState(true);

  // Effective language: prop override > settings.language
  const lang = langOverride || settings.language || 'en-IN';

  // Multi-turn state
  const conversationHistory = useRef([]);
  const recognitionRef = useRef(null);
  const silenceTimer = useRef(null);
  const safetyTimer = useRef(null);
  const sessionActiveRef = useRef(false);   // True while the user wants continuous voice mode on
  const manualStopRef   = useRef(false);    // True when user explicitly toggled off

  // Detect Electron
  const isElectron = typeof window !== 'undefined' && (
    !!window.electron ||
    /electron/i.test(navigator.userAgent || '') ||
    !!window.process?.versions?.electron
  );

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR && !isElectron);
    return () => {
      sessionActiveRef.current = false;
      clearTimeout(silenceTimer.current);
      clearTimeout(safetyTimer.current);
      try { recognitionRef.current?.abort(); } catch (_) {}
    };
  }, [isElectron]);

  /* ── Convert LLM cart items → Redux cart ── */
  const syncCartToRedux = useCallback((llmCart, action) => {
    if (action === 'cleared' && (!llmCart || !llmCart.length)) {
      dispatch(clearCart());
      return;
    }
    if (!llmCart || !llmCart.length) return;
    dispatch(clearCart());
    llmCart.forEach(item => {
      dispatch(addToCart({
        menu_item_id: item.menu_item_id,
        name: item.name,
        base_price: item.unit_price,
        variant_id: item.variant_id || null,
        variant_name: item.variant_name || null,
        variant_price: item.variant_id ? item.unit_price : 0,
        food_type: item.food_type || 'veg',
        quantity: item.quantity,
        special_instructions: item.notes || '',
        addons: [],
      }));
    });
  }, [dispatch]);

  /* ── Send transcript to LLM ── */
  const sendToLLM = useCallback(async (text) => {
    if (!text.trim() || isThinking) return;
    setIsThinking(true);
    setLastResponse('');

    const currentCart = cart.map(c => ({
      menu_item_id: c.menu_item_id,
      name: c.name,
      unit_price: Number(c.base_price) + Number(c.variant_price || 0),
      quantity: c.quantity,
      variant_id: c.variant_id || null,
      variant_name: c.variant_name || null,
      food_type: c.food_type,
      notes: c.special_instructions || '',
    }));

    const newHistory = [...conversationHistory.current, { role: 'user', content: text }];

    try {
      const res = await api.post('/voice-pos/converse', {
        transcript: text,
        conversation_history: newHistory,
        current_cart: currentCart,
        outlet_id: outletId,
      });

      const data = res.data?.data || res.data || res;
      const { cart: newCart, response, action, table_number, order_type } = data;

      syncCartToRedux(newCart, action);
      if (order_type) dispatch(setReduxOrderType(order_type));
      if (table_number) {
        toast.success(`Table ${table_number} detected`, { icon: '🪑', duration: 2000 });
      }

      conversationHistory.current = [
        ...newHistory,
        { role: 'assistant', content: response },
      ];

      setLastResponse(response);

      // History persistence
      if (settings.saveHistory) {
        appendVoiceHistory({
          user: text,
          assistant: response,
          action: action || null,
          cart_after: newCart || [],
          lang,
        });
      }

      // TTS — optional
      if (response && settings.speakResponses && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(response);
        utter.lang = lang;
        utter.rate = settings.ttsRate || 1.1;
        window.speechSynthesis.speak(utter);
      }

      if (response && settings.showToasts) {
        toast(response, { icon: '🤖', duration: 3000, style: { maxWidth: '400px', fontSize: '13px' } });
      }

      // After the LLM responds, decide whether to listen again
      // Stop conditions: action='completed', user said done/finish/checkout, or settings.continuousMode off
      const completed = action === 'completed' || action === 'placed' || action === 'cancelled';
      const userSaidDone = /\b(done|finish|that'?s all|checkout|nothing else|stop listening)\b/i.test(text);

      if (settings.continuousMode && !completed && !userSaidDone && !manualStopRef.current && sessionActiveRef.current) {
        // Small gap so the TTS doesn't bleed into the next listen window
        setTimeout(() => {
          if (sessionActiveRef.current && !manualStopRef.current) startListening();
        }, 400);
      } else {
        sessionActiveRef.current = false;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Voice order failed');
      sessionActiveRef.current = false;
    } finally {
      setIsThinking(false);
    }
  }, [isThinking, cart, outletId, syncCartToRedux, dispatch, settings, lang]);

  /* ── Start a recognition session ── */
  const startListening = useCallback(() => {
    if (isThinking || isListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Speech not supported. Use Chrome.'); return; }

    try { recognitionRef.current?.abort(); } catch (_) {}

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let ended = false;

    const cleanup = (text) => {
      if (ended) return;
      ended = true;
      clearTimeout(silenceTimer.current);
      clearTimeout(safetyTimer.current);
      recognitionRef.current = null;
      setIsListening(false);
      setTranscript('');
      if (text) sendToLLM(text);
      else if (sessionActiveRef.current && !manualStopRef.current && settings.continuousMode) {
        // Empty result — listen again after a brief pause unless user stopped
        setTimeout(() => {
          if (sessionActiveRef.current && !manualStopRef.current) startListening();
        }, 300);
      }
    };

    recognition.onstart = () => {
      if (import.meta.env.DEV) console.log('[Voice] started, lang:', lang);
      setIsListening(true);
    };

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t + ' ';
        else interim += t;
      }
      setTranscript(finalTranscript + interim);

      // Reset silence timer on every result chunk
      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        try { recognition.stop(); } catch (_) {}
      }, Math.max(800, Number(settings.silenceTimeoutMs) || 2500));
    };

    recognition.onend = () => cleanup(finalTranscript.trim());

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed') toast.error('Microphone not allowed. Check browser permissions.');
      else if (e.error === 'no-speech') toast('No speech detected.', { icon: '🎤', duration: 1500 });
      else if (e.error === 'audio-capture') toast.error('No microphone found.');
      else if (e.error === 'network') toast.error('Network error during speech recognition.');
      cleanup('');
    };

    try {
      recognition.start();
      clearTimeout(safetyTimer.current);
      safetyTimer.current = setTimeout(() => {
        if (!ended) {
          try { recognition.abort(); } catch (_) {}
          cleanup('');
        }
      }, (Number(settings.maxSessionSec) || 60) * 1000);
    } catch (err) {
      toast.error('Could not start voice recognition.');
      cleanup('');
    }
  }, [isListening, isThinking, lang, sendToLLM, settings]);

  /* ── Stop listening (manual) ── */
  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    sessionActiveRef.current = false;
    clearTimeout(silenceTimer.current);
    try {
      recognitionRef.current?.stop();
    } catch (_) {
      setIsListening(false);
      setTranscript('');
      recognitionRef.current = null;
    }
  }, []);

  /* ── Toggle a multi-turn session on/off ── */
  const toggleListening = useCallback(() => {
    if (isListening || sessionActiveRef.current) {
      stopListening();
    } else {
      manualStopRef.current = false;
      sessionActiveRef.current = true;
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  /* ── Reset conversation context (clears LLM memory) ── */
  const resetConversation = useCallback(() => {
    conversationHistory.current = [];
    setLastResponse('');
    setTranscript('');
  }, []);

  return {
    isListening,
    isThinking,
    transcript,
    lastResponse,
    supported,
    isElectron,
    lang,
    settings,
    sessionActive: sessionActiveRef.current,
    toggleListening,
    stopListening,
    resetConversation,
    sendToLLM,
  };
}
