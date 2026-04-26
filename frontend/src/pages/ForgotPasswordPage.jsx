import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Please enter your email address');

    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password-email', { email });
      toast.success(res.data.message || 'Reset link sent to your email');
      // In a real app, we might redirect to a success message page
    } catch (error) {
      toast.error(error.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px]" />
      
      <div className="relative w-full max-w-md mx-4 animate-fade-in">
        <button 
          onClick={() => navigate('/login')}
          className="flex items-center text-surface-400 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Login
        </button>

        <div className="card border border-surface-700/80 shadow-glass-lg">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 mb-4">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="page-title">Forgot Password?</h2>
            <p className="text-surface-400 mt-2 text-sm">
              Enter the email associated with your account and we'll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full btn-lg"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
