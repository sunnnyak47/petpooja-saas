/**
 * AllUsersPage — View all users across all chains
 * Route: /all-users
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Users, Search, Shield, Store, Clock, CheckCircle2,
  AlertCircle, ChevronDown, BarChart2, UserCheck
} from 'lucide-react';

const ROLE_COLORS = {
  owner:        { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  manager:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  cashier:      { color: '#4ade80', bg: 'rgba(74,222,128,0.15)' },
  kitchen_staff:{ color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  waiter:       { color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  super_admin:  { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

const PLAN_COLORS = { TRIAL: '#94a3b8', STARTER: '#60a5fa', PRO: '#a78bfa', ENTERPRISE: '#4ade80' };

function RoleBadge({ role }) {
  const cfg = ROLE_COLORS[role] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
      style={{ background: cfg.bg, color: cfg.color }}>
      {role?.replace(/_/g, ' ')}
    </span>
  );
}

function timeAgo(dt) {
  if (!dt) return 'Never';
  const diff = Date.now() - new Date(dt).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AllUsersPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users', search, roleFilter, planFilter],
    queryFn: () => api.get('/superadmin/users', {
      params: {
        search: search || undefined,
        role: roleFilter !== 'ALL' ? roleFilter : undefined,
        plan: planFilter !== 'ALL' ? planFilter : undefined,
      }
    }).then(r => r.data),
    staleTime: 60_000,
  });

  const totalActive = users.filter(u => u.is_active).length;
  const roles = [...new Set(users.map(u => u.role))];
  const chains = [...new Set(users.map(u => u.chain_name))].length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>All Users</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          View and search users across all restaurant chains
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Users',    value: users.length,   color: '#6366f1', icon: Users },
          { label: 'Active Users',   value: totalActive,    color: '#22c55e', icon: UserCheck },
          { label: 'Across Chains',  value: chains,         color: '#f59e0b', icon: Store },
          { label: 'Unique Roles',   value: roles.length,   color: '#8b5cf6', icon: Shield },
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

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or chain…"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="ALL">All Roles</option>
          {Object.keys(ROLE_COLORS).map(r => (
            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="ALL">All Plans</option>
          {['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Users className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No users found</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['User', 'Role', 'Outlet', 'Chain', 'Plan', 'Last Login', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className="transition-opacity hover:opacity-80"
                    style={{ borderBottom: i < users.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                          {u.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{u.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{u.outlet_name}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{u.chain_name}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold" style={{ color: PLAN_COLORS[u.chain_plan] || '#94a3b8' }}>
                        {u.chain_plan}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Clock className="w-3 h-3" />
                        {timeAgo(u.last_login_at)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {u.is_active ? (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#4ade80' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#f87171' }}>
                          <AlertCircle className="w-3.5 h-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
        Showing {users.length} users
      </p>
    </div>
  );
}
