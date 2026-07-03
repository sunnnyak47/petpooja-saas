/**
 * First-login welcome. Shows once for a tenant user who has finished the setup
 * wizard but hasn't seen the product tour yet. "Take a quick tour" fires the
 * dashboard tour and leaves per-screen tours to auto-run as they explore;
 * "Maybe later" mutes auto-tours (they can still replay from the "?" menu).
 */
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Sparkles, PlayCircle } from 'lucide-react';
import { useTour } from '../../onboarding/TourProvider';

const TENANT_ROLES = ['owner', 'manager', 'cashier', 'captain', 'waiter', 'chef', 'delivery'];

export default function WelcomeModal() {
  const tour = useTour();
  const user = useSelector((s) => s.auth.user);
  const [open, setOpen] = useState(
    () => !!tour && !tour.hasWelcomed() && TENANT_ROLES.includes(user?.role)
  );
  if (!open || !tour) return null;

  const name = user?.full_name?.split(' ')[0] || 'there';

  const startTour = () => { tour.setWelcomed(); tour.setMuted(false); setOpen(false); tour.startTour('/'); };
  const later = () => { tour.setWelcomed(); tour.setMuted(true); setOpen(false); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100050, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 440, maxWidth: '94vw', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 18, boxShadow: '0 30px 70px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--accent)', padding: '22px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={22} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Welcome, {name} 👋</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, opacity: 0.9 }}>Your restaurant is set up — let's show you around.</p>
          </div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            A quick 60-second walkthrough of your dashboard, POS and kitchen screen. Each screen also has its own short tour the
            first time you open it — and you can replay any of them from the <strong style={{ color: 'var(--text-primary)' }}>“?”</strong> in the top bar.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={startTour} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 0', borderRadius: 11, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              <PlayCircle size={18} /> Take a quick tour
            </button>
            <button onClick={later} style={{ padding: '12px 18px', borderRadius: 11, border: '1px solid var(--border)',
              background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
