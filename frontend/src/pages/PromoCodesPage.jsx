/**
 * PromoCodesPage — SaaS discount promo code management
 * Route: /promo-codes
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Tag, Plus, Trash2, Edit2, Copy, CheckCircle2, X,
  Percent, IndianRupee, Calendar, Users, ToggleLeft, ToggleRight, AlertCircle
} from 'lucide-react';

const PLAN_COLORS = { TRIAL: '#94a3b8', STARTER: '#60a5fa', PRO: '#a78bfa', ENTERPRISE: '#4ade80' };
const ALL_PLANS = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative w-10 h-5 rounded-full transition-all cursor-pointer"
      style={{ background: value ? '#6366f1' : 'var(--border)' }}>
      <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
        style={{ left: value ? '22px' : '2px' }} />
    </button>
  );
}

function PromoForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    code: '', discount_type: 'PERCENT', discount_value: 10,
    applicable_plans: ['STARTER', 'PRO', 'ENTERPRISE'],
    max_uses: '', valid_until: '', description: '',
  });

  const togglePlan = (plan) => {
    setForm(f => ({
      ...f,
      applicable_plans: f.applicable_plans.includes(plan)
        ? f.applicable_plans.filter(p => p !== plan)
        : [...f.applicable_plans, plan],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
            {initial ? 'Edit Promo Code' : 'New Promo Code'}
          </h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Promo Code *</label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. LAUNCH50"
              disabled={!!initial}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono font-bold outline-none uppercase disabled:opacity-50"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Discount Type</label>
              <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="PERCENT">Percentage (%)</option>
                <option value="FLAT">Flat Amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Discount Value {form.discount_type === 'PERCENT' ? '(%)' : '(₹)'}
              </label>
              <input type="number" value={form.discount_value}
                onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                min="0" max={form.discount_type === 'PERCENT' ? 100 : 99999} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Applicable Plans</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_PLANS.map(plan => (
                <button key={plan} onClick={() => togglePlan(plan)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: form.applicable_plans.includes(plan) ? `${PLAN_COLORS[plan]}20` : 'var(--bg-primary)',
                    border: `1px solid ${form.applicable_plans.includes(plan) ? PLAN_COLORS[plan] : 'var(--border)'}`,
                    color: form.applicable_plans.includes(plan) ? PLAN_COLORS[plan] : 'var(--text-secondary)',
                  }}>{plan}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max Uses (blank = unlimited)</label>
              <input type="number" value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: e.target.value ? Number(e.target.value) : '' }))}
                placeholder="Unlimited"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Valid Until (blank = forever)</label>
              <input type="date" value={form.valid_until ? form.valid_until.slice(0, 10) : ''}
                onChange={e => setForm(f => ({ ...f, valid_until: e.target.value ? new Date(e.target.value).toISOString() : '' }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Internal note about this code"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={!form.code}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}>
            <CheckCircle2 className="w-4 h-4" />
            {initial ? 'Save Changes' : 'Create Code'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PromoCodesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copied, setCopied] = useState(null);

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ['promo-codes'],
    queryFn: () => api.get('/superadmin/promo-codes').then(r => r.data),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/superadmin/promo-codes', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promo-codes'] }); setShowForm(false); },
    onError: (e) => toast.error(e.message || 'Failed to create promo code'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/superadmin/promo-codes/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promo-codes'] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/superadmin/promo-codes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promo-codes'] }),
  });

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (promo) => promo.valid_until && new Date(promo.valid_until) < new Date();
  const isMaxedOut = (promo) => promo.max_uses && promo.used_count >= promo.max_uses;

  const activeCount = promos.filter(p => p.is_active && !isExpired(p) && !isMaxedOut(p)).length;
  const totalUses = promos.reduce((s, p) => s + (p.used_count || 0), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Promo Codes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Create and manage SaaS discount codes for plan upgrades
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}>
          <Plus className="w-4 h-4" /> New Code
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Codes', value: activeCount, color: '#22c55e', icon: Tag },
          { label: 'Total Codes', value: promos.length, color: '#6366f1', icon: Tag },
          { label: 'Total Uses', value: totalUses, color: '#f59e0b', icon: Users },
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

      {/* Promo cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 rounded-xl"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <Tag className="w-10 h-10" style={{ color: 'var(--text-secondary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No promo codes yet</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Create a code to offer discounts on plan upgrades</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {promos.map(p => {
            const expired = isExpired(p);
            const maxed = isMaxedOut(p);
            const invalid = expired || maxed || !p.is_active;

            return (
              <div key={p.id} className="rounded-xl p-5 space-y-3"
                style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${invalid ? 'var(--border)' : '#6366f140'}`,
                  opacity: invalid ? 0.7 : 1,
                }}>
                {/* Code + actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg tracking-widest"
                      style={{ color: invalid ? 'var(--text-secondary)' : '#818cf8' }}>
                      {p.code}
                    </span>
                    <button onClick={() => copyCode(p.code)}
                      className="p-1 rounded hover:opacity-70">
                      {copied === p.code
                        ? <CheckCircle2 className="w-4 h-4" style={{ color: '#4ade80' }} />
                        : <Copy className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle
                      value={p.is_active && !expired && !maxed}
                      onChange={(v) => updateMutation.mutate({ id: p.id, data: { is_active: v } })}
                    />
                    <button onClick={() => setEditing(p)}
                      className="p-1.5 rounded-lg hover:opacity-80"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {/* TODO: Replace window.confirm with a state-based confirmation dialog */}
                    <button onClick={() => { if (confirm('Delete this promo code?')) deleteMutation.mutate(p.id); }}
                      className="p-1.5 rounded-lg hover:opacity-80"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Discount */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
                    style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                    {p.discount_type === 'PERCENT'
                      ? <Percent className="w-3.5 h-3.5" style={{ color: '#4ade80' }} />
                      : <IndianRupee className="w-3.5 h-3.5" style={{ color: '#4ade80' }} />}
                    <span className="text-sm font-bold" style={{ color: '#4ade80' }}>
                      {p.discount_type === 'PERCENT' ? `${p.discount_value}% off` : `₹${p.discount_value} off`}
                    </span>
                  </div>
                  {(expired || maxed || !p.is_active) && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                      {!p.is_active ? 'Disabled' : expired ? 'Expired' : 'Limit reached'}
                    </span>
                  )}
                  {p.description && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>
                  )}
                </div>

                {/* Plans */}
                <div className="flex gap-1.5 flex-wrap">
                  {(p.applicable_plans || []).map(plan => (
                    <span key={plan} className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: `${PLAN_COLORS[plan]}20`, color: PLAN_COLORS[plan] }}>{plan}</span>
                  ))}
                </div>

                {/* Usage + Validity */}
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>{p.used_count} used {p.max_uses ? `/ ${p.max_uses} max` : '(unlimited)'}</span>
                  </div>
                  {p.valid_until && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Expires {new Date(p.valid_until).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Usage bar */}
                {p.max_uses && (
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="h-1 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (p.used_count / p.max_uses) * 100)}%`,
                        background: maxed ? '#ef4444' : '#6366f1',
                      }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <PromoForm onSave={createMutation.mutate} onClose={() => setShowForm(false)} />}
      {editing && (
        <PromoForm
          initial={editing}
          onSave={(data) => updateMutation.mutate({ id: editing.id, data })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
