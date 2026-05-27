import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Loader2, Shield, ChefHat, CheckCircle2, ArrowUpRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPasswordPage() {
  const [email, setEmail]           = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [sent, setSent]             = useState(false);
  const [devPreview, setDevPreview] = useState(null); // { previewUrl, resetLink, transport }
  const [tick, setTick]             = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2200);
    return () => clearInterval(id);
  }, []);

  const validateEmail = (val) => {
    if (!val) return 'Email is required.';
    if (!EMAIL_RE.test(val)) return 'Please enter a valid email address.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setEmailError(err); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password-email', { email });
      const payload = res.data || res;
      // Dev mode: backend may include a preview URL + raw link
      if (payload.dev_preview_url || payload.dev_reset_link) {
        setDevPreview({
          previewUrl: payload.dev_preview_url,
          resetLink:  payload.dev_reset_link,
          transport:  payload.dev_transport,
        });
      }
      setSent(true);
      toast.success(payload.message || 'Reset link sent.');
    } catch (error) {
      const msg = error.message || 'Could not send reset link.';
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('user')) {
        setEmailError('No account found with this email address.');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const emailBorder = emailError
    ? '1.5px solid #ef4444'
    : emailFocused ? '1.5px solid #2563eb' : '1.5px solid rgba(15,23,42,0.08)';
  const emailShadow = emailError
    ? '0 0 0 4px rgba(239,68,68,0.08)'
    : emailFocused ? '0 0 0 4px rgba(37,99,235,0.1)' : '0 1px 2px rgba(15,23,42,0.04)';

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: 'hidden', background: '#fafafa',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes meshShift {
          0%,100% { transform: rotate(0deg) translate(0,0); }
          25%      { transform: rotate(90deg) translate(40px,-30px); }
          50%      { transform: rotate(180deg) translate(-20px,40px); }
          75%      { transform: rotate(270deg) translate(-30px,-20px);}
        }
        @keyframes blob {
          0%,100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          33%      { border-radius: 30% 60% 70% 40% / 50% 60% 40% 50%; }
          66%      { border-radius: 70% 30% 50% 50% / 40% 70% 30% 60%; }
        }
        @keyframes drift {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(20px,-25px) scale(1.05); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes spin360 { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{ background-position: 200% 0;} 100%{ background-position: -200% 0;} }
        @keyframes pulseRing {
          0%{ box-shadow: 0 0 0 0 rgba(37,99,235,0.5);}
          70%{ box-shadow: 0 0 0 10px rgba(37,99,235,0);}
          100%{ box-shadow: 0 0 0 0 rgba(37,99,235,0);}
        }
        @keyframes drawCheck { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
        .submit-btn { background-size: 200% 100% !important; transition: background-position 0.35s, transform 0.18s, box-shadow 0.18s, opacity 0.18s; }
        .submit-btn:hover:not(:disabled) { background-position: 100% 0 !important; transform: translateY(-1.5px); box-shadow: 0 14px 40px rgba(37,99,235,0.4) !important; }
        .submit-btn:active:not(:disabled) { transform: translateY(0); }
        @media (max-width: 900px) {
          .left-pane { display: none !important; }
        }
      `}</style>

      {/* ═════════════ LEFT PANEL (matches LoginPage) ═════════════ */}
      <div className="left-pane" style={{
        flex: '0 0 56%', position: 'relative', overflow: 'hidden',
        background: '#020617',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '52px 56px',
      }}>
        {/* gradient mesh */}
        <div style={{
          position: 'absolute', inset: '-40%',
          background: `
            radial-gradient(at 22% 28%, #1e40af 0%, transparent 42%),
            radial-gradient(at 78% 18%, #312e81 0%, transparent 50%),
            radial-gradient(at 12% 72%, #0c4a6e 0%, transparent 46%),
            radial-gradient(at 84% 84%, #1d4ed8 0%, transparent 38%),
            radial-gradient(at 50% 50%, #1e1b4b 0%, transparent 60%)
          `,
          animation: 'meshShift 32s ease-in-out infinite',
          opacity: 0.85,
        }} />
        {/* blobs */}
        <div style={{
          position: 'absolute', width: 520, height: 520, top: '-15%', right: '-15%',
          background: 'radial-gradient(circle at 35% 35%, rgba(99,102,241,0.35), rgba(59,130,246,0.15) 50%, transparent 75%)',
          animation: 'blob 24s ease-in-out infinite, drift 16s ease-in-out infinite',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', width: 380, height: 380, bottom: '-12%', left: '-10%',
          background: 'radial-gradient(circle at 50% 50%, rgba(14,165,233,0.28), transparent 70%)',
          animation: 'blob 30s ease-in-out infinite reverse, drift 20s ease-in-out infinite 2s',
          filter: 'blur(50px)',
        }} />
        {/* grid lines */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}>
          <defs>
            <pattern id="grid2" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="gridFade2" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="gridMask2"><rect width="100%" height="100%" fill="url(#gridFade2)" /></mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid2)" mask="url(#gridMask2)" />
        </svg>
        {/* noise */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
          mixBlendMode: 'overlay',
        }} />

        {/* Top — brand */}
        <div style={{ position: 'relative', zIndex: 2, animation: 'fadeUp 0.7s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13, flexShrink: 0,
              background: 'linear-gradient(135deg, #fff 0%, #e0e7ff 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 28px rgba(99,102,241,0.35), inset 0 -2px 0 rgba(15,23,42,0.1)',
            }}>
              <ChefHat size={20} strokeWidth={2.2} color="#1e1b4b" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.015em', lineHeight: 1.15 }}>MS-RM</div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 1 }}>
                Restaurant OS
              </div>
            </div>
          </div>
        </div>

        {/* Middle — security messaging */}
        <div style={{ position: 'relative', zIndex: 2, animation: 'fadeUp 0.7s ease 0.1s both', maxWidth: 480 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px 5px 8px', borderRadius: 99,
            background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.3)',
            marginBottom: 28,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#818cf8', animation: 'pulseRing 1.8s ease-out infinite' }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#c7d2fe', letterSpacing: '0.02em' }}>
              Encrypted password recovery
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 3.2vw, 48px)', fontWeight: 700, color: '#fff',
            lineHeight: 1.07, letterSpacing: '-0.035em', margin: 0, marginBottom: 18,
          }}>
            We&rsquo;ll get you<br />
            <span style={{
              background: 'linear-gradient(90deg, #60a5fa 0%, #818cf8 30%, #c084fc 60%, #60a5fa 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'shimmer 8s linear infinite', fontWeight: 800,
            }}>
              back in seconds.
            </span>
          </h1>

          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7,
            maxWidth: 420, margin: 0, marginBottom: 32,
          }}>
            Enter your work email and we&rsquo;ll send a single-use, time-limited reset
            link to your inbox. Your old password stays untouched until you set a new one.
          </p>

          {/* security steps card */}
          <div style={{
            background: 'rgba(15,23,42,0.55)',
            backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '18px 20px',
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            {[
              { step: '1', text: 'Enter the email tied to your account' },
              { step: '2', text: 'Open the secure link we email you (valid 30 min)' },
              { step: '3', text: 'Set a new password and sign back in' },
            ].map((s, i) => (
              <div key={s.step} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '11px 0',
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(99,102,241,0.16)',
                  border: '1px solid rgba(129,140,248,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#c7d2fe',
                }}>
                  {s.step}
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{s.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — security tagline */}
        <div style={{ position: 'relative', zIndex: 2, animation: 'fadeUp 0.7s ease 0.2s both' }}>
          <div style={{
            paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Shield size={14} color="rgba(255,255,255,0.4)" />
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
              256-bit TLS · One-time reset tokens · No password ever stored in plaintext
            </span>
          </div>
        </div>
      </div>

      {/* ═════════════ RIGHT PANEL — form ═════════════ */}
      <div style={{
        flex: 1, position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '52px 48px',
        background: `
          radial-gradient(at 100% 0%, rgba(99,102,241,0.06) 0%, transparent 50%),
          radial-gradient(at 0% 100%, rgba(59,130,246,0.04) 0%, transparent 50%),
          #fafafa
        `,
      }}>

        <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 2, animation: 'fadeUp 0.6s ease 0.15s both' }}>

          {/* Back link */}
          <button
            onClick={() => navigate('/login')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'transparent', border: '1px solid rgba(15,23,42,0.08)',
              padding: '5px 12px', borderRadius: 99, cursor: 'pointer',
              fontSize: 11.5, color: '#64748b', fontWeight: 600,
              marginBottom: 28, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'rgba(15,23,42,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(15,23,42,0.08)'; }}
          >
            <ArrowLeft size={13} />
            Back to sign in
          </button>

          {sent ? (
            /* ─── Success state ─── */
            <div style={{ textAlign: 'left' }}>
              <div style={{
                width: 54, height: 54, borderRadius: 14,
                background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 22,
                boxShadow: '0 8px 24px rgba(16,185,129,0.2)',
              }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="12" stroke="#059669" strokeWidth="2"/>
                  <path d="M8 14l4 4 8-8" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ strokeDasharray: 60, strokeDashoffset: 0, animation: 'drawCheck 0.6s ease-out 0.1s both' }}/>
                </svg>
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.035em', margin: 0, marginBottom: 8, lineHeight: 1.1 }}>
                Check your inbox.
              </h2>
              <p style={{ fontSize: 14.5, color: '#64748b', margin: 0, marginBottom: 6, lineHeight: 1.55 }}>
                We sent a password reset link to:
              </p>
              <p style={{ fontSize: 14.5, color: '#0f172a', margin: 0, marginBottom: 24, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                {email}
              </p>
              <div style={{
                padding: '14px 16px', borderRadius: 11,
                background: '#fffbeb', border: '1px solid #fde68a',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600, lineHeight: 1.6 }}>
                  The link expires in <strong>1 hour</strong>. If you don&rsquo;t see it,
                  check your spam folder or wait a moment before trying again.
                </div>
              </div>

              {/* Dev-only preview block — shows up when backend uses Ethereal */}
              {devPreview && (devPreview.previewUrl || devPreview.resetLink) && (
                <div style={{
                  padding: '14px 16px', borderRadius: 11, marginBottom: 24,
                  background: '#eff6ff', border: '1px solid #bfdbfe',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
                    🛠 Dev mode · transport: {devPreview.transport || 'unknown'}
                  </div>
                  {devPreview.previewUrl && (
                    <a href={devPreview.previewUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', fontSize: 12, color: '#1d4ed8', wordBreak: 'break-all', textDecoration: 'none', fontWeight: 600, marginBottom: 6 }}>
                      📨 View email in browser →
                    </a>
                  )}
                  {devPreview.resetLink && (
                    <a href={devPreview.resetLink}
                      style={{ display: 'block', fontSize: 11.5, color: '#475569', wordBreak: 'break-all', textDecoration: 'underline', fontFamily: 'ui-monospace, monospace' }}>
                      {devPreview.resetLink}
                    </a>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10,
                    background: '#fff', border: '1.5px solid rgba(15,23,42,0.1)',
                    fontSize: 13.5, fontWeight: 700, color: '#0f172a', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  Send to a different email
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="submit-btn"
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontSize: 13.5, fontWeight: 700, color: '#fff',
                    background: 'linear-gradient(90deg, #1e40af 0%, #2563eb 50%, #1e40af 100%)',
                    boxShadow: '0 8px 24px rgba(37,99,235,0.3)',
                  }}
                >
                  Back to sign in
                </button>
              </div>
            </div>
          ) : (
            /* ─── Form state ─── */
            <>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, #dbeafe, #e0e7ff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 22, boxShadow: '0 6px 20px rgba(37,99,235,0.12)',
              }}>
                <Mail size={22} color="#1d4ed8" strokeWidth={2.2} />
              </div>

              <h2 style={{ fontSize: 30, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.035em', margin: 0, marginBottom: 8, lineHeight: 1.1 }}>
                Reset password
              </h2>
              <p style={{ fontSize: 14.5, color: '#64748b', margin: 0, marginBottom: 28, lineHeight: 1.55 }}>
                Enter the email tied to your account and we&rsquo;ll send a secure reset link.
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label htmlFor="fp-email" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8, letterSpacing: '0.01em' }}>
                    Work email
                  </label>
                  <input
                    id="fp-email"
                    type="email"
                    style={{
                      width: '100%', padding: '13px 14px', fontSize: 14.5,
                      borderRadius: 10, border: emailBorder,
                      background: emailError ? '#fff7f7' : '#fff',
                      color: '#0f172a', outline: 'none',
                      transition: 'border 0.18s, box-shadow 0.18s',
                      boxShadow: emailShadow,
                      fontFamily: 'inherit', letterSpacing: '-0.005em',
                    }}
                    placeholder="you@restaurant.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(validateEmail(e.target.value)); }}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => { setEmailFocused(false); if (email.trim()) setEmailError(validateEmail(email)); }}
                    autoFocus
                    autoComplete="email"
                  />
                  {emailError && (
                    <p style={{ marginTop: 8, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="6" cy="6" r="5.5" stroke="#ef4444" strokeWidth="1.1"/>
                        <path d="M6 3.5v3M6 8h.01" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      {emailError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="submit-btn"
                  style={{
                    width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4,
                    fontSize: 14.5, fontWeight: 700, color: '#fff', letterSpacing: '-0.005em',
                    background: loading
                      ? '#94a3b8'
                      : 'linear-gradient(90deg, #1e40af 0%, #2563eb 25%, #3b82f6 50%, #2563eb 75%, #1e40af 100%)',
                    boxShadow: loading ? 'none' : '0 10px 30px rgba(37,99,235,0.32), inset 0 -2px 0 rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {loading
                    ? <><Loader2 size={16} style={{ animation: 'spin360 1s linear infinite' }} /> Sending link…</>
                    : <>Send reset link <ArrowUpRight size={16} strokeWidth={2.5} /></>
                  }
                </button>
              </form>

              {/* Help row */}
              <div style={{
                marginTop: 24, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(15,23,42,0.025)', border: '1px solid rgba(15,23,42,0.05)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, fontSize: 12, color: '#64748b', lineHeight: 1.55 }}>
                  Remembered it after all?
                </div>
                <button
                  onClick={() => navigate('/login')}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, color: '#2563eb', padding: 0,
                  }}
                >
                  Sign in →
                </button>
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 11.5, color: '#94a3b8', margin: 0, fontWeight: 500 }}>
              © 2026 MS-RM System · All rights reserved
            </p>
            <p style={{ fontSize: 11.5, color: '#94a3b8', margin: 0, marginTop: 4 }}>
              Crafted by{' '}
              <span style={{ color: '#475569', fontWeight: 700, letterSpacing: '-0.005em' }}>
                Madsun Digital Marketing &amp; Media Agency
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
