/**
 * VoicePOS — Conversational LLM-powered voice ordering
 * Multi-turn: corrections, removals, variant selection, quantity changes
 * Uses Groq + Llama 3.3 70B via /api/voice-pos/converse
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addToCart } from '../../store/slices/posSlice';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Mic, MicOff, X, CheckCircle, ShoppingCart, Globe,
  Trash2, Plus, Minus, Loader2, Volume2, VolumeX,
  RotateCcw, Send, Keyboard, ChevronDown, Zap,
  MessageSquare, Bot, User,
} from 'lucide-react';

/* ─── Language list ──────────────────────────────────────────── */
const LANGUAGES = [
  { code: 'hi-IN', label: 'हिंदी',        flag: '🇮🇳', hint: 'Do butter chicken, ek naan' },
  { code: 'en-IN', label: 'English (IN)', flag: '🇮🇳', hint: 'Two butter chicken, one naan' },
  { code: 'en-AU', label: 'English (AU)', flag: '🇦🇺', hint: 'Two burgers and a chips' },
  { code: 'ta-IN', label: 'தமிழ்',        flag: '🇮🇳', hint: 'Rendu dosa, onnu idli' },
  { code: 'te-IN', label: 'తెలుగు',       flag: '🇮🇳', hint: 'Rendu biryani, okati raita' },
  { code: 'mr-IN', label: 'मराठी',        flag: '🇮🇳', hint: 'Don vada pav, ek chai' },
  { code: 'gu-IN', label: 'ગુજરાતી',      flag: '🇮🇳', hint: 'Be dhokla, ek chai' },
  { code: 'bn-IN', label: 'বাংলা',        flag: '🇮🇳', hint: 'Dui mishti doi, ek chai' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ',        flag: '🇮🇳', hint: 'Eradu idli, ondu coffee' },
  { code: 'ml-IN', label: 'മലയാളം',      flag: '🇮🇳', hint: 'Randu dosa, onnu chaya' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ',      flag: '🇮🇳', hint: 'Ik lassi, do paratha' },
  { code: 'ur-IN', label: 'اردو',         flag: '🇮🇳', hint: 'Do biryani, ek naan' },
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸', hint: 'Two burgers, one fries' },
];

/* ─── Mic wave animation ─────────────────────────────────────── */
function MicWave({ active, thinking }) {
  if (thinking) {
    return (
      <div className="flex items-center gap-1">
        {[0,1,2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full bg-accent animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{
          width: 3, borderRadius: 9999,
          background: active ? '#ef4444' : 'var(--border)',
          height: active ? `${10 + Math.sin(i * 0.9) * 10}px` : '3px',
          transition: 'height 0.15s',
          animation: active ? `vBar ${0.5 + i*0.1}s ease-in-out infinite alternate` : 'none',
          animationDelay: `${i * 0.07}s`,
        }} />
      ))}
      <style>{`@keyframes vBar { from{height:3px} to{height:22px} }`}</style>
    </div>
  );
}

/* ─── Chat bubble ────────────────────────────────────────────── */
function ChatBubble({ role, text, changes, unmatched, isLatest }) {
  const isUser = role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-accent/20' : 'bg-green-500/20'}`}>
        {isUser ? <User size={14} className="text-accent" /> : <Bot size={14} className="text-green-600" />}
      </div>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${isUser
        ? 'bg-accent text-white rounded-tr-sm'
        : 'bg-surface border border-border text-primary rounded-tl-sm'}`}
      >
        <p className="leading-relaxed">{text}</p>
        {changes?.length > 0 && (
          <div className={`mt-1.5 pt-1.5 border-t ${isUser ? 'border-white/20' : 'border-border'}`}>
            {changes.map((c, i) => (
              <p key={i} className={`text-xs ${isUser ? 'text-white/80' : 'text-green-600'}`}>✓ {c}</p>
            ))}
          </div>
        )}
        {unmatched?.length > 0 && (
          <div className="mt-1 pt-1 border-t border-amber-200">
            <p className="text-xs text-amber-600">⚠ Not found: {unmatched.join(', ')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Cart item row ──────────────────────────────────────────── */
function CartItemRow({ item, onQtyChange, onRemove }) {
  const isVeg = item.food_type === 'veg';
  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <div className={`w-3 h-3 rounded-sm border-2 flex-shrink-0 ${isVeg ? 'border-green-500' : 'border-red-500'}`}>
        <div className={`w-1.5 h-1.5 rounded-full m-px ${isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        {item.variant_name && <p className="text-xs text-secondary">{item.variant_name}</p>}
        {item.notes && <p className="text-xs text-amber-600 italic">"{item.notes}"</p>}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onQtyChange(item.menu_item_id, item.variant_id, item.quantity - 1)}
          className="w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-red-50 hover:border-red-300">
          <Minus size={10} />
        </button>
        <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
        <button onClick={() => onQtyChange(item.menu_item_id, item.variant_id, item.quantity + 1)}
          className="w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-green-50 hover:border-green-300">
          <Plus size={10} />
        </button>
      </div>
      <div className="text-right w-16">
        <p className="text-xs font-semibold text-accent">₹{((item.unit_price || 0) * item.quantity).toFixed(0)}</p>
      </div>
      <button onClick={() => onRemove(item.menu_item_id, item.variant_id)}
        className="text-red-400 hover:text-red-600 flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════ */
export default function VoicePOS({ onClose }) {
  const dispatch = useDispatch();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;

  /* ── State ── */
  const [lang, setLang]                       = useState('hi-IN');
  const [showLangPicker, setShowLangPicker]   = useState(false);
  const [inputMode, setInputMode]             = useState('voice'); // 'voice' | 'text'
  const [manualText, setManualText]           = useState('');
  const [isListening, setIsListening]         = useState(false);
  const [isThinking, setIsThinking]           = useState(false);
  const [isSpeaking, setIsSpeaking]           = useState(false);
  const [interimText, setInterimText]         = useState('');
  const [ttsEnabled, setTtsEnabled]           = useState(true);
  const [supported, setSupported]             = useState(true);
  const [confirmed, setConfirmed]             = useState(false);

  // Conversation state
  const [messages, setMessages]               = useState([]); // [{role:'user'|'assistant', content, changes, unmatched}]
  const [conversationHistory, setConvHistory] = useState([]); // [{role, content}] for API
  const [cart, setCart]                       = useState([]); // current cart from LLM

  /* ── Refs ── */
  const recognitionRef = useRef(null);
  const silenceTimer   = useRef(null);
  const chatEndRef     = useRef(null);
  const manualRef      = useRef(null);

  /* ── Init ── */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
    // Welcome message
    setMessages([{
      role: 'assistant',
      content: '🎙️ Voice POS ready! Say your order in any language. Try: "Do butter chicken aur ek garlic naan"',
    }]);
  }, []);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText]);

  /* ── TTS speak ── */
  const speak = useCallback((text) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-IN';
    utt.rate = 1.1;
    utt.pitch = 1;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [ttsEnabled]);

  /* ── Confirm & add to POS cart ── */
  const handleConfirm = useCallback((cartToUse) => {
    const finalCart = cartToUse || cart;
    if (!finalCart.length) {
      toast.error('Cart is empty!');
      return;
    }
    finalCart.forEach(item => {
      dispatch(addToCart({
        menu_item_id: item.menu_item_id,
        name: item.name,
        base_price: item.unit_price,
        variant_id: item.variant_id || null,
        variant_price: item.variant_id ? item.unit_price : 0,
        food_type: item.food_type,
        quantity: item.quantity,
        special_instructions: item.notes || '',
        addons: [],
      }));
    });
    setConfirmed(true);
    toast.success(`${finalCart.length} item(s) added to cart!`);
    setTimeout(onClose, 1200);
  }, [cart, dispatch, onClose]);

  /* ── Send a turn to LLM ── */
  const sendTurn = useCallback(async (transcript) => {
    if (!transcript.trim() || isThinking) return;

    // Add user message to chat
    const userMsg = { role: 'user', content: transcript };
    setMessages(prev => [...prev, userMsg]);

    // Add to API history
    const newHistory = [...conversationHistory, { role: 'user', content: transcript }];

    setIsThinking(true);
    try {
      const res = await api.post('/voice-pos/converse', {
        transcript,
        conversation_history: newHistory,
        current_cart: cart,
        outlet_id: outletId,
      });

      // Handle both {data:{...}} and direct response shapes
      const data = res.data?.data || res.data || res;
      const { cart: newCart, response, action, unmatched, changes } = data;

      // Update cart
      if (action === 'cleared') {
        setCart([]);
      } else if (newCart) {
        setCart(newCart);
      }

      // Add assistant message to chat
      const assistantMsg = { role: 'assistant', content: response, changes, unmatched };
      setMessages(prev => [...prev, assistantMsg]);

      // Update conversation history for next turn
      setConvHistory([...newHistory, { role: 'assistant', content: response }]);

      // TTS response
      speak(response);

      // Handle confirm
      if (action === 'confirm') {
        setTimeout(() => handleConfirm(newCart || cart), 800);
      }

    } catch (err) {
      const errMsg = 'Sorry, I had trouble understanding. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      speak(errMsg);
    } finally {
      setIsThinking(false);
    }
  }, [conversationHistory, cart, outletId, speak, isThinking, handleConfirm]);

  /* ── Start listening ── */
  const startListening = useCallback(() => {
    if (isThinking || isListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
      window.speechSynthesis?.cancel(); // stop any TTS
    };

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t;
        else interim += t;
      }
      setInterimText(interim);
      // Reset silence timer
      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => recognition.stop(), 1800);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      clearTimeout(silenceTimer.current);
      if (finalTranscript.trim()) sendTurn(finalTranscript.trim());
    };

    recognition.onerror = (e) => {
      setIsListening(false);
      setInterimText('');
      if (e.error === 'not-allowed') {
        toast.error('Microphone permission denied. Use text mode instead.');
        setInputMode('text');
      }
    };

    recognition.start();
  }, [lang, isThinking, isListening, sendTurn]);

  /* ── Stop listening ── */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    clearTimeout(silenceTimer.current);
  }, []);

  /* ── Cleanup on unmount ── */
  useEffect(() => () => {
    clearTimeout(silenceTimer.current);
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  /* ── Manual text submit ── */
  const submitManual = useCallback(() => {
    if (!manualText.trim()) return;
    sendTurn(manualText.trim());
    setManualText('');
  }, [manualText, sendTurn]);

  /* ── Cart helpers ── */
  const updateQty = useCallback((itemId, variantId, newQty) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(i => !(i.menu_item_id === itemId && i.variant_id === variantId)));
    } else {
      setCart(prev => prev.map(i =>
        i.menu_item_id === itemId && i.variant_id === variantId ? { ...i, quantity: newQty } : i
      ));
    }
  }, []);

  const removeItem = useCallback((itemId, variantId) => {
    setCart(prev => prev.filter(i => !(i.menu_item_id === itemId && i.variant_id === variantId)));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setMessages(prev => [...prev, { role: 'assistant', content: 'Cart cleared! Start a new order.' }]);
    setConvHistory([]);
  }, []);

  /* ── Reset conversation ── */
  const resetConversation = useCallback(() => {
    setCart([]);
    setConvHistory([]);
    setMessages([{
      role: 'assistant',
      content: '🔄 Conversation reset. Start a new order!',
    }]);
  }, []);

  /* ── Computed ── */
  const cartTotal = cart.reduce((s, i) => s + (i.unit_price || 0) * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  /* ── Status text ── */
  const statusText = isListening ? '🎤 Listening...' :
    isThinking ? '🤖 Processing...' :
    isSpeaking ? '🔊 Speaking...' : null;

  /* ── Render ── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden" style={{ height: '90vh', maxHeight: 700 }}>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-accent/10 to-transparent">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Zap size={16} className="text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-base leading-none">Voice POS</h2>
            <p className="text-xs text-secondary mt-0.5">AI-powered · Groq Llama 3.3 · Multi-turn conversation</p>
          </div>

          {/* Status chip */}
          {statusText && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {statusText}
            </div>
          )}

          {/* TTS toggle */}
          <button onClick={() => setTtsEnabled(e => !e)}
            className={`p-1.5 rounded-lg transition-colors ${ttsEnabled ? 'text-accent bg-accent/10' : 'text-secondary'}`}
            title={ttsEnabled ? 'Mute responses' : 'Unmute responses'}>
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Reset */}
          <button onClick={resetConversation} className="p-1.5 rounded-lg text-secondary hover:text-primary" title="Reset conversation">
            <RotateCcw size={16} />
          </button>

          <button onClick={onClose} className="p-1.5 rounded-lg text-secondary hover:text-red-500">
            <X size={18} />
          </button>
        </div>

        {/* ── Main body: Chat | Cart ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT: Chat ── */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-border">

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((msg, i) => (
                <ChatBubble
                  key={i}
                  role={msg.role}
                  text={msg.content}
                  changes={msg.changes}
                  unmatched={msg.unmatched}
                  isLatest={i === messages.length - 1}
                />
              ))}

              {/* Interim text bubble */}
              {(isListening && interimText) && (
                <div className="flex flex-row-reverse gap-2">
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
                    <User size={14} className="text-accent" />
                  </div>
                  <div className="max-w-[78%] rounded-2xl rounded-tr-sm px-3 py-2 bg-accent/20 border border-accent/30">
                    <p className="text-sm italic text-accent">{interimText}...</p>
                  </div>
                </div>
              )}

              {/* Thinking indicator */}
              {isThinking && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Bot size={14} className="text-green-600" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-surface border border-border">
                    <div className="flex gap-1">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-2 h-2 rounded-full bg-secondary animate-bounce"
                          style={{ animationDelay: `${i*0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* ── Input area ── */}
            <div className="border-t border-border p-3 space-y-2">

              {/* Language + mode selector row */}
              <div className="flex items-center gap-2">
                {/* Language picker */}
                <div className="relative">
                  <button onClick={() => setShowLangPicker(p => !p)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs hover:border-accent transition-colors">
                    <span>{currentLang.flag}</span>
                    <span className="font-medium">{currentLang.label}</span>
                    <ChevronDown size={12} />
                  </button>
                  {showLangPicker && (
                    <div className="absolute bottom-full left-0 mb-1 w-52 bg-background border border-border rounded-xl shadow-xl z-10 max-h-52 overflow-y-auto">
                      {LANGUAGES.map(l => (
                        <button key={l.code}
                          onClick={() => { setLang(l.code); setShowLangPicker(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface transition-colors ${lang === l.code ? 'text-accent font-medium bg-surface' : ''}`}>
                          <span>{l.flag}</span>
                          <div className="text-left">
                            <p>{l.label}</p>
                            <p className="text-secondary opacity-70">{l.hint}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1" />

                {/* Mode toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  <button onClick={() => setInputMode('voice')}
                    className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${inputMode === 'voice' ? 'bg-accent text-white' : 'bg-surface text-secondary hover:text-primary'}`}>
                    <Mic size={12} /> Voice
                  </button>
                  <button onClick={() => setInputMode('text')}
                    className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${inputMode === 'text' ? 'bg-accent text-white' : 'bg-surface text-secondary hover:text-primary'}`}>
                    <Keyboard size={12} /> Type
                  </button>
                </div>
              </div>

              {/* Voice mode */}
              {inputMode === 'voice' && (
                <div className="flex items-center justify-center gap-4 py-1">
                  {!supported ? (
                    <p className="text-xs text-amber-600">⚠ Speech API not supported. Use text mode or Chrome browser.</p>
                  ) : (
                    <>
                      <MicWave active={isListening} thinking={isThinking} />
                      <button
                        onMouseDown={startListening}
                        onMouseUp={stopListening}
                        onTouchStart={startListening}
                        onTouchEnd={stopListening}
                        disabled={isThinking}
                        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all
                          ${isListening
                            ? 'bg-red-500 text-white scale-110 shadow-red-300'
                            : isThinking
                            ? 'bg-surface text-secondary cursor-not-allowed'
                            : 'bg-accent text-white hover:scale-105 active:scale-95'}`}
                      >
                        {isThinking ? <Loader2 size={22} className="animate-spin" /> :
                          isListening ? <MicOff size={22} /> : <Mic size={22} />}
                      </button>
                      <MicWave active={isListening} thinking={isThinking} />
                    </>
                  )}
                </div>
              )}

              {/* Text mode */}
              {inputMode === 'text' && (
                <div className="flex gap-2">
                  <input
                    ref={manualRef}
                    value={manualText}
                    onChange={e => setManualText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitManual()}
                    placeholder={`Type order... e.g. "${currentLang.hint}"`}
                    className="input flex-1 text-sm"
                    disabled={isThinking}
                  />
                  <button onClick={submitManual} disabled={!manualText.trim() || isThinking}
                    className="btn-primary px-3 py-2 flex items-center gap-1.5 text-sm">
                    <Send size={14} />
                  </button>
                </div>
              )}

              <p className="text-center text-xs text-secondary">
                {isListening ? 'Release to stop · Speak clearly' : 'Hold mic button to speak · Or use text mode'}
              </p>
            </div>
          </div>

          {/* ── RIGHT: Cart panel ── */}
          <div className="w-56 flex flex-col bg-surface/50">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShoppingCart size={14} className="text-accent" />
                <span className="text-xs font-semibold">Order Preview</span>
              </div>
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-secondary hover:text-red-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-secondary text-center py-6">
                  <MessageSquare size={24} className="mb-2 opacity-30" />
                  <p className="text-xs">No items yet</p>
                  <p className="text-xs opacity-70 mt-1">Say your order to start</p>
                </div>
              ) : (
                cart.map((item, i) => (
                  <CartItemRow
                    key={`${item.menu_item_id}-${item.variant_id}-${i}`}
                    item={item}
                    onQtyChange={updateQty}
                    onRemove={removeItem}
                  />
                ))
              )}
            </div>

            {/* Cart total + confirm */}
            {cart.length > 0 && (
              <div className="p-3 border-t border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-accent">₹{cartTotal.toFixed(0)}</span>
                </div>
                <button
                  onClick={() => handleConfirm()}
                  disabled={confirmed}
                  className="w-full btn-primary py-2 text-sm flex items-center justify-center gap-2"
                >
                  {confirmed
                    ? <><CheckCircle size={16} /> Added!</>
                    : <><ShoppingCart size={16} /> Add to Cart</>
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
