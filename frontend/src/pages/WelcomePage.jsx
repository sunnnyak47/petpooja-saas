import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Receipt, LayoutGrid, UtensilsCrossed,
  Package, Users, BarChart3, Building2, ArrowRight,
  ChefHat, Zap, Globe, Shield
} from 'lucide-react';

const features = [
  { icon: ShoppingCart,    label: 'Order Management',    desc: 'Dine-in, takeaway & delivery orders in one flow' },
  { icon: Receipt,         label: 'Billing & Invoices',  desc: 'Fast checkout, split bills, digital receipts' },
  { icon: LayoutGrid,      label: 'Table Management',    desc: 'Live table status, reservations & floor maps' },
  { icon: UtensilsCrossed, label: 'Menu Management',     desc: 'Categories, modifiers, pricing & availability' },
  { icon: Package,         label: 'Inventory & Stock',   desc: 'Real-time stock tracking with low-stock alerts' },
  { icon: Users,           label: 'Staff Management',    desc: 'Roles, shifts, attendance & access control' },
  { icon: BarChart3,       label: 'Sales & Analytics',   desc: 'Revenue reports, trends & performance metrics' },
  { icon: Building2,       label: 'Multi-Branch',        desc: 'Unified control across all your locations' },
];

const highlights = [
  { icon: Zap,    text: 'Lightning-fast POS' },
  { icon: Globe,  text: 'Works offline' },
  { icon: Shield, text: 'Secure & reliable' },
  { icon: ChefHat,text: 'Kitchen display' },
];

export default function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* ── Top Nav ── */}
      <header className="flex items-center justify-between px-8 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'var(--accent)' }}>
            <ChefHat size={20} className="text-white" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>MSRM</span>
            <span className="text-base font-light ml-1" style={{ color: 'var(--text-secondary)' }}>System</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            Superadmin Portal
          </span>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary btn-sm"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="flex flex-col lg:flex-row items-center gap-12 px-8 lg:px-16 py-16 flex-1 max-w-7xl mx-auto w-full">

        {/* Left — Copy */}
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6 border" style={{ color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
            <Building2 size={12} />
            Multi-Branch Restaurant ERP
          </div>

          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-[1.15] mb-5">
            Run Every Branch.<br />
            <span style={{ color: 'var(--accent)' }}>From One Dashboard.</span>
          </h1>

          <p className="text-base leading-relaxed mb-8 max-w-xl" style={{ color: 'var(--text-secondary)' }}>
            MSRM System is a complete restaurant ERP — orders, billing, tables, inventory, staff, and analytics — built for multi-branch restaurant groups that demand reliability and speed.
          </p>

          {/* Highlight pills */}
          <div className="flex flex-wrap gap-2 mb-10">
            {highlights.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                <Icon size={12} style={{ color: 'var(--accent)' }} />
                {text}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="btn-primary btn-lg flex items-center gap-2 group"
            >
              Get Started
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Central control for all branches
            </span>
          </div>
        </div>

        {/* Right — Hero visual */}
        <div className="flex-shrink-0 w-full lg:w-[420px]">
          <HeroVisual />
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section className="px-8 lg:px-16 pb-16 max-w-7xl mx-auto w-full">
        <div className="text-center mb-10">
          <h2 className="text-xl font-bold mb-2">Everything your restaurant needs</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Eight core modules, one unified platform</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {features.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="card-hover group p-5 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
                <Icon size={20} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5">{label}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Multi-branch callout ── */}
      <section className="mx-8 lg:mx-16 mb-12 rounded-2xl overflow-hidden max-w-7xl self-center w-full" style={{ background: 'var(--accent)' }}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-8 py-7">
          <div className="text-white">
            <p className="text-lg font-bold mb-1">Manage multiple restaurant branches from one dashboard</p>
            <p className="text-sm opacity-80">Superadmin controls: branch setup, user roles, billing, and platform-wide analytics</p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex-shrink-0 bg-white font-semibold text-sm px-6 py-3 rounded-xl transition-opacity hover:opacity-90 flex items-center gap-2"
            style={{ color: 'var(--accent)' }}
          >
            Access Dashboard <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t px-8 py-4 flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
        <span>MSRM System · Multi-Branch Restaurant ERP</span>
        <span>© {new Date().getFullYear()} · v2.0.3</span>
      </footer>

    </div>
  );
}

/* ── Inline SVG hero illustration ── */
function HeroVisual() {
  return (
    <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {/* Gradient background */}
      <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, transparent 60%)' }} />

      {/* Mock dashboard UI */}
      <div className="absolute inset-0 p-5 flex flex-col gap-3">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded" style={{ background: 'var(--accent)' }} />
            <div className="h-2.5 w-24 rounded-full" style={{ background: 'var(--border)' }} />
          </div>
          <div className="flex gap-1.5">
            {[...Array(3)].map((_, i) => <div key={i} className="w-5 h-5 rounded-lg" style={{ background: 'var(--bg-hover)' }} />)}
          </div>
        </div>

        {/* Stat cards row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Revenue', val: '₹1.24L', color: '#16a34a' },
            { label: 'Orders', val: '348', color: 'var(--accent)' },
            { label: 'Branches', val: '6', color: '#d97706' },
          ].map(({ label, val, color }) => (
            <div key={label} className="rounded-xl p-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <p className="text-[9px] font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
              <p className="text-sm font-bold" style={{ color }}>{val}</p>
            </div>
          ))}
        </div>

        {/* Chart placeholder */}
        <div className="flex-1 rounded-xl border p-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <p className="text-[9px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Sales Trend · All Branches</p>
          <div className="flex items-end gap-1 h-16">
            {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm transition-all" style={{ height: `${h}%`, background: i === 10 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 35%, transparent)' }} />
            ))}
          </div>
        </div>

        {/* Table status row */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { n: 'T1', s: 'occupied' },
            { n: 'T2', s: 'free' },
            { n: 'T3', s: 'occupied' },
            { n: 'T4', s: 'free' },
            { n: 'T5', s: 'reserved' },
          ].map(({ n, s }) => (
            <div key={n} className="rounded-lg p-2 text-center border" style={{
              background: s === 'occupied' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : s === 'reserved' ? 'color-mix(in srgb, #d97706 12%, transparent)' : 'var(--bg-hover)',
              borderColor: s === 'occupied' ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : s === 'reserved' ? 'color-mix(in srgb, #d97706 30%, transparent)' : 'var(--border)',
            }}>
              <p className="text-[9px] font-bold" style={{ color: s === 'occupied' ? 'var(--accent)' : s === 'reserved' ? '#d97706' : 'var(--text-secondary)' }}>{n}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
