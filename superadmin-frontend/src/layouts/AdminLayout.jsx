import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { 
  Building2, LayoutDashboard, CreditCard, 
  Settings, LogOut, ChevronLeft, ShieldCheck,
  Activity, Users, Palette
} from 'lucide-react';
import { useTheme } from '../themes/ThemeContext';
import { useNavigate } from 'react-router-dom';

const saNav = [
  { path: '/', label: 'Global Monitor', icon: LayoutDashboard },
  { path: '/chains', label: 'Restaurant Hub', icon: Building2 },
  { path: '/billing', label: 'SaaS Revenue', icon: CreditCard },
  { path: '/settings', label: 'System Config', icon: Settings },
];

export default function AdminLayout({ user, onLogout }) {
  const { currentTheme } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [serverTime, setServerTime] = useState(new Date().toISOString().split('T')[1].slice(0, 8));

  // Live Clock Effect
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setServerTime(now.toISOString().split('T')[1].slice(0, 8));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const displayName = user?.full_name || 'Software Owner';
  const activeSessions = 143; // Dynamic placeholder

  return (
    <div className="flex h-screen overflow-hidden font-sans" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* SaaS Admin Sidebar */}
      <aside 
        style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}
        className={`${collapsed ? 'w-20' : 'w-72'} border-r flex flex-col transition-all duration-300 shadow-2xl z-50`}
      >
        {/* Brand */}
        <div className="h-24 flex items-center px-8 border-b border-white/5 bg-white/[0.02]">
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-tighter text-white uppercase italic leading-none">Admin Panel</span>
              <span className="text-[10px] text-indigo-500 font-black uppercase tracking-[0.3em] mt-2">SaaS Foundation</span>
            </div>
          )}
          {collapsed && <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto font-black italic">A</div>}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-10 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          {saNav.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-4 px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all group
                ${isActive
                   ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/40 translate-x-1'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'}`
              }
            >
              <Icon className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110`} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* System User (Final Sidebar Specs) */}
        <div className="p-6 border-t border-white/5 bg-black/20">
            <div className={`p-4 bg-slate-800/20 rounded-3xl flex items-center ${collapsed ? 'justify-center' : 'gap-4'} border border-white/5`}>
               <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-black text-lg border border-indigo-500/20 shadow-inner">
                  {displayName.charAt(0).toUpperCase()}
               </div>
               {!collapsed && (
                 <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white truncate uppercase tracking-tighter">{displayName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Root Access</span>
                    </div>
                 </div>
               )}
            </div>

            <button 
                onClick={handleLogout}
                className={`w-full mt-6 flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 transition-all uppercase tracking-widest ${collapsed ? 'justify-center' : ''}`}
            >
                <LogOut size={16} />
                {!collapsed && <span>System Logout</span>}
            </button>
        </div>
      </aside>

      {/* Control Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Superior Header */}
        <header 
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          className="h-20 backdrop-blur-md border-b px-8 flex items-center justify-between"
        >
           <div className="flex items-center gap-6">
             <button onClick={() => setCollapsed(!collapsed)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors border border-slate-800">
               <ChevronLeft className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
             </button>
             <div>
               <h1 className="text-xl font-black tracking-tight text-white uppercase italic">Platform Overview</h1>
               <div className="flex items-center gap-2 mt-1">
                 <Activity size={12} className="text-emerald-400" />
                 <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">SaaS Cloud — Healthy</span>
               </div>
             </div>
           </div>

           <div className="flex items-center gap-6">
              {/* Quick Theme Toggle */}
              <button
                onClick={() => navigate('/settings')}
                title="Change Theme"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors"
                style={{
                  background: 'var(--bg-hover)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>{currentTheme.emoji}</span>
                <span className="hidden sm:block">
                  {currentTheme.name}
                </span>
              </button>

              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Server Time (UTC)</p>
                <p className="text-xs font-mono font-bold text-white mt-0.5">{serverTime}</p>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                 <Users size={16} style={{ color: 'var(--accent)' }} />
                 <span className="text-xs font-black text-white">{activeSessions} Active Sessions</span>
              </div>
           </div>
        </header>

        {/* Global Body */}
        <main className="flex-1 overflow-y-auto p-12 custom-scrollbar" style={{ background: 'var(--bg-primary)' }}>
           <Outlet />
        </main>
      </div>
    </div>
  );
}
