/**
 * VoicePOS — Multilingual voice ordering component.
 * Waiter speaks in Hindi/Punjabi/Tamil/English/any Indian language →
 * auto-parsed → items added to cart instantly.
 * Uses Web Speech API (100% offline, no cloud needed on Chrome/Edge).
 * Falls back to manual text input when mic is unavailable.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addToCart } from '../../store/slices/posSlice';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Mic, MicOff, Volume2, X, CheckCircle, AlertCircle,
  RefreshCw, ChevronDown, ShoppingCart, Zap, Globe,
  Plus, Minus, Trash2, Info, Keyboard,
} from 'lucide-react';

/* ─── constants ─────────────────────────────────────────────────── */
const LANGUAGES = [
  { code: 'en-IN', label: 'English (India)',     flag: '🇮🇳' },
  { code: 'hi-IN', label: 'हिंदी (Hindi)',        flag: '🇮🇳' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ (Punjabi)',    flag: '🇮🇳' },
  { code: 'ta-IN', label: 'தமிழ் (Tamil)',        flag: '🇮🇳' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)',      flag: '🇮🇳' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ (Kannada)',     flag: '🇮🇳' },
  { code: 'ml-IN', label: 'മലയാളം (Malayalam)',  flag: '🇮🇳' },
  { code: 'mr-IN', label: 'मराठी (Marathi)',      flag: '🇮🇳' },
  { code: 'gu-IN', label: 'ગુજરાતી (Gujarati)',  flag: '🇮🇳' },
  { code: 'bn-IN', label: 'বাংলা (Bengali)',      flag: '🇮🇳' },
  { code: 'ur-IN', label: 'اردو (Urdu)',          flag: '🇮🇳' },
  { code: 'en-AU', label: 'English (Australia)', flag: '🇦🇺' },
  { code: 'en-US', label: 'English (US)',         flag: '🇺🇸' },
];

const EXAMPLE_PHRASES = [
  { lang: 'Hindi',   phrase: 'Ek butter chicken, do naan, teen lassi' },
  { lang: 'English', phrase: 'Two paneer tikka, one dal makhani' },
  { lang: 'Tamil',   phrase: 'Rendu dosa, onnu sambar, moonu idli' },
  { lang: 'Punjabi', phrase: 'Ik lassi, do paratha, teen dal' },
];

/* ─── mic wave animation ─────────────────────────────────────────── */
function MicWave({ active }) {
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {[0,1,2,3,4].map(i => (
        <div
          key={i}
          style={{
            width: 4,
            borderRadius: 9999,
            background: active ? 'var(--accent)' : 'var(--border)',
            height: active ? `${12 + Math.sin(i * 0.8) * 12}px` : '4px',
            transition: 'height 0.1s ease',
            animation: active ? `voiceBar ${0.6 + i * 0.1}s ease-in-out infinite alternate` : 'none',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes voiceBar {
          from { height: 4px; }
          to   { height: 28px; }
        }
      `}</style>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────── */
export default function VoicePOS({ onClose }) {
  const dispatch = useDispatch();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;

  const [lang, setLang]                     = useState('hi-IN');
  const [isListening, setIsListening]       = useState(false);
  const [transcript, setTranscript]         = useState('');
  const [interimText, setInterimText]       = useState('');
  const [parsedItems, setParsedItems]       = useState([]);
  const [unmatched, setUnmatched]           = useState([]);
  const [isParsing, setIsParsing]           = useState(false);
  const [parseError, setParseError]         = useState('');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [supported, setSupported]           = useState(true);
  const [exampleIdx, setExampleIdx]         = useState(0);
  const [inputMode, setInputMode]           = useState('voice'); // 'voice' | 'text'
  const [manualText, setManualText]         = useState('');

  const recognitionRef = useRef(null);
  const transcriptRef  = useRef('');
  const silenceTimer   = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
    const t = setInterval(() => setExampleIdx(i => (i + 1) % EXAMPLE_PHRASES.length), 3000);
    return () => clearInterval(t);
  }, []);

  /* ── parse transcript via backend ── */
  const parseTranscript = useCallback(async (text) => {
    if (!text.trim()) return;
    setIsParsing(true);
    setParseError('');
    try {
      const res = await api.post('/voice-pos/parse', { transcript: text, outlet_id: outletId });
      const { matched, unmatched: um, error: backendErr } = res.data?.data || {};
      setParsedItems(matched || []);
      setUnmatched(um || []);
      if (backendErr) setParseError(`Server: ${backendErr}`);
      else if (!matched?.length) setParseError('No menu items recognised. Try rephrasing or check your menu.');
    } catch {
      setParseError('Could not connect to server. Check your connection.');
    } finally {
      setIsParsing(false);
    }
  }, [outletId]);

  /* ── speech recognition ── */
  const startListening = useCallback(async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Request mic permission
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (permErr) {
        const msg = permErr.name === 'NotAllowedError'
          ? 'Microphone access blocked. Allow microphone in browser settings, then retry.'
          : `Microphone error: ${permErr.message}`;
        setParseError(msg);
        return;
      }
    }

    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognitionRef.current = recognition;

    transcriptRef.current = '';
    setTranscript('');
    setInterimText('');
    setParsedItems([]);
    setUnmatched([]);
    setParseError('');

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (e) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      if (final) {
        transcriptRef.current += final;
        setTranscript(transcriptRef.current.trim());
      }
      setInterimText(interim);

      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        if (transcriptRef.current.trim()) parseTranscript(transcriptRef.current.trim());
      }, 1500);
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const msgs = {
        'not-allowed': 'Microphone access blocked. Allow microphone in browser Settings → Privacy → Microphone.',
        'service-not-allowed': 'Speech recognition requires microphone access.',
        'network': 'Speech service unavailable. Check internet connection.',
      };
      setParseError(msgs[e.error] || `Microphone error: ${e.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      if (transcriptRef.current.trim()) parseTranscript(transcriptRef.current.trim());
    };

    recognition.start();
  }, [lang, parseTranscript]);

  const stopListening = useCallback(() => {
    clearTimeout(silenceTimer.current);
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsListening(false);
    if (transcriptRef.current.trim()) parseTranscript(transcriptRef.current.trim());
  }, [parseTranscript]);

  useEffect(() => () => {
    clearTimeout(silenceTimer.current);
    if (recognitionRef.current) recognitionRef.current.stop();
  }, []);

  /* ── quantity controls ── */
  const setItemQty = (idx, delta) => {
    setParsedItems(prev => {
      const next = [...prev];
      const newQty = next[idx].quantity + delta;
      if (newQty <= 0) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantity: newQty };
      return next;
    });
  };

  /* ── add all to cart ── */
  const addAllToCart = () => {
    if (!parsedItems.length) return;
    parsedItems.forEach(item => dispatch(addToCart({
      menu_item_id: item.menu_item_id,
      name: item.name,
      base_price: item.base_price,
      food_type: item.food_type,
      kitchen_station: item.kitchen_station,
      quantity: item.quantity,
      variant_id: null,
      variant_price: 0,
      addons: [],
    })));
    toast.success(`${parsedItems.length} item${parsedItems.length > 1 ? 's' : ''} added to cart`);
    onClose();
  };

  const reset = () => {
    transcriptRef.current = '';
    setTranscript(''); setInterimText(''); setManualText('');
    setParsedItems([]); setUnmatched([]); setParseError('');
  };

  const selectedLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const ex = EXAMPLE_PHRASES[exampleIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent)' }}>
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Voice POS</h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Speak order in any language</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button
                onClick={() => setInputMode('voice')}
                className="px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1"
                style={{
                  background: inputMode === 'voice' ? 'var(--accent)' : 'transparent',
                  color: inputMode === 'voice' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Mic className="w-3 h-3" /> Voice
              </button>
              <button
                onClick={() => setInputMode('text')}
                className="px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1"
                style={{
                  background: inputMode === 'text' ? 'var(--accent)' : 'transparent',
                  color: inputMode === 'text' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Keyboard className="w-3 h-3" /> Type
              </button>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Not supported */}
          {!supported && inputMode === 'voice' && (
            <div className="m-4 p-4 rounded-xl flex gap-3" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }}>
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Browser not supported</p>
                <p className="text-xs mt-1">Voice POS requires Chrome or Edge. Use the Type tab instead.</p>
              </div>
            </div>
          )}

          {/* Language selector */}
          <div className="px-5 pt-4">
            <div className="relative">
              <button
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl w-full text-sm font-medium transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                onClick={() => setShowLangPicker(p => !p)}
              >
                <Globe className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span>{selectedLang.flag} {selectedLang.label}</span>
                <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showLangPicker ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-secondary)' }} />
              </button>
              {showLangPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl shadow-xl z-20 overflow-hidden max-h-60 overflow-y-auto"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  {LANGUAGES.map(l => (
                    <button key={l.code}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors hover:opacity-80"
                      style={{
                        color: lang === l.code ? 'var(--accent)' : 'var(--text-primary)',
                        fontWeight: lang === l.code ? 700 : 400,
                        background: lang === l.code ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                      }}
                      onClick={() => { setLang(l.code); setShowLangPicker(false); }}
                    >
                      <span>{l.flag}</span><span>{l.label}</span>
                      {lang === l.code && <CheckCircle className="w-4 h-4 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── VOICE MODE ── */}
          {inputMode === 'voice' && (
            <div className="flex flex-col items-center py-6 px-5">
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={!supported}
                className="relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: isListening
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : 'var(--accent)',
                  transform: isListening ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                {isListening
                  ? <MicOff className="w-10 h-10 text-white" />
                  : <Mic className="w-10 h-10 text-white" />
                }
                {isListening && (
                  <span className="absolute inset-0 rounded-full border-4 border-red-400/60 animate-ping" />
                )}
              </button>

              <MicWave active={isListening} />

              <p className="text-sm font-medium mt-2">
                {isListening
                  ? <span className="font-bold animate-pulse" style={{ color: '#ef4444' }}>● Listening… speak now</span>
                  : <span style={{ color: 'var(--text-secondary)' }}>Tap mic to start speaking</span>
                }
              </p>

              {!isListening && !transcript && (
                <div className="mt-3 text-center">
                  <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Try saying:</p>
                  <p className="text-xs font-medium italic" style={{ color: 'var(--accent)' }}>"{ex.phrase}"</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>({ex.lang})</p>
                </div>
              )}
            </div>
          )}

          {/* ── TEXT MODE ── */}
          {inputMode === 'text' && (
            <div className="px-5 py-4">
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Type your order (Hindi, English, or any mix):
              </p>
              <textarea
                className="w-full rounded-xl p-3 text-sm resize-none focus:outline-none"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  minHeight: 80,
                }}
                placeholder={`e.g. ${ex.phrase}`}
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (manualText.trim()) { setTranscript(manualText.trim()); parseTranscript(manualText.trim()); }
                  }
                }}
              />
              <button
                onClick={() => { if (manualText.trim()) { setTranscript(manualText.trim()); parseTranscript(manualText.trim()); } }}
                disabled={!manualText.trim() || isParsing}
                className="mt-2 w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {isParsing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isParsing ? 'Parsing…' : 'Parse Order'}
              </button>
            </div>
          )}

          {/* Transcript display (voice mode) */}
          {inputMode === 'voice' && (transcript || interimText) && (
            <div className="mx-5 mb-4 p-4 rounded-xl" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Volume2 className="w-3 h-3" /> Heard
              </p>
              <p className="text-sm leading-relaxed">
                <span style={{ color: 'var(--text-primary)' }}>{transcript}</span>
                {interimText && <span className="italic" style={{ color: 'var(--text-secondary)' }}> {interimText}</span>}
              </p>
              {transcript && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => parseTranscript(transcript)} disabled={isParsing}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-opacity disabled:opacity-50"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                    {isParsing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    {isParsing ? 'Parsing…' : 'Re-parse'}
                  </button>
                  <button onClick={reset}
                    className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-70"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="mx-5 mb-4 p-3 rounded-xl text-sm" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }}>
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{parseError}</p>
              </div>
              {parseError.includes('blocked') && (
                <button
                  onClick={() => { setParseError(''); setInputMode('text'); }}
                  className="mt-2 w-full py-2 rounded-lg text-xs font-bold"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Switch to Type Mode instead
                </button>
              )}
            </div>
          )}

          {/* Parsed items */}
          {parsedItems.length > 0 && (
            <div className="mx-5 mb-4">
              <p className="text-xs font-bold mb-2 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <CheckCircle className="w-3 h-3" style={{ color: 'var(--success)' }} />
                RECOGNISED ({parsedItems.length} item{parsedItems.length > 1 ? 's' : ''})
              </p>
              <div className="space-y-2">
                {parsedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: item.food_type === 'veg' ? 'var(--success)' : 'var(--danger)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        ₹{item.base_price.toFixed(2)} · {item.confidence}% match
                        {item.spoken_as &&
                          item.spoken_as.toLowerCase() !== item.name.toLowerCase() &&
                          !parsedItems.some((o, i) => i !== idx && o.spoken_as === item.spoken_as) &&
                          <span> · heard &ldquo;{item.spoken_as}&rdquo;</span>
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setItemQty(idx, -1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-black text-sm" style={{ color: 'var(--text-primary)' }}>{item.quantity}</span>
                      <button onClick={() => setItemQty(idx, +1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setParsedItems(p => p.filter((_, i) => i !== idx))}
                        className="w-7 h-7 rounded-full flex items-center justify-center ml-1 transition-opacity hover:opacity-70"
                        style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center px-4 py-2 mt-1">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total</span>
                <span className="font-black text-lg" style={{ color: 'var(--text-primary)' }}>
                  ₹{parsedItems.reduce((s, i) => s + i.base_price * i.quantity, 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Unmatched */}
          {unmatched.length > 0 && (
            <div className="mx-5 mb-4 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 20%, transparent)' }}>
              <p className="text-xs font-bold mb-2 flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                <Info className="w-3 h-3" /> NOT FOUND ({unmatched.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {unmatched.map((u, i) => (
                  <span key={i} className="px-2 py-1 rounded-lg text-xs"
                    style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}>
                    {u}
                  </span>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                These weren't found in your menu. Check spelling or add them.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          {parsedItems.length > 0 ? (
            <button onClick={addAllToCart}
              className="w-full py-3.5 rounded-xl font-bold text-base text-white flex items-center justify-center gap-3 transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}>
              <ShoppingCart className="w-5 h-5" />
              Add {parsedItems.length} Item{parsedItems.length > 1 ? 's' : ''} to Cart
              <span className="text-sm opacity-80">
                · ₹{parsedItems.reduce((s, i) => s + i.base_price * i.quantity, 0).toFixed(0)}
              </span>
            </button>
          ) : (
            <p className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
              Supports Hindi · Punjabi · Tamil · Telugu · Kannada · Bengali · English
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
