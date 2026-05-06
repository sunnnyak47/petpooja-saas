/**
 * PlatformSettingsPage — Global platform configuration for superadmin
 * Route: /platform-settings
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Settings, Save, ToggleLeft, ToggleRight, IndianRupee,
  Shield, Globe, Clock, Users, AlertTriangle, CheckCircle2,
  RefreshCw, Building2, Mail, Phone, Lock
} from 'lucide-react';

const PLAN_COLORS = { TRIAL: '#94a3b8', STARTER: '#60a5fa', PRO: '#a78bfa', ENTERPRISE: '#4ade80' };

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-all ${disabled ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
      style={{ background: value ? '#6366f1' : 'var(--border)' }}
    >
      <div className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all"
        style={{ left: value ? '28px' : '4px' }} />
    </button>
  );
}

function SectionCard({ title, icon: Icon, color = '#6366f1', children }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, sub, children }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
      </div>
      <div className="flex-shrink-0 ml-4">{children}</div>
    </div>
  );
}

export default function PlatformSettingsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => api.get('/superadmin/platform-settings').then(r => r.data),
    staleTime: 60_000,
  });

  useEffect(() => { if (settings && !draft) setDraft({ ...settings }); }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.put('/superadmin/platform-settings', data),
    onSuccess: () => {
      qc.invalidateQueries(['platform-settings']);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }));
  const setNested = (key, subKey, val) => setDraft(d => ({ ...d, [key]: { ...d[key], [subKey]: val } }));

  if (isLoading || !draft) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Platform Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Global configuration for the entire MS-RM System platform
          </p>
        </div>
        <button
          onClick={() => saveMutation.mutate(draft)}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}
        >
          {saveMutation.isPending
            ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl"
        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} />
        <p className="text-sm" style={{ color: '#fbbf24' }}>
          Changes here affect the entire platform and all restaurant chains. Apply with caution.
        </p>
      </div>

      {/* Platform Identity */}
      <SectionCard title="Platform Identity" icon={Building2} color="#6366f1">
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Platform Name', key: 'platform_name', placeholder: 'MS-RM System' },
            { label: 'Support Email', key: 'support_email', placeholder: 'support@madsundigital.com' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
              <input
                value={draft[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Access Control */}
      <SectionCard title="Access Control" icon={Shield} color="#ef4444">
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          <SettingRow
            label="Maintenance Mode"
            sub="When ON, all restaurant logins are blocked with a maintenance message"
          >
            <div className="flex items-center gap-2">
              <Toggle value={draft.maintenance_mode} onChange={v => set('maintenance_mode', v)} />
              <span className="text-xs font-semibold" style={{ color: draft.maintenance_mode ? '#ef4444' : '#4ade80' }}>
                {draft.maintenance_mode ? 'ON — Platform Locked' : 'OFF — Normal'}
              </span>
            </div>
          </SettingRow>
          <SettingRow
            label="New Registrations"
            sub="Allow new restaurant chains to sign up"
          >
            <div className="flex items-center gap-2">
              <Toggle value={draft.registration_open} onChange={v => set('registration_open', v)} />
              <span className="text-xs font-semibold" style={{ color: draft.registration_open ? '#4ade80' : '#f59e0b' }}>
                {draft.registration_open ? 'Open' : 'Closed'}
              </span>
            </div>
          </SettingRow>
          <SettingRow
            label="Allow Impersonation"
            sub="Superadmin can log in as any chain owner"
          >
            <Toggle value={draft.allow_impersonation} onChange={v => set('allow_impersonation', v)} />
          </SettingRow>
          <SettingRow
            label="Onboarding Required"
            sub="New chains must complete setup wizard before accessing dashboard"
          >
            <Toggle value={draft.onboarding_required} onChange={v => set('onboarding_required', v)} />
          </SettingRow>
        </div>
      </SectionCard>

      {/* Plan Pricing */}
      <SectionCard title="Plan Pricing (₹/month)" icon={IndianRupee} color="#22c55e">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'].map(plan => (
            <div key={plan} className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: `1px solid ${PLAN_COLORS[plan]}40` }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: PLAN_COLORS[plan] }} />
                <span className="text-xs font-bold" style={{ color: PLAN_COLORS[plan] }}>{plan}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>₹</span>
                <input
                  type="number"
                  value={draft.plan_pricing?.[plan] ?? 0}
                  onChange={e => setNested('plan_pricing', plan, Number(e.target.value))}
                  className="flex-1 w-full px-2 py-1.5 rounded-lg text-sm font-bold outline-none"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  min="0"
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>/mo</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Outlet Limits */}
      <SectionCard title="Max Outlets Per Plan" icon={Globe} color="#f59e0b">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'].map(plan => (
            <div key={plan} className="rounded-xl p-4" style={{ background: 'var(--bg-primary)', border: `1px solid ${PLAN_COLORS[plan]}40` }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: PLAN_COLORS[plan] }} />
                <span className="text-xs font-bold" style={{ color: PLAN_COLORS[plan] }}>{plan}</span>
              </div>
              <input
                type="number"
                value={draft.max_outlets_per_plan?.[plan] ?? 1}
                onChange={e => setNested('max_outlets_per_plan', plan, Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded-lg text-sm font-bold outline-none text-center"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                min="1"
              />
              <p className="text-xs mt-1 text-center" style={{ color: 'var(--text-secondary)' }}>outlets max</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Session & Security */}
      <SectionCard title="Session & Security" icon={Lock} color="#8b5cf6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Default Trial Period (days)</label>
            <input
              type="number"
              value={draft.default_trial_days || 14}
              onChange={e => set('default_trial_days', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              min="1" max="365"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Session Timeout (hours)</label>
            <input
              type="number"
              value={draft.session_timeout_hours || 24}
              onChange={e => set('session_timeout_hours', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              min="1" max="720"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Minimum Password Length</label>
            <input
              type="number"
              value={draft.min_password_length || 8}
              onChange={e => set('min_password_length', Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              min="6" max="32"
            />
          </div>
        </div>
      </SectionCard>

      {/* Last updated */}
      {draft.updated_at && (
        <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
          Last updated: {new Date(draft.updated_at).toLocaleString()}
        </p>
      )}

      {saved && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl z-50"
          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80' }}>
          <CheckCircle2 className="w-4 h-4" />
          Platform settings saved successfully
        </div>
      )}
    </div>
  );
}
