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
  owner:        { color: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
  manager:      { color: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
  cashier:      { color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)' },
  kitchen_staff:{ color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)' },
  waiter:       { color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)' },
  super_admin:  { color: '#ef4444', bg: 'color-mix(in srgb, #ef4444 14%, transparent)' },
};

const PLAN_COLORS = { TRIAL: '#64748b', STARTER: 'var(--accent)', PRO: 'var(--accent)', ENTERPRISE: '#16a34a' };

function RoleBadge({ role }) {
  const cfg = ROLE_COLORS[role] || { color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)' };
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

  const { data: users = [], isLoading, isError, refetch } = useQuery({
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
  const roles = [...new Set(users.map(u => u.role).filter(Boolean))];
  const chains = [...new Set(users.map(u => u.chain_name))].length;

  // The backend only ever returns the seeded roles (super_admin/owner/manager/
  // cashier). Filtering by 'waiter'/'kitchen_staff' always matched zero rows, so
  // drive the dropdown from roles seen in data, falling back to the real set.
  const ROLE_OPTIONS = roles.length
    ? roles
    : ['super_admin', 'owner', 'manager', 'cashier'];

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
          { label: 'Total Users',    value: users.length,   color: 'var(--accent)', icon: Users },
          { label: 'Active Users',   value: totalActive,    color: 'var(--accent)', icon: UserCheck },
          { label: 'Across Chains',  value: chains,         color: 'var(--accent)', icon: Store },
          { label: 'Unique Roles',   value: roles.length,   color: 'var(--accent)', icon: Shield },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>
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
          {ROLE_OPTIONS.map(r => (
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
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertCircle className="w-10 h-10" style={{ color: '#ef4444' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Couldn't load users</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>The request failed — this isn't an empty result.</p>
            <button onClick={() => refetch()}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              Retry
            </button>
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
                          style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
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
                      <span className="text-xs font-semibold" style={{ color: PLAN_COLORS[u.chain_plan] || '#64748b' }}>
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
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16a34a' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#ef4444' }}>
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
