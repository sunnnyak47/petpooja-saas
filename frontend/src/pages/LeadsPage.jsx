import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Inbox, Phone, Mail, MapPin, Store, Clock } from 'lucide-react';
import api from '../lib/api';

const STATUSES = [
  { id: 'new', label: 'New', color: '#2563eb' },
  { id: 'contacted', label: 'Contacted', color: '#f59e0b' },
  { id: 'demo_booked', label: 'Demo booked', color: '#7c3aed' },
  { id: 'won', label: 'Won', color: '#16a34a' },
  { id: 'lost', label: 'Lost', color: '#ef4444' },
];
const colorOf = (s) => (STATUSES.find((x) => x.id === s) || {}).color || 'var(--text-secondary)';

export default function LeadsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leads', filter],
    queryFn: () => api.get(`/leads${filter ? `?status=${filter}` : ''}`).then((r) => r.data),
    staleTime: 30000,
  });
  const leads = data?.leads || [];
  const counts = data?.counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/leads/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('Lead updated'); },
    onError: (e) => toast.error(e.message || 'Update failed'),
  });

  const fmt = (d) => new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Inbox className="w-6 h-6" style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Demo Leads</h1>
      </div>
      <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>Demo &amp; sales requests captured from the marketing website.</p>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setFilter('')}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border"
          style={{ borderColor: 'var(--border)', background: filter === '' ? 'var(--accent)' : 'var(--bg-card)', color: filter === '' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
          All {total ? `(${total})` : ''}
        </button>
        {STATUSES.map((s) => (
          <button key={s.id} onClick={() => setFilter(s.id)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--border)', background: filter === s.id ? s.color : 'var(--bg-card)', color: filter === s.id ? '#fff' : 'var(--text-secondary)' }}>
            {s.label} {counts[s.id] ? `(${counts[s.id]})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-secondary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No leads yet</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Demo requests from the website will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => (
            <div key={l.id} className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{l.name}</span>
                  {l.restaurant && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>· {l.restaurant}</span>}
                  {l.region && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{l.region}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="w-3.5 h-3.5" />{l.email}</a>
                  {l.phone && <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="w-3.5 h-3.5" />{l.phone}</a>}
                  {l.outlets && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{l.outlets} outlets</span>}
                  {l.current_system && <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" />from {l.current_system}</span>}
                  <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{fmt(l.created_at)}</span>
                </div>
              </div>
              <select
                value={l.status}
                onChange={(e) => updateStatus.mutate({ id: l.id, status: e.target.value })}
                className="text-sm font-semibold rounded-lg px-3 py-2 border outline-none"
                style={{ borderColor: colorOf(l.status), color: colorOf(l.status), background: 'var(--bg-card)' }}>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
