import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Calendar, Plus, Users, Clock, Award, AlertTriangle, ChevronLeft,
  ChevronRight, X, Check, Trash2, Edit2, Shield, Star, RefreshCw,
} from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHIFT_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4'];

function getWeekDates(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay();
  d.setDate(d.getDate() - day + 1); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(d);
    nd.setDate(d.getDate() + i);
    return nd;
  });
}

function fmt(date) {
  return date.toISOString().split('T')[0];
}

const CERT_TYPES = ['RSA (Responsible Service of Alcohol)', 'Food Safety Handler', 'First Aid Certificate', 'Working With Children Check', 'Security License'];

export default function RosteringPage() {
  const { user } = useSelector(s => s.auth);
  const qc = useQueryClient();
  const outletId = user?.outlet_id;
  const currency = user?.outlet?.currency || 'AUD';

  const [activeTab, setActiveTab] = useState('roster'); // roster | availability | certifications
  const [weekBase, setWeekBase] = useState(new Date());
  const [showCreateRoster, setShowCreateRoster] = useState(false);
  const [showAddShift, setShowAddShift] = useState(null); // { rosterId, date }
  const [showAddCert, setShowAddCert] = useState(false);
  const weekDates = getWeekDates(weekBase);
  const [rosterForm, setRosterForm] = useState({ name: '', start_date: fmt(weekDates[0]), end_date: fmt(weekDates[6]), notes: '' });
  const [shiftForm, setShiftForm] = useState({ staff_id: '', start_time: '09:00', end_time: '17:00', role_label: '' });
  const [certForm, setCertForm] = useState({ staff_id: '', cert_type: '', issue_date: '', expiry_date: '', cert_number: '', provider: '' });

  const { data: rosters = [] } = useQuery({
    queryKey: ['rosters', outletId],
    queryFn: () => api.get('/rostering', { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff-list', outletId],
    queryFn: () => api.get('/staff', { params: { outlet_id: outletId } }).then(r => r.data?.staff || r.data || []),
    enabled: !!outletId,
  });

  const { data: certs = [] } = useQuery({
    queryKey: ['certifications', outletId],
    queryFn: () => api.get('/rostering/certifications', { params: { outlet_id: outletId } }).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: expiring = [] } = useQuery({
    queryKey: ['expiring-certs', outletId],
    queryFn: () => api.get('/rostering/certifications/expiring', { params: { outlet_id: outletId, within_days: 60 } }).then(r => r.data),
    enabled: !!outletId,
  });

  const createRosterMut = useMutation({
    mutationFn: (data) => api.post('/rostering', { ...data, outlet_id: outletId }),
    onSuccess: () => { qc.invalidateQueries(['rosters']); toast.success('Roster created'); setShowCreateRoster(false); },
    onError: e => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: (id) => api.post(`/rostering/${id}/publish`, { outlet_id: outletId }),
    onSuccess: () => { qc.invalidateQueries(['rosters']); toast.success('Roster published ✓'); },
    onError: e => toast.error(e.message),
  });

  const deleteRosterMut = useMutation({
    mutationFn: (id) => api.delete(`/rostering/${id}`, { params: { outlet_id: outletId } }),
    onSuccess: () => { qc.invalidateQueries(['rosters']); toast.success('Roster deleted'); },
    onError: e => toast.error(e.message),
  });

  const addShiftMut = useMutation({
    mutationFn: ({ rosterId, data }) => api.post(`/rostering/${rosterId}/assignments`, data),
    onSuccess: () => { qc.invalidateQueries(['rosters']); toast.success('Shift assigned'); setShowAddShift(null); },
    onError: e => toast.error(e.message),
  });

  const removeShiftMut = useMutation({
    mutationFn: (assignmentId) => api.delete(`/rostering/assignments/${assignmentId}`),
    onSuccess: () => { qc.invalidateQueries(['rosters']); toast.success('Shift removed'); },
  });

  const addCertMut = useMutation({
    mutationFn: (data) => api.post('/rostering/certifications', { ...data, outlet_id: outletId }),
    onSuccess: () => { qc.invalidateQueries(['certifications', 'expiring-certs']); toast.success('Certification added'); setShowAddCert(false); },
    onError: e => toast.error(e.message),
  });

  // Current active roster (pick first published or last draft)
  const activeRoster = rosters.find(r => r.status === 'published') || rosters[0];
  const weekAssignments = activeRoster?.assignments?.filter(a => {
    const d = new Date(a.date);
    return d >= weekDates[0] && d <= weekDates[6];
  }) || [];

  const getStaffColor = (staffId) => {
    const idx = staff.findIndex(s => s.id === staffId);
    return SHIFT_COLORS[idx % SHIFT_COLORS.length] || '#6B7280';
  };

  const daysUntilExpiry = (dateStr) => {
    const days = Math.floor((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Staff Rostering</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Schedule shifts, track availability & manage certifications
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddCert(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
          >
            <Shield className="w-4 h-4" /> Add Cert
          </button>
          <button
            onClick={() => setShowCreateRoster(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Plus className="w-4 h-4" /> New Roster
          </button>
        </div>
      </div>

      {/* Expiring certs alert */}
      {expiring.length > 0 && (
        <div className="rounded-xl p-4 border border-amber-200 flex items-start gap-3" style={{ background: '#FEF9C3' }}>
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{expiring.length} certification{expiring.length > 1 ? 's' : ''} expiring soon</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {expiring.map(c => (
                <span key={c.id} className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-medium">
                  {c.staff?.full_name} — {c.cert_type} ({daysUntilExpiry(c.expiry_date)} days)
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
        {[
          { id: 'roster', label: 'Roster Calendar', icon: Calendar },
          { id: 'rosters', label: 'All Rosters', icon: Clock },
          { id: 'certifications', label: 'Certifications', icon: Shield },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 flex-1 justify-center py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: activeTab === id ? 'var(--bg-card)' : 'transparent',
              color: activeTab === id ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── ROSTER CALENDAR ── */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          {/* Week nav */}
          <div className="flex items-center justify-between p-4 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <button onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); }} className="p-2 rounded-lg hover:bg-opacity-10 transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
                Week of {weekDates[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} — {weekDates[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              {activeRoster && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Roster: {activeRoster.name} · <span className={activeRoster.status === 'published' ? 'text-emerald-600' : 'text-amber-600'}>{activeRoster.status}</span></p>}
            </div>
            <button onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); }} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Calendar grid */}
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
              {weekDates.map((d, i) => {
                const isToday = fmt(d) === fmt(new Date());
                return (
                  <div key={i} className="p-3 text-center border-r last:border-r-0" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-secondary)' }}>{DAYS[(i + 1) % 7]}</p>
                    <p className={`text-lg font-black mt-0.5 ${isToday ? 'text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}`}
                      style={{ color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {d.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Shift slots */}
            <div className="grid grid-cols-7 min-h-[200px]">
              {weekDates.map((d, i) => {
                const dateStr = fmt(d);
                const dayAssignments = weekAssignments.filter(a => fmt(new Date(a.date)) === dateStr);
                return (
                  <div key={i} className="p-2 border-r last:border-r-0 min-h-[160px]" style={{ borderColor: 'var(--border)' }}>
                    {dayAssignments.map(a => {
                      const color = getStaffColor(a.staff_id);
                      return (
                        <div key={a.id} className="mb-1 rounded-lg p-1.5 text-white text-xs relative group"
                          style={{ background: color, fontSize: '11px' }}>
                          <p className="font-bold truncate">{a.staff?.full_name?.split(' ')[0]}</p>
                          <p className="opacity-80">{a.start_time}–{a.end_time}</p>
                          {a.role_label && <p className="opacity-70 truncate">{a.role_label}</p>}
                          <button
                            onClick={() => removeShiftMut.mutate(a.id)}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                    {activeRoster && activeRoster.status !== 'published' && (
                      <button
                        onClick={() => { setShowAddShift({ rosterId: activeRoster.id, date: dateStr }); setShiftForm(p => ({ ...p, staff_id: '' })); }}
                        className="w-full mt-1 py-1 rounded-lg text-xs border border-dashed transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Staff legend */}
          <div className="flex flex-wrap gap-2">
            {staff.slice(0, 8).map((s, i) => (
              <span key={s.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full text-white font-medium"
                style={{ background: SHIFT_COLORS[i % SHIFT_COLORS.length] }}>
                {s.full_name?.split(' ')[0] || s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── ALL ROSTERS ── */}
      {activeTab === 'rosters' && (
        <div className="space-y-3">
          {rosters.length === 0 && (
            <div className="text-center py-16 rounded-xl border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No rosters yet</p>
              <p className="text-sm mt-1">Create your first roster to get started</p>
            </div>
          )}
          {rosters.map(roster => (
            <div key={roster.id} className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{roster.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${roster.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {roster.status}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(roster.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} —{' '}
                    {new Date(roster.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{roster.assignments?.length || 0} shifts · by {roster.creator?.full_name}
                  </p>
                  {roster.notes && <p className="text-xs mt-1 italic" style={{ color: 'var(--text-secondary)' }}>{roster.notes}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {roster.status === 'draft' && (
                    <button
                      onClick={() => publishMut.mutate(roster.id)}
                      disabled={publishMut.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: '#10B981' }}
                    >
                      <Check className="w-3.5 h-3.5 inline mr-1" />Publish
                    </button>
                  )}
                  <button
                    onClick={() => deleteRosterMut.mutate(roster.id)}
                    className="p-1.5 rounded-lg border transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CERTIFICATIONS ── */}
      {activeTab === 'certifications' && (
        <div className="space-y-4">
          {certs.length === 0 && (
            <div className="text-center py-16 rounded-xl border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No certifications recorded</p>
              <p className="text-sm mt-1">Track RSA, Food Safety Handler and other required certifications</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {certs.map(c => {
              const days = daysUntilExpiry(c.expiry_date);
              const urgent = days <= 30;
              const warning = days <= 60 && days > 30;
              return (
                <div key={c.id} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: urgent ? '#EF4444' : warning ? '#F59E0B' : 'var(--border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: urgent ? '#EF4444' : warning ? '#F59E0B' : 'var(--accent)' }}>
                        {c.cert_type}
                      </p>
                      <p className="font-semibold text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>{c.staff?.full_name}</p>
                      {c.cert_number && <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-secondary)' }}>#{c.cert_number}</p>}
                      {c.provider && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.provider}</p>}
                    </div>
                    {(urgent || warning) && <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${urgent ? 'text-red-500' : 'text-amber-500'}`} />}
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-between text-xs" style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Issued: {new Date(c.issue_date).toLocaleDateString('en-AU')}</span>
                    <span className={`font-semibold ${urgent ? 'text-red-600' : warning ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Roster Modal */}
      {showCreateRoster && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Create New Roster</h3>
              <button onClick={() => setShowCreateRoster(false)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="p-5 space-y-3">
              <input
                placeholder="Roster name (e.g. Week 18 Coverage)"
                value={rosterForm.name}
                onChange={e => setRosterForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Start Date</label>
                  <input type="date" value={rosterForm.start_date} onChange={e => setRosterForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>End Date</label>
                  <input type="date" value={rosterForm.end_date} onChange={e => setRosterForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <textarea
                placeholder="Notes (optional)"
                value={rosterForm.notes}
                onChange={e => setRosterForm(p => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCreateRoster(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button
                  onClick={() => createRosterMut.mutate(rosterForm)}
                  disabled={createRosterMut.isPending || !rosterForm.name}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--accent)' }}
                >
                  {createRosterMut.isPending ? 'Creating...' : 'Create Roster'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Shift Modal */}
      {showAddShift && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-sm" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Assign Shift — {showAddShift.date}</h3>
              <button onClick={() => setShowAddShift(null)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="p-5 space-y-3">
              <select
                value={shiftForm.staff_id}
                onChange={e => setShiftForm(p => ({ ...p, staff_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <option value="">Select Staff Member</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Start</label>
                  <input type="time" value={shiftForm.start_time} onChange={e => setShiftForm(p => ({ ...p, start_time: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>End</label>
                  <input type="time" value={shiftForm.end_time} onChange={e => setShiftForm(p => ({ ...p, end_time: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <input
                placeholder="Role label (e.g. Barista, Floor Manager)"
                value={shiftForm.role_label}
                onChange={e => setShiftForm(p => ({ ...p, role_label: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAddShift(null)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button
                  onClick={() => addShiftMut.mutate({ rosterId: showAddShift.rosterId, data: { ...shiftForm, date: showAddShift.date } })}
                  disabled={addShiftMut.isPending || !shiftForm.staff_id}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--accent)' }}
                >
                  {addShiftMut.isPending ? 'Adding...' : 'Assign Shift'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Certification Modal */}
      {showAddCert && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Add Staff Certification</h3>
              <button onClick={() => setShowAddCert(false)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
            </div>
            <div className="p-5 space-y-3">
              <select value={certForm.staff_id} onChange={e => setCertForm(p => ({ ...p, staff_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Select Staff Member</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.name}</option>)}
              </select>
              <select value={certForm.cert_type} onChange={e => setCertForm(p => ({ ...p, cert_type: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Select Certification Type</option>
                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input placeholder="Certificate Number" value={certForm.cert_number} onChange={e => setCertForm(p => ({ ...p, cert_number: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              <input placeholder="Issuing Provider (e.g. Responsible Service Australia)"
                value={certForm.provider} onChange={e => setCertForm(p => ({ ...p, provider: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Issue Date</label>
                  <input type="date" value={certForm.issue_date} onChange={e => setCertForm(p => ({ ...p, issue_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Expiry Date</label>
                  <input type="date" value={certForm.expiry_date} onChange={e => setCertForm(p => ({ ...p, expiry_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAddCert(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button
                  onClick={() => addCertMut.mutate(certForm)}
                  disabled={addCertMut.isPending || !certForm.staff_id || !certForm.cert_type}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--accent)' }}
                >
                  {addCertMut.isPending ? 'Saving...' : 'Add Certification'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
