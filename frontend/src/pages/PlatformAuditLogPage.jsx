/**
 * PlatformAuditLogPage — SuperAdmin platform audit trail.
 * Route: /platform-audit-log (super_admin only)
 * Recent platform-owner actions: chain suspend/activate, plan changes, region
 * switches, impersonation, owner-password resets — newest first.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ScrollText, RefreshCw, Loader2 } from 'lucide-react';

const ACTION_META = {
  SUPERADMIN_IMPERSONATION:        { label: 'Impersonated owner', color: '#6366f1' },
  SUPERADMIN_RESET_OWNER_PASSWORD: { label: 'Reset owner login',  color: '#f59e0b' },
  CHAIN_SUSPENDED:                 { label: 'Suspended chain',    color: '#ef4444' },
  CHAIN_ACTIVATED:                 { label: 'Activated chain',    color: '#16a34a' },
  PLAN_ASSIGNED:                   { label: 'Changed plan',       color: '#8b5cf6' },
  REGION_SWITCHED:                 { label: 'Switched region',    color: '#3b82f6' },
  CHAIN_REGION_SWITCHED:           { label: 'Switched region',    color: '#3b82f6' },
};

function fmtWhen(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleString(); } catch { return '—'; }
}

export default function PlatformAuditLogPage() {
  const [limit] = useState(100);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['superadmin-audit-log', limit],
    queryFn: () => api.get(`/superadmin/audit-log?limit=${limit}`).then(r => r.data || []),
    staleTime: 30_000,
  });
  const rows = Array.isArray(data) ? data : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <ScrollText className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Audit Trail</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Recent platform actions — who did what, to which chain, when
            </p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading audit trail…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Couldn't load the audit trail</p>
            <button onClick={() => refetch()} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <ScrollText className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No platform actions recorded yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Action</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Chain</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>By</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const meta = ACTION_META[r.action] || { label: r.action, color: 'var(--text-secondary)' };
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{r.chain || '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.actor || 'super_admin'}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtWhen(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
