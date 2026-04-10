import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { logout } from '../store/slices/authSlice';
import {
  LayoutDashboard, ShoppingCart, ClipboardList, UtensilsCrossed,
  Users, BarChart3, LogOut, ChevronLeft, Bell, Settings, Package,
  ShieldCheck, ChefHat, CreditCard, Tag, Puzzle, Shield, Clock, QrCode
} from 'lucide-react';
import OwnerWizard from '../components/onboarding/OwnerWizard';
import DunningBanner from '../components/onboarding/DunningBanner';
import IncomingOrderAlert from '../components/pos/IncomingOrderAlert';

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
  { path: '/kitchen', label: 'Kitchen (KDS)', icon: ChefHat },
  { path: '/menu', label: 'Menu List', icon: UtensilsCrossed },
  { path: '/qr-codes', label: 'QR Codes', icon: QrCode },
  { path: '/inventory', label: 'Stock Master', icon: Package },
  { path: '/customers', label: 'Customers', icon: Users },
  { path: '/payments', label: 'Payments', icon: CreditCard },
  { path: '/discounts', label: 'Promotions', icon: Tag },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/integrations', label: 'Integrations', icon: Puzzle },
  { path: '/audit-log', label: 'Audit Trail', icon: Shield },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [pendingOrders, setPendingOrders] = useState([]); // Queue forIncomingOrderAlert
  const { user, token } = useSelector((s) => s.auth);

  const navItems = user?.role === 'super_admin' ? superAdminNav : ownerNav;

  useEffect(() => {
    if (user?.primary_color) {
      document.documentElement.style.setProperty('--brand-500', user.primary_color);
      document.documentElement.style.setProperty('--brand-600', user.primary_color + 'dd');
    }
  }, [user]);

  // Online Order Notifications
  useEffect(() => {
    if (!user?.outlet_id || !token) return;
    const socket = io(`${import.meta.env.VITE_API_URL || window.location.origin}/orders`, {
      auth: { token },
      transports: ['websocket']
    });

    socket.on('connect', () => {
      socket.emit('join_outlet', user.outlet_id);
    });

    socket.on('new_online_order', (data) => {
      setPendingOrders(prev => [...prev, data]);
    });

    socket.on('new_online_order_cleared', (data) => {
      setPendingOrders(prev => prev.filter(o => o.order_id !== data.order_id));
    });

    return () => socket.disconnect();
  }, [user?.outlet_id, token]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const showWizard = user?.role === 'owner' && !user?.head_office?.setup_completed;

  return (
    <div className="flex bg-surface-900 text-surface-100 flex-col h-screen overflow-hidden">
      <DunningBanner user={user} />
      
      {/* High Priority Incoming Order Alert */}
      {pendingOrders.length > 0 && (
        <IncomingOrderAlert 
          order={pendingOrders[0]} 
          onAccepted={() => setPendingOrders(prev => prev.slice(1))}
          onRejected={() => setPendingOrders(prev => prev.slice(1))}
        />
      )}
      
      <div className="flex flex-1 overflow-hidden">
        {showWizard && <OwnerWizard headOffice={user.head_office} />}

        {/* Sidebar */}
        <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-surface-800/50 backdrop-blur-xl border-r border-surface-700/50 flex flex-col transition-all duration-300`}>
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-surface-700/50">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm">P</div>
                <span className="font-bold text-lg bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">Petpooja</span>
              </div>
            )}
            {collapsed && <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-sm mx-auto">P</div>}
            <button onClick={() => setCollapsed(!collapsed)} className="p-1 hover:bg-surface-700 rounded-lg transition-colors" id="toggle-sidebar">
              <ChevronLeft className={`w-4 h-4 text-surface-400 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map(({ path, label, icon: Icon, isLive }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                  ${isActive
                    ? 'bg-brand-500/15 text-brand-400 shadow-sm shadow-brand-500/10'
                    : 'text-surface-400 hover:text-white hover:bg-surface-700/50'}`
                }
                id={`nav-${label.toLowerCase().replace(/\s+/g,'-')}`}
              >
                <div className="relative flex-shrink-0">
                  <Icon className="w-5 h-5" />
                  {isLive && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-surface-900 animate-pulse" />
                  )}
                </div>
                {!collapsed && <span className="flex-1">{label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* User */}
          <div className="p-3 border-t border-surface-700/50">
            <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} p-2`}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/30 to-brand-700/30 flex items-center justify-center text-brand-400 font-semibold text-sm flex-shrink-0">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.full_name || 'User'}</p>
                  <p className="text-xs text-surface-500 truncate">{user?.role || 'Staff'}</p>
                </div>
              )}
            </div>
            <button onClick={handleLogout} className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-all ${collapsed ? 'justify-center' : ''}`} id="btn-logout">
              <LogOut className="w-4 h-4" />
              {!collapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Topbar */}
          <header className="h-16 bg-surface-800/30 backdrop-blur-sm border-b border-surface-700/50 flex items-center justify-between px-6">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {user?.outlet?.name || 'Petpooja ERP'}
              </h2>
              <p className="text-xs text-surface-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
            <div className={`flex items-center gap-3 ${hasNewOnlineOrder ? 'animate-pulse' : ''}`}>
              <button onClick={() => { setHasNewOnlineOrder(false); navigate('/running-orders'); }} className="relative p-2 hover:bg-surface-700 rounded-xl transition-colors" id="btn-notifications">
                <Bell className={`w-5 h-5 ${hasNewOnlineOrder ? 'text-brand-400' : 'text-surface-400'}`} />
                {hasNewOnlineOrder && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-brand-500 rounded-full ring-2 ring-surface-800"></span>
                )}
              </button>
              {hasNewOnlineOrder && (
                <div onClick={() => { setHasNewOnlineOrder(false); navigate('/running-orders'); }} className="flex items-center gap-2 px-3 py-1 bg-brand-500/20 rounded-full border border-brand-500/30 cursor-pointer hover:bg-brand-500/30 transition-all">
                  <div className="w-2 h-2 bg-brand-500 rounded-full animate-ping" />
                  <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest">New Order</span>
                </div>
              )}
              <button className="p-2 hover:bg-surface-700 rounded-xl transition-colors" id="btn-settings">
                <Settings className="w-5 h-5 text-surface-400" />
              </button>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-6 bg-surface-900/50">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
