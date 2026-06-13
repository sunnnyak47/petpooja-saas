/**
 * TaxProfilesPage — Per-region tax configuration management
 * Route: /tax-profiles
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Receipt, Plus, Save, Trash2, Edit2, CheckCircle2, Globe,
  ChevronDown, AlertTriangle, X
} from 'lucide-react';

const REGIONS = [
  { code: 'IN', name: 'India', flag: '🇮🇳', currency: '₹' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'A$' },
  { code: 'US', name: 'USA', flag: '🇺🇸', currency: '$' },
  { code: 'UK', name: 'UK', flag: '🇬🇧', currency: '£' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', currency: 'S$' },
];

const GST_TYPES = ['REGULAR', 'COMPOSITE', 'INCLUSIVE', 'EXEMPT'];

function SlabRow({ slab, onChange, onDelete }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center gap-2 flex-1">
        <input
          type="number"
          value={slab.rate}
          onChange={e => onChange({ ...slab, rate: Number(e.target.value) })}
          className="w-16 px-2 py-1 rounded text-sm text-center font-bold outline-none"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          min="0" max="100" step="0.5"
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
        <input
          type="text"
          value={slab.label}
          onChange={e => onChange({ ...slab, label: e.target.value })}
          className="flex-1 px-3 py-1 rounded text-sm outline-none"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          placeholder="Label (e.g. 5% GST)"
        />
      </div>
      <button onClick={onDelete}
        className="w-7 h-7 rounded flex items-center justify-center transition-colors"
        style={{ color: '#ef4444' }}>
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ProfileCard({ profile, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const region = REGIONS.find(r => r.code === profile.region);

  useEffect(() => { setDraft(profile); }, [profile]);

  const handleSlabChange = (idx, updated) => {
    const slabs = [...draft.slabs];
    slabs[idx] = updated;
    setDraft(d => ({ ...d, slabs }));
  };

  const handleSlabDelete = (idx) => {
    setDraft(d => ({ ...d, slabs: d.slabs.filter((_, i) => i !== idx) }));
  };

  const addSlab = () => {
    setDraft(d => ({ ...d, slabs: [...d.slabs, { rate: 0, label: '' }] }));
  };

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="text-2xl flex items-center">{region?.flag || <Globe className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />}</div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{draft.name}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{region?.name || draft.region} · {region?.currency || ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                <Save className="w-3.5 h-3.5" /> Save
              </button>
              <button onClick={() => { setDraft(profile); setEditing(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => onDelete(profile.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:opacity-80"
                style={{ background: 'color-mix(in srgb, #ef4444 12%, transparent)', color: '#ef4444', border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Settings row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Profile Name</label>
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              disabled={!editing}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: editing ? 1 : 0.7 }} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Tax Type</label>
            <select value={draft.gst_type} onChange={e => setDraft(d => ({ ...d, gst_type: e.target.value }))}
              disabled={!editing}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: editing ? 1 : 0.7 }}>
              {GST_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Default Slab (%)</label>
            <input type="number" value={draft.default_slab}
              onChange={e => setDraft(d => ({ ...d, default_slab: Number(e.target.value) }))}
              disabled={!editing}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: editing ? 1 : 0.7 }} />
          </div>
        </div>

        {/* Tax inclusive toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => editing && setDraft(d => ({ ...d, inclusive: !d.inclusive }))}
            className={`w-10 h-5 rounded-full transition-all ${editing ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ background: draft.inclusive ? 'var(--accent)' : 'var(--border)' }}>
            <div className="w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5"
              style={{ transform: draft.inclusive ? 'translateX(20px)' : 'translateX(0)' }} />
          </button>
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Tax Inclusive Pricing</span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {draft.inclusive ? 'Price shown includes tax' : 'Tax added on top of price'}
          </span>
        </div>

        {/* Tax slabs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tax Slabs</p>
            {editing && (
              <button onClick={addSlab}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                <Plus className="w-3 h-3" /> Add Slab
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {draft.slabs.map((slab, i) => (
              editing ? (
                <SlabRow key={i} slab={slab}
                  onChange={updated => handleSlabChange(i, updated)}
                  onDelete={() => handleSlabDelete(i)} />
              ) : (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-primary)' }}>
                  <span className="w-12 text-center text-sm font-bold px-2 py-0.5 rounded"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                    {slab.rate}%
                  </span>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{slab.label}</span>
                  {slab.rate === draft.default_slab && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'color-mix(in srgb, #16a34a 12%, transparent)', color: '#16a34a' }}>Default</span>
                  )}
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TaxProfilesPage() {
  const qc = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProfile, setNewProfile] = useState({ id: '', region: 'IN', name: '', slabs: [], default_slab: 5, gst_type: 'REGULAR', inclusive: false });

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['tax-profiles'],
    queryFn: () => api.get('/superadmin/tax-profiles').then(r => r.data),
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (updated) => api.put('/superadmin/tax-profiles', { profiles: updated }),
    onSuccess: () => qc.invalidateQueries(['tax-profiles']),
    onError: (e) => toast.error(e.message || 'Failed to save tax profiles'),
  });

  const handleSaveProfile = (updated) => {
    const idx = profiles.findIndex(p => p.id === updated.id);
    const next = idx >= 0 ? profiles.map((p, i) => i === idx ? updated : p) : [...profiles, updated];
    saveMutation.mutate(next);
  };

  const handleDeleteProfile = (id) => {
    if (!confirm('Delete this tax profile?')) return;
    saveMutation.mutate(profiles.filter(p => p.id !== id));
  };

  const handleAddNew = () => {
    if (!newProfile.id || !newProfile.name) return toast.error('ID and name are required');
    const exists = profiles.find(p => p.id === newProfile.id);
    if (exists) return toast.error('Profile ID already exists');
    saveMutation.mutate([...profiles, newProfile]);
    setShowNewForm(false);
    setNewProfile({ id: '', region: 'IN', name: '', slabs: [], default_slab: 5, gst_type: 'REGULAR', inclusive: false });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Tax Profile Manager</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Configure tax rules per region — applied to all chains in that region</p>
        </div>
        <button onClick={() => setShowNewForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
          <Plus className="w-4 h-4" />
          New Profile
        </button>
      </div>

      {/* New profile quick form */}
      {showNewForm && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)' }}>
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>New Tax Profile</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Profile ID', key: 'id', placeholder: 'e.g. IN_GST' },
              { label: 'Name', key: 'name', placeholder: 'e.g. India GST' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                <input value={newProfile[f.key]} onChange={e => setNewProfile(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Region</label>
              <select value={newProfile.region} onChange={e => setNewProfile(p => ({ ...p, region: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {REGIONS.map(r => <option key={r.code} value={r.code}>{r.flag} {r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Default Slab %</label>
              <input type="number" value={newProfile.default_slab}
                onChange={e => setNewProfile(p => ({ ...p, default_slab: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNewForm(false)}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button onClick={handleAddNew}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
              <CheckCircle2 className="w-4 h-4" /> Create Profile
            </button>
          </div>
        </div>
      )}

      {/* Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: 'color-mix(in srgb, #f59e0b 10%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}>
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
        <p className="text-sm" style={{ color: '#f59e0b' }}>
          Changes to tax profiles affect all restaurant chains in that region. Existing orders are not retroactively updated.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map(p => (
            <ProfileCard key={p.id} profile={p} onSave={handleSaveProfile} onDelete={handleDeleteProfile} />
          ))}
          {profiles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Receipt className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No tax profiles configured</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Create a profile to define tax rules for each region</p>
            </div>
          )}
        </div>
      )}

      {saveMutation.isSuccess && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl z-50"
          style={{ background: 'color-mix(in srgb, #16a34a 12%, transparent)', border: '1px solid color-mix(in srgb, #16a34a 40%, transparent)', color: '#16a34a' }}>
          <CheckCircle2 className="w-4 h-4" />
          Tax profiles saved successfully
        </div>
      )}
    </div>
  );
}
