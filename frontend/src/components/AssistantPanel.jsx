import { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';

/**
 * AssistantPanel — global, read-only AI assistant. A floating button on every
 * dashboard page opens a chat that answers questions grounded in the user's own
 * live data (POST /assistant/ask). Read-only: it can't change anything. Tools
 * are permission-gated server-side, so it only ever sees what the user can see.
 */

const SUGGESTIONS = [
  'How much did we sell today?',
  "What's tomorrow looking like?",
  'What are my top sellers?',
  'How much tax do I owe?',
];

export default function AssistantPanel() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);

  const askM = useMutation({
    mutationFn: (q) => api.post('/assistant/ask', { question: q, ...(outletId ? { outlet_id: outletId } : {}) }),
    onSuccess: (r) => setMessages((m) => [...m, { role: 'bot', text: r?.data?.answer || 'Sorry, I could not answer that.' }]),
    onError: (e) => setMessages((m) => [...m, { role: 'bot', text: e?.response?.data?.message || "I couldn't answer that right now — please try again." }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, askM.isPending]);

  // Assistant is for tenant users; super-admin uses the platform console.
  if (!user || user.role === 'super_admin') return null;

  const send = (q) => {
    const t = (q ?? input).trim();
    if (!t || askM.isPending) return;
    setMessages((m) => [...m, { role: 'user', text: t }]);
    setInput('');
    askM.mutate(t);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 60,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13,
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          }}
        >
          <Sparkles size={16} /> Ask
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Assistant"
          style={{
            position: 'fixed', right: 20, bottom: 20, zIndex: 60,
            width: 372, maxWidth: 'calc(100vw - 32px)',
            height: 540, maxHeight: 'calc(100vh - 40px)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
              <Sparkles size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>Assistant</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Read-only · answers from your data</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                  Hi{user?.full_name ? ` ${user.full_name.split(' ')[0]}` : ''} 👋 Ask me anything about your restaurant — sales, tax, stock, who owes you. I only read your data; I can&apos;t change anything.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, border: '0.5px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', background: 'var(--accent)', color: '#fff', fontSize: 13, lineHeight: 1.5 }}>{m.text}</div>
              ) : (
                <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '9px 13px', borderRadius: '14px 14px 14px 4px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6 }}>{m.text}</div>
              )
            ))}

            {askM.isPending && (
              <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                <Loader2 size={14} className="animate-spin" /> Reading your data…
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data…"
              maxLength={500}
              style={{ flex: 1, fontSize: 13, padding: '9px 12px', borderRadius: 10, outline: 'none', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <button type="submit" disabled={askM.isPending || !input.trim()} aria-label="Send" style={{ border: 'none', borderRadius: 10, padding: '0 14px', background: 'var(--accent)', color: '#fff', cursor: 'pointer', opacity: (askM.isPending || !input.trim()) ? 0.5 : 1 }}>
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
