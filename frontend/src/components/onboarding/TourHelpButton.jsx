/**
 * "?" help button for the top bar. Opens a menu to replay the tour for the
 * current screen or any module, plus reset all tours. Every tour is discoverable
 * here, so the walkthrough is never a one-shot the user can lose.
 */
import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpCircle, PlayCircle, RotateCcw } from 'lucide-react';
import { useTour } from '../../onboarding/TourProvider';
import { TOURS } from '../../onboarding/tours';

export default function TourHelpButton() {
  const tour = useTour();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!tour) return null;
  const here = TOURS[pathname];
  const entries = Object.entries(TOURS);

  const run = (id) => { setOpen(false); tour.startTour(id); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Help & tours"
        className="p-2 rounded-lg border transition-colors"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 260, zIndex: 100060,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 18px 44px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Guided tours</p>
          </div>
          {here && (
            <button onClick={() => run(pathname)} style={rowStyle(true)}>
              <PlayCircle size={16} style={{ color: 'var(--accent)' }} />
              <span>Tour this screen · <strong>{here.name}</strong></span>
            </button>
          )}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {entries.map(([id, t]) => (
              <button key={id} onClick={() => run(id)} style={rowStyle(false)}>
                <span style={{ width: 16 }} />
                <span style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                {tour.isDone(id) && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-secondary)' }}>seen</span>}
              </button>
            ))}
          </div>
          <button onClick={() => { tour.resetAll(); setOpen(false); }} style={{ ...rowStyle(false), borderTop: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <RotateCcw size={15} /> <span>Reset all tours</span>
          </button>
        </div>
      )}
    </div>
  );
}

const rowStyle = (accent) => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px',
  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13,
  color: accent ? 'var(--text-primary)' : 'var(--text-secondary)',
});
