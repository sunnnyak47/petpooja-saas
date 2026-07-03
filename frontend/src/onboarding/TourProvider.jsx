/**
 * Product-tour engine (self-contained, no external dependency).
 *
 * One engine drives every module tour from the data-driven registry in tours.js.
 * A step may point at a `[data-tour="…"]` anchor (spotlight + popover beside it) or
 * omit the anchor (a centered explainer card). Missing anchors degrade gracefully to
 * centered steps, so a tour never breaks if a page hasn't added its anchors yet.
 *
 * Completion + preferences are kept in localStorage (per device) — tours are ephemeral
 * UI guidance, so no backend/migration is needed; the data-driven GetStartedChecklist
 * already tracks real activation.
 */
import { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { TOURS } from './tours';

const DONE_KEY = 'msrm_tour_done';
const WELCOME_KEY = 'msrm_tour_welcomed';
const MUTE_KEY = 'msrm_tour_muted';

const readDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch { return []; } };

const TourCtx = createContext(null);
export const useTour = () => useContext(TourCtx);

export function TourProvider({ children }) {
  const [tourId, setTourId] = useState(null);   // active tour id (a route key)
  const [idx, setIdx] = useState(0);            // current step index
  const [, force] = useState(0);                // re-render on resize/scroll

  const tour = tourId ? TOURS[tourId] : null;
  const steps = tour?.steps || [];
  const step = steps[idx] || null;

  const stop = useCallback(() => { setTourId(null); setIdx(0); }, []);

  const markDone = useCallback((id) => {
    const done = readDone();
    if (!done.includes(id)) { done.push(id); localStorage.setItem(DONE_KEY, JSON.stringify(done)); }
  }, []);

  const startTour = useCallback((id) => {
    if (!TOURS[id] || !TOURS[id].steps?.length) return;
    setIdx(0); setTourId(id);
  }, []);

  const finish = useCallback(() => { if (tourId) markDone(tourId); stop(); }, [tourId, markDone, stop]);

  const next = useCallback(() => {
    setIdx((i) => { if (i + 1 >= steps.length) { finish(); return i; } return i + 1; });
  }, [steps.length, finish]);
  const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  // Recompute anchor position on resize/scroll while a tour is active.
  useEffect(() => {
    if (!tour) return;
    const on = () => force((n) => n + 1);
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); };
  }, [tour]);

  // Scroll the current anchor into view when the step changes.
  useLayoutEffect(() => {
    if (!step?.anchor) return;
    const el = document.querySelector(step.anchor);
    if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* older browsers */ } }
    const t = setTimeout(() => force((n) => n + 1), 320); // reposition after scroll settles
    return () => clearTimeout(t);
  }, [step, tourId, idx]);

  // Esc closes the tour.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e) => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') back(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, finish, next, back]);

  const ctx = {
    startTour, stop, finish,
    isRunning: !!tour,
    isDone: (id) => readDone().includes(id),
    resetAll: () => { localStorage.removeItem(DONE_KEY); localStorage.removeItem(MUTE_KEY); },
    isMuted: () => localStorage.getItem(MUTE_KEY) === '1',
    setMuted: (v) => v ? localStorage.setItem(MUTE_KEY, '1') : localStorage.removeItem(MUTE_KEY),
    hasWelcomed: () => localStorage.getItem(WELCOME_KEY) === '1',
    setWelcomed: () => localStorage.setItem(WELCOME_KEY, '1'),
    markDone,
  };

  return (
    <TourCtx.Provider value={ctx}>
      {children}
      {tour && step && <TourOverlay tour={tour} step={step} idx={idx} total={steps.length}
        onNext={next} onBack={back} onClose={finish} />}
    </TourCtx.Provider>
  );
}

function TourOverlay({ tour, step, idx, total, onNext, onBack, onClose }) {
  const el = step.anchor ? document.querySelector(step.anchor) : null;
  const rect = el ? el.getBoundingClientRect() : null;
  const pad = 6;
  const last = idx + 1 >= total;

  // Popover placement: below the anchor if it fits, else above; clamp to viewport.
  const popRef = useRef(null);
  const [pop, setPop] = useState({ left: 0, top: 0, centered: !rect });
  useLayoutEffect(() => {
    if (!rect) { setPop({ centered: true }); return; }
    const w = popRef.current?.offsetWidth || 320;
    const h = popRef.current?.offsetHeight || 160;
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = rect.bottom + 12;
    if (top + h > vh - 12) top = Math.max(12, rect.top - h - 12);
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(12, Math.min(left, vw - w - 12));
    setPop({ left, top, centered: false });
  }, [rect?.left, rect?.top, rect?.width, rect?.height, idx]);

  const card = (
    <div ref={popRef} style={{
      position: 'fixed', zIndex: 100002, width: 340, maxWidth: '92vw',
      ...(pop.centered
        ? { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
        : { left: pop.left, top: pop.top }),
      background: 'var(--bg-card)', color: 'var(--text-primary)',
      border: '1px solid var(--border)', borderRadius: 14,
      boxShadow: '0 24px 60px rgba(0,0,0,0.35)', padding: '16px 16px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
          {tour.name} · {idx + 1}/{total}
        </span>
        <button onClick={onClose} aria-label="Close tour"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2 }}>
          <X size={16} />
        </button>
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 5px', color: 'var(--text-primary)' }}>{step.title}</p>
      <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: 'var(--text-secondary)' }}>{step.body}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
          Skip tour
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {idx > 0 && (
            <button onClick={onBack} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
            }}><ArrowLeft size={14} /> Back</button>
          )}
          <button onClick={onNext} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff',
          }}>
            {last ? <>Done <Check size={14} /></> : <>Next <ArrowRight size={14} /></>}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {rect ? (
        // Spotlight: a transparent window at the anchor with a huge box-shadow dimming everything else.
        <div style={{
          position: 'fixed', zIndex: 100000,
          left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 10, boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)', border: '2px solid var(--accent)',
          pointerEvents: 'none', transition: 'all 0.2s ease',
        }} />
      ) : (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15,23,42,0.55)' }} />
      )}
      {card}
    </>,
    document.body
  );
}
