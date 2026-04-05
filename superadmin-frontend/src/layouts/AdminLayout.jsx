import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { 
  Building2, LayoutDashboard, History, CreditCard, 
  Settings, LogOut, ChevronLeft, ShieldCheck, 
  BarChart3, Activity, Users, Send
} from 'lucide-react';

const saNav = [
  { path: '/', label: 'Global Monitor', icon: LayoutDashboard },
  { path: '/chains', label: 'Restaurant Hub', icon: Building2 },
  { path: '/billing', label: 'SaaS Revenue', icon: CreditCard },
  { path: '/broadcast', label: 'Communications', icon: Send },
  { path: '/audit', label: 'Security Logs', icon: History },
  { path: '/settings', label: 'System Config', icon: Settings },
];

export default function AdminLayout({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const displayName = user?.full_name || 'Software Owner';
  const displayEmail = user?.email || 'admin@admin.com';

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* SaaS Admin Sidebar */}
      <aside className={`${collapsed ? 'w-20' : 'w-72'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 shadow-2xl z-50`}>
        {/* Brand */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <ShieldCheck size={24} />
              </div>
              <div>
                <span className="font-black text-lg tracking-tight uppercase">Admin Panel</span>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">SaaS Foundation</p>
              </div>
            </div>
          )}
          {collapsed && <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto"><ShieldCheck size={20} /></div>}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-8 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          {saNav.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all group
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* System User */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-xl">
            <div className={`p-4 bg-slate-800/30 rounded-2xl flex items-center ${collapsed ? 'justify-center' : 'gap-3'} border border-slate-700/30`}>
               <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-black">
                  {displayName.charAt(0).toUpperCase()}
               </div>
               {!collapsed && (
                 <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white truncate">{displayName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Root Access</span>
                    </div>
                 </div>
               )}
            </div>

            <button 
                onClick={handleLogout}
                className={`w-full mt-4 flex items-center gap-4 px-5 py-3 rounded-xl text-xs font-black text-rose-400 hover:bg-rose-500/10 transition-colors uppercase tracking-widest ${collapsed ? 'justify-center' : ''}`}
            >
                <LogOut size={16} />
                {!collapsed && <span>System Logout</span>}
            </button>
        </div>
      </aside>

      {/* Control Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Superior Header */}
        <header className="h-20 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-8 flex items-center justify-between">
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
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Server Time (UTC)</p>
                <p className="text-xs font-mono font-bold text-white mt-0.5">{new Date().toISOString().split('T')[1].slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl">
                 <Users size={16} className="text-indigo-400" />
                 <span className="text-xs font-black text-white">143 Active Sessions</span>
              </div>
           </div>
        </header>

        {/* Global Body */}
        <main className="flex-1 overflow-y-auto p-12 bg-slate-950 custom-scrollbar">
           <Outlet />
        </main>
      </div>
    </div>
  );
}
