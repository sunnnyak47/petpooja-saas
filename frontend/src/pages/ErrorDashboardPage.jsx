/**
 * ErrorDashboardPage — SuperAdmin error & crash monitor.
 * Route: /error-dashboard (super_admin / sa.audit.view)
 * Live view of grouped backend + frontend errors with resolve controls.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Bug, AlertTriangle, RefreshCw, Loader2, CheckCircle2, Server, Monitor,
} from 'lucide-react';

const LEVEL_COLOR = {
  fatal: '#dc2626',
  error: '#ef4444',
  warn: '#f59e0b',
};
const SOURCE_COLOR = {
  backend: '#6366f1',
  frontend: '#0ea5e9',
};

function fmtWhen(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleString(); } catch { return '—'; }
}

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="rounded-2xl border p-4 flex items-center gap-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)` }}>
        <Icon className="w-5 h-5" style={{ color: tint }} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {value ?? '—'}
        </div>
        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
      style={active
        ? { background: 'var(--accent)', color: 'var(--accent-text, #fff)', borderColor: 'var(--accent)' }
        : { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
      {children}
    </button>
  );
}

function Badge({ label, color }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      {label}
    </span>
  );
}

export default function ErrorDashboardPage() {
  const queryClient = useQueryClient();
  const [resolvedFilter, setResolvedFilter] = useState('unresolved'); // 'unresolved' | 'all'
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'backend' | 'frontend'

  const statsQuery = useQuery({
    queryKey: ['error-stats'],
    queryFn: () => api.get('/monitoring/stats').then(r => r.data || {}),
    staleTime: 20_000,
  });

  const listQuery = useQuery({
    queryKey: ['error-logs', resolvedFilter, sourceFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (resolvedFilter === 'unresolved') params.set('resolved', 'false');
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      // List endpoint returns the paginated body { data, meta }; keep both.
      return api.get(`/monitoring/errors?${params.toString()}`).then(r => ({
        rows: Array.isArray(r.data) ? r.data : [],
        total: r.meta?.total ?? 0,
      }));
    },
    staleTime: 15_000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolved }) =>
      api.patch(`/monitoring/errors/${id}/resolve`, { resolved }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-logs'] });
      queryClient.invalidateQueries({ queryKey: ['error-stats'] });
    },
  });

  const stats = statsQuery.data || {};
  const rows = listQuery.data?.rows || [];
  const isFetching = listQuery.isFetching || statsQuery.isFetching;

  const refreshAll = () => {
    listQuery.refetch();
    statsQuery.refetch();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <Bug className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Error Monitor</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Grouped backend & frontend errors — newest occurrences first
            </p>
          </div>
        </div>
        <button onClick={refreshAll} disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={AlertTriangle} label="Unresolved" value={stats.unresolved} tint="#ef4444" />
        <StatCard icon={Bug} label="Last 24 hours" value={stats.last_24h} tint="#f59e0b" />
        <StatCard icon={Server} label="Backend" value={stats.by_source?.backend} tint={SOURCE_COLOR.backend} />
        <StatCard icon={Monitor} label="Frontend" value={stats.by_source?.frontend} tint={SOURCE_COLOR.frontend} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Pill active={resolvedFilter === 'unresolved'} onClick={() => setResolvedFilter('unresolved')}>Unresolved</Pill>
          <Pill active={resolvedFilter === 'all'} onClick={() => setResolvedFilter('all')}>All</Pill>
        </div>
        <div className="w-px h-5" style={{ background: 'var(--border)' }} />
        <div className="flex items-center gap-2">
          <Pill active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>All sources</Pill>
          <Pill active={sourceFilter === 'backend'} onClick={() => setSourceFilter('backend')}>Backend</Pill>
          <Pill active={sourceFilter === 'frontend'} onClick={() => setSourceFilter('frontend')}>Frontend</Pill>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        {listQuery.isLoading ? (
          <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading errors…
          </div>
        ) : listQuery.isError ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Couldn't load errors</p>
            <button onClick={() => listQuery.refetch()} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <CheckCircle2 className="w-8 h-8" style={{ color: '#16a34a' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {resolvedFilter === 'unresolved' ? 'No unresolved errors — all clear' : 'No errors recorded'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Message', 'Source / Level', 'Count', 'Path / URL', 'Last seen', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 max-w-sm">
                      <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }} title={r.message}>
                        {r.message}
                      </div>
                      {r.name && (
                        <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{r.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Badge label={r.source} color={SOURCE_COLOR[r.source] || 'var(--text-secondary)'} />
                        <Badge label={r.level} color={LEVEL_COLOR[r.level] || 'var(--text-secondary)'} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{r.count}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-xs truncate block" style={{ color: 'var(--text-secondary)' }} title={r.path || r.url || ''}>
                        {r.path || r.url || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {fmtWhen(r.last_seen_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => resolveMutation.mutate({ id: r.id, resolved: !r.resolved })}
                        disabled={resolveMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80 disabled:opacity-50"
                        style={r.resolved
                          ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                          : { borderColor: '#16a34a', color: '#16a34a' }}>
                        {r.resolved ? 'Re-open' : (<><CheckCircle2 className="w-3.5 h-3.5" /> Resolve</>)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
