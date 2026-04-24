import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { logout } from '../store/slices/authSlice';
import { useTheme } from '../themes/ThemeContext';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, UtensilsCrossed,
  Users, BarChart3, LogOut, ChevronLeft, Bell, Settings, Package,
  ShieldCheck, ChefHat, CreditCard, Tag, Puzzle, Shield, Clock,
  QrCode, BellRing, Sun, Moon, Monitor,
} from 'lucide-react';
import OwnerWizard from '../components/onboarding/OwnerWizard';
import DunningBanner from '../components/onboarding/DunningBanner';
import IncomingOrderAlert from '../components/POS/IncomingOrderAlert';

const superAdminNav = [
  { path: '/', label: 'Global Analytics', icon: BarChart3 },
  { path: '/super-admin', label: 'Restaurant Chains', icon: ShieldCheck },
  { path: '/audit-logs', label: 'System Logs', icon: ClipboardList },
  { path: '/billing', label: 'SaaS Revenue', icon: ShoppingCart },
  { path: '/settings', label: 'System Settings', icon: Settings },
];

const ownerNav = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/pos', label: 'POS Terminal', icon: ShoppingCart },
  { path: '/running-orders', label: 'Running Orders', icon: Clock, isLive: true },
  { path: '/orders', label: 'Order History', icon: ClipboardList },
  { path: '/kitchen', label: 'Kitchen Display', icon: ChefHat },
  { path: '/menu', label: 'Menu Management', icon: UtensilsCrossed },
  { path: '/qr-codes', label: 'QR Codes', icon: QrCode },
  { path: '/qr-orders', label: 'Table QR Orders', icon: BellRing, isLive: true },
  { path: '/inventory', label: 'Inventory', icon: Package },
  { path: '/customers', label: 'Customers', icon: Users },
  { path: '/payments', label: 'Payments', icon: CreditCard },
  { path: '/discounts', label: 'Promotions', icon: Tag },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/integrations', label: 'Integrations', icon: Puzzle },
  { path: '/audit-log', label: 'Audit Trail', icon: Shield },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout() {
  const { toggleTheme, isDark } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [audioLocked, setAudioLocked] = useState(true);
  const [updateProgress, setUpdateProgress] = useState(null);
  const { user, token } = useSelector((s) => s.auth);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const unlock = () => {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().then(() => {
          setAudioLocked(false);
          window.removeEventListener('click', unlock);
          window.removeEventListener('keydown', unlock);
          window.removeEventListener('touchstart', unlock);
        });
      } else {
        setAudioLocked(false);
      }
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  useEffect(() => {
    if (!window.electron?.onUpdateProgress) return;
    const unsub = window.electron.onUpdateProgress((data) => setUpdateProgress(data.percent));
    return unsub;
  }, []);

  const navItems = user?.role === 'super_admin' ? superAdminNav : ownerNav;

  useEffect(() => {
    if (user?.primary_color) {
      document.documentElement.style.setProperty('--accent', user.primary_color);
      document.documentElement.style.setProperty('--accent-hover', user.primary_color + 'dd');
    }
  }, [user]);

  useEffect(() => {
    if (!user?.outlet_id || !token) return;
    const socket = io(`${import.meta.env.VITE_API_URL || window.location.origin}/orders`, {
      auth: { token },
      transports: ['websocket'],
    });
    socket.on('connect', () => socket.emit('join_outlet', user.outlet_id));
    socket.on('new_online_order', (data) => setPendingOrders((prev) => [...prev, data]));
    socket.on('new_online_order_cleared', (data) => {
      setPendingOrders((prev) => prev.filter((o) => o.order_id !== data.order_id));
    });
    return () => socket.disconnect();
  }, [user?.outlet_id, token]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const showWizard = user?.role === 'owner' && !user?.head_office?.setup_completed;

  const outletName = user?.outlet?.name || 'MS-RM System';

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <DunningBanner user={user} />

      {/* Update download progress bar */}
      {updateProgress !== null && (
        <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-white" style={{ background: '#2563eb' }}>
          <div className="flex-1 bg-blue-400/40 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-300"
              style={{ width: `${updateProgress}%` }}
            />
          </div>
          <span className="flex-shrink-0">
            {updateProgress < 100 ? `Downloading update… ${updateProgress}%` : 'Download complete — restart to apply'}
          </span>
        </div>
      )}

      {pendingOrders.length > 0 && (
        <IncomingOrderAlert
          order={pendingOrders[0]}
          audioLocked={audioLocked}
          audioCtx={audioCtxRef.current}
          onAccepted={() => setPendingOrders((prev) => prev.slice(1))}
          onRejected={() => setPendingOrders((prev) => prev.slice(1))}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {showWizard && <OwnerWizard headOffice={user.head_office} />}

        {/* ── Sidebar ── */}
        <aside
          className={`${collapsed ? 'w-[70px]' : 'w-[240px]'} flex-shrink-0 flex flex-col border-r transition-all duration-300`}
          style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}
        >
          {/* Brand */}
          <div
            className="h-14 flex items-center justify-between px-4 border-b flex-shrink-0"
            style={{ borderColor: 'var(--border)' }}
          >
            {!collapsed && (
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                  style={{ background: 'var(--accent)' }}
                >
                  M
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate leading-none" style={{ color: 'var(--text-primary)' }}>
                    MS-RM System
                  </p>
                  <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Restaurant Management
                  </p>
                </div>
              </div>
            )}
            {collapsed && (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs mx-auto"
                style={{ background: 'var(--accent)' }}
              >
                M
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md transition-colors flex-shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {navItems.map(({ path, label, icon: Icon, isLive }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    collapsed ? 'justify-center' : ''
                  } ${isActive ? 'sidebar-link-active' : 'sidebar-link'}`
                }
              >
                <div className="relative flex-shrink-0">
                  <Icon className="w-4 h-4" />
                  {isLive && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  )}
                </div>
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* User */}
          <div className="p-2 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            {!collapsed && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1" style={{ background: 'var(--bg-hover)' }}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ background: 'var(--accent)' }}
                >
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {user?.full_name || 'User'}
                  </p>
                  <p className="text-[10px] capitalize truncate" style={{ color: 'var(--text-secondary)' }}>
                    {user?.role?.replace('_', ' ') || 'Staff'}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${collapsed ? 'justify-center' : ''}`}
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <header
            className="h-14 flex items-center justify-between px-6 border-b flex-shrink-0"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {outletName}
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="p-2 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Notifications */}
              <button
                onClick={() => navigate('/running-orders')}
                className="relative p-2 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                <Bell className="w-4 h-4" style={{ color: pendingOrders.length > 0 ? 'var(--accent)' : 'var(--text-secondary)' }} />
                {pendingOrders.length > 0 && (
                  <span
                    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
                    style={{ background: 'var(--danger)', borderColor: 'var(--bg-card)' }}
                  />
                )}
              </button>

              {/* New order pill */}
              {pendingOrders.length > 0 && (
                <button
                  onClick={() => navigate('/running-orders')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {pendingOrders.length} New {pendingOrders.length === 1 ? 'Order' : 'Orders'}
                </button>
              )}

              {/* Settings */}
              <button
                onClick={() => navigate('/settings')}
                className="p-2 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-primary)' }}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
