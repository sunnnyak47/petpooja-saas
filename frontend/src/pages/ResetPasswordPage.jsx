import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error('Invalid reset link. No token found.');
      navigate('/login');
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || !confirmPassword) return toast.error('Please fill in all fields');
    if (password !== confirmPassword) return toast.error('Passwords do not match');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password-token', { 
        token, 
        new_password: password 
      });
      toast.success(res.data.message || 'Password reset successfully!');
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      toast.error(error.message || 'Failed to reset password. Link may be expired.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900 relative">
        <div className="text-center card border border-surface-700 p-12 max-w-md animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Password Updated</h2>
          <p className="text-surface-400">Your password has been changed successfully. Redirecting you to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px]" />
      
      <div className="relative w-full max-w-md mx-4 animate-fade-in">
        <div className="card border border-surface-700/80 shadow-glass-lg">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="page-title">Reset Password</h2>
            <p className="text-surface-400 mt-2 text-sm">
              Please enter and confirm your new password below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5" htmlFor="password">
                New Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5" htmlFor="confirm-password">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                className="input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full btn-lg"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
