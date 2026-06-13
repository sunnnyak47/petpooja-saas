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

      toast.success(`Welcome, ${payload.user?.full_name || payload.user?.email || 'Admin'}`);
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
        background:
          'radial-gradient(120% 120% at 50% 0%, #1e293b 0%, #0f172a 55%, #0b1120 100%)',
      }}
    >
      <div className="relative w-full max-w-md">
        {/* Card */}
        <div
          className="rounded-2xl p-8 shadow-xl"
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
          }}
        >
          {/* Logo + Title */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
              style={{ background: '#4f46e5' }}
            >
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#ffffff' }}>
              SuperAdmin Portal
            </h1>
            <p className="text-slate-400 text-sm mt-1.5">
              Platform command center — authorized access only
            </p>
          </div>

          {/* Status indicator */}
          <div
            className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 mb-6"
            style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}
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
                className="w-full px-4 py-3 rounded-lg text-white placeholder-slate-500 text-sm outline-none transition-colors"
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                onBlur={(e) => (e.target.style.borderColor = '#334155')}
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
                  className="w-full px-4 py-3 pr-12 rounded-lg text-white placeholder-slate-500 text-sm outline-none transition-colors"
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e) => (e.target.style.borderColor = '#334155')}
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
              className="w-full py-3 rounded-lg font-semibold text-white text-sm transition-colors mt-2 flex items-center justify-center gap-2"
              style={{
                background: loading ? 'rgba(79, 70, 229, 0.5)' : '#4f46e5',
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
            All actions are logged and audited
          </p>
        </div>
      </div>
    </div>
  );
}
