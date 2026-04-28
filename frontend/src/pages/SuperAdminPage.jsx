import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Building2, Plus, Users, Utensils, DollarSign, Globe,
  CheckCircle, X, RefreshCw, ArrowLeftRight, MapPin,
  Shield, Clock, Banknote, FileText, ChevronRight,
} from 'lucide-react';

/* ─── Region meta ─────────────────────────────────────────── */
const REGIONS = {
  IN: {
    label: 'India', flag: '🇮🇳', currency: 'INR', symbol: '₹',
    color: '#FF6B35', bg: '#FFF3EE', borderColor: '#FFD0B0',
    timezone: 'Asia/Kolkata', compliance: 'GSTIN / FSSAI',
    tax: 'CGST + SGST split', description: 'Standard Indian tax & compliance profile',
  },
  AU: {
    label: 'Australia', flag: '🇦🇺', currency: 'AUD', symbol: 'A$',
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
      toast.success(`✅ Switched to ${REGIONS[vars.region].flag} ${REGIONS[vars.region].label} profile!`);
      setRegionModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Region switch failed'),
  });

  const seedMenuMutation = useMutation({
    mutationFn: () => api.post('/menu/templates/seed'),
    onSuccess: () => toast.success('🇦🇺 Australian menu templates seeded!'),
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
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Platform Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Manage franchise chains · Switch region profiles · Australia & India
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => seedMenuMutation.mutate()} disabled={seedMenuMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            <Utensils className="w-4 h-4" />
            {seedMenuMutation.isPending ? 'Seeding...' : 'Seed AU Menus'}
          </button>
          <button onClick={() => setShowOnboard(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus className="w-4 h-4" /> Onboard Chain
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Building2 className="w-5 h-5" />} label="Total Chains"  value={chains.length}  color="#6366F1" />
        <KPICard icon={<span className="text-xl">🇮🇳</span>}                    label="India Chains"   value={inCount}  color="#FF6B35" />
        <KPICard icon={<span className="text-xl">🇦🇺</span>}                    label="AU Chains"      value={auCount}  color="#0052CC" />
        <KPICard icon={<DollarSign className="w-5 h-5" />}                      label="Active Plans"
          value={chains.filter(c => c.subscriptions?.[0]?.status === 'active').length} color="#10B981" />
      </div>

      {/* ══════════════════════════════════════════════════════
          REGION PROFILE SWITCHER  ← THE KEY MISSING SECTION
          ══════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: 'var(--accent)', background: 'var(--bg-card)' }}>
        {/* Banner */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ background: 'var(--accent)', borderColor: 'var(--accent)' }}>
          <ArrowLeftRight className="w-5 h-5 text-white" />
          <div>
            <p className="font-bold text-white text-sm">Switch Region Profile</p>
            <p className="text-white/80 text-xs">Change a chain's operating country — currency, timezone, tax model & compliance</p>
          </div>
        </div>

        <div className="p-5">
          {/* Region cards — the primary CTA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {['IN', 'AU'].map(rKey => {
              const r = REGIONS[rKey];
              const tpl = regionTemplates?.[rKey];
              const count = rKey === 'AU' ? auCount : inCount;
              return (
                <div key={rKey} className="rounded-xl border-2 p-4 transition-all"
                  style={{ borderColor: r.borderColor, background: r.bg }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="text-4xl">{r.flag}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-base" style={{ color: r.color }}>{r.label} Profile</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold text-white" style={{ background: r.color }}>
                            {count} chain{count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{r.description}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> {r.currency} ({r.symbol})</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.timezone.split('/').pop().replace('_', ' ')}</span>
                          <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {r.compliance}</span>
                          <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {r.tax}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-chain switch buttons — prominent list */}
          {chains.length === 0 ? (
            <div className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>
              <p className="text-sm">No chains yet. Onboard a chain first.</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-secondary)' }}>
                Click to switch a chain's region profile:
              </p>
              <div className="space-y-2">
                {chains.map(chain => {
                  const curRegion = chain.region || 'IN';
                  const targetRegion = curRegion === 'AU' ? 'IN' : 'AU';
                  const cur = REGIONS[curRegion];
                  const target = REGIONS[targetRegion];
                  return (
                    <div key={chain.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                          style={{ background: cur.color }}>
                          {chain.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{chain.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Currently: {cur.flag} {cur.label} · {cur.currency}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setRegionModal({ chain, targetRegion, abn: chain.abn || '', acn: chain.acn || '' })}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 shrink-0"
                        style={{ background: target.color }}>
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Switch to {target.flag} {target.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Chain grid ── */}
      <div>
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl border mb-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <input type="text" placeholder="Search chains..."
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            {['ALL', 'IN', 'AU'].map(r => (
              <button key={r} onClick={() => setFilterRegion(r)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: filterRegion === r ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: filterRegion === r ? '#fff' : 'var(--text-secondary)',
                }}>
                {r === 'ALL' ? 'All' : `${REGIONS[r].flag} ${r}`}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredChains.map(chain => {
            const curRegion = chain.region || 'IN';
            const r = REGIONS[curRegion];
            const target = REGIONS[curRegion === 'AU' ? 'IN' : 'AU'];
            return (
              <div key={chain.id} className="rounded-2xl border overflow-hidden transition-shadow hover:shadow-md"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                {/* Region accent bar */}
                <div className="h-1.5" style={{ background: r.color }} />

                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-black text-xl flex-shrink-0"
                      style={{ background: chain.primary_color || r.color }}>
                      {chain.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base truncate" style={{ color: 'var(--text-primary)' }}>{chain.name}</h3>
                        <span className="text-lg">{r.flag}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white"
                          style={{ background: chain.subscriptions?.[0]?.status === 'active' ? '#10B981' : '#EF4444' }}>
                          {chain.subscriptions?.[0]?.status || 'trial'}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {chain.contact_email} · {r.label} · {r.currency}
                      </p>
                      {curRegion === 'AU' && chain.abn && (
                        <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>ABN: {chain.abn}</p>
                      )}
                      {curRegion === 'IN' && chain.gstin && (
                        <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>GSTIN: {chain.gstin}</p>
                      )}
                      <div className="flex gap-5 mt-3">
                        <Stat label="Outlets" value={chain._count?.outlets || 0} />
                        <Stat label="Staff"   value={chain._count?.users || 0} />
                        <Stat label="Plan"    value={chain.subscriptions?.[0]?.plan_name || 'Free'} accent />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer with prominent switch */}
                <div className="px-5 py-3 border-t flex items-center justify-between gap-3"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {r.flag} {r.label} · {r.timezone.split('/').pop().replace('_', ' ')}
                    </span>
                  </div>
                  <button
                    onClick={() => setRegionModal({ chain, targetRegion: curRegion === 'AU' ? 'IN' : 'AU', abn: chain.abn || '', acn: chain.acn || '' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
                    style={{ background: target.color }}>
                    <ArrowLeftRight className="w-3 h-3" />
                    Switch to {target.flag} {target.label}
                  </button>
                </div>
              </div>
            );
          })}
          {filteredChains.length === 0 && (
            <div className="col-span-2 text-center py-16 rounded-2xl border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No chains found</p>
              <p className="text-xs mt-1">Try adjusting your filter or onboard a new chain.</p>
            </div>
          )}
        </div>
      </div>

      {/* ══ REGION SWITCH MODAL ══ */}
      {regionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" style={{ background: 'var(--bg-card)' }}>
            {/* Modal header */}
            <div className="p-5 border-b" style={{ borderColor: 'var(--border)', background: REGIONS[regionModal.targetRegion].color }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-white text-lg flex items-center gap-2">
                    {REGIONS[regionModal.targetRegion].flag} Switch to {REGIONS[regionModal.targetRegion].label} Profile
                  </h3>
                  <p className="text-white/80 text-xs mt-0.5">{regionModal.chain.name}</p>
                </div>
                <button onClick={() => setRegionModal(null)} className="text-white/70 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* What changes */}
              <div className="rounded-xl p-4 space-y-2.5 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Changes That Will Apply</p>
                {[
                  ['💱 Currency',    REGIONS[regionModal.targetRegion].currency + ' (' + REGIONS[regionModal.targetRegion].symbol + ')'],
                  ['🕐 Timezone',    REGIONS[regionModal.targetRegion].timezone],
                  ['🌏 Country',     regionModal.targetRegion === 'AU' ? 'Australia' : 'India'],
                  ['📋 Compliance',  REGIONS[regionModal.targetRegion].compliance],
                  ['🏦 Tax Model',   REGIONS[regionModal.targetRegion].tax],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* ABN / ACN fields for AU */}
              {regionModal.targetRegion === 'AU' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                      ABN — Australian Business Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      placeholder="e.g. 12 345 678 901"
                      value={regionModal.abn}
                      onChange={e => setRegionModal(p => ({ ...p, abn: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none mt-1"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>ACN — Australian Company Number (optional)</label>
                    <input
                      placeholder="e.g. 123 456 789"
                      value={regionModal.acn}
                      onChange={e => setRegionModal(p => ({ ...p, acn: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none mt-1"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                ⚠️ This also updates all outlets under this chain to use the new region defaults.
              </p>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setRegionModal(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
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
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: REGIONS[regionModal.targetRegion].color }}>
                  {switchRegionMutation.isPending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Switching…</>
                    : <><CheckCircle className="w-4 h-4" /> Confirm Switch to {REGIONS[regionModal.targetRegion].flag} {REGIONS[regionModal.targetRegion].label}</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ ONBOARD MODAL ══ */}
      {showOnboard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" style={{ background: 'var(--bg-card)' }}>
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Onboard New Restaurant Chain</h3>
              <button onClick={() => setShowOnboard(false)}><X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} /></button>
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
                  className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              ))}

              {/* Region selector */}
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Select Region Profile</p>
                <div className="grid grid-cols-2 gap-3">
                  {['IN', 'AU'].map(r => (
                    <button key={r} onClick={() => setFormData(p => ({ ...p, region: r }))}
                      className="py-3 rounded-xl text-sm font-bold border-2 transition-all"
                      style={{
                        borderColor: formData.region === r ? REGIONS[r].color : 'var(--border)',
                        background: formData.region === r ? REGIONS[r].bg : 'var(--bg-secondary)',
                        color: formData.region === r ? REGIONS[r].color : 'var(--text-secondary)',
                      }}>
                      <div className="text-2xl mb-1">{REGIONS[r].flag}</div>
                      <div>{REGIONS[r].label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{REGIONS[r].currency} · {REGIONS[r].compliance}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowOnboard(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <button onClick={() => onboardMutation.mutate(formData)}
                  disabled={onboardMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
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

function Stat({ label, value, accent }) {
  return (
    <div className="text-center">
      <span className="block text-lg font-black" style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</span>
      <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}
