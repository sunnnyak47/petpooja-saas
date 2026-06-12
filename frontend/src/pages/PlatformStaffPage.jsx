/**
 * PlatformStaffPage — manage SuperAdmin console staff (super_admin only).
 * Route: /platform-staff  (requires sa.staff.manage)
 *
 * Create staff with a scoped platform role, change roles, reset/unlock their
 * login (one-time temp password), and deactivate/reactivate them. The backend
 * enforces every action and prevents removing the last active super admin.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserCog, UserPlus, RefreshCw, Loader2, KeyRound, Copy, Check,
  ShieldCheck, Power, X,
} from 'lucide-react';
import api from '../lib/api';

const ROLE_COLORS = {
  super_admin:      '#8b5cf6',
  platform_admin:   '#6366f1',
  platform_support: '#0ea5e9',
  platform_billing: '#16a34a',
  platform_readonly:'#64748b',
};

function fmtWhen(dt) {
  if (!dt) return 'Never';
  try { return new Date(dt).toLocaleString(); } catch { return '—'; }
}

function RoleBadge({ role, label }) {
  const color = ROLE_COLORS[role] || 'var(--text-secondary)';
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      {label || role}
    </span>
  );
}

export default function PlatformStaffPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [credResult, setCredResult] = useState(null); // { email, temp_password, title }
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type:'deactivate', staff }
  const [err, setErr] = useState('');

  const { data: staff, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['platform-staff'],
    queryFn: () => api.get('/superadmin/staff').then(r => r.data || []),
    staleTime: 15_000,
  });
  const { data: roles } = useQuery({
    queryKey: ['platform-roles'],
    queryFn: () => api.get('/superadmin/staff/roles').then(r => r.data || []),
    staleTime: 5 * 60_000,
  });

  const rows = Array.isArray(staff) ? staff : [];
  const roleList = Array.isArray(roles) ? roles : [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ['platform-staff'] });

  const createMut = useMutation({
    mutationFn: (body) => api.post('/superadmin/staff', body).then(r => r.data),
    onSuccess: (data) => {
      setShowAdd(false);
      setCredResult({ ...data, title: 'Staff account created' });
      invalidate();
    },
    onError: (e) => setErr(e.message || 'Failed to create staff'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/superadmin/staff/${id}`, body),
    onSuccess: invalidate,
    onError: (e) => setErr(e.message || 'Failed to update staff'),
  });
  const resetMut = useMutation({
    mutationFn: (id) => api.post(`/superadmin/staff/${id}/reset-password`).then(r => r.data),
    onSuccess: (data) => setCredResult({ ...data, title: 'Login reset' }),
    onError: (e) => setErr(e.message || 'Failed to reset login'),
  });
  const deactivateMut = useMutation({
    mutationFn: (id) => api.delete(`/superadmin/staff/${id}`),
    onSuccess: () => { setConfirm(null); invalidate(); },
    onError: (e) => { setErr(e.message || 'Failed to deactivate'); setConfirm(null); },
  });

  const copyTemp = (pw) => {
    navigator.clipboard?.writeText(pw).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <UserCog className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Platform Staff</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Give employees scoped access to the SuperAdmin console
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => { setErr(''); setShowAdd(true); }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}>
            <UserPlus className="w-4 h-4" /> Add Staff
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading staff…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Couldn't load staff</p>
            <button onClick={() => refetch()} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <UserCog className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No platform staff yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Name', 'Email', 'Role', 'Status', 'Last login', ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{s.full_name}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{s.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={s.role}
                        onChange={(e) => { setErr(''); updateMut.mutate({ id: s.id, body: { role: e.target.value } }); }}
                        className="text-xs font-semibold rounded-lg px-2 py-1 border outline-none cursor-pointer"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: ROLE_COLORS[s.role] || 'var(--text-primary)' }}
                      >
                        {roleList.map(r => <option key={r.name} value={r.name}>{r.display_name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: s.is_active ? '#16a34a' : 'var(--text-secondary)' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.is_active ? '#16a34a' : '#94a3b8' }} />
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtWhen(s.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button title="Reset login"
                          onClick={() => { setErr(''); resetMut.mutate(s.id); }}
                          disabled={resetMut.isPending}
                          className="p-1.5 rounded-lg border transition-colors hover:opacity-80 disabled:opacity-50"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {s.is_active ? (
                          <button title="Deactivate"
                            onClick={() => { setErr(''); setConfirm({ type: 'deactivate', staff: s }); }}
                            className="p-1.5 rounded-lg border transition-colors hover:opacity-80"
                            style={{ borderColor: 'var(--border)', color: '#ef4444' }}>
                            <Power className="w-4 h-4" />
                          </button>
                        ) : (
                          <button title="Reactivate"
                            onClick={() => { setErr(''); updateMut.mutate({ id: s.id, body: { is_active: true } }); }}
                            className="p-1.5 rounded-lg border transition-colors hover:opacity-80"
                            style={{ borderColor: 'var(--border)', color: '#16a34a' }}>
                            <Power className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {err && !showAdd && (
        <p className="text-sm px-1" style={{ color: '#ef4444' }}>{err}</p>
      )}

      {/* Add Staff modal */}
      {showAdd && (
        <AddStaffModal
          roleList={roleList}
          pending={createMut.isPending}
          error={err}
          onClose={() => setShowAdd(false)}
          onSubmit={(body) => { setErr(''); createMut.mutate(body); }}
        />
      )}

      {/* One-time credential modal */}
      {credResult && (
        <Modal onClose={() => setCredResult(null)}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5" style={{ color: '#16a34a' }} />
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{credResult.title}</h3>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Share this one-time password with <strong style={{ color: 'var(--text-primary)' }}>{credResult.email}</strong>.
            It won't be shown again — they should change it after logging in.
          </p>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <code className="flex-1 text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{credResult.temp_password}</code>
            <button onClick={() => copyTemp(credResult.temp_password)}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ color: 'var(--accent)' }}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setCredResult(null)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
            Done
          </button>
        </Modal>
      )}

      {/* Deactivate confirm */}
      {confirm?.type === 'deactivate' && (
        <Modal onClose={() => setConfirm(null)}>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Deactivate staff?</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{confirm.staff.full_name}</strong> will lose access to the console
            immediately. You can reactivate them later.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirm(null)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button onClick={() => deactivateMut.mutate(confirm.staff.id)} disabled={deactivateMut.isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#ef4444' }}>
              {deactivateMut.isPending ? 'Deactivating…' : 'Deactivate'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function AddStaffModal({ roleList, pending, error, onClose, onSubmit }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'platform_support' });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const valid = form.full_name.trim() && form.email.trim() && form.phone.trim() && form.role;

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Add platform staff</h3>
        <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}><X className="w-5 h-5" /></button>
      </div>
      <div className="space-y-3">
        {[
          { k: 'full_name', label: 'Full name', type: 'text', ph: 'Jane Smith' },
          { k: 'email', label: 'Email', type: 'email', ph: 'jane@company.com' },
          { k: 'phone', label: 'Phone', type: 'tel', ph: '9876543210' },
        ].map(f => (
          <div key={f.k}>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
            <input type={f.type} value={form[f.k]} onChange={set(f.k)} placeholder={f.ph}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          </div>
        ))}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Role</label>
          <select value={form.role} onChange={set('role')}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none border cursor-pointer"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            {roleList.map(r => <option key={r.name} value={r.name}>{r.display_name}</option>)}
          </select>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
            {roleList.find(r => r.name === form.role)?.description}
          </p>
        </div>
      </div>
      {error && <p className="text-sm mt-3" style={{ color: '#ef4444' }}>{error}</p>}
      <div className="flex gap-2 mt-5">
        <button onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
        <button onClick={() => onSubmit(form)} disabled={!valid || pending}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {pending ? 'Creating…' : 'Create staff'}
        </button>
      </div>
    </Modal>
  );
}
