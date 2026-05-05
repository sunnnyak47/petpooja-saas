/**
 * ImpersonationLogPage — Audit trail of all impersonation sessions
 * Route: /impersonation-log
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  UserCheck, Search, Clock, Shield, ChevronRight,
  AlertTriangle, Eye, Calendar
} from 'lucide-react';

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ImpersonationLogPage() {
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['impersonation-log'],
    queryFn: () => api.get('/superadmin/impersonation-log').then(r => r.data),
    staleTime: 30_000,
  });

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.admin_email?.toLowerCase().includes(q)
      || l.target_chain_name?.toLowerCase().includes(q)
      || l.target_user_email?.toLowerCase().includes(q);
  });

  const today = filtered.filter(l => new Date(l.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000));
  const thisWeek = filtered.filter(l => new Date(l.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Impersonation Log</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Complete audit trail of all superadmin impersonation sessions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Sessions',  value: logs.length,    color: '#6366f1', icon: UserCheck },
          { label: 'Today',           value: today.length,   color: '#f59e0b', icon: Clock },
          { label: 'This Week',       value: thisWeek.length, color: '#22c55e', icon: Calendar },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${c.color}20` }}>
              <c.icon className="w-4 h-4" style={{ color: c.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{c.value}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Security Notice */}
      <div className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
        <p className="text-sm" style={{ color: '#f59e0b' }}>
          This log records every instance of superadmin accessing a restaurant chain's account. All sessions are audited for security compliance.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by admin email, chain name, or user email…"
          className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Eye className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {logs.length === 0 ? 'No impersonation sessions recorded' : 'No results for your search'}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {logs.length === 0 ? 'Sessions will appear here after impersonating a chain' : 'Try a different search term'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Admin', 'Target Chain', 'Target User', 'Timestamp', 'Time Ago'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => (
                  <tr key={log.id} className="transition-opacity hover:opacity-80"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                          <Shield className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{log.admin_email || 'Super Admin'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{log.target_chain_name || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{log.target_user_email || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(log.timestamp)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{timeAgo(log.timestamp)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
        Showing {filtered.length} of {logs.length} sessions
      </p>
    </div>
  );
}
