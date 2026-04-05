import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'react-hot-toast';
import AdminLayout from './layouts/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import ChainManagement from './pages/ChainManagement';
import { useState } from 'react';
import { ShieldCheck, Lock, Activity } from 'lucide-react';
import api from './lib/api';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" toastOptions={{
        style: { background: '#1e293b', color: '#fff', borderRadius: '16px', border: '1px solid #334155' }
      }} />
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="chains" element={<ChainManagement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}

function AdminLogin({ onLogin }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Phase 1: Call the Secure Global Login API
      const response = await api.post('/login', { pin });
      const { token } = response;
      
      localStorage.setItem('sa_token', token);
      window.location.reload();
    } catch (err) {
      toast.error('Invalid Global Master Key');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-slate-950 flex items-center justify-center p-8 selection:bg-indigo-500 selection:text-white">
      <div className="w-full max-w-lg bg-orange-500/5 backdrop-blur-3xl border border-white/5 p-12 rounded-[48px] shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[120px] rounded-full animate-pulse" />
         
         <div className="relative text-center space-y-8">
            <div className="w-24 h-24 bg-indigo-600 rounded-[32px] flex items-center justify-center text-white mx-auto shadow-2xl shadow-indigo-600/20 rotate-3 group-hover:rotate-0 transition-transform duration-500">
               <ShieldCheck size={48} />
            </div>
            
            <div className="space-y-2">
               <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">SuperAdmin Console</h2>
               <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                  <Lock size={12} /> Restricted Software Governance Area
               </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6 pt-4">
               <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest text-left ml-4 mb-2">Platform Master Key</label>
                  <input 
                    type="password" 
                    placeholder="••••"
                    maxLength={4}
                    className="w-full px-8 py-6 bg-slate-900/50 border-2 border-slate-800 rounded-3xl text-center text-4xl tracking-widest font-black text-white focus:border-indigo-600 outline-none transition-all shadow-xl"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                  />
               </div>
               <button 
                  disabled={loading}
                  className="w-full py-6 bg-indigo-600 text-white text-lg font-black rounded-3xl shadow-2xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
               >
                  {loading ? <Activity className="animate-spin" /> : <><ShieldCheck size={20} /> Access Control Hub</>}
               </button>
            </form>

            <div className="pt-8 text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center justify-center gap-4 border-t border-white/5">
                <span>V2.1 — CLOUD SYNCED</span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span>SERVER US-EAST-1</span>
            </div>
         </div>
      </div>
    </div>
  );
}
