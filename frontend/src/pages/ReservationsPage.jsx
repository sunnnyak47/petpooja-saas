/**
 * ReservationsPage — Table booking and reservation management
 * Route: /reservations
 */
import React, { useState, useRef, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useRegion } from '../hooks/useRegion';
import { isValidPhone, PHONE_MAXLEN } from '../lib/validation';
import {
  Calendar, Users, Plus, Phone,
  CheckCircle2, XCircle, AlertCircle,
  Utensils, Search, Edit2, Trash2, Loader2,
  QrCode, Copy, Download, Mail, MessageCircle, ExternalLink, Sparkles
} from 'lucide-react';

/**
 * Best-fit table ranking (mirrors the backend service): smallest AVAILABLE
 * table that seats the party, else largest available, else any table.
 */
function rankTablesByFit(tables, partySize) {
  const size = Math.max(1, parseInt(partySize, 10) || 1);
  const byCapAsc = (a, b) =>
    (a.seating_capacity - b.seating_capacity) ||
    String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true });
  const byCapDesc = (a, b) => (b.seating_capacity - a.seating_capacity) || byCapAsc(a, b);
  const live = (tables || []).filter(t => !t.is_deleted);
  const available = live.filter(t => (t.status || 'available') === 'available');
  const availableFits = available.filter(t => (t.seating_capacity || 0) >= size).sort(byCapAsc);
  if (availableFits.length) return availableFits;
  if (available.length) return available.slice().sort(byCapDesc);
  const anyFits = live.filter(t => (t.seating_capacity || 0) >= size).sort(byCapAsc);
  if (anyFits.length) return anyFits;
  return live.slice().sort(byCapDesc);
}

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
  customer_name: '', customer_phone: '',
  party_size: 2, reservation_date: '', reservation_time: '',
  special_requests: '', status: 'confirmed', table_id: ''
};

export default function ReservationsPage() {
  const qc = useQueryClient();
  const region = useRegion();
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const phonePlaceholder = region === 'AU' ? '+61 412345678' : '+91 9876543210';
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editId, setEditId]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // reservation object pending deletion
  const [showShare, setShowShare] = useState(false);        // share QR/link modal
  const qrRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];

  // Public self-reservation link for this outlet (hash-routed, like the QR order link)
  const reserveUrl = outletId
    ? `${window.location.origin}/#/reserve?outlet=${outletId}`
    : '';

  // Live tables (read-only) — used to auto-suggest a best-fit table for the party.
  const { data: tables = [] } = useQuery({
    queryKey: ['tables', outletId],
    queryFn: () => api.get(`/orders/tables?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
    staleTime: 30_000,
  });

  const suggestions = useMemo(
    () => rankTablesByFit(tables, form.party_size).slice(0, 3),
    [tables, form.party_size]
  );
  const topSuggestion = suggestions[0] || null;
  const suggestionFits =
    topSuggestion && (topSuggestion.seating_capacity || 0) >= (parseInt(form.party_size, 10) || 1);
  // The table actually chosen for this booking (explicit pick or the top suggestion).
  const chosenTableId = form.table_id || topSuggestion?.id || '';

  const handleSave = () => {
    if (form.customer_phone && !isValidPhone(form.customer_phone)) {
      toast.error('Please enter a valid phone number');
      return;
    }
    const { table_id, ...rest } = form;
    const payload = { ...rest, party_size: Number(form.party_size) };
    // Attach the chosen/suggested table so what the owner sees is what gets booked.
    if (chosenTableId) payload.table_id = chosenTableId;
    saveMutation.mutate(editId ? payload : { ...payload, outlet_id: outletId });
  };

  // ── Share helpers ──────────────────────────────────────────────────────────
  const copyLink = () => {
    navigator.clipboard.writeText(reserveUrl)
      .then(() => toast.success('Reservation link copied!'))
      .catch(() => toast.error('Copy failed'));
  };

  const shareWhatsApp = () => {
    const msg = `Book a table at ${user?.outlet?.name || 'our restaurant'}: ${reserveUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const shareEmail = () => {
    const subject = `Reserve a table at ${user?.outlet?.name || 'our restaurant'}`;
    const body = `Hi,\n\nYou can reserve a table online here:\n${reserveUrl}\n\nSee you soon!`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 800, 1000);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 30px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(user?.outlet?.name || 'Reserve a Table', 400, 70);
      ctx.drawImage(img, 150, 110, 500, 500);
      ctx.fillStyle = '#4f46e5';
      ctx.font = 'bold 40px Inter, system-ui, sans-serif';
      ctx.fillText('Scan to Reserve', 400, 690);
      ctx.fillStyle = '#6b7280';
      ctx.font = '22px Inter, system-ui, sans-serif';
      ctx.fillText('Book your table online', 400, 740);
      ctx.fillText('in a few taps', 400, 772);
      const link = document.createElement('a');
      link.download = `Reservation-QR-${user?.outlet?.name || 'restaurant'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Reservation QR downloaded!');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', outletId],
    queryFn: () => api.get('/reservations', { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!outletId,
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
    onError: (e) => {
      const fieldErrors = e?.response?.data?.errors;
      const msg = Array.isArray(fieldErrors) && fieldErrors.length
        ? fieldErrors.map(fe => `${fe.field}: ${fe.message}`).join('; ')
        : e?.response?.data?.message || e.message || 'Failed to save reservation';
      toast.error(msg);
    },
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
    if (statusFilter !== 'ALL' && r.status?.toUpperCase() !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.customer_name?.toLowerCase().includes(q) || r.customer_phone?.includes(q);
    }
    return true;
  });

  const todayRes  = reservations.filter(r => r.reservation_date?.startsWith(today));
  const pending   = reservations.filter(r => r.status?.toUpperCase() === 'PENDING').length;
  const confirmed = reservations.filter(r => r.status?.toUpperCase() === 'CONFIRMED').length;

  const handleEdit = (r) => {
    setEditId(r.id);
    setForm({
      customer_name: r.customer_name, customer_phone: r.customer_phone,
      party_size: r.party_size,
      reservation_date: r.reservation_date?.split('T')[0] || '',
      reservation_time: r.reservation_time || '',
      special_requests: r.special_requests || '',
      status: r.status,
      table_id: r.table_id || r.table?.id || '',
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
        <div className="flex items-center gap-2">
          <button onClick={() => setShowShare(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <QrCode className="w-4 h-4" /> Share Booking Link
          </button>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff' }}>
            <Plus className="w-4 h-4" /> New Reservation
          </button>
        </div>
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
                { key: 'party_size', label: 'Party Size *', type: 'number', placeholder: '2' },
                { key: 'reservation_date', label: 'Date *', type: 'date', placeholder: '' },
                { key: 'reservation_time', label: 'Time *', type: 'time', placeholder: '' },
              ].map(f => (
                <div key={f.key} className={f.key === 'customer_name' ? 'col-span-2' : ''}>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                  <input type={f.type} min={f.key === 'reservation_date' ? today : undefined}
                    maxLength={f.key === 'customer_phone' ? PHONE_MAXLEN : undefined}
                    value={form[f.key]} placeholder={f.placeholder}
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

            {/* Auto table suggestion based on party size */}
            {topSuggestion && (
              <div className="rounded-xl p-3"
                style={{
                  background: suggestionFits ? 'rgba(99,102,241,0.10)' : 'rgba(245,158,11,0.10)',
                  border: `1px solid ${suggestionFits ? 'rgba(99,102,241,0.30)' : 'rgba(245,158,11,0.30)'}`,
                }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: suggestionFits ? '#818cf8' : '#f59e0b' }} />
                  <span className="text-[11px] font-bold uppercase tracking-wide"
                    style={{ color: suggestionFits ? '#818cf8' : '#f59e0b' }}>
                    Suggested table
                  </span>
                </div>
                {suggestionFits ? (
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    <span className="font-bold">Table {topSuggestion.table_number}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {' '}(seats {topSuggestion.seating_capacity}) — best fit for {form.party_size} guests
                      {suggestions.length > 1
                        ? `. Alt: ${suggestions.slice(1).map(t => `T${t.table_number}`).join(', ')}`
                        : ''}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    No free table seats {form.party_size} right now — largest is{' '}
                    <span className="font-bold">Table {topSuggestion.table_number}</span>
                    <span style={{ color: 'var(--text-secondary)' }}> ({topSuggestion.seating_capacity} seats)</span>
                  </p>
                )}
                {/* Quick pick from the ranked suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {suggestions.map(t => {
                    const active = chosenTableId === t.id;
                    return (
                      <button key={t.id} type="button"
                        onClick={() => setForm(p => ({ ...p, table_id: active ? '' : t.id }))}
                        className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                        style={{
                          background: active ? '#4f46e5' : 'var(--bg-primary)',
                          border: `1px solid ${active ? '#4f46e5' : 'var(--border)'}`,
                          color: active ? '#fff' : 'var(--text-secondary)',
                        }}>
                        T{t.table_number} · {t.seating_capacity}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setEditId(null); }}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saveMutation.isPending ||
                  !form.customer_name ||
                  !form.reservation_date ||
                  !form.reservation_time ||
                  !(Number(form.party_size) >= 1)
                }
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
                  const cfg = STATUS_CFG[r.status?.toUpperCase()] || STATUS_CFG.PENDING;
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
                          {r.status?.toUpperCase() === 'PENDING' && (
                            <button onClick={() => statusMutation.mutate({ id: r.id, status: 'confirmed' })}
                              className="text-xs px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
                              Confirm
                            </button>
                          )}
                          {r.status?.toUpperCase() === 'CONFIRMED' && (
                            <button onClick={() => statusMutation.mutate({ id: r.id, status: 'seated' })}
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

      {/* ═════ Share reservation QR + link ═════ */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowShare(false); }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5" style={{ color: '#818cf8' }} />
                <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Share Booking Link</h3>
              </div>
              <button onClick={() => setShowShare(false)}>
                <XCircle className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Customers can scan this QR or open the link to reserve a table themselves — no app or login needed.
            </p>

            {/* QR */}
            <div className="flex justify-center">
              <div ref={qrRef} className="inline-block bg-white p-5 rounded-2xl shadow-lg">
                {reserveUrl
                  ? <QRCodeSVG value={reserveUrl} size={200} level="H" includeMargin fgColor="#111827" />
                  : <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400 text-sm">No outlet</div>}
              </div>
            </div>

            {/* Link + inline copy/open */}
            <div className="flex items-center gap-2 rounded-xl p-3"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
              <code className="text-[11px] flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{reserveUrl}</code>
              <button onClick={copyLink} title="Copy link"
                className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
                <Copy className="w-4 h-4" />
              </button>
              <a href={reserveUrl} target="_blank" rel="noopener noreferrer" title="Open link"
                className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Share actions */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={copyLink}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <Copy className="w-4 h-4" /> Copy Link
              </button>
              <button onClick={shareWhatsApp}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.30)', color: '#22c55e' }}>
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
              <button onClick={shareEmail}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <Mail className="w-4 h-4" /> Email
              </button>
              <button onClick={downloadQR}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff' }}>
                <Download className="w-4 h-4" /> Download QR
              </button>
            </div>
          </div>
        </div>
      )}

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
