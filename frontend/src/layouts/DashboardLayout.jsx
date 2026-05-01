import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { logout } from '../store/slices/authSlice';
import { SOCKET_URL } from '../lib/api';
import { useTheme } from '../themes/ThemeContext';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, UtensilsCrossed,
  Users, BarChart3, LogOut, ChevronLeft, Bell, Settings, Package,
  ShieldCheck, ChefHat, CreditCard, Tag, Puzzle, Shield, Clock,
  QrCode, BellRing, Sun, Moon, Warehouse, Heart, Globe, Zap, Sparkles, ShieldAlert,
  CalendarDays, Link2, ShoppingBag, Timer,
} from 'lucide-react';
import OwnerWizard from '../components/onboarding/OwnerWizard';
import DunningBanner from '../components/onboarding/DunningBanner';
import IncomingOrderAlert from '../components/POS/IncomingOrderAlert';

const superAdminNav = [
  { section: 'Platform' },
  { path: '/',            label: 'Analytics',         icon: BarChart3 },
  { path: '/super-admin', label: 'Restaurant Chains', icon: ShieldCheck },
  { section: 'System' },
  { path: '/audit-log',   label: 'System Logs',       icon: ClipboardList },
  { path: '/billing',     label: 'SaaS Revenue',      icon: ShoppingCart },
  { path: '/settings',    label: 'Settings',          icon: Settings },
];

const ownerNav = [
  { section: 'Operations' },
  { path: '/',               label: 'Dashboard',       icon: LayoutDashboard },
  { path: '/pos',            label: 'POS Terminal',    icon: ShoppingCart },
  { path: '/running-orders', label: 'Live Orders',     icon: Clock,    isLive: true },
  { path: '/kitchen',        label: 'Kitchen Display', icon: ChefHat },
  { section: 'Management' },
  { path: '/orders',         label: 'Order History',   icon: ClipboardList },
  { path: '/menu',           label: 'Menu',            icon: UtensilsCrossed },
  { path: '/inventory',        label: 'Inventory',       icon: Package },
  { path: '/purchase-orders',  label: 'Purchase Orders', icon: ShoppingBag },
  { path: '/central-kitchen', label: 'Central Kitchen', icon: Warehouse },
  { path: '/customers',      label: 'Customers',       icon: Users },
  { path: '/crm',            label: 'Loyalty & CRM',   icon: Heart },
  { path: '/ondc',           label: 'ONDC',            icon: Globe },
  { path: '/pricing',         label: 'Dynamic Pricing',  icon: Zap },
  { path: '/festival',        label: 'Festival Mode',    icon: Sparkles },
  { path: '/fraud',           label: 'Fraud Detection',  icon: ShieldAlert },
  { section: 'Revenue' },
  { path: '/payments',       label: 'Payments',        icon: CreditCard },
  { path: '/discounts',      label: 'Promotions',      icon: Tag },
  { path: '/reports',        label: 'Reports',         icon: BarChart3 },
  { section: 'System' },
  { path: '/qr-codes',       label: 'QR Codes',        icon: QrCode },
  { path: '/qr-orders',      label: 'QR Orders',       icon: BellRing, isLive: true },
  { path: '/integrations',   label: 'Integrations',    icon: Puzzle },
  { path: '/audit-log',      label: 'Audit Trail',     icon: Shield },
  { path: '/rostering',       label: 'Rostering',       icon: CalendarDays },
  { path: '/au-integrations', label: 'AU Integrations', icon: Link2 },
  { path: '/aggregators',     label: 'Aggregators',     icon: ShoppingBag },
  { path: '/online-orders',   label: 'Online Orders',   icon: Globe, isLive: true },
  { path: '/prep-analytics',  label: 'Prep Analytics',  icon: BarChart3 },
  { path: '/eod-report',      label: 'EOD Report',      icon: ClipboardList },
  { path: '/settings',       label: 'Settings',        icon: Settings },
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
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AC();
    const unlock = () => {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().then(() => {
          setAudioLocked(false);
          ['click', 'keydown', 'touchstart'].forEach(e => window.removeEventListener(e, unlock));
        });
      } else { setAudioLocked(false); }
    };
    ['click', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, unlock));
    return () => ['click', 'keydown', 'touchstart'].forEach(e => window.removeEventListener(e, unlock));
  }, []);

  useEffect(() => {
    if (!window.electron?.onUpdateProgress) return;
    return window.electron.onUpdateProgress((d) => setUpdateProgress(d.percent));
  }, []);

  useEffect(() => {
    if (user?.primary_color) {
      document.documentElement.style.setProperty('--accent', user.primary_color);
      document.documentElement.style.setProperty('--accent-hover', user.primary_color + 'dd');
    }
  }, [user]);

  useEffect(() => {
    if (!user?.outlet_id || !token) return;
    const socket = io(`${SOCKET_URL}/orders`, {
      auth: { token }, transports: ['websocket'],
    });
    socket.on('connect', () => socket.emit('join_outlet', user.outlet_id));
    socket.on('new_online_order', (d) => setPendingOrders((p) => [...p, d]));
    socket.on('new_online_order_cleared', (d) =>
      setPendingOrders((p) => p.filter((o) =>
        (o.order_id || o.id) !== (d.order_id || d.id)
      ))
    );
    return () => socket.disconnect();
  }, [user?.outlet_id, token]);

  const handleLogout = () => { dispatch(logout()); navigate('/login'); };

  const navItems   = user?.role === 'super_admin' ? superAdminNav : ownerNav;
  const showWizard = user?.role === 'owner' && !(user?.head_office?.setup_complete ?? user?.head_office?.setup_completed);
  const outletName = user?.outlet?.name || 'MS-RM System';

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <DunningBanner user={user} />

      {updateProgress !== null && (
        <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.3)' }}>
            <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${updateProgress}%` }} />
          </div>
          <span className="flex-shrink-0">
            {updateProgress < 100 ? `Downloading update… ${updateProgress}%` : 'Ready — restart to apply'}
          </span>
        </div>
      )}

      {pendingOrders.length > 0 && (
        <IncomingOrderAlert
          order={pendingOrders[0]}
          audioLocked={audioLocked}
          audioCtx={audioCtxRef.current}
          onAccepted={() => setPendingOrders((p) => p.slice(1))}
          onRejected={() => setPendingOrders((p) => p.slice(1))}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {showWizard && <OwnerWizard headOffice={user.head_office} />}

        {/* ── Sidebar ── */}
        <aside
          className={`${collapsed ? 'w-[64px]' : 'w-[220px]'} flex-shrink-0 flex flex-col border-r transition-all duration-200`}
          style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}
        >
          {/* Brand header
              On macOS the traffic lights (⛔🟡🟢) sit at x:12 y:18 inside this
              56px-tall strip. We make the whole strip a drag region so the window
              can be moved by dragging the sidebar header, then push the brand
              content 78px from the left so it never collides with the buttons.
              On Windows/Linux there are no traffic lights so padding stays at 0.  */}
          <div
            className="h-14 flex items-center justify-between border-b flex-shrink-0"
            style={{
              borderColor: 'var(--border)',
              WebkitAppRegion: 'drag',        // makes this strip draggable (macOS)
              paddingLeft:  collapsed ? 0 : 'calc(env(titlebar-area-x, 0px) + 78px)',
              paddingRight: 12,
            }}
          >
            {!collapsed ? (
              <div className="flex items-center gap-2.5 min-w-0" style={{ WebkitAppRegion: 'no-drag' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: 'var(--accent)' }}>M</div>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>MS-RM System</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Restaurant Management</p>
                </div>
              </div>
            ) : (
              /* collapsed: centre icon, push it right of traffic lights */
              <div className="flex-1 flex justify-end" style={{ WebkitAppRegion: 'no-drag' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: 'var(--accent)' }}>M</div>
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: 'var(--text-secondary)', WebkitAppRegion: 'no-drag' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-2 px-2">
            {navItems.map((item, idx) => {
              if (item.section) {
                if (collapsed) return null;
                return (
                  <p
                    key={idx}
                    className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: 'var(--text-secondary)', opacity: 0.5, marginTop: idx === 0 ? 4 : 16 }}
                  >
                    {item.section}
                  </p>
                );
              }
              const { path, label, icon: Icon, isLive } = item;
              return (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 mb-0.5 ${collapsed ? 'justify-center' : ''} ${isActive ? 'sidebar-link-active' : 'sidebar-link'}`
                  }
                >
                  <div className="relative flex-shrink-0">
                    <Icon className="w-4 h-4" />
                    {isLive && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                  </div>
                  {!collapsed && <span className="truncate">{label}</span>}
                </NavLink>
              );
            })}
          </nav>

          {/* User + logout */}
          <div className="p-2 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            {!collapsed && (
              <div className="flex items-center gap-2 px-2 py-2 rounded-lg mb-1" style={{ background: 'var(--bg-hover)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: 'var(--accent)' }}>
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{user?.full_name || 'User'}</p>
                  <p className="text-[10px] capitalize" style={{ color: 'var(--text-secondary)' }}>{user?.role?.replace('_', ' ') || 'Staff'}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${collapsed ? 'justify-center' : ''}`}
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; e.currentTarget.style.color = '#dc2626'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Topbar — also a drag region so the window can be dragged from the top-right area */}
          <header className="h-14 flex items-center justify-between px-6 border-b flex-shrink-0" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', WebkitAppRegion: 'drag' }}>
            <div style={{ WebkitAppRegion: 'no-drag' }}>
              <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{outletName}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
              {pendingOrders.length > 0 && (
                <button
                  onClick={() => navigate('/running-orders')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {pendingOrders.length} New {pendingOrders.length === 1 ? 'Order' : 'Orders'}
                </button>
              )}

              <button
                onClick={() => navigate('/running-orders')}
                className="relative p-2 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                title="Running Orders"
              >
                <Bell className="w-4 h-4" style={{ color: pendingOrders.length > 0 ? 'var(--accent)' : undefined }} />
                {pendingOrders.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full border-2" style={{ background: 'var(--danger)', borderColor: 'var(--bg-card)' }} />
                )}
              </button>

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

              <button
                onClick={() => navigate('/settings')}
                className="p-2 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-primary)' }}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
