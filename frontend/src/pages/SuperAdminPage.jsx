import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Building2, Plus, Users, Utensils, DollarSign, Globe,
  CheckCircle, X, RefreshCw, ArrowLeftRight, MapPin,
  Shield, Clock, Banknote, FileText, ChevronRight, Search,
} from 'lucide-react';

/* ─── Region meta ─────────────────────────────────────────── */
const REGIONS = {
  IN: {
    label: 'India', flag: '\u{1F1EE}\u{1F1F3}', currency: 'INR', symbol: '₹',
    color: '#FF6B35', bg: '#FFF3EE', borderColor: '#FFD0B0',
    timezone: 'Asia/Kolkata', compliance: 'GSTIN / FSSAI',
    tax: 'CGST + SGST split', description: 'Standard Indian tax & compliance profile',
  },
  AU: {
    label: 'Australia', flag: '\u{1F1E6}\u{1F1FA}', currency: 'AUD', symbol: 'A$',
    color: '#0052CC', bg: '#EEF4FF', borderColor: '#B0CAFF',
    timezone: 'Australia/Sydney', compliance: 'ABN / ACN',
    tax: 'GST-inclusive 10%', description: 'Australian business & compliance profile',
  },
};

export default function SuperAdminPage() {
  const queryClient = useQueryClient();
  const [showOnboard, setShowOnboard]   = useState(false);
  const [regionModal, setRegionModal]   = useState(null); // { chain, targetRegion, abn, acn }
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [searchQ, setSearchQ]           = useState('');
  const [formData, setFormData]         = useState({ name: '', email: '', phone: '', password: '', region: 'IN' });

  const { data: chains = [], isLoading } = useQuery({
    queryKey: ['admin-chains'],
    queryFn: () => api.get('/ho/chains').then(r => r.data),
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
      setShowOnboard(false);
      setFormData({ name: '', email: '', phone: '', password: '', region: 'IN' });
    },
    onError: (e) => toast.error(e.message || 'Onboarding failed'),
  });

  const switchRegionMutation = useMutation({
    mutationFn: ({ chainId, region, abn, acn }) =>
      api.patch(`/superadmin/chains/${chainId}/region`, { region, abn, acn }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success(`Switched to ${REGIONS[vars.region].flag} ${REGIONS[vars.region].label} profile!`);
      setRegionModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Region switch failed'),
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
        <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading platform...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Platform Management
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Manage franchise chains, region profiles, and onboarding
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => seedMenuMutation.mutate()} disabled={seedMenuMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
            <Utensils className="w-4 h-4" />
            {seedMenuMutation.isPending ? 'Seeding...' : 'Seed AU Menus'}
          </button>
          <button onClick={() => setShowOnboard(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}>
            <Plus className="w-4 h-4" /> Onboard Chain
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Building2 className="w-5 h-5" />} label="Total Chains"  value={chains.length}  color="#6366F1" />
        <KPICard icon={<span className="text-lg">{REGIONS.IN.flag}</span>}       label="India Chains"   value={inCount}  color="#FF6B35" />
        <KPICard icon={<span className="text-lg">{REGIONS.AU.flag}</span>}       label="AU Chains"      value={auCount}  color="#0052CC" />
        <KPICard icon={<DollarSign className="w-5 h-5" />}                      label="Active Plans"
          value={chains.filter(c => c.subscriptions?.[0]?.status === 'active').length} color="#10B981" />
      </div>

      {/* ── Region Profile Switcher ── */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent)', opacity: 0.1 }}>
            </div>
            <ArrowLeftRight className="w-4 h-4 absolute ml-2" style={{ color: 'var(--accent)' }} />
            <div className="ml-6">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Region Profiles</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Currency, timezone, tax model and compliance by country
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          {/* Region cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {['IN', 'AU'].map(rKey => {
              const r = REGIONS[rKey];
              const count = rKey === 'AU' ? auCount : inCount;
              return (
                <div key={rKey} className="rounded-xl border overflow-hidden flex"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
                  <div className="w-1 flex-shrink-0" style={{ background: r.color }} />
                  <div className="p-4 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl leading-none">{r.flag}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{r.label}</h3>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: `${r.color}12`, color: r.color }}>
                              {count} chain{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{r.description}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> {r.currency} ({r.symbol})</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.timezone.split('/').pop().replace('_', ' ')}</span>
                            <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {r.compliance}</span>
                            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {r.tax}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Chain grid ── */}
      <div>
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input type="text" placeholder="Search chains..."
              value={searchQ} onChange={e => setSearchQ(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                '--tw-ring-color': 'var(--accent)',
              }} />
          </div>
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {['ALL', 'IN', 'AU'].map(r => (
              <button key={r} onClick={() => setFilterRegion(r)}
                className="px-4 py-2 text-xs font-medium transition-colors"
                style={{
                  background: filterRegion === r ? 'var(--accent)' : 'var(--bg-primary)',
                  color: filterRegion === r ? '#fff' : 'var(--text-secondary)',
                  borderRight: r !== 'AU' ? '1px solid var(--border)' : 'none',
                }}>
                {r === 'ALL' ? 'All' : `${REGIONS[r].flag} ${r}`}
              </button>
            ))}
          </div>
        </div>

        {/* Section label */}
        <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
          Chains
        </p>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredChains.map(chain => {
            const curRegion = chain.region || 'IN';
            const r = REGIONS[curRegion];
            const target = REGIONS[curRegion === 'AU' ? 'IN' : 'AU'];
            const sub = chain.subscriptions?.[0];
            const status = sub?.status || 'trial';
            const statusColor = status === 'active' ? '#10B981' : status === 'trial' ? '#F59E0B' : '#EF4444';

            return (
              <div key={chain.id} className="rounded-xl border transition-shadow hover:shadow-sm"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                      style={{ background: chain.primary_color || r.color }}>
                      {chain.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{chain.name}</h3>
                        <span className="text-sm">{r.flag}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${statusColor}14`, color: statusColor }}>
                          {status}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {chain.contact_email}
                      </p>
                      {curRegion === 'AU' && chain.abn && (
                        <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>ABN: {chain.abn}</p>
                      )}
                      {curRegion === 'IN' && chain.gstin && (
                        <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>GSTIN: {chain.gstin}</p>
                      )}

                      {/* Stats row with dividers */}
                      <div className="flex items-center gap-0 mt-3">
                        <Stat label="Outlets" value={chain._count?.outlets || 0} />
                        <div className="w-px h-8 mx-4" style={{ background: 'var(--border)' }} />
                        <Stat label="Staff" value={chain._count?.users || 0} />
                        <div className="w-px h-8 mx-4" style={{ background: 'var(--border)' }} />
                        <Stat label="Plan" value={sub?.plan_name || 'Free'} accent />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t flex items-center justify-between gap-3"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {r.flag} {r.label} · {r.currency} · {r.timezone.split('/').pop().replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => setRegionModal({ chain, targetRegion: curRegion === 'AU' ? 'IN' : 'AU', abn: chain.abn || '', acn: chain.acn || '' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                    <ArrowLeftRight className="w-3 h-3" />
                    Switch to {target.flag} {target.label}
                  </button>
                </div>
              </div>
            );
          })}
          {filteredChains.length === 0 && (
            <div className="col-span-2 flex flex-col items-center justify-center py-16 rounded-xl border"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
              <Building2 className="w-12 h-12 mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No chains found</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Try adjusting your filter or onboard a new chain.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Region Switch Modal ── */}
      {regionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-md overflow-hidden shadow-xl border"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            {/* Modal header */}
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                  Switch to {REGIONS[regionModal.targetRegion].flag} {REGIONS[regionModal.targetRegion].label}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{regionModal.chain.name}</p>
              </div>
              <button onClick={() => setRegionModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* What changes */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Changes that will apply
                </p>
                <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                  {[
                    ['Currency',    REGIONS[regionModal.targetRegion].currency + ' (' + REGIONS[regionModal.targetRegion].symbol + ')'],
                    ['Timezone',    REGIONS[regionModal.targetRegion].timezone],
                    ['Country',     regionModal.targetRegion === 'AU' ? 'Australia' : 'India'],
                    ['Compliance',  REGIONS[regionModal.targetRegion].compliance],
                    ['Tax Model',   REGIONS[regionModal.targetRegion].tax],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center px-3.5 py-2.5 text-sm"
                      style={{ borderColor: 'var(--border)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ABN / ACN fields for AU */}
              {regionModal.targetRegion === 'AU' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                      ABN (Australian Business Number) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      placeholder="e.g. 12 345 678 901"
                      value={regionModal.abn}
                      onChange={e => setRegionModal(p => ({ ...p, abn: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                      style={{
                        background: 'var(--bg-secondary)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                        '--tw-ring-color': 'var(--accent)',
                      }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                      ACN (Australian Company Number)
                      <span className="ml-1 opacity-60">optional</span>
                    </label>
                    <input
                      placeholder="e.g. 123 456 789"
                      value={regionModal.acn}
                      onChange={e => setRegionModal(p => ({ ...p, acn: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                      style={{
                        background: 'var(--bg-secondary)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                        '--tw-ring-color': 'var(--accent)',
                      }} />
                  </div>
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                This will also update all outlets under this chain to use the new region defaults.
              </p>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setRegionModal(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
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
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: 'var(--accent)' }}>
                  {switchRegionMutation.isPending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Switching...</>
                    : <><CheckCircle className="w-4 h-4" /> Confirm Switch</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Onboard Modal ── */}
      {showOnboard && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-md overflow-hidden shadow-xl border"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Onboard New Chain</h3>
              <button onClick={() => setShowOnboard(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { key: 'name',     placeholder: 'Restaurant Chain Name', type: 'text' },
                { key: 'email',    placeholder: 'Owner Email',           type: 'email' },
                { key: 'phone',    placeholder: 'Phone',                  type: 'text' },
                { key: 'password', placeholder: 'Initial Password',       type: 'password' },
              ].map(f => (
                <input key={f.key} type={f.type} placeholder={f.placeholder}
                  value={formData[f.key]}
                  onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                  style={{
                    background: 'var(--bg-secondary)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                    '--tw-ring-color': 'var(--accent)',
                  }} />
              ))}

              {/* Region selector */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Region
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {['IN', 'AU'].map(r => (
                    <button key={r} onClick={() => setFormData(p => ({ ...p, region: r }))}
                      className="py-3 rounded-lg text-sm font-medium border transition-all"
                      style={{
                        borderColor: formData.region === r ? 'var(--accent)' : 'var(--border)',
                        background: formData.region === r ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                        color: formData.region === r ? 'var(--text-primary)' : 'var(--text-secondary)',
                        boxShadow: formData.region === r ? '0 0 0 1px var(--accent)' : 'none',
                      }}>
                      <div className="text-2xl mb-1">{REGIONS[r].flag}</div>
                      <div>{REGIONS[r].label}</div>
                      <div className="text-[10px] mt-0.5 opacity-60">{REGIONS[r].currency} · {REGIONS[r].compliance}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowOnboard(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  Cancel
                </button>
                <button onClick={() => onboardMutation.mutate(formData)}
                  disabled={onboardMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90"
                  style={{ background: 'var(--accent)' }}>
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
    <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        </div>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}10`, color }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <span className="block text-sm font-semibold" style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>
        {value}
      </span>
      <span className="text-[10px] uppercase font-medium tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </div>
  );
}
