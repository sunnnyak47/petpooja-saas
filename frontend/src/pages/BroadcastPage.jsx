/**
 * BroadcastPage — Send platform-wide broadcasts to restaurant chains
 * Route: /broadcasts
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Radio, Send, Users, Info, AlertTriangle, CheckCircle2, Gift,
  Clock, Megaphone, ChevronDown, X
} from 'lucide-react';

const TYPE_CFG = {
  INFO:        { color: '#64748b', bg: 'color-mix(in srgb, #64748b 14%, transparent)', icon: Info,          label: 'Information' },
  WARNING:     { color: '#ef4444', bg: 'color-mix(in srgb, #ef4444 14%, transparent)', icon: AlertTriangle, label: 'Warning' },
  MAINTENANCE: { color: '#f59e0b', bg: 'color-mix(in srgb, #f59e0b 14%, transparent)', icon: Clock,         label: 'Maintenance' },
  PROMO:       { color: '#16a34a', bg: 'color-mix(in srgb, #16a34a 14%, transparent)', icon: Gift,          label: 'Promotion' },
};

const TARGET_CFG = {
  ALL:        { label: 'All Chains',        color: '#64748b' },
  TRIAL:      { label: 'Trial Only',        color: '#64748b' },
  STARTER:    { label: 'Starter Plans',     color: '#64748b' },
  PRO:        { label: 'Pro Plans',         color: '#64748b' },
  ENTERPRISE: { label: 'Enterprise Plans',  color: '#16a34a' },
};

function timeAgo(dt) {
  if (!dt) return '—';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function BroadcastPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', body: '', type: 'INFO', target: 'ALL' });
  const [preview, setPreview] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ['broadcasts'],
    queryFn: () => api.get('/superadmin/broadcasts').then(r => r.data),
    staleTime: 30_000,
  });

  const sendMutation = useMutation({
    mutationFn: (data) => api.post('/superadmin/broadcasts', data),
    onSuccess: () => {
      qc.invalidateQueries(['broadcasts']);
      setForm({ title: '', body: '', type: 'INFO', target: 'ALL' });
      setPreview(false);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    },
    onError: (e) => toast.error(e.message || 'Failed to send broadcast'),
  });

  const totalSent = broadcasts.reduce((s, b) => s + (b.recipient_count || 0), 0);
  const TypeIcon = TYPE_CFG[form.type]?.icon || Info;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Broadcast Center</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Send announcements, alerts, or promotions to restaurant chains
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Broadcasts', value: broadcasts.length, color: '#64748b', icon: Radio },
          { label: 'Total Recipients Reached', value: totalSent.toLocaleString(), color: '#16a34a', icon: Users },
          { label: 'This Month', value: broadcasts.filter(b => new Date(b.sent_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length, color: '#f59e0b', icon: Megaphone },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c.color}20` }}>
              <c.icon className="w-5 h-5" style={{ color: c.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{c.value}</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Compose */}
        <div className="col-span-3 space-y-4">
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Compose Broadcast</h2>

            {/* Type selector */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Message Type</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(TYPE_CFG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, type: key }))}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all"
                    style={{
                      background: form.type === key ? `${cfg.color}20` : 'var(--bg-primary)',
                      border: `1px solid ${form.type === key ? cfg.color : 'var(--border)'}`,
                    }}>
                    <cfg.icon className="w-4 h-4" style={{ color: cfg.color }} />
                    <span className="text-xs font-semibold" style={{ color: form.type === key ? cfg.color : 'var(--text-secondary)' }}>
                      {cfg.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target selector */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Send To</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(TARGET_CFG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, target: key }))}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={{
                      background: form.target === key ? 'var(--accent)' : 'var(--bg-primary)',
                      border: `1px solid ${form.target === key ? 'var(--accent)' : 'var(--border)'}`,
                      color: form.target === key ? 'var(--accent-text)' : 'var(--text-secondary)',
                    }}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Broadcast Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Scheduled Maintenance Tonight"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>

            {/* Body */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Message Body *</label>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={5} placeholder="Write your broadcast message here…"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{form.body.length}/500 characters</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setPreview(!preview)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {preview ? 'Edit' : 'Preview'}
              </button>
              <button
                onClick={() => sendMutation.mutate(form)}
                disabled={sendMutation.isPending || !form.title || !form.body}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex-1 justify-center"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                {sendMutation.isPending
                  ? <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  : <Send className="w-4 h-4" />}
                Send to {TARGET_CFG[form.target]?.label}
              </button>
            </div>
          </div>

          {/* Preview */}
          {preview && form.title && (
            <div className="rounded-xl p-5 space-y-3"
              style={{ background: `${TYPE_CFG[form.type]?.color}10`, border: `1px solid ${TYPE_CFG[form.type]?.color}40` }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: TYPE_CFG[form.type]?.color }}>Preview</p>
              <div className="flex items-start gap-3">
                <TypeIcon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: TYPE_CFG[form.type]?.color }} />
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{form.title}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{form.body}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                    Sending to: {TARGET_CFG[form.target]?.label} • From: MS-RM Support
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div className="col-span-2">
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Broadcast History</h3>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
              </div>
            ) : broadcasts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Radio className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No broadcasts sent yet</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {broadcasts.map(b => {
                  const cfg = TYPE_CFG[b.type] || TYPE_CFG.INFO;
                  return (
                    <div key={b.id} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: cfg.bg }}>
                          <cfg.icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.title}</p>
                          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{b.body}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                              {b.type}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              → {TARGET_CFG[b.target]?.label || b.target}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {b.recipient_count} recipients
                            </span>
                            <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>{timeAgo(b.sent_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {sent && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl z-50"
          style={{ background: 'color-mix(in srgb, #16a34a 14%, transparent)', border: '1px solid color-mix(in srgb, #16a34a 40%, transparent)', color: '#16a34a' }}>
          <CheckCircle2 className="w-4 h-4" />
          Broadcast sent successfully!
        </div>
      )}
    </div>
  );
}
