/**
 * GetStartedChecklist — non-blocking "finish your setup" card for owners.
 * Reads /ho/onboarding-status (computed from real data), links each step to the
 * right page, and disappears once everything's done or the owner dismisses it.
 */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, X, Rocket, ChevronRight } from 'lucide-react';
import api from '../../lib/api';

const ITEMS = [
  { key: 'brand', label: 'Brand your workspace', hint: 'Colour & logo', to: '/settings' },
  { key: 'tax', label: 'Add tax & legal details', hint: 'GSTIN / ABN', to: '/settings' },
  { key: 'menu', label: 'Add your first menu item', hint: 'Build your menu', to: '/menu' },
  { key: 'table', label: 'Set up a table / QR code', hint: 'For dine-in & QR orders', to: '/tables' },
  { key: 'order', label: 'Ring up a test order', hint: 'See the POS in action', to: '/pos' },
];

export default function GetStartedChecklist() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api.get('/ho/onboarding-status').then((r) => r.data),
    staleTime: 30_000,
  });

  const dismissMut = useMutation({
    mutationFn: () => api.post('/ho/onboarding-dismiss'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-status'] }),
  });

  if (!data || !data.applicable || data.dismissed) return null;
  const steps = data.steps || {};
  const done = data.completed_count || 0;
  if (done >= (data.total || 5)) return null; // all done → hide

  const pct = Math.round((done / (data.total || 5)) * 100);

  return (
    <div data-tour="dash.checklist" className="rounded-2xl border overflow-hidden mb-6" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
            <Rocket className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Get started ({done}/{data.total || 5})</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Finish setup to get the most out of your POS</p>
          </div>
        </div>
        <button onClick={() => dismissMut.mutate()} disabled={dismissMut.isPending}
          title="Dismiss" className="p-1.5 rounded-lg hover:opacity-70 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* progress bar */}
      <div className="px-5">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
      </div>

      <div className="p-2">
        {ITEMS.map((item) => {
          const complete = !!steps[item.key];
          return (
            <button key={item.key} onClick={() => navigate(item.to)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:opacity-90"
              style={{ background: 'transparent' }}>
              {complete
                ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#16a34a' }} />
                : <Circle className="w-5 h-5 shrink-0" style={{ color: 'var(--text-secondary)' }} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)', textDecoration: complete ? 'line-through' : 'none', opacity: complete ? 0.6 : 1 }}>
                  {item.label}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.hint}</p>
              </div>
              {!complete && <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
