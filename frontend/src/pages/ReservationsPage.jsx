/**
 * ReservationsPage — Table booking and reservation management
 * Route: /reservations
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useRegion } from '../hooks/useRegion';
import {
  Calendar, Clock, Users, Plus, Phone, Mail,
  CheckCircle2, XCircle, AlertCircle, ChevronDown,
  Utensils, Search, Edit2, Trash2, Loader2
} from 'lucide-react';

const STATUS_CFG = {
  PENDING:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Pending',   icon: AlertCircle },
  CONFIRMED: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Confirmed', icon: CheckCircle2 },
  SEATED:    { color: '#4ade80', bg: 'rgba(34,197,94,0.12)',   label: 'Seated',    icon: Utensils },
  CANCELLED: { color: '#f87171', bg: 'rgba(239,68,68,0.12)',   label: 'Cancelled', icon: XCircle },
  NO_SHOW:   { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: 'No Show',   icon: XCircle },
};

function timeStr(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function dateStr(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const EMPTY_FORM = {
  customer_name: '', customer_phone: '', customer_email: '',
  party_size: 2, reservation_date: '', reservation_time: '',
  table_preference: '', special_requests: '', status: 'CONFIRMED'
};

export default function ReservationsPage() {
  const qc = useQueryClient();
  const region = useRegion();
  const phonePlaceholder = region === 'AU' ? '+61 412345678' : '+91 9876543210';
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editId, setEditId]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // reservation object pending deletion

  const today = new Date().toISOString().split('T')[0];

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => api.get('/reservations').then(r => r.data),
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editId
      ? api.patch(`/reservations/${editId}`, data)
      : api.post('/reservations', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(editId ? 'Reservation updated' : 'Reservation created');
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditId(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed to save reservation'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/reservations/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Status updated');
    },
    onError: (e) => toast.error(e?.response?.data?.message || e.message || 'Failed to update status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/reservations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Reservation deleted');
      setConfirmDelete(null);
    },
    onError: (e) => {
      toast.error(e?.response?.data?.message || e.message || 'Failed to delete reservation');
      setConfirmDelete(null);
    },
  });

  const filtered = reservations.filter(r => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.customer_name?.toLowerCase().includes(q) || r.customer_phone?.includes(q);
    }
    return true;
  });

  const todayRes  = reservations.filter(r => r.reservation_date?.startsWith(today));
  const pending   = reservations.filter(r => r.status === 'PENDING').length;
  const confirmed = reservations.filter(r => r.status === 'CONFIRMED').length;

  const handleEdit = (r) => {
    setEditId(r.id);
    setForm({
      customer_name: r.customer_name, customer_phone: r.customer_phone,
      customer_email: r.customer_email || '', party_size: r.party_size,
      reservation_date: r.reservation_date?.split('T')[0] || '',
      reservation_time: r.reservation_time || '',
      table_preference: r.table_preference || '',
      special_requests: r.special_requests || '',
      status: r.status,
    });
    setShowForm(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Reservations</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Manage table bookings and walk-in reservations
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff' }}>
          <Plus className="w-4 h-4" /> New Reservation
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Today',     value: todayRes.length,                 color: '#6366f1', icon: Calendar },
          { label: 'Pending',   value: pending,                         color: '#f59e0b', icon: AlertCircle },
          { label: 'Confirmed', value: confirmed,                       color: '#60a5fa', icon: CheckCircle2 },
          { label: 'Total',     value: reservations.length,             color: '#22c55e', icon: Utensils },
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
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <div className="flex gap-2">
          {['ALL', ...Object.keys(STATUS_CFG)].map(s => {
            const cfg = STATUS_CFG[s];
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{
                  background: statusFilter === s ? (cfg?.bg || 'rgba(99,102,241,0.15)') : 'var(--bg-secondary)',
                  border: `1px solid ${statusFilter === s ? (cfg?.color || '#6366f1') : 'var(--border)'}`,
                  color: statusFilter === s ? (cfg?.color || '#818cf8') : 'var(--text-secondary)',
                }}>
                {cfg?.label || 'All'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reservation Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                {editId ? 'Edit Reservation' : 'New Reservation'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditId(null); }}>
                <XCircle className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'customer_name', label: 'Customer Name *', type: 'text', placeholder: 'John Doe' },
                { key: 'customer_phone', label: 'Phone *', type: 'tel', placeholder: phonePlaceholder },
                { key: 'customer_email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
                { key: 'party_size', label: 'Party Size *', type: 'number', placeholder: '2' },
                { key: 'reservation_date', label: 'Date *', type: 'date', placeholder: '' },
                { key: 'reservation_time', label: 'Time *', type: 'time', placeholder: '' },
                { key: 'table_preference', label: 'Table Preference', type: 'text', placeholder: 'Window, Corner, etc.' },
              ].map(f => (
                <div key={f.key} className={f.key === 'customer_name' ? 'col-span-2' : ''}>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                  <input type={f.type} value={form[f.key]} placeholder={f.placeholder}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Special Requests</label>
                <textarea value={form.special_requests} rows={2}
                  onChange={e => setForm(p => ({ ...p, special_requests: e.target.value }))}
                  placeholder="Dietary restrictions, occasion, seating preference…"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setEditId(null); }}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending || !form.customer_name || !form.reservation_date}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff' }}>
                {saveMutation.isPending ? 'Saving…' : editId ? 'Update' : 'Create Reservation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reservations List */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Calendar className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {reservations.length === 0 ? 'No reservations yet' : 'No results'}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {reservations.length === 0 ? 'Create your first reservation above' : 'Try a different filter'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Guest', 'Party', 'Date & Time', 'Table Pref', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide"
                      style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const cfg = STATUS_CFG[r.status] || STATUS_CFG.PENDING;
                  return (
                    <tr key={r.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}
                      className="hover:opacity-80 transition-opacity">
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.customer_name}</p>
                          <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            <Phone className="w-3 h-3" />{r.customer_phone}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                          <Users className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                          {r.party_size}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{dateStr(r.reservation_date)}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.reservation_time || timeStr(r.reservation_date)}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.table_preference || '—'}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {r.status === 'PENDING' && (
                            <button onClick={() => statusMutation.mutate({ id: r.id, status: 'CONFIRMED' })}
                              className="text-xs px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
                              Confirm
                            </button>
                          )}
                          {r.status === 'CONFIRMED' && (
                            <button onClick={() => statusMutation.mutate({ id: r.id, status: 'SEATED' })}
                              className="text-xs px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                              Seat
                            </button>
                          )}
                          <button onClick={() => handleEdit(r)} title="Edit reservation"
                            className="p-1.5 rounded-md transition-colors"
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                            <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          <button onClick={() => setConfirmDelete(r)} title="Delete reservation"
                            className="p-1.5 rounded-md transition-colors"
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                            <Trash2 className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═════ Delete-reservation confirm dialog ═════ */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleteMutation.isPending) setConfirmDelete(null); }}
        >
          <div className="w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {/* header */}
            <div className="px-6 pt-6 pb-3">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <Trash2 className="w-5 h-5" style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#ef4444' }}>
                    Delete reservation
                  </div>
                  <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                    This can&rsquo;t be undone
                  </div>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Delete the reservation for{' '}
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {confirmDelete.customer_name || 'this guest'}
                </span>
                {confirmDelete.party_size ? ` (party of ${confirmDelete.party_size})` : ''}
                {confirmDelete.reservation_date
                  ? ` on ${new Date(confirmDelete.reservation_date).toLocaleDateString(undefined,{day:'numeric',month:'short'})}`
                  : ''}
                {confirmDelete.reservation_time ? ` at ${confirmDelete.reservation_time}` : ''}?
              </p>
            </div>
            {/* footer */}
            <div className="px-6 py-4 flex items-center justify-end gap-2"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Keep
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
                }}>
                {deleteMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                  : <>Delete reservation</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
