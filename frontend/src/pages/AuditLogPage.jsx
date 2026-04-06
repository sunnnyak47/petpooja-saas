import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Shield, Search, User, Activity,
  AlertTriangle, Lock, Trash2, Edit3, LogIn, LogOut,
  DollarSign, Settings
} from 'lucide-react';

const ACTION_ICONS = {
  login: <LogIn className="w-4 h-4 text-emerald-400" />,
  logout: <LogOut className="w-4 h-4 text-surface-400" />,
  create: <Edit3 className="w-4 h-4 text-blue-400" />,
  update: <Edit3 className="w-4 h-4 text-orange-400" />,
  delete: <Trash2 className="w-4 h-4 text-red-400" />,
  void: <AlertTriangle className="w-4 h-4 text-red-400" />,
  refund: <DollarSign className="w-4 h-4 text-red-400" />,
  discount: <DollarSign className="w-4 h-4 text-purple-400" />,
  payment: <DollarSign className="w-4 h-4 text-emerald-400" />,
  settings: <Settings className="w-4 h-4 text-surface-400" />,
  permission: <Lock className="w-4 h-4 text-yellow-400" />,
};

const ACTION_COLORS = {
  login: 'bg-emerald-500/10 text-emerald-400',
  logout: 'bg-surface-700/50 text-surface-400',
  create: 'bg-blue-500/10 text-blue-400',
  update: 'bg-orange-500/10 text-orange-400',
  delete: 'bg-red-500/10 text-red-400',
  void: 'bg-red-500/10 text-red-400',
  refund: 'bg-red-500/10 text-red-400',
  payment: 'bg-emerald-500/10 text-emerald-400',
};

/**
 * M15: Security & Audit Log Page
 */
export default function AuditLogPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('today');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', outletId, dateFilter, actionFilter, page],
    queryFn: () => api.get(`/staff/audit-log?outlet_id=${outletId}&period=${dateFilter}&page=${page}&limit=50${actionFilter !== 'all' ? `&action=${actionFilter}` : ''}`).then(r => r.data || r),
    enabled: !!outletId,
  });

  const logs = useMemo(() => {
    let list = Array.isArray(data) ? data : (data?.logs || []);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.action?.toLowerCase().includes(q) ||
        l.user_name?.toLowerCase().includes(q) ||
        l.details?.toLowerCase().includes(q) ||
        l.entity?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, search]);

  const formatTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Shield className="w-7 h-7 text-brand-400" /> Audit Trail & Security
        </h1>
        <p className="text-sm text-surface-400 mt-1">Track every action, login, and sensitive operation across all users</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: logs.length, icon: <Activity className="w-5 h-5" />, color: 'text-brand-400' },
          { label: 'Logins', value: logs.filter(l => l.action === 'login').length, icon: <LogIn className="w-5 h-5" />, color: 'text-emerald-400' },
          { label: 'Voids/Refunds', value: logs.filter(l => ['void', 'refund'].includes(l.action)).length, icon: <AlertTriangle className="w-5 h-5" />, color: 'text-red-400' },
          { label: 'Config Changes', value: logs.filter(l => ['settings', 'permission'].includes(l.action)).length, icon: <Settings className="w-5 h-5" />, color: 'text-yellow-400' },
        ].map((s, i) => (
          <div key={i} className="bg-surface-900 rounded-2xl p-4 border border-surface-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-surface-400 uppercase font-bold tracking-wider">{s.label}</span>
              <span className={s.color}>{s.icon}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-full" placeholder="Search actions, users, entities..." />
        </div>
        <div className="flex bg-surface-800 rounded-xl p-1">
          {['today', 'week', 'month', 'all'].map((d) => (
            <button key={d} onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${dateFilter === d ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}>
              {d}
            </button>
          ))}
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input text-sm">
          <option value="all">All Actions</option>
          <option value="login">Logins</option>
          <option value="create">Creates</option>
          <option value="update">Updates</option>
          <option value="delete">Deletes</option>
          <option value="void">Voids</option>
          <option value="refund">Refunds</option>
          <option value="payment">Payments</option>
        </select>
      </div>

      {/* Log Table */}
      <div className="flex-1 overflow-y-auto bg-surface-900 rounded-2xl border border-surface-800">
        <table className="w-full">
          <thead className="sticky top-0 bg-surface-900 z-10">
            <tr className="text-left text-xs text-surface-400 uppercase tracking-wider border-b border-surface-800">
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800/50">
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-12 text-surface-500">Loading audit trail...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-surface-500">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No audit events found</p>
              </td></tr>
            ) : logs.map((log, i) => (
              <tr key={log.id || i} className="hover:bg-surface-800/30 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs text-surface-400 font-mono">{formatTime(log.created_at || log.timestamp)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-surface-700 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-surface-400" />
                    </div>
                    <span className="text-sm text-white font-medium">{log.user_name || log.changed_by || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${ACTION_COLORS[log.action] || 'bg-surface-700 text-surface-300'}`}>
                    {ACTION_ICONS[log.action] || <Activity className="w-3.5 h-3.5" />}
                    {log.action?.toUpperCase() || 'ACTION'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-surface-300">{log.entity || log.module || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-surface-400 line-clamp-1">{log.details || log.reason || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-surface-500 font-mono">{log.ip_address || log.ip || '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
