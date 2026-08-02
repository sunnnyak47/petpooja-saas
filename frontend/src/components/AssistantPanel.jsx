import { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Sparkles, X, Send, Loader2, Download, Check } from 'lucide-react';

// The API base already includes /api; the export download path is relative to it.
const API_BASE = import.meta.env.VITE_API_URL || '';
const downloadHref = (path) => `${API_BASE}${path}`;

// Tapping an alert asks the assistant for the detail behind it.
const ALERT_Q = {
  low_stock: "what's running low on stock?",
  sales_drop: 'how are sales this week?',
  tax_due: 'how much GST or BAS do I owe?',
  fraud_open: 'any fraud alerts?',
};

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
  const [resolved, setResolved] = useState({}); // index → 'done' | 'cancelled' | 'pending'
  const scrollRef = useRef(null);

  const askM = useMutation({
    // Send the recent turns as `history` so the assistant handles follow-ups
    // ("what about last month?"). Bot turns carry their `tool` so the backend's
    // no-LLM fallback can stay on topic. The server bounds/sanitizes it.
    mutationFn: ({ q, history }) => api.post('/assistant/ask', {
      question: q,
      history,
      ...(outletId ? { outlet_id: outletId } : {}),
    }),
    onSuccess: (r) => setMessages((m) => [...m, { role: 'bot', text: r?.data?.answer || 'Sorry, I could not answer that.', download: r?.data?.download || null, tool: r?.data?.tool || null, action: r?.data?.action || null }]),
    onError: (e) => setMessages((m) => [...m, { role: 'bot', text: e?.response?.data?.message || "I couldn't answer that right now — please try again." }]),
  });

  // Confirm a previewed write action (preview → approve → run).
  const actM = useMutation({
    mutationFn: ({ token }) => api.post('/assistant/act', { token, ...(outletId ? { outlet_id: outletId } : {}) }),
    onSuccess: (r) => setMessages((m) => [...m, { role: 'bot', text: r?.data?.answer || 'Done.' }]),
    onError: (e) => setMessages((m) => [...m, { role: 'bot', text: e?.response?.data?.message || "That didn't go through — please try from the relevant screen." }]),
  });

  const confirmAction = (idx, token) => {
    if (resolved[idx]) return;
    setResolved((r) => ({ ...r, [idx]: 'pending' }));
    actM.mutate({ token }, { onSettled: () => setResolved((r) => ({ ...r, [idx]: 'done' })) });
  };
  const cancelAction = (idx) => {
    if (resolved[idx]) return;
    setResolved((r) => ({ ...r, [idx]: 'cancelled' }));
    setMessages((m) => [...m, { role: 'bot', text: 'Okay — cancelled. Nothing was changed.' }]);
  };

  // Proactive alerts — the assistant "pings" you with what needs attention.
  const alertsQuery = useQuery({
    queryKey: ['assistant-alerts', outletId],
    queryFn: () => api.get('/assistant/alerts', { params: outletId ? { outlet_id: outletId } : {} }),
    enabled: !!user && user.role !== 'super_admin' && !!outletId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const alerts = alertsQuery.data?.data?.alerts || [];
  const sevColor = (s) => (s === 'high' ? '#dc2626' : s === 'medium' ? '#d97706' : '#2563eb');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, askM.isPending]);

  // Assistant is for tenant users; super-admin uses the platform console.
  if (!user || user.role === 'super_admin') return null;

  const send = (q) => {
    const t = (q ?? input).trim();
    if (!t || askM.isPending) return;
    // Build history from the turns BEFORE this question (last 6), carrying tool tags.
    const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text, ...(m.tool ? { tool: m.tool } : {}) }));
    setMessages((m) => [...m, { role: 'user', text: t }]);
    setInput('');
    askM.mutate({ q: t, history });
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
          {alerts.length > 0 && (
            <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
              {alerts.length}
            </span>
          )}
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
            {alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>Needs your attention</div>
                {alerts.map((al) => (
                  <button
                    key={al.key}
                    onClick={() => send(ALERT_Q[al.key] || al.title)}
                    style={{ textAlign: 'left', border: '1px solid var(--border)', borderLeft: `3px solid ${sevColor(al.severity)}`, background: 'var(--bg-hover)', borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{al.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 2 }}>{al.message}</div>
                  </button>
                ))}
              </div>
            )}
            {messages.length === 0 && (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                  Hi{user?.full_name ? ` ${user.full_name.split(' ')[0]}` : ''} 👋 Ask me anything about your restaurant — sales, tax, stock, who owes you. I can also do a few things on request (like &ldquo;86 the paneer tikka&rdquo; or &ldquo;mark table 5 clean&rdquo;) — I&apos;ll always show you exactly what I&apos;ll do and wait for your confirmation first.
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
                <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '9px 13px', borderRadius: '14px 14px 14px 4px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6 }}>
                  <div>{m.text}</div>
                  {m.download && (
                    <a
                      href={downloadHref(m.download.path)}
                      download={m.download.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}
                    >
                      <Download size={14} /> Download {m.download.format?.toUpperCase()}
                    </a>
                  )}
                  {m.action && m.action.token && (
                    resolved[i] === 'done' ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>✓ Actioned</div>
                    ) : resolved[i] === 'cancelled' ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>Cancelled</div>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => confirmAction(i, m.action.token)}
                          disabled={resolved[i] === 'pending'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: m.action.warn ? '#dc2626' : 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: resolved[i] === 'pending' ? 0.6 : 1 }}
                        >
                          {resolved[i] === 'pending' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {m.action.warn ? 'Yes, send' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => cancelAction(i)}
                          disabled={resolved[i] === 'pending'}
                          style={{ padding: '7px 14px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )
                  )}
                </div>
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
