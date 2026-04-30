import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { loginSuccess, setLoading } from '../store/slices/authSlice';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoadingState] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login || !password) return toast.error('Please fill in all fields');
    setLoadingState(true);
    dispatch(setLoading(true));
    try {
      const res = await api.post('/auth/login', { login, password });
      const payload = res.data?.data || res.data;
      dispatch(loginSuccess(payload));
      localStorage.setItem('accessToken', payload.accessToken);
      localStorage.setItem('refreshToken', payload.refreshToken || '');
      toast.success(`Welcome back, ${payload.user?.full_name || payload.user?.email || 'User'}`);
      navigate('/');
    } catch (error) {
      toast.error(error.message || 'Login failed');
    } finally {
      setLoadingState(false);
      dispatch(setLoading(false));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#f8fafc' }}>

      <div className="w-full max-w-[400px]">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 text-white font-bold text-lg" style={{ background: '#2563eb' }}>
            M
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">MS-RM System</h1>
          <p className="text-sm text-slate-500 mt-1">Restaurant Management System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="login-email">
                Email or Phone
              </label>
              <input
                id="login-email"
                type="text"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="admin@example.com"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="login-password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{ background: '#2563eb' }}
              onMouseEnter={e => !loading && (e.currentTarget.style.background = '#1d4ed8')}
              onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Demo Credentials</p>
            <div className="text-xs text-slate-400 font-mono space-y-1">
              <p>Email: admin@demo.com</p>
              <p>Password: Admin@12345</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-1">
          <p className="text-xs text-slate-400">© 2026 MS-RM System. All rights reserved.</p>
          <p className="text-xs text-slate-400">
            Created by{' '}
            <span className="font-medium text-slate-500">Madsun Digital Marketing &amp; Media Agency</span>
          </p>
        </div>
      </div>
    </div>
  );
}
