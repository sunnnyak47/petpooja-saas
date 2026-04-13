import useBranding from '../hooks/useBranding';

export default function LoginPage() {
  const { branding, getPlatformInitial } = useBranding();
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
      dispatch(loginSuccess(res.data));
      toast.success(`Welcome back, ${res.data.user.full_name}!`);
      navigate('/');
    } catch (error) {
      toast.error(error.message || 'Login failed');
    } finally {
      setLoadingState(false);
      dispatch(setLoading(false));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] bg-brand-700/10 rounded-full blur-[120px]" />

      <div className="relative w-full max-w-md mx-4 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-glow uppercase">
            {getPlatformInitial()}
          </div>
          <h1 className="text-3xl font-bold text-white">{branding.platform_name}</h1>
          <p className="text-surface-400 mt-1">Restaurant Management System</p>
        </div>

        {/* Login card */}
        <div className="card border border-surface-700/80 shadow-glass-lg">
          <h2 className="text-xl font-semibold text-white mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5" htmlFor="login-email">
                Email or Phone
              </label>
              <input
                id="login-email"
                type="text"
                className="input"
                placeholder="admin@petpooja.com or 9999999999"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1.5" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                  id="toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-xs font-medium text-brand-500 hover:text-brand-400 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full btn-lg"
              id="btn-login"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 p-3 bg-surface-700/30 rounded-xl">
            <p className="text-xs text-surface-500 font-medium mb-2">Demo Credentials</p>
            <div className="text-xs text-surface-400 space-y-1 font-mono">
              <p>Email: admin@petpooja.com</p>
              <p>Password: Admin@12345</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-surface-600 mt-6">
          © 2026 Petpooja ERP — Powering 100,000+ Restaurants
        </p>
      </div>
    </div>
  );
}
