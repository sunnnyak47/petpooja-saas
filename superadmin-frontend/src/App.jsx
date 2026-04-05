import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import ChainManagement from './pages/ChainManagement';
import LoginPage from './pages/LoginPage';
import api from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    }
  }
});

/** Protected Route wrapper */
function ProtectedRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('sa_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [verifying, setVerifying] = useState(!!localStorage.getItem('sa_token'));

  // Verify token on mount
  useEffect(() => {
    const token = localStorage.getItem('sa_token');
    if (!token) { setVerifying(false); return; }

    api.get('/verify')
      .then(res => {
        setUser(res.data?.user || user);
        setVerifying(false);
      })
      .catch(() => {
        localStorage.removeItem('sa_token');
        localStorage.removeItem('sa_user');
        setUser(null);
        setVerifying(false);
      });
  }, []);

  const handleLogin = useCallback((userData, token) => {
    localStorage.setItem('sa_token', token);
    localStorage.setItem('sa_user', JSON.stringify(userData));
    setUser(userData);
    queryClient.clear();
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('sa_token');
    localStorage.removeItem('sa_user');
    setUser(null);
    queryClient.clear();
  }, []);

  if (verifying) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Verifying Session...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e293b', color: '#fff', borderRadius: '16px', border: '1px solid #334155', fontWeight: 700 }
        }}
      />
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute user={user}>
              <AdminLayout user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="chains" element={<ChainManagement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
