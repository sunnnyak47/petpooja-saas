/**
 * VoicePOS — Conversational LLM-powered voice ordering
 * Phase 2: Table detection, order-type toggle, upsell suggestions, direct order placement
 * Uses Groq + Llama 3.3 70B via /api/voice-pos/converse
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { addToCart } from '../../store/slices/posSlice';
import { useCurrency } from '../../hooks/useCurrency';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Mic, MicOff, X, CheckCircle, ShoppingCart, Globe,
  Trash2, Plus, Minus, Loader2, Volume2, VolumeX,
  RotateCcw, Send, Keyboard, ChevronDown, Zap,
  MessageSquare, Bot, User, Utensils, Package,
  Sparkles, Table2, ArrowRight, ChevronUp,
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
function ChatBubble({ role, text, changes, unmatched }) {
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
  const { symbol } = useCurrency();
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
        <p className="text-xs font-semibold text-accent">{symbol}{((item.unit_price || 0) * item.quantity).toFixed(0)}</p>
      </div>
      <button onClick={() => onRemove(item.menu_item_id, item.variant_id)}
        className="text-red-400 hover:text-red-600 flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/* ─── Upsell chip ────────────────────────────────────────────── */
function UpsellChip({ item, onAdd }) {
  const { symbol } = useCurrency();
  const isVeg = item.food_type === 'veg';
  return (
    <button
      onClick={() => onAdd(item)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors text-xs group"
    >
      <div className={`w-2.5 h-2.5 rounded-sm border ${isVeg ? 'border-green-500' : 'border-red-500'} flex-shrink-0`}>
        <div className={`w-1.5 h-1.5 rounded-full m-px ${isVeg ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>
      <span className="font-medium text-accent">{item.name}</span>
      <span className="text-secondary">{symbol}{item.unit_price}</span>
      <Plus size={10} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

/* ─── Order Confirmation Screen ──────────────────────────────── */
function OrderConfirmScreen({ order, onClose }) {
  const { symbol } = useCurrency();
  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-2xl">
      <div className="text-center space-y-3 px-8">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
          <CheckCircle size={32} className="text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-primary">Order Placed!</h2>
        <div className="bg-surface border border-border rounded-xl p-4 space-y-2 text-sm text-left">
          <div className="flex justify-between">
            <span className="text-secondary">Order Number</span>
            <span className="font-bold text-accent text-base">#{order.order_number}</span>
          </div>
          {order.table_id && (
            <div className="flex justify-between">
              <span className="text-secondary">Table</span>
              <span className="font-medium">{order.table?.name || '—'}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-secondary">Type</span>
            <span className="font-medium capitalize">{(order.order_type || 'dine_in').replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">Items</span>
            <span className="font-medium">{order.items?.length || 0}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <span className="text-secondary">Total</span>
            <span className="font-bold text-accent">{symbol}{Number(order.grand_total || order.net_amount || order.subtotal || 0).toFixed(0)}</span>
          </div>
        </div>
        <p className="text-xs text-green-600 font-medium">✓ KOT sent to kitchen</p>
        <button onClick={onClose} className="btn-primary w-full mt-2 flex items-center justify-center gap-2">
          <ArrowRight size={16} /> New Order
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════ */
export default function VoicePOS({ onClose }) {
  const dispatch = useDispatch();
  const { user } = useSelector(s => s.auth);
  const { symbol } = useCurrency();
  const outletId = user?.outlet_id;

  /* ── Core state ── */
  const [lang, setLang]                       = useState('hi-IN');
  const [showLangPicker, setShowLangPicker]   = useState(false);
  const [inputMode, setInputMode]             = useState('voice');
  const [manualText, setManualText]           = useState('');
  const [isListening, setIsListening]         = useState(false);
  const [isThinking, setIsThinking]           = useState(false);
  const [isSpeaking, setIsSpeaking]           = useState(false);
  const [interimText, setInterimText]         = useState('');
  const [ttsEnabled, setTtsEnabled]           = useState(true);
  const [supported, setSupported]             = useState(true);

  // Conversation
  const [messages, setMessages]               = useState([]);
  const [conversationHistory, setConvHistory] = useState([]);
  const [cart, setCart]                       = useState([]);

  // Order details (LLM-detected + user-set)
  const [orderType, setOrderType]             = useState('dine_in');
  const [detectedTableNum, setDetectedTableNum] = useState(null); // raw number from LLM
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [customerName, setCustomerName]       = useState('');
  const [tables, setTables]                   = useState([]);
  const [showTablePicker, setShowTablePicker] = useState(false);

  // Upsell
  const [upsellSuggestions, setUpsellSuggestions] = useState([]);
  const [upsellLoading, setUpsellLoading]     = useState(false);
  const upsellDebounce                         = useRef(null);

  // Order placement
  const [isPlacingOrder, setIsPlacingOrder]   = useState(false);
  const [placedOrder, setPlacedOrder]         = useState(null);

  // "Don't Stop" — keep mic alive until manually toggled off
  const [keepListening, setKeepListening]       = useState(false);
  const keepListeningRef                         = useRef(false);
  const startListeningRef                        = useRef(null); // avoids circular dep

  /* ── Refs ── */
  const recognitionRef = useRef(null);
  const silenceTimer   = useRef(null);
  const chatEndRef     = useRef(null);
  const manualRef      = useRef(null);

  /* ── Init ── */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
    setMessages([{
      role: 'assistant',
      content: 'Ready! Tap the mic and say your order — like "Do butter chicken aur ek naan". I understand Hindi, English, Tamil, and more.',
    }]);

    // Fetch available tables
    if (outletId) {
      api.get(`/orders/tables?outlet_id=${outletId}`)
        .then(r => {
          const list = r.data || r || [];
          setTables(Array.isArray(list) ? list.filter(t => t.status !== 'occupied') : []);
        })
        .catch(() => {});
    }
  }, [outletId]);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText]);

  /* ── Auto-fetch upsell when cart has 2+ items (debounced 2s) ── */
  useEffect(() => {
    if (cart.length < 2) { setUpsellSuggestions([]); return; }
    clearTimeout(upsellDebounce.current);
    upsellDebounce.current = setTimeout(async () => {
      if (!outletId) return;
      setUpsellLoading(true);
      try {
        const r = await api.post('/voice-pos/upsell', { cart, outlet_id: outletId });
        const data = r.data || r || [];
        setUpsellSuggestions(Array.isArray(data) ? data : []);
      } catch { setUpsellSuggestions([]); }
      finally { setUpsellLoading(false); }
    }, 2000);
    return () => clearTimeout(upsellDebounce.current);
  }, [cart, outletId]);

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

  /* ── Add upsell item to cart ── */
  const addUpsellItem = useCallback((item) => {
    setCart(prev => {
      const existing = prev.find(i => i.menu_item_id === item.menu_item_id && !i.variant_id);
      if (existing) {
        return prev.map(i => i.menu_item_id === item.menu_item_id && !i.variant_id
          ? { ...i, quantity: i.quantity + 1 }
          : i
        );
      }
      return [...prev, {
        menu_item_id: item.menu_item_id,
        name: item.name,
        quantity: 1,
        variant_id: null,
        variant_name: null,
        unit_price: item.unit_price,
        notes: '',
        food_type: item.food_type,
      }];
    });
    // Remove from suggestions
    setUpsellSuggestions(prev => prev.filter(s => s.menu_item_id !== item.menu_item_id));
    toast.success(`${item.name} added!`);
  }, []);

  /* ── Add to POS Redux cart (existing flow) ── */
  const handleAddToCart = useCallback((cartToUse) => {
    const finalCart = cartToUse || cart;
    if (!finalCart.length) { toast.error('Cart is empty!'); return; }
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
    toast.success(`${finalCart.length} item(s) added to cart!`);
    onClose();
  }, [cart, dispatch, onClose]);

  /* ── Place order directly in DB ── */
  const handlePlaceOrder = useCallback(async (cartToUse) => {
    const finalCart = cartToUse || cart;
    if (!finalCart.length) { toast.error('Cart is empty!'); return; }
    setIsPlacingOrder(true);
    try {
      const r = await api.post('/voice-pos/place-order', {
        cart: finalCart,
        outlet_id: outletId,
        order_type: orderType,
        table_id: selectedTableId || null,
        customer_name: customerName || null,
      });
      const order = r.data?.order || r.order || r.data || r;
      setPlacedOrder(order);
      speak(`Order number ${order.order_number} placed! KOT sent to kitchen.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place order');
    } finally {
      setIsPlacingOrder(false);
    }
  }, [cart, outletId, orderType, selectedTableId, customerName, speak]);

  /* ── Send a turn to LLM ── */
  const sendTurn = useCallback(async (transcript) => {
    if (!transcript.trim() || isThinking) return;

    const userMsg = { role: 'user', content: transcript };
    setMessages(prev => [...prev, userMsg]);
    const newHistory = [...conversationHistory, { role: 'user', content: transcript }];
    setIsThinking(true);

    try {
      const res = await api.post('/voice-pos/converse', {
        transcript,
        conversation_history: newHistory,
        current_cart: cart,
        outlet_id: outletId,
      });

      const data = res.data?.data || res.data || res;
      const { cart: newCart, response, action, unmatched, changes,
              table_number, order_type: detectedOrderType, customer_name: detectedCustomer } = data;

      // Update cart
      if (action === 'cleared') setCart([]);
      else if (newCart) setCart(newCart);

      // Apply LLM-detected order metadata
      if (table_number) {
        setDetectedTableNum(table_number);
        // Auto-select matching table from list
        const matched = tables.find(t =>
          t.table_number === table_number ||
          t.name?.includes(String(table_number))
        );
        if (matched) setSelectedTableId(matched.id);
      }
      if (detectedOrderType) setOrderType(detectedOrderType);
      if (detectedCustomer) setCustomerName(detectedCustomer);

      // Add assistant reply
      const assistantMsg = { role: 'assistant', content: response, changes, unmatched };
      setMessages(prev => [...prev, assistantMsg]);
      setConvHistory([...newHistory, { role: 'assistant', content: response }]);

      speak(response);

      if (action === 'confirm') {
        setTimeout(() => handlePlaceOrder(newCart || cart), 800);
      }

    } catch {
      const errMsg = 'Sorry, I had trouble understanding. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
      speak(errMsg);
    } finally {
      setIsThinking(false);
      // In "Don't Stop" mode — restart mic automatically after each turn
      if (keepListeningRef.current) {
        setTimeout(() => { startListeningRef.current?.(); }, 700);
      }
    }
  }, [conversationHistory, cart, outletId, tables, speak, isThinking, handlePlaceOrder]);

  /* ── Start / Stop listening (tap-to-toggle) ── */
  const startListening = useCallback(() => {
    if (isThinking || isListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    try { recognitionRef.current?.abort(); } catch (_) {}

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
      window.speechSynthesis?.cancel();
    };

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t;
        else interim += t;
      }
      setInterimText(interim);
      // In "Don't Stop" mode — no silence timer: browser keeps the stream open.
      // In normal mode — auto-stop after 2.5s silence.
      if (!keepListeningRef.current) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => {
          try { recognition.stop(); } catch (_) {}
        }, 2500);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      clearTimeout(silenceTimer.current);
      if (finalTranscript.trim()) {
        sendTurn(finalTranscript.trim());
        // sendTurn's finally will restart mic in keep-listening mode
      } else if (keepListeningRef.current) {
        // No speech heard — restart immediately (waiting for customer)
        setTimeout(() => { if (keepListeningRef.current) startListeningRef.current?.(); }, 300);
      }
    };

    recognition.onerror = (e) => {
      setIsListening(false);
      setInterimText('');
      if (e.error === 'not-allowed') {
        toast.error('Microphone not allowed. Please use text mode.');
        setInputMode('text');
        // Kill keep-listening mode on permission error
        keepListeningRef.current = false;
        setKeepListening(false);
      } else if (keepListeningRef.current && e.error !== 'aborted') {
        // Any other error — try to recover after a short pause
        setTimeout(() => { if (keepListeningRef.current) startListeningRef.current?.(); }, 800);
      }
    };

    recognition.start();
  }, [lang, isThinking, isListening, sendTurn]);

  // Keep ref in sync so sendTurn can call startListening without circular dep
  startListeningRef.current = startListening;

  const stopListening = useCallback(() => {
    keepListeningRef.current = false;
    setKeepListening(false);
    clearTimeout(silenceTimer.current);
    try { recognitionRef.current?.stop(); } catch (_) {}
  }, []);

  /* ── Toggle mic (tap to start / tap to stop) ── */
  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  /* ── Keyboard shortcuts: Escape to close, Space for mic ── */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Spacebar toggles mic (only when not typing in an input)
      if (e.code === 'Space' && inputMode === 'voice' && !isThinking
          && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, inputMode, isThinking, toggleListening]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    clearTimeout(silenceTimer.current);
    clearTimeout(upsellDebounce.current);
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
    setUpsellSuggestions([]);
    setDetectedTableNum(null);
    setSelectedTableId(null);
    setCustomerName('');
    setMessages(prev => [...prev, { role: 'assistant', content: 'Cart cleared! Start a new order.' }]);
    setConvHistory([]);
  }, []);

  const resetConversation = useCallback(() => {
    setCart([]);
    setUpsellSuggestions([]);
    setConvHistory([]);
    setDetectedTableNum(null);
    setSelectedTableId(null);
    setCustomerName('');
    setMessages([{ role: 'assistant', content: 'Ready for a new order! Tap the mic to start.' }]);
  }, []);

  /* ── Computed ── */
  const cartTotal  = cart.reduce((s, i) => s + (i.unit_price || 0) * i.quantity, 0);
  const cartCount  = cart.reduce((s, i) => s + i.quantity, 0);
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const selectedTable = tables.find(t => t.id === selectedTableId);

  const statusText = isThinking ? '🤖 Processing...' :
    isSpeaking ? '🔊 Speaking...' :
    isListening && keepListening ? '🔴 Live — mic always on' :
    isListening ? '🎤 Listening...' :
    keepListening ? '⏳ Waiting to restart mic…' : null;

  /* ── Render ── */
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md" style={{ background: 'rgba(15,15,20,0.92)' }}>
      <div className="rounded-2xl shadow-2xl border border-border/50 w-full max-w-3xl flex flex-col overflow-hidden relative"
        style={{ height: '85vh', maxHeight: 680, background: 'var(--bg-primary, #ffffff)' }}>

        {/* Order Confirmation Overlay */}
        {placedOrder && (
          <OrderConfirmScreen
            order={placedOrder}
            onClose={() => { setPlacedOrder(null); resetConversation(); onClose(); }}
          />
        )}

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-accent/10 to-transparent shrink-0">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Zap size={16} className="text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-base leading-none">Voice POS</h2>
            <p className="text-xs text-secondary mt-0.5">Speak your order in any language</p>
          </div>

          {statusText && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {statusText}
            </div>
          )}

          <button onClick={() => setTtsEnabled(e => !e)}
            className={`p-1.5 rounded-lg transition-colors ${ttsEnabled ? 'text-accent bg-accent/10' : 'text-secondary'}`}
            title={ttsEnabled ? 'Mute responses' : 'Unmute responses'}>
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button onClick={resetConversation} className="p-1.5 rounded-lg text-secondary hover:text-primary" title="Reset">
            <RotateCcw size={16} />
          </button>

          <button onClick={onClose} className="p-1.5 rounded-lg text-secondary hover:text-red-500">
            <X size={18} />
          </button>
        </div>

        {/* ── Order type + table bar ── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface/50 shrink-0">
          {/* Order type toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${orderType === 'dine_in' ? 'bg-accent text-white' : 'bg-background text-secondary hover:text-primary'}`}>
              <Utensils size={11} /> Dine In
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${orderType === 'takeaway' ? 'bg-accent text-white' : 'bg-background text-secondary hover:text-primary'}`}>
              <Package size={11} /> Takeaway
            </button>
          </div>

          {/* Table picker (dine_in only) */}
          {orderType === 'dine_in' && (
            <div className="relative">
              <button
                onClick={() => setShowTablePicker(p => !p)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${selectedTableId ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-background text-secondary hover:border-accent'}`}>
                <Table2 size={11} />
                {selectedTable ? selectedTable.name : detectedTableNum ? `Table ${detectedTableNum} ?` : 'Table'}
                <ChevronDown size={10} />
              </button>
              {showTablePicker && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-background border border-border rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedTableId(null); setDetectedTableNum(null); setShowTablePicker(false); }}
                    className="w-full px-3 py-2 text-xs text-secondary hover:bg-surface text-left">
                    No table (counter)
                  </button>
                  {tables.length === 0 && (
                    <p className="px-3 py-2 text-xs text-secondary">No available tables</p>
                  )}
                  {tables.map(t => (
                    <button key={t.id}
                      onClick={() => { setSelectedTableId(t.id); setDetectedTableNum(null); setShowTablePicker(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-surface transition-colors ${selectedTableId === t.id ? 'text-accent font-medium' : ''}`}>
                      <span>{t.name}</span>
                      {t.capacity && <span className="text-secondary">{t.capacity}p</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Customer name */}
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Customer name…"
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs outline-none focus:border-accent min-w-0"
          />

          {detectedTableNum && !selectedTableId && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg shrink-0">
              Heard: table {detectedTableNum}
            </span>
          )}
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

            {/* ── Upsell suggestions ── */}
            {(upsellSuggestions.length > 0 || upsellLoading) && cart.length >= 2 && (
              <div className="border-t border-border px-3 py-2 bg-amber-50/40 shrink-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={12} className="text-amber-500" />
                  <span className="text-xs font-medium text-amber-700">Suggested add-ons</span>
                  {upsellLoading && <Loader2 size={10} className="animate-spin text-amber-500" />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {upsellSuggestions.map(s => (
                    <UpsellChip key={s.menu_item_id} item={s} onAdd={addUpsellItem} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Input area ── */}
            <div className="border-t border-border p-3 space-y-2 shrink-0">
              {/* Language + mode row */}
              <div className="flex items-center gap-2">
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
                <div className="flex flex-col items-center gap-2 py-1">
                  {!supported ? (
                    <p className="text-xs text-amber-600">Speech not supported in this browser. Use text mode or open in Chrome.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-4">
                        <MicWave active={isListening || keepListening} thinking={isThinking} />
                        <button
                          onClick={toggleListening}
                          disabled={isThinking}
                          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all
                            ${isListening || keepListening
                              ? 'bg-red-500 text-white scale-110 shadow-red-500/30 ring-4 ring-red-500/20'
                              : isThinking
                              ? 'bg-surface text-secondary cursor-not-allowed'
                              : 'bg-accent text-white hover:scale-105 active:scale-95 shadow-accent/30'}`}
                        >
                          {isThinking ? <Loader2 size={22} className="animate-spin" /> :
                            (isListening || keepListening) ? <MicOff size={22} /> : <Mic size={22} />}
                        </button>
                        <MicWave active={isListening || keepListening} thinking={isThinking} />
                      </div>

                      {/* Don't Stop toggle */}
                      <button
                        onClick={() => {
                          const next = !keepListening;
                          keepListeningRef.current = next;
                          setKeepListening(next);
                          if (next && !isListening && !isThinking) {
                            // Activate mic immediately when turning on Don't Stop
                            setTimeout(() => startListeningRef.current?.(), 100);
                          } else if (!next) {
                            // Turning off: stop current recognition
                            clearTimeout(silenceTimer.current);
                            try { recognitionRef.current?.stop(); } catch (_) {}
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          keepListening
                            ? 'bg-red-500/15 text-red-500 border border-red-500/40 ring-2 ring-red-500/20'
                            : 'bg-surface text-secondary border border-border hover:border-accent hover:text-accent'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${keepListening ? 'bg-red-500 animate-pulse' : 'bg-secondary'}`} />
                        {keepListening ? "Don't Stop (click to stop)" : "Don't Stop"}
                      </button>
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
                    placeholder={`Type order… e.g. "${currentLang.hint}"`}
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
                {isListening ? 'Tap mic to stop · Speak clearly' : 'Tap mic or press Space · Say "table 3" to set table'}
              </p>
            </div>
          </div>

          {/* ── RIGHT: Cart panel ── */}
          <div className="w-60 flex flex-col bg-surface/50 shrink-0">
            <div className="px-3 py-2.5 border-b border-border flex items-center justify-between shrink-0">
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

            {/* Cart total + action buttons */}
            {cart.length > 0 && (
              <div className="p-3 border-t border-border space-y-2 shrink-0">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-accent">{symbol}{cartTotal.toFixed(0)}</span>
                </div>

                {/* Order metadata summary */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${orderType === 'dine_in' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {orderType === 'dine_in' ? '🍽 Dine In' : '📦 Takeaway'}
                  </span>
                  {selectedTable && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      🪑 {selectedTable.name}
                    </span>
                  )}
                </div>

                {/* Place Order (direct) */}
                <button
                  onClick={() => handlePlaceOrder()}
                  disabled={isPlacingOrder}
                  className="w-full btn-primary py-2 text-sm flex items-center justify-center gap-2"
                >
                  {isPlacingOrder
                    ? <><Loader2 size={14} className="animate-spin" /> Placing…</>
                    : <><Zap size={14} /> Place Order</>
                  }
                </button>

                {/* Send to POS Cart instead of placing directly */}
                <button
                  onClick={() => handleAddToCart()}
                  className="w-full py-1 text-xs text-center text-secondary hover:text-accent transition-colors"
                >
                  or send to POS cart →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
