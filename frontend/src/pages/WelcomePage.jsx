/**
 * WelcomePage — Professional landing page for MS-RM System.
 * Route: /welcome  (public, no auth required)
 * Buttons → /login  (ProtectedRoute guards handle post-login redirect)
 */
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useEffect, useState } from 'react';
import {
  ArrowRight, CheckCircle, ChefHat, BarChart3, Users,
  Package, Monitor, Truck, ClipboardList, LayoutGrid,
  Shield, Zap, Globe, Star,
} from 'lucide-react';

/* ─── mock POS order data shown in hero ─── */
const MOCK_ORDERS = [
  { id: '#1042', table: 'T-04', items: 'Butter Chicken, Garlic Naan ×2', amount: '₹560', status: 'preparing', time: '8m' },
  { id: '#1041', table: 'T-07', items: 'Dal Makhani, Jeera Rice, Raita', amount: '₹380', status: 'ready',     time: '2m' },
  { id: '#1040', table: 'T-02', items: 'Paneer Tikka, Lassi ×3',         amount: '₹720', status: 'served',    time: '—'  },
  { id: '#1039', table: 'Swiggy', items: 'Chicken Biryani, Mirchi Salan',amount: '₹490', status: 'preparing', time: '14m'},
];

const MOCK_MENU = [
  { name: 'Butter Chicken',  price: '₹320', cat: 'Mains',     dot: '#ef4444' },
  { name: 'Paneer Tikka',    price: '₹280', cat: 'Starters',  dot: '#22c55e' },
  { name: 'Garlic Naan',     price: '₹60',  cat: 'Breads',    dot: '#22c55e' },
  { name: 'Dal Makhani',     price: '₹220', cat: 'Mains',     dot: '#22c55e' },
  { name: 'Chicken Biryani', price: '₹360', cat: 'Specials',  dot: '#ef4444' },
  { name: 'Mango Lassi',     price: '₹120', cat: 'Beverages', dot: '#22c55e' },
];

const STATUS_STYLE = {
  preparing: { bg: '#fef3c7', color: '#92400e', label: 'Preparing' },
  ready:     { bg: '#d1fae5', color: '#065f46', label: 'Ready'     },
  served:    { bg: '#ede9fe', color: '#5b21b6', label: 'Served'    },
};

/* ─── feature list ─── */
const FEATURES = [
  { icon: Monitor,       title: 'Kitchen Display System',     desc: 'Real-time KDS with station routing, priority queues and cook-time SLA tracking.' },
  { icon: LayoutGrid,    title: 'Floor Plan & Tables',        desc: 'Live table map with drag-and-drop, reservations, occupancy heatmap and QR menus.' },
  { icon: Package,       title: 'Inventory & Costing',        desc: 'Stock tracking, reorder alerts, recipe costing and purchase-order management.' },
  { icon: Users,         title: 'Staff & Rostering',          desc: 'Shift scheduling, attendance, RSA certification alerts and auto-roster from templates.' },
  { icon: Truck,         title: 'Aggregator Sync',            desc: 'Swiggy, Zomato, DoorDash and Menulog — menu push, order pull and live kanban.' },
  { icon: BarChart3,     title: 'Analytics & Reports',        desc: 'Revenue trends, peak-hour heatmaps, food-cost %, labour %, and EOD cash reconciliation.' },
  { icon: Globe,         title: 'Multi-Region (IN & AU)',     desc: 'AUD / INR currency, timezone, tax and regulatory profile switching per franchise.' },
  { icon: ClipboardList, title: 'End-of-Day Report',         desc: '5-step cash-close wizard with denomination count, discrepancy flagging and lock.' },
];

const STATS = [
  { value: '12+',  label: 'Integrated modules' },
  { value: '<1 s', label: 'POS load time'       },
  { value: '99.9%',label: 'Uptime SLA'           },
  { value: '4.9★', label: 'Operator rating'      },
];

/* ─── small reusable components ─── */
function Tag({ children, color = '#6366f1' }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.06em',
      background: color + '18',
      color,
      border: `1px solid ${color}33`,
    }}>
      {children}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(15,23,42,0.07)', margin: '0' }} />;
}

/* ─── hero mock UI ─── */
function HeroMockUI() {
  const [activeTab, setActiveTab] = useState('orders');

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      boxShadow: '0 24px 80px rgba(15,23,42,0.18)',
      overflow: 'hidden',
      border: '1px solid rgba(15,23,42,0.08)',
      userSelect: 'none',
    }}>
      {/* title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px',
        background: '#0f172a',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8, fontWeight: 600, letterSpacing: '0.04em' }}>
          MS-RM System — Restaurant Dashboard
        </span>
      </div>

      {/* inner layout */}
      <div style={{ display: 'flex', height: 340 }}>

        {/* sidebar */}
        <div style={{ width: 150, background: '#0f172a', padding: '12px 0', flexShrink: 0 }}>
          {[
            { id: 'orders', label: 'Live Orders' },
            { id: 'menu',   label: 'Menu'        },
            { id: 'kds',    label: 'Kitchen KDS' },
            { id: 'staff',  label: 'Staff'       },
            { id: 'reports',label: 'Reports'     },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 16px', fontSize: 12, fontWeight: 600,
                background: activeTab === item.id ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: activeTab === item.id ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                border: 'none', cursor: 'pointer',
                borderLeft: activeTab === item.id ? '3px solid #6366f1' : '3px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* main panel */}
        <div style={{ flex: 1, padding: 16, overflow: 'hidden', background: '#f8fafc' }}>

          {activeTab === 'orders' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Live Orders</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e',
                  padding: '2px 8px', borderRadius: 99,
                }}>4 active</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {MOCK_ORDERS.map(order => {
                  const s = STATUS_STYLE[order.status];
                  return (
                    <div key={order.id} style={{
                      background: '#fff', borderRadius: 8, padding: '8px 10px',
                      border: '1px solid rgba(15,23,42,0.07)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a' }}>{order.id}</span>
                          <span style={{ fontSize: 10, color: '#64748b' }}>{order.table}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {order.items}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{order.amount}</div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                          background: s.bg, color: s.color,
                        }}>{s.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'menu' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Menu Items</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {MOCK_MENU.map(item => (
                  <div key={item.name} style={{
                    background: '#fff', borderRadius: 8, padding: '8px 10px',
                    border: '1px solid rgba(15,23,42,0.07)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, border: `2px solid ${item.dot}`, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.cat}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{item.price}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {(activeTab === 'kds' || activeTab === 'staff' || activeTab === 'reports') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {activeTab === 'kds'     && <Monitor size={20} color="#fff" />}
                {activeTab === 'staff'   && <Users size={20} color="#fff" />}
                {activeTab === 'reports' && <BarChart3 size={20} color="#fff" />}
              </div>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                {activeTab === 'kds'     ? 'Kitchen Display System' : ''}
                {activeTab === 'staff'   ? 'Staff & Rostering'      : ''}
                {activeTab === 'reports' ? 'Analytics & Reports'    : ''}
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Click "Launch Dashboard" to access</span>
            </div>
          )}

        </div>
      </div>

      {/* bottom bar */}
      <div style={{
        padding: '8px 16px',
        background: '#0f172a',
        display: 'flex', gap: 16, alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        {[
          { dot: '#22c55e', label: 'Backend connected' },
          { dot: '#6366f1', label: '3 tables occupied'  },
          { dot: '#f59e0b', label: '2 orders in KDS'    },
        ].map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.dot }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── main page ─── */
export default function WelcomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useSelector(s => s.auth);

  // If already logged in, skip welcome and go straight to dashboard
  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const goLogin = () => navigate('/login');

  return (
    <div style={{
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#f8fafc',
      color: '#0f172a',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.55s ease both; }
        .btn-primary { transition: background 0.18s, box-shadow 0.18s, transform 0.18s; }
        .btn-primary:hover { background: #4f46e5 !important; box-shadow: 0 8px 24px rgba(79,70,229,0.35) !important; transform: translateY(-1px); }
        .btn-ghost:hover { background: rgba(15,23,42,0.06) !important; }
        .feature-card:hover { box-shadow: 0 8px 32px rgba(15,23,42,0.1) !important; transform: translateY(-2px); }
        .feature-card { transition: box-shadow 0.2s, transform 0.2s; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(248,250,252,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(15,23,42,0.08)',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChefHat size={17} color="#fff" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em', color: '#0f172a' }}>
            MS-RM System
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={goLogin}
            className="btn-ghost"
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569',
            }}
          >
            Sign in
          </button>
          <button
            onClick={goLogin}
            className="btn-primary"
            style={{
              padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
            }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        padding: 'clamp(48px, 8vw, 96px) 32px clamp(32px, 5vw, 64px)',
        maxWidth: 1160, margin: '0 auto',
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 48, alignItems: 'center',
      }}>
        {/* left copy */}
        <div className="fade-up">
          <Tag color="#6366f1">Restaurant Management Platform</Tag>

          <h1 style={{
            fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: 800,
            lineHeight: 1.1, letterSpacing: '-0.03em',
            margin: '20px 0 20px',
            color: '#0f172a',
          }}>
            Run your restaurant
            <br />
            <span style={{ color: '#6366f1' }}>smarter, faster,</span>
            <br />
            and without the chaos.
          </h1>

          <p style={{
            fontSize: 16, color: '#475569', lineHeight: 1.7,
            marginBottom: 32, maxWidth: 440,
          }}>
            One platform for your POS, kitchen display, inventory, staff rostering,
            aggregator orders and end-of-day reports — built for Indian and Australian franchises.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 36 }}>
            <button
              onClick={goLogin}
              className="btn-primary"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              }}
            >
              Launch Dashboard
              <ArrowRight size={16} />
            </button>
            <button
              onClick={goLogin}
              className="btn-ghost"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: '#fff', color: '#0f172a',
                border: '1px solid rgba(15,23,42,0.12)',
                cursor: 'pointer', boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
              }}
            >
              Open POS
            </button>
          </div>

          {/* trust proof */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { icon: Shield, text: 'Secure & offline-ready' },
              { icon: Zap,    text: 'Under 1s load time'    },
              { icon: Star,   text: '4.9 operator rating'   },
            ].map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={14} color="#6366f1" />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* right: interactive mock */}
        <div className="fade-up" style={{ animationDelay: '0.15s' }}>
          <HeroMockUI />
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div style={{ background: '#0f172a' }}>
        <div style={{
          maxWidth: 1160, margin: '0 auto',
          padding: '36px 32px',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 24, textAlign: 'center',
        }}>
          {STATS.map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.03em', marginBottom: 4 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.04em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: 'clamp(48px,7vw,80px) 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Tag color="#10b981">Platform capabilities</Tag>
          <h2 style={{
            fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 800,
            letterSpacing: '-0.02em', marginTop: 16, marginBottom: 12, color: '#0f172a',
          }}>
            Everything your restaurant needs, built in.
          </h2>
          <p style={{ fontSize: 15, color: '#64748b', maxWidth: 480, margin: '0 auto' }}>
            No patchwork of third-party apps. MS-RM handles the full operation from first order to end-of-day lock.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="feature-card"
              style={{
                background: '#fff', borderRadius: 12, padding: '20px',
                border: '1px solid rgba(15,23,42,0.07)',
                boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 14,
              }}>
                <Icon size={18} color="#6366f1" />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginBottom: 7 }}>
                {title}
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
                {desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CHECK LIST / WHY ── */}
      <section style={{ background: '#f1f5f9' }}>
        <div style={{
          maxWidth: 1160, margin: '0 auto',
          padding: 'clamp(48px,7vw,80px) 32px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center',
        }}>
          <div>
            <Tag color="#f59e0b">Why operators choose MS-RM</Tag>
            <h2 style={{
              fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800,
              letterSpacing: '-0.02em', margin: '16px 0 20px', color: '#0f172a',
            }}>
              Built for real restaurant operations, not demos.
            </h2>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, marginBottom: 28 }}>
              Designed hand-in-hand with restaurant owners and franchise operators
              across India and Australia. Every feature ships with a working backend,
              not a mockup.
            </p>
            <button
              onClick={goLogin}
              className="btn-primary"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 22px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              }}
            >
              Start managing your restaurant <ArrowRight size={15} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              'Full offline support — POS works without internet',
              'Real-time kitchen display synced to every order',
              'Aggregator orders from Swiggy, Zomato, DoorDash & Menulog',
              'Franchise-level head-office reports across all locations',
              'Inventory recipe costing down to per-dish ingredient cost',
              'RSA certification and rostering alerts for Australian franchises',
              'End-of-day cash reconciliation with denomination count and lock',
              'Voice POS — speak orders in Hindi, Tamil, English and more',
            ].map(point => (
              <div key={point} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <CheckCircle size={16} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)',
        padding: 'clamp(48px,7vw,72px) 32px',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 800,
          color: '#fff', marginBottom: 16, letterSpacing: '-0.02em',
        }}>
          Ready to run a better restaurant?
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', marginBottom: 32 }}>
          Sign in and have your first order on screen in under two minutes.
        </p>
        <button
          onClick={goLogin}
          className="btn-primary"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700,
            background: '#fff', color: '#4f46e5', border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          Launch MS-RM System <ArrowRight size={17} />
        </button>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#0f172a',
        padding: '24px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChefHat size={13} color="#fff" />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>
            MS-RM SYSTEM
          </span>
        </div>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.3)' }}>
          © 2026 Madsun Digital Marketing & Media Agency · All rights reserved
        </span>
      </footer>
    </div>
  );
}
