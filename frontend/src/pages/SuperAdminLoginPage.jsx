/**
 * @fileoverview Dedicated SuperAdmin login page — dark command-center theme.
 * Route: /superadmin-login  (public, outside DashboardLayout)
 */

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { loginSuccess } from '../store/slices/authSlice';

export default function SuperAdminLoginPage() {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const dispatch   = useDispatch();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Email and password required');
    setLoading(true);
    try {
      const res     = await api.post('/superadmin/login', { email, password });
      const payload = res.data?.data || res.data;

      // The backend returns the staff member's REAL platform role + permissions.
      // We keep `role: 'super_admin'` for the routing shell (so any platform staff
      // can enter the console), preserve the real role in `platform_role`, and
      // carry `permissions` to drive nav visibility. Per-action security is
      // enforced server-side on every /superadmin route.
      const u = payload.user || {};
      const platformRole = u.role || 'super_admin';
      const sessionUser = {
        ...u,
        platform_role: platformRole,
        role: 'super_admin',
        is_super_admin: platformRole === 'super_admin',
        permissions: Array.isArray(u.permissions) ? u.permissions : [],
      };
      const accessToken = payload.token || payload.accessToken || '';

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('user', JSON.stringify(sessionUser));

      dispatch(loginSuccess({
        accessToken,
        refreshToken: payload.refreshToken || accessToken,
        user: sessionUser,
      }));

      toast.success(`Welcome, ${payload.user?.full_name || payload.user?.email || 'Admin'} 🚀`);
      navigate('/');
    } catch (err) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1a0a2e 100%)',
      }}
    >
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-10 animate-pulse"
            style={{
              width: Math.random() * 8 + 4 + 'px',
              height: Math.random() * 8 + 4 + 'px',
              background: i % 2 === 0 ? '#6366f1' : '#8b5cf6',
              top: Math.random() * 100 + '%',
              left: Math.random() * 100 + '%',
              animationDelay: Math.random() * 3 + 's',
              animationDuration: (Math.random() * 2 + 2) + 's',
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div
          className="rounded-3xl p-8 shadow-2xl"
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Logo + Title */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              SuperAdmin Portal
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Platform command center — authorized access only
            </p>
          </div>

          {/* Status indicator */}
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 mb-6"
            style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}
          >
            <Activity className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-xs font-medium">System operational — all services live</span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">
                Admin Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@admin.com"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(99, 102, 241, 0.3)')}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 rounded-xl text-white placeholder-slate-500 text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(99, 102, 241, 0.3)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all mt-2 flex items-center justify-center gap-2"
              style={{
                background: loading
                  ? 'rgba(99, 102, 241, 0.5)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating…
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Enter Command Center
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <a
              href="/#/login"
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              ← Back to restaurant login
            </a>
          </div>

          <p className="text-center text-slate-600 text-xs mt-4">
            🔒 All actions are logged and audited
          </p>
        </div>
      </div>
    </div>
  );
}
