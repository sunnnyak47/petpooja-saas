import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Megaphone, Plus, X, RefreshCw, Trash2, ToggleLeft, ToggleRight,
  Info, AlertTriangle, Wrench, Sparkles, Calendar, Users, Globe,
} from 'lucide-react';

const TYPE_META = {
  info:        { label: 'Info',        color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)', icon: Info },
  warning:     { label: 'Warning',     color: '#ef4444', bg: 'color-mix(in srgb, #ef4444 14%, transparent)', icon: AlertTriangle },
  maintenance: { label: 'Maintenance', color: '#f59e0b', bg: 'color-mix(in srgb, #f59e0b 14%, transparent)', icon: Wrench },
  feature:     { label: 'Feature',     color: '#16a34a', bg: 'color-mix(in srgb, #16a34a 14%, transparent)', icon: Sparkles },
};

const TYPES = ['info', 'warning', 'maintenance', 'feature'];

const emptyForm = {
  title: '',
  message: '',
  type: 'info',
  target: 'all',
  chain_ids: [],
  expires_at: '',
};

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const today = new Date().toISOString().split('T')[0];

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get('/superadmin/announcements').then(r => r.data),
  });

  const { data: chains = [] } = useQuery({
    queryKey: ['admin-chains'],
    queryFn: () => api.get('/ho/chains').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/superadmin/announcements', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['announcements']);
      toast.success('Announcement created');
      setShowCreate(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(e.message || 'Failed to create'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.patch(`/superadmin/announcements/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries(['announcements']),
    onError: (e) => toast.error(e.message || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/superadmin/announcements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['announcements']);
      toast.success('Announcement deleted');
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error(e.message || 'Failed to delete'),
  });

  const handleChainToggle = (chainId) => {
    setForm(p => ({
      ...p,
      chain_ids: p.chain_ids.includes(chainId)
        ? p.chain_ids.filter(id => id !== chainId)
        : [...p.chain_ids, chainId],
    }));
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.message.trim()) return toast.error('Message is required');
    if (form.target === 'specific' && form.chain_ids.length === 0)
      return toast.error('Select at least one chain');
    const { chain_ids, target, ...rest } = form;
    createMutation.mutate({
      ...rest,
      expires_at: form.expires_at || null,
      target_chain_ids: target === 'all' ? [] : chain_ids,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Announcements
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Broadcast messages to restaurant chains
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)' }}>
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
          <Megaphone className="w-12 h-12 mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No announcements yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Create one to broadcast a message to your chains.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(ann => {
            const meta = TYPE_META[ann.type] || TYPE_META.info;
            const TypeIcon = meta.icon;
            const targetCount = ann.target_chain_ids?.length || 0;
            const targetLabel = targetCount
              ? `${targetCount} specific chain${targetCount > 1 ? 's' : ''}`
              : 'All chains';

            return (
              <div key={ann.id}
                className="rounded-xl border transition-shadow hover:shadow-sm"
                style={{
                  background: 'var(--bg-primary)',
                  borderColor: ann.is_active ? 'var(--border)' : 'var(--border)',
                  opacity: ann.is_active ? 1 : 0.6,
                }}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: meta.bg, color: meta.color }}>
                      <TypeIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                        {!ann.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                            Inactive
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm mt-1.5" style={{ color: 'var(--text-primary)' }}>{ann.title}</h3>
                      <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{ann.message}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className="flex items-center gap-1">
                          {targetCount ? <Users className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                          {targetLabel}
                        </span>
                        {ann.expires_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Expires {new Date(ann.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                          {new Date(ann.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleMutation.mutate({ id: ann.id, is_active: !ann.is_active })}
                        disabled={toggleMutation.isPending}
                        className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                        title={ann.is_active ? 'Deactivate' : 'Activate'}
                        style={{ color: ann.is_active ? '#16a34a' : 'var(--text-secondary)' }}>
                        {ann.is_active
                          ? <ToggleRight className="w-5 h-5" />
                          : <ToggleLeft className="w-5 h-5" />
                        }
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(ann)}
                        className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                        title="Delete"
                        style={{ color: '#ef4444' }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-sm overflow-hidden shadow-xl border"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'color-mix(in srgb, #ef4444 14%, transparent)' }}>
                <Trash2 className="w-5 h-5" style={{ color: '#ef4444' }} />
              </div>
              <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>Delete Announcement</h3>
              <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete "<span className="font-medium">{deleteConfirm.title}</span>"? This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  Cancel
                </button>
                <button
                  onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: '#ef4444' }}>
                  {deleteMutation.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Deleting...</> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-lg overflow-hidden shadow-xl border max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>New Announcement</h3>
              <button onClick={() => { setShowCreate(false); setForm(emptyForm); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                  Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled maintenance on Sunday"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
              </div>

              {/* Message */}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                  Message <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Write your announcement message here..."
                  value={form.message}
                  onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2 resize-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
              </div>

              {/* Type selector */}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Type</label>
                <div className="flex gap-2 flex-wrap">
                  {TYPES.map(t => {
                    const m = TYPE_META[t];
                    const TypeIcon = m.icon;
                    const active = form.type === t;
                    return (
                      <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                        style={{
                          background: active ? m.bg : 'var(--bg-primary)',
                          color: active ? m.color : 'var(--text-secondary)',
                          borderColor: active ? m.color : 'var(--border)',
                        }}>
                        <TypeIcon className="w-3 h-3" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target */}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Target</label>
                <div className="flex gap-3">
                  {[
                    { value: 'all', label: 'All chains' },
                    { value: 'specific', label: 'Specific chains' },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="target"
                        value={opt.value}
                        checked={form.target === opt.value}
                        onChange={() => setForm(p => ({ ...p, target: opt.value, chain_ids: [] }))}
                        style={{ accentColor: 'var(--accent)' }} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                    </label>
                  ))}
                </div>

                {form.target === 'specific' && (
                  <div className="mt-3 rounded-lg border max-h-48 overflow-y-auto"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                    {chains.length === 0 && (
                      <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No chains found</p>
                    )}
                    {chains.map(chain => (
                      <label key={chain.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b last:border-0 hover:opacity-80 transition-opacity"
                        style={{ borderColor: 'var(--border)' }}>
                        <input
                          type="checkbox"
                          checked={form.chain_ids.includes(chain.id)}
                          onChange={() => handleChainToggle(chain.id)}
                          style={{ accentColor: 'var(--accent)' }} />
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                          style={{ background: 'var(--accent)' }}>
                          {chain.name.charAt(0)}
                        </div>
                        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{chain.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Expires at */}
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                  Expires At <span className="opacity-60 ml-1">optional</span>
                </label>
                <input
                  type="date"
                  min={today}
                  value={form.expires_at}
                  onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowCreate(false); setForm(emptyForm); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: 'var(--accent)' }}>
                  {createMutation.isPending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating...</>
                    : 'Create Announcement'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
