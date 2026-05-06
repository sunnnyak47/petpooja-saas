/**
 * useVoiceOrder — lightweight hook for inline voice ordering on POS page.
 * Tap mic → listen → send transcript to Groq LLM → dispatch items to Redux cart.
 * No popup, no modal. Just voice-to-cart.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addToCart, clearCart, setOrderType as setReduxOrderType, setSelectedTable } from '../store/slices/posSlice';
import api from '../lib/api';
import toast from 'react-hot-toast';

// Supported languages for voice recognition
export const VOICE_LANGUAGES = [
  { code: 'en-IN',  label: 'English (India)',  short: 'EN-IN' },
  { code: 'hi-IN',  label: 'Hindi',            short: 'हिंदी' },
  { code: 'en-US',  label: 'English (US)',      short: 'EN-US' },
  { code: 'pa-IN',  label: 'Punjabi',           short: 'ਪੰਜਾਬੀ' },
  { code: 'ta-IN',  label: 'Tamil',             short: 'தமிழ்' },
  { code: 'te-IN',  label: 'Telugu',            short: 'తెలుగు' },
  { code: 'kn-IN',  label: 'Kannada',           short: 'ಕನ್ನಡ' },
  { code: 'ml-IN',  label: 'Malayalam',          short: 'മലയാളം' },
  { code: 'mr-IN',  label: 'Marathi',           short: 'मराठी' },
  { code: 'gu-IN',  label: 'Gujarati',          short: 'ગુજરાતી' },
  { code: 'bn-IN',  label: 'Bengali',           short: 'বাংলা' },
  { code: 'ur-IN',  label: 'Urdu',              short: 'اردو' },
  { code: 'ar-SA',  label: 'Arabic',            short: 'عربي' },
];

export default function useVoiceOrder(langOverride) {
  const dispatch = useDispatch();
  const { user } = useSelector(s => s.auth);
  const cart = useSelector(s => s.pos.cart);
  const outletId = user?.outlet_id;

  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const lang = langOverride || 'en-IN';
  const [supported, setSupported] = useState(true);

  // Conversation history for multi-turn
  const conversationHistory = useRef([]);
  const recognitionRef = useRef(null);
  const silenceTimer = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
    return () => {
      clearTimeout(silenceTimer.current);
      recognitionRef.current?.abort();
    };
  }, []);

  /* ── Convert LLM cart items → Redux addToCart dispatches ── */
  const syncCartToRedux = useCallback((llmCart, action) => {
    if (action === 'cleared' && (!llmCart || !llmCart.length)) {
      dispatch(clearCart());
      return;
    }
    if (!llmCart || !llmCart.length) return;

    // Clear existing cart and replace with LLM's updated cart
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

    // Build current_cart from what LLM needs (not Redux shape)
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
      const { cart: newCart, response, action, table_number, order_type, customer_name } = data;

      // Sync cart
      syncCartToRedux(newCart, action);

      // Apply detected metadata
      if (order_type) dispatch(setReduxOrderType(order_type));
      if (table_number) {
        // Try to resolve table — POS page's table list isn't accessible here,
        // so we just toast about it
        toast.success(`Table ${table_number} detected`, { icon: '🪑', duration: 2000 });
      }

      // Update conversation history
      conversationHistory.current = [
        ...newHistory,
        { role: 'assistant', content: response },
      ];

      setLastResponse(response);

      // Speak the response
      if (response && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(response);
        utter.lang = lang;
        utter.rate = 1.1;
        window.speechSynthesis.speak(utter);
      }

      // Toast the response for visual feedback
      if (response) {
        toast(response, { icon: '🤖', duration: 3000, style: { maxWidth: '400px', fontSize: '13px' } });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Voice order failed');
    } finally {
      setIsThinking(false);
    }
  }, [isThinking, cart, outletId, syncCartToRedux, dispatch]);

  /* ── Start listening ── */
  const startListening = useCallback(() => {
    if (isThinking || isListening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Speech not supported. Use Chrome.'); return; }

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t + ' ';
        else interim += t;
      }
      setTranscript(finalTranscript + interim);

      // Auto-stop after 2.5s silence
      clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => recognition.stop(), 3000);
    };

    recognition.onend = () => {
      setIsListening(false);
      const text = finalTranscript.trim();
      setTranscript('');
      if (text) sendToLLM(text);
    };

    recognition.onerror = (e) => {
      setIsListening(false);
      setTranscript('');
      if (e.error === 'not-allowed') {
        toast.error('Microphone not allowed. Check browser permissions.');
      }
    };

    recognition.start();
  }, [isListening, isThinking, lang, sendToLLM]);

  /* ── Stop listening ── */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    clearTimeout(silenceTimer.current);
  }, []);

  /* ── Toggle ── */
  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  /* ── Reset conversation ── */
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
    lang,
    toggleListening,
    resetConversation,
    sendToLLM,  // for text input fallback
  };
}
