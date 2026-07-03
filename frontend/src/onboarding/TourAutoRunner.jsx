/**
 * Watches the route and auto-starts the matching module tour the first time a
 * tenant user visits that screen — once only, and never for the platform/superadmin
 * console. Skips while a welcome hasn't been shown or the user muted auto-tours;
 * the "?" help menu can still replay any tour on demand.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTour } from './TourProvider';
import { TOURS } from './tours';

const TENANT_ROLES = ['owner', 'manager', 'cashier', 'captain', 'waiter', 'chef', 'delivery'];

export default function TourAutoRunner() {
  const { pathname } = useLocation();
  const tour = useTour();
  const user = useSelector((s) => s.auth.user);
  const lastRun = useRef(null);

  useEffect(() => {
    if (!tour || !user) return;
    if (!TENANT_ROLES.includes(user.role)) return;   // never on the superadmin console
    if (!tour.hasWelcomed() || tour.isMuted()) return;
    if (!TOURS[pathname] || tour.isDone(pathname) || tour.isRunning) return;
    if (lastRun.current === pathname) return;
    lastRun.current = pathname;
    const t = setTimeout(() => {
      // Re-check the guards at fire time (route may have changed / tour started).
      if (!tour.isRunning && !tour.isDone(pathname) && !tour.isMuted()) tour.startTour(pathname);
    }, 650);
    return () => clearTimeout(t);
  }, [pathname, tour, user]);

  return null;
}
