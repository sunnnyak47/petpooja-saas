import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Building2, Plus, Users, Utensils, CreditCard, ExternalLink,
  ShieldCheck, AlertCircle, Globe, MapPin, DollarSign, FileText,
  ToggleLeft, ToggleRight, RefreshCw, CheckCircle, X, ChevronDown,
} from 'lucide-react';

const REGIONS = {
  IN: { label: 'India', flag: '🇮🇳', currency: 'INR', symbol: '₹', color: '#FF6B35', timezone: 'Asia/Kolkata' },
  AU: { label: 'Australia', flag: '🇦🇺', currency: 'AUD', symbol: 'A$', color: '#0052CC', timezone: 'Australia/Sydney' },
};

export default function SuperAdminPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [regionModal, setRegionModal] = useState(null); // { chain, region }
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [searchQ, setSearchQ] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', region: 'IN' });

  const { data: chains = [], isLoading } = useQuery({
    queryKey: ['admin-chains'],
    queryFn: () => api.get('/ho/chains').then(r => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/ho/dashboard').then(r => r.data),
  });

  const { data: regionTemplates } = useQuery({
    queryKey: ['region-templates'],
    queryFn: () => api.get('/superadmin/region-templates').then(r => r.data),
  });

  const onboardMutation = useMutation({
    mutationFn: (data) => api.post('/ho/register', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success('Restaurant chain onboarded!');
      setShowModal(false);
      setFormData({ name: '', email: '', phone: '', password: '', region: 'IN' });
    },
    onError: (e) => toast.error(e.message || 'Onboarding failed'),
  });

  const switchRegionMutation = useMutation({
    mutationFn: ({ chainId, region, abn, acn }) =>
      api.patch(`/superadmin/chains/${chainId}/region`, { region, abn, acn }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success(`Switched to ${REGIONS[vars.region].label} profile 🎉`);
      setRegionModal(null);
    },
    onError: (e) => toast.error(e.message || 'Region switch failed'),
  });

  const seedMenuMutation = useMutation({
    mutationFn: () => api.post('/menu/templates/seed'),
    onSuccess: () => toast.success('Australian menu templates seeded!'),
    onError: (e) => toast.error(e.message),
  });

  const filteredChains = chains.filter(c => {
    const r = c.region || 'IN';
    if (filterRegion !== 'ALL' && r !== filterRegion) return false;
    if (searchQ && !c.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const auCount = chains.filter(c => (c.region || 'IN') === 'AU').length;
  const inCount = chains.filter(c => (c.region || 'IN') === 'IN').length;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Loading platform...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Platform Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Manage franchise chains across India & Australia
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => seedMenuMutation.mutate()}
            disabled={seedMenuMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            <Utensils className="w-4 h-4" /> {seedMenuMutation.isPending ? 'Seeding...' : 'Seed AU Menus'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Plus className="w-4 h-4" /> Onboard Chain
          </button>
        </div>
      </div>

      {/* Region KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Building2 className="w-5 h-5" />} label="Total Chains" value={chains.length} color="#6366F1" />
        <KPICard icon={<span className="text-xl">🇮🇳</span>} label="India Chains" value={inCount} color="#FF6B35" />
        <KPICard icon={<span className="text-xl">🇦🇺</span>} label="AU Chains" value={auCount} color="#0052CC" />
        <KPICard icon={<DollarSign className="w-5 h-5" />} label="Active Plans" value={chains.filter(c => c.subscriptions?.[0]?.status === 'active').length} color="#10B981" />
      </div>

      {/* Region Summary Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['AU', 'IN'].map(region => {
          const r = REGIONS[region];
          const tpl = regionTemplates?.[region];
          return (
            <div key={region} className="rounded-2xl p-5 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{r.flag}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{r.label} Profile</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: r.color }}>{r.currency}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{tpl?.description || `Default ${r.label} configuration`}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>🕐 {r.timezone}</span>
                    <span>💲 {r.symbol}</span>
                    <span>📋 {region === 'AU' ? 'ABN/ACN' : 'GSTIN/FSSAI'}</span>
                    <span>🏦 {region === 'AU' ? 'GST-inclusive 10%' : 'CGST/SGST'}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex-1 relative min-w-[200px]">
          <input
            type="text"
            placeholder="Search chains..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-lg text-sm border outline-none"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-2">
          {['ALL', 'IN', 'AU'].map(r => (
            <button
              key={r}
              onClick={() => setFilterRegion(r)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: filterRegion === r ? 'var(--accent)' : 'var(--bg-secondary)',
                color: filterRegion === r ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {r === 'ALL' ? 'All' : `${REGIONS[r].flag} ${r}`}
            </button>
          ))}
        </div>
      </div>

      {/* Chains grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredChains.map(chain => {
          const region = chain.region || 'IN';
          const r = REGIONS[region];
          return (
            <div
              key={chain.id}
              className="rounded-2xl border overflow-hidden transition-shadow hover:shadow-lg"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              {/* Region banner */}
              <div className="h-1" style={{ background: r.color }} />

              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-black text-xl flex-shrink-0"
                    style={{ background: chain.primary_color || r.color }}
                  >
                    {chain.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base truncate" style={{ color: 'var(--text-primary)' }}>{chain.name}</h3>
                      <span className="text-lg flex-shrink-0">{r.flag}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white flex-shrink-0"
                        style={{ background: chain.subscriptions?.[0]?.status === 'active' ? '#10B981' : '#EF4444' }}>
                        {chain.subscriptions?.[0]?.status || 'trial'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {chain.contact_email} · {r.label} · {r.currency}
                    </p>
                    {region === 'AU' && chain.abn && (
                      <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>ABN: {chain.abn}</p>
                    )}
                    {region === 'IN' && chain.gstin && (
                      <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>GSTIN: {chain.gstin}</p>
                    )}
                    <div className="flex gap-5 mt-3">
                      <div className="text-center">
                        <span className="block text-lg font-black" style={{ color: 'var(--text-primary)' }}>{chain._count?.outlets || 0}</span>
                        <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-secondary)' }}>Outlets</span>
                      </div>
                      <div className="text-center border-l pl-5" style={{ borderColor: 'var(--border)' }}>
                        <span className="block text-lg font-black" style={{ color: 'var(--text-primary)' }}>{chain._count?.users || 0}</span>
                        <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-secondary)' }}>Staff</span>
                      </div>
                      <div className="text-center border-l pl-5" style={{ borderColor: 'var(--border)' }}>
                        <span className="block text-sm font-black" style={{ color: 'var(--accent)' }}>{chain.subscriptions?.[0]?.plan_name || 'Free'}</span>
                        <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-secondary)' }}>Plan</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <button
                  onClick={() => setRegionModal({ chain, targetRegion: region === 'AU' ? 'IN' : 'AU', abn: '', acn: '' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Switch to {region === 'AU' ? '🇮🇳 IN' : '🇦🇺 AU'}
                </button>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {r.flag} {r.timezone.split('/').pop().replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Region Switch Modal */}
      {regionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  Switch to {REGIONS[regionModal.targetRegion].flag} {REGIONS[regionModal.targetRegion].label} Profile
                </h3>
                <button onClick={() => setRegionModal(null)}>
                  <X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                This will update currency, timezone, and compliance profile for <strong>{regionModal.chain.name}</strong> and all its outlets.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* What will change */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-secondary)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Changes Applied</p>
                {[
                  ['Currency', REGIONS[regionModal.targetRegion].currency],
                  ['Timezone', REGIONS[regionModal.targetRegion].timezone],
                  ['Country', regionModal.targetRegion === 'AU' ? 'Australia' : 'India'],
                  ['Compliance', regionModal.targetRegion === 'AU' ? 'ABN/ACN' : 'GSTIN/FSSAI'],
                  ['Tax Model', regionModal.targetRegion === 'AU' ? 'GST-inclusive 10%' : 'CGST/SGST split'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{v}</span>
                  </div>
                ))}
              </div>

              {regionModal.targetRegion === 'AU' && (
                <div className="space-y-3">
                  <input
                    placeholder="ABN (Australian Business Number) e.g. 12 345 678 901"
                    value={regionModal.abn}
                    onChange={e => setRegionModal(p => ({ ...p, abn: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <input
                    placeholder="ACN (optional)"
                    value={regionModal.acn}
                    onChange={e => setRegionModal(p => ({ ...p, acn: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setRegionModal(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => switchRegionMutation.mutate({
                    chainId: regionModal.chain.id,
                    region: regionModal.targetRegion,
                    abn: regionModal.abn,
                    acn: regionModal.acn,
                  })}
                  disabled={switchRegionMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ background: REGIONS[regionModal.targetRegion].color }}
                >
                  {switchRegionMutation.isPending ? 'Switching...' : `Switch to ${REGIONS[regionModal.targetRegion].label} ✓`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboard Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Onboard New Restaurant Chain</h3>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <input
                placeholder="Restaurant Chain Name"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                placeholder="Owner Email"
                type="email"
                value={formData.email}
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                placeholder="Phone"
                value={formData.phone}
                onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                placeholder="Initial Password"
                type="password"
                value={formData.password}
                onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="grid grid-cols-2 gap-3">
                {['IN', 'AU'].map(r => (
                  <button
                    key={r}
                    onClick={() => setFormData(p => ({ ...p, region: r }))}
                    className="py-2.5 rounded-lg text-sm font-semibold border transition-colors"
                    style={{
                      borderColor: formData.region === r ? REGIONS[r].color : 'var(--border)',
                      background: formData.region === r ? `${REGIONS[r].color}15` : 'var(--bg-secondary)',
                      color: formData.region === r ? REGIONS[r].color : 'var(--text-secondary)',
                    }}
                  >
                    {REGIONS[r].flag} {REGIONS[r].label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => onboardMutation.mutate(formData)}
                  disabled={onboardMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--accent)' }}
                >
                  {onboardMutation.isPending ? 'Creating...' : 'Create Chain'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ icon, label, value, color }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
    </div>
  );
}
