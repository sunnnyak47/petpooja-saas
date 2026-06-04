import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ChefHat, TrendingUp, Activity, Shield, ArrowUpRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { warmupBackend, isColdStartError } from '../lib/api';
import { loginSuccess, setLoading } from '../store/slices/authSlice';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ─── animated live-metric snippets ─── */
const METRICS = [
  { label: 'Live revenue today',   value: '$18,420',  delta: '+12.4%', tone: '#10b981', icon: TrendingUp },
  { label: 'Orders in kitchen',    value: '24',       delta: 'live',    tone: '#3b82f6', icon: Activity   },
  { label: 'Stock-out alerts',      value: '0',        delta: 'all good',tone: '#8b5cf6', icon: Shield     },
];

const TESTIMONIAL = {
  quote: 'Cut our end-of-day reconciliation from 45 minutes to under 5. The kitchen display alone paid for the whole system in two weeks.',
  name:  'Aarav Mehta',
  role:  'Owner · Garden State Eatery (Sydney + Mumbai)',
};

export default function LoginPage() {
  const [login, setLogin]               = useState('');
  const [emailError, setEmailError]     = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoadingState]      = useState(false);
  const [pwFocused, setPwFocused]       = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [tick, setTick]                 = useState(0);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // gentle live-metric tick to feel "alive"
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2200);
    return () => clearInterval(id);
  }, []);

  // Wake the (possibly cold-started) backend as soon as the login page loads,
  // so it's warm by the time the user submits — fixes "first login always times out".
  useEffect(() => { warmupBackend(); }, []);

  const validateEmail = (val) => {
    if (!val) return 'Email is required.';
    if (!EMAIL_RE.test(val)) return 'Please enter a valid email address.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateEmail(login);
    if (err) { setEmailError(err); return; }
    if (!password) return toast.error('Please enter your password.');
    setLoadingState(true);
    dispatch(setLoading(true));
    // Generous timeout so a cold-starting backend (up to ~50s) doesn't abort.
    const submit = () => api.post('/auth/login', { login, password }, { timeout: 60000 });
    try {
      let res;
      try {
        res = await submit();
      } catch (firstErr) {
        // If the first attempt died on a cold-start timeout/network blip, the
        // server is now waking — retry once transparently instead of erroring.
        if (isColdStartError(firstErr)) {
          toast.loading('Waking up the server…', { id: 'warm', duration: 4000 });
          res = await submit();
          toast.dismiss('warm');
        } else {
          throw firstErr;
        }
      }
      const payload = res.data?.data || res.data;
      dispatch(loginSuccess(payload));
      localStorage.setItem('accessToken', payload.accessToken);
      localStorage.setItem('refreshToken', payload.refreshToken || '');
      toast.success(`Welcome back, ${payload.user?.full_name || payload.user?.email || 'User'}`);
      navigate('/');
    } catch (error) {
      toast.dismiss('warm');
      const msg = isColdStartError(error)
        ? 'Server is waking up — please tap Continue once more.'
        : (error.message || 'Login failed');
      if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('user')) {
        setEmailError('No account found with this email address.');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoadingState(false);
      dispatch(setLoading(false));
    }
  };

  // pulse the live revenue +1 every tick (cheap feel-alive trick)
  const liveRevenue = 18420 + (tick * 23);

  const emailBorder = emailError
    ? '1.5px solid #ef4444'
    : emailFocused ? '1.5px solid #2563eb' : '1.5px solid rgba(15,23,42,0.08)';
  const emailShadow = emailError
    ? '0 0 0 4px rgba(239,68,68,0.08)'
    : emailFocused ? '0 0 0 4px rgba(37,99,235,0.1)' : '0 1px 2px rgba(15,23,42,0.04)';
  const pwBorder  = pwFocused ? '1.5px solid #2563eb' : '1.5px solid rgba(15,23,42,0.08)';
  const pwShadow  = pwFocused ? '0 0 0 4px rgba(37,99,235,0.1)' : '0 1px 2px rgba(15,23,42,0.04)';

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflow: 'hidden', background: '#fafafa',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; -webkit-font-smoothing: antialiased; }
        @keyframes meshShift {
          0%,100% { transform: rotate(0deg)   translate(0,    0);    }
          25%      { transform: rotate(90deg)  translate(40px, -30px); }
          50%      { transform: rotate(180deg) translate(-20px, 40px); }
          75%      { transform: rotate(270deg) translate(-30px, -20px);}
        }
        @keyframes blob {
          0%,100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          33%      { border-radius: 30% 60% 70% 40% / 50% 60% 40% 50%; }
          66%      { border-radius: 70% 30% 50% 50% / 40% 70% 30% 60%; }
        }
        @keyframes drift {
          0%,100% { transform: translate(0,   0)    scale(1);    }
          50%      { transform: translate(20px,-25px) scale(1.05); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes spin360 { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulseRing {
          0%   { box-shadow: 0 0 0 0   rgba(37,99,235,0.5); }
          70%  { box-shadow: 0 0 0 10px rgba(37,99,235,0);   }
          100% { box-shadow: 0 0 0 0   rgba(37,99,235,0);   }
        }
        .glass-card { backdrop-filter: blur(20px) saturate(140%); -webkit-backdrop-filter: blur(20px) saturate(140%); }
        .submit-btn { background-size: 200% 100% !important; transition: background-position 0.35s, transform 0.18s, box-shadow 0.18s, opacity 0.18s; }
        .submit-btn:hover:not(:disabled) { background-position: 100% 0 !important; transform: translateY(-1.5px); box-shadow: 0 14px 40px rgba(37,99,235,0.4) !important; }
        .submit-btn:active:not(:disabled){ transform: translateY(0); }
        .fp-link { transition: color 0.15s; }
        .fp-link:hover { color: #1d4ed8 !important; }
        .live-dot { animation: pulseRing 1.8s ease-out infinite; }
        @media (max-width: 900px) {
          .left-pane { display: none !important; }
          .right-pane { flex: 1 !important; }
        }
      `}</style>

      {/* ═════════════════════════ LEFT PANEL ═════════════════════════ */}
      <div className="left-pane" style={{
        flex: '0 0 56%', position: 'relative', overflow: 'hidden',
        background: '#020617',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '52px 56px',
      }}>

        {/* ── Layer 1: animated gradient mesh background ── */}
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

        {/* ── Layer 2: amorphous blob accent ── */}
        <div style={{
          position: 'absolute', width: 520, height: 520,
          top: '-15%', right: '-15%',
          background: 'radial-gradient(circle at 35% 35%, rgba(99,102,241,0.35), rgba(59,130,246,0.15) 50%, transparent 75%)',
          animation: 'blob 24s ease-in-out infinite, drift 16s ease-in-out infinite',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', width: 380, height: 380,
          bottom: '-12%', left: '-10%',
          background: 'radial-gradient(circle at 50% 50%, rgba(14,165,233,0.28), transparent 70%)',
          animation: 'blob 30s ease-in-out infinite reverse, drift 20s ease-in-out infinite 2s',
          filter: 'blur(50px)',
        }} />

        {/* ── Layer 3: subtle grid lines ── */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}>
          <defs>
            <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="gridFade" cx="50%" cy="50%" r="60%">
              <stop offset="0%"   stopColor="#fff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0"   />
            </radialGradient>
            <mask id="gridMask"><rect width="100%" height="100%" fill="url(#gridFade)" /></mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" mask="url(#gridMask)" />
        </svg>

        {/* ── Layer 4: noise/grain overlay ── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
          mixBlendMode: 'overlay',
        }} />

        {/* ═════ CONTENT ═════ */}
        <div style={{ position: 'relative', zIndex: 2, animation: 'fadeUp 0.7s ease both' }}>
          {/* Brand */}
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
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.015em', lineHeight: 1.15 }}>
                MS-RM
              </div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 1 }}>
                Restaurant OS
              </div>
            </div>
          </div>
        </div>

        {/* ═════ HERO BLOCK ═════ */}
        <div style={{ position: 'relative', zIndex: 2, animation: 'fadeUp 0.7s ease 0.1s both' }}>

          {/* Live status pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px 5px 8px', borderRadius: 99,
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.25)',
            marginBottom: 28,
          }}>
            <span className="live-dot" style={{
              width: 7, height: 7, borderRadius: '50%', background: '#10b981',
            }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6ee7b7', letterSpacing: '0.02em' }}>
              All systems operational — {(220 + (tick % 12)).toString()} locations live
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(34px, 3.4vw, 52px)', fontWeight: 700, color: '#fff',
            lineHeight: 1.05, letterSpacing: '-0.035em', margin: 0, marginBottom: 16,
          }}>
            The operating<br />
            system for<br />
            <span style={{
              background: 'linear-gradient(90deg, #60a5fa 0%, #818cf8 30%, #c084fc 60%, #60a5fa 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'shimmer 8s linear infinite',
              fontWeight: 800,
            }}>
              modern restaurants.
            </span>
          </h1>

          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7,
            maxWidth: 420, margin: 0, marginBottom: 36, fontWeight: 400,
          }}>
            POS, kitchen display, inventory, payroll, aggregator sync and end-of-day
            close — one platform, every market.
          </p>

          {/* ── Live metrics card mockup ── */}
          <div className="glass-card" style={{
            display: 'inline-flex', flexDirection: 'column',
            background: 'rgba(15,23,42,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '18px 20px',
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            minWidth: 360,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, paddingBottom: 14,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulseRing 1.8s ease-out infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Live · Today
                </span>
              </div>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontFamily: 'ui-monospace, monospace' }}>
                synced just now
              </span>
            </div>

            {METRICS.map((m, i) => {
              const Icon = m.icon;
              const animatedVal = i === 0 ? `$${liveRevenue.toLocaleString()}` : m.value;
              return (
                <div key={m.label} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '11px 0',
                  borderBottom: i < METRICS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: `${m.tone}1c`,
                    border: `1px solid ${m.tone}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color={m.tone} strokeWidth={2.2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: '0.02em', marginBottom: 2 }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', fontFeatureSettings: '"tnum"' }}>
                      {animatedVal}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    background: `${m.tone}1c`, color: m.tone, letterSpacing: '0.02em',
                  }}>
                    {m.delta}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═════ TESTIMONIAL / BOTTOM ═════ */}
        <div style={{ position: 'relative', zIndex: 2, animation: 'fadeUp 0.7s ease 0.2s both' }}>
          <div style={{
            paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'flex-start', gap: 16,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 14,
              boxShadow: '0 4px 14px rgba(251,191,36,0.3), inset 0 -2px 0 rgba(0,0,0,0.1)',
            }}>
              AM
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: 13.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.65,
                margin: 0, marginBottom: 10, fontStyle: 'italic',
                fontWeight: 400, letterSpacing: '-0.005em',
              }}>
                “{TESTIMONIAL.quote}”
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{TESTIMONIAL.name}</span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{TESTIMONIAL.role}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════ RIGHT PANEL ═════════════════════════ */}
      <div className="right-pane" style={{
        flex: 1, position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '52px 48px',
        background: `
          radial-gradient(at 100% 0%, rgba(99,102,241,0.06) 0%, transparent 50%),
          radial-gradient(at 0% 100%, rgba(59,130,246,0.04) 0%, transparent 50%),
          #fafafa
        `,
      }}>

        {/* subtle noise on right */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }} />

        <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 2, animation: 'fadeUp 0.6s ease 0.15s both' }}>

          {/* tiny "back to home" link */}
          <button
            onClick={() => navigate('/welcome')}
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
            ← Back to home
          </button>

          {/* Heading */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 30, fontWeight: 800, color: '#0f172a',
              letterSpacing: '-0.035em', margin: 0, marginBottom: 8,
              lineHeight: 1.1,
            }}>
              Sign in
            </h2>
            <p style={{ fontSize: 14.5, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Welcome back. Use your email to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8, letterSpacing: '0.01em' }}
              >
                Work email
              </label>
              <input
                id="login-email"
                type="email"
                style={{
                  width: '100%', padding: '13px 14px', fontSize: 14.5,
                  borderRadius: 10, border: emailBorder,
                  background: emailError ? '#fff7f7' : '#fff',
                  color: '#0f172a', outline: 'none',
                  transition: 'border 0.18s, box-shadow 0.18s',
                  boxShadow: emailShadow,
                  fontFamily: 'inherit',
                  letterSpacing: '-0.005em',
                }}
                placeholder="you@restaurant.com"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  if (emailError) setEmailError(validateEmail(e.target.value));
                }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => {
                  setEmailFocused(false);
                  if (login.trim()) setEmailError(validateEmail(login));
                }}
                autoFocus
                autoComplete="email"
              />
              {emailError && (
                <p style={{ marginTop: 8, fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="6" cy="6" r="5.5" stroke="#ef4444" strokeWidth="1.1" />
                    <path d="M6 3.5v3M6 8h.01" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  {emailError}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label htmlFor="login-password" style={{ fontSize: 12, fontWeight: 600, color: '#334155', letterSpacing: '0.01em' }}>
                  Password
                </label>
                <button
                  type="button"
                  className="fp-link"
                  onClick={() => navigate('/forgot-password')}
                  style={{
                    fontSize: 11.5, fontWeight: 600, color: '#2563eb',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, letterSpacing: '0.01em',
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  style={{
                    width: '100%', padding: '13px 44px 13px 14px', fontSize: 14.5,
                    borderRadius: 10, border: pwBorder, background: '#fff',
                    color: '#0f172a', outline: 'none', letterSpacing: showPassword ? '-0.005em' : '0.2em',
                    transition: 'border 0.18s, box-shadow 0.18s',
                    boxShadow: pwShadow,
                    fontFamily: 'inherit',
                  }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPwFocused(true)}
                  onBlur={() => setPwFocused(false)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', padding: 6, borderRadius: 6,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="submit-btn"
              style={{
                width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer', marginTop: 6,
                fontSize: 14.5, fontWeight: 700, color: '#fff',
                letterSpacing: '-0.005em',
                background: loading
                  ? '#94a3b8'
                  : 'linear-gradient(90deg, #1e40af 0%, #2563eb 25%, #3b82f6 50%, #2563eb 75%, #1e40af 100%)',
                boxShadow: loading ? 'none' : '0 10px 30px rgba(37,99,235,0.32), inset 0 -2px 0 rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading
                ? <><Loader2 size={16} style={{ animation: 'spin360 1s linear infinite' }} /> Verifying…</>
                : <>Continue <ArrowUpRight size={16} strokeWidth={2.5} /></>
              }
            </button>
          </form>

          {/* Divider + Security row */}
          <div style={{ marginTop: 26 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px', borderRadius: 10,
              background: 'rgba(15,23,42,0.025)',
              border: '1px solid rgba(15,23,42,0.05)',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                background: 'linear-gradient(135deg, #dbeafe, #e0e7ff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Shield size={13} color="#1d4ed8" strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a' }}>
                  Enterprise-grade security
                </div>
                <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 1 }}>
                  256-bit TLS · SOC 2 Type II · GDPR-compliant
                </div>
              </div>
            </div>
          </div>

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
