import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { hasSAPermission } from '../lib/platformRoles';
import {
  Building2, Plus, Users, Utensils, DollarSign, Globe,
  CheckCircle, X, RefreshCw, ArrowLeftRight, MapPin,
  Shield, Clock, Banknote, FileText, ChevronRight, Search,
  LogIn, PauseCircle, PlayCircle, StickyNote, ShoppingCart,
  TrendingUp, BarChart3, Loader2, Rocket, Check, KeyRound, Copy,
  Trash2, RotateCcw,
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

const PLAN_COLORS = {
  TRIAL:      { bg: '#FEF3C7', color: '#D97706', border: '#FCD34D' },
  STARTER:    { bg: '#DBEAFE', color: '#1D4ED8', border: '#93C5FD' },
  PRO:        { bg: '#EDE9FE', color: '#7C3AED', border: '#C4B5FD' },
  ENTERPRISE: { bg: '#D1FAE5', color: '#065F46', border: '#6EE7B7' },
};

const PLANS = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];

/* Clean region marker — a typographic code chip instead of an emoji flag
   (emoji flags render as inconsistent platform PNGs and look unprofessional). */
function RegionChip({ code, size = 'md' }) {
  const color = REGIONS[code]?.color || 'var(--text-secondary)';
  const d = size === 'lg' ? 34 : size === 'sm' ? 22 : 28;
  const fs = size === 'lg' ? 12 : size === 'sm' ? 9 : 11;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: d, height: d, borderRadius: Math.round(d / 3.5), flexShrink: 0,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      color, fontWeight: 700, fontSize: fs, letterSpacing: '0.02em',
    }}>{code}</span>
  );
}

export default function SuperAdminPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showOnboard, setShowOnboard]   = useState(false);
  const [regionModal, setRegionModal]   = useState(null);
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [searchQ, setSearchQ]           = useState('');
  const [formData, setFormData]         = useState({ name: '', email: '', phone: '', password: '', region: 'IN', owner_name: '', city: '', abn: '', acn: '' });
  const [notesModal, setNotesModal]     = useState(null); // { chain, text }
  const [planDropdown, setPlanDropdown] = useState(null); // chain.id
  const [resetResult, setResetResult] = useState(null); // { owner_email, temp_password, chainName }
  const [resetConfirm, setResetConfirm] = useState(null); // chain pending reset confirmation
  const [activeTab, setActiveTab]       = useState('chains');

  const { data: chains = [], isLoading } = useQuery({
    queryKey: ['admin-chains'],
    queryFn: () => api.get('/ho/chains').then(r => r.data),
  });

  const { data: regionTemplates } = useQuery({
    queryKey: ['region-templates'],
    queryFn: () => api.get('/superadmin/region-templates').then(r => r.data),
  });

  const { data: liveStats } = useQuery({
    queryKey: ['live-stats'],
    queryFn: () => api.get('/superadmin/live-stats').then(r => r.data),
    refetchInterval: 30000,
  });

  const onboardMutation = useMutation({
    mutationFn: (data) => api.post('/ho/register', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      queryClient.invalidateQueries(['live-stats']);
      queryClient.invalidateQueries(['onboarding-overview']);
      toast.success('Restaurant chain onboarded!');
      setShowOnboard(false);
      setFormData({ name: '', email: '', phone: '', password: '', region: 'IN', owner_name: '', city: '', abn: '', acn: '' });
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message || 'Onboarding failed'),
  });

  const switchRegionMutation = useMutation({
    mutationFn: ({ chainId, region, abn, acn }) =>
      api.patch(`/superadmin/chains/${chainId}/region`, { region, abn, acn }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success(`Switched to ${REGIONS[vars.region].label} profile!`);
      setRegionModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Region switch failed'),
  });

  const seedMenuMutation = useMutation({
    mutationFn: () => api.post('/menu/templates/seed'),
    onSuccess: () => toast.success('Australian menu templates seeded!'),
    onError: (e) => toast.error(e.message),
  });

  const resetLoginMutation = useMutation({
    mutationFn: (chainId) => api.post(`/superadmin/chains/${chainId}/reset-owner-password`),
    onSuccess: (res, chainId) => {
      const d = res?.data || res || {};
      const chainName = chains.find(c => c.id === chainId)?.name || 'this chain';
      setResetResult({ ...d, chainName });
    },
    onError: (e) => toast.error(e?.message || e?.response?.data?.message || 'Reset failed'),
  });

  const impersonateMutation = useMutation({
    mutationFn: (head_office_id) => api.post('/superadmin/impersonate', { head_office_id }),
    onSuccess: (res, head_office_id) => {
      const { token, user: impUser } = res.data;
      const chainName = chains.find(c => c.id === head_office_id)?.name || 'chain';
      const adminToken = localStorage.getItem('accessToken');
      const adminUser = localStorage.getItem('user');
      // Save admin session for restore
      localStorage.setItem('impersonate_token', token);
      localStorage.setItem('admin_restore_token', adminToken);
      localStorage.setItem('admin_restore_user', adminUser || '');
      // Decode impersonated token to get user payload
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const impersonatedUser = {
          ...(impUser || {}),
          id: payload.id,
          email: payload.email,
          role: payload.role || 'owner',
          full_name: impUser?.full_name || payload.full_name || 'Owner',
          head_office_id: payload.head_office_id,
          impersonated: true,
        };
        localStorage.setItem('accessToken', token);
        localStorage.setItem('user', JSON.stringify(impersonatedUser));
      } catch {
        localStorage.setItem('accessToken', token);
      }
      toast.success(`Viewing as ${chainName}`);
      window.location.href = window.location.origin + window.location.pathname + '#/';
      window.location.reload();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Impersonation failed'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }) =>
      api.patch(`/superadmin/chains/${id}/status`, { action, reason: '' }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success('Chain status updated');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Status update failed'),
  });

  const planMutation = useMutation({
    mutationFn: ({ id, plan }) => api.patch(`/superadmin/chains/${id}/plan`, { plan }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success('Plan updated');
      setPlanDropdown(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Plan update failed'),
  });

  const notesMutation = useMutation({
    mutationFn: ({ id, notes }) => api.patch(`/superadmin/chains/${id}/notes`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      toast.success('Notes saved');
      setNotesModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Save failed'),
  });

  // ── Chain lifecycle: transfer ownership + soft-delete / restore ──
  const { user } = useSelector((s) => s.auth);
  const canDelete = hasSAPermission(user, 'sa.chains.delete');
  const [transferModal, setTransferModal] = useState(null);   // { chain, mode, full_name, email, phone }
  const [transferResult, setTransferResult] = useState(null); // { previous_owner, new_owner, temp_password, chainName }
  const [deleteConfirm, setDeleteConfirm] = useState(null);   // { chain, reason }
  const [showDeleted, setShowDeleted] = useState(false);

  const transferMutation = useMutation({
    mutationFn: ({ id, body }) => api.post(`/superadmin/chains/${id}/transfer-ownership`, body).then(r => r.data),
    onSuccess: (d, vars) => {
      const chainName = chains.find(c => c.id === vars.id)?.name || 'this chain';
      setTransferModal(null);
      setTransferResult({ ...(d || {}), chainName });
      queryClient.invalidateQueries(['admin-chains']);
    },
    onError: (e) => toast.error(e?.message || 'Transfer failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }) => api.delete(`/superadmin/chains/${id}`, { data: { reason: reason || '' } }),
    onSuccess: () => {
      setDeleteConfirm(null);
      queryClient.invalidateQueries(['admin-chains']);
      queryClient.invalidateQueries(['deleted-chains']);
      toast.success('Chain archived');
    },
    onError: (e) => { toast.error(e?.message || 'Delete failed'); setDeleteConfirm(null); },
  });

  const restoreMutation = useMutation({
    mutationFn: (id) => api.post(`/superadmin/chains/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-chains']);
      queryClient.invalidateQueries(['deleted-chains']);
      toast.success('Chain restored');
    },
    onError: (e) => toast.error(e?.message || 'Restore failed'),
  });

  const { data: deletedChains = [] } = useQuery({
    queryKey: ['deleted-chains'],
    queryFn: () => api.get('/superadmin/chains-deleted').then(r => r.data || []),
    enabled: canDelete,
    staleTime: 30_000,
  });

  const { data: onboardingData = [], isLoading: onboardingLoading, refetch: refetchOnboarding } = useQuery({
    queryKey: ['onboarding-overview'],
    queryFn: () => api.get('/superadmin/onboarding-overview').then(r => r.data || []),
    enabled: activeTab === 'onboarding',
  });

  const resetWizardMutation = useMutation({
    mutationFn: (chainId) => api.post(`/superadmin/chains/${chainId}/reset-wizard`),
    onSuccess: () => {
      queryClient.invalidateQueries(['onboarding-overview']);
      toast.success('Wizard reset for this chain');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Reset failed'),
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

  // Backend /superadmin/live-stats returns { today:{orders,revenue}, this_month:{orders}, ... }.
  // Read the nested paths (the old flat reads were always undefined → '—').
  const ordersToday     = liveStats?.today?.orders;
  const revenueToday    = liveStats?.today?.revenue;
  const ordersThisMonth = liveStats?.this_month?.orders;
  // The payload carries no currency_symbol and the revenue is a cross-region
  // (₹ + A$) sum, so only prefix a symbol if the backend ever supplies one.
  const sym = liveStats?.currency_symbol || '';

  return (
    <div className="space-y-6 animate-fade-in pb-10" onClick={() => setPlanDropdown(null)}>

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

      {/* ── Live Stats Bar ── */}
      <div className="rounded-xl border p-4" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Live Platform Stats · refreshes every 30s
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <LiveStatCard
            icon={<ShoppingCart className="w-4 h-4" />}
            label="Orders Today"
            value={ordersToday ?? '—'}
            color="#16a34a"
          />
          <LiveStatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Revenue Today"
            value={revenueToday != null ? `${sym}${Number(revenueToday).toLocaleString()}` : '—'}
            color="#64748b"
          />
          <LiveStatCard
            icon={<Building2 className="w-4 h-4" />}
            label="Active Chains"
            value={liveStats?.active_chains ?? chains.filter(c => c.is_active !== false).length}
            color="#64748b"
          />
          <LiveStatCard
            icon={<BarChart3 className="w-4 h-4" />}
            label="Orders This Month"
            value={ordersThisMonth ?? '—'}
            color="#f59e0b"
          />
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Building2 className="w-5 h-5" />} label="Total Chains"  value={chains.length}  color="var(--accent)" />
        <KPICard icon={<span className="text-xs font-bold">IN</span>}            label="India Chains"   value={inCount}  color="#FF6B35" />
        <KPICard icon={<span className="text-xs font-bold">AU</span>}            label="AU Chains"      value={auCount}  color="#0052CC" />
        <KPICard icon={<DollarSign className="w-5 h-5" />}                      label="Active Plans"
          value={chains.filter(c => c.subscriptions?.[0]?.status === 'active').length} color="#16a34a" />
      </div>

      {/* ── Region Profile Switcher ── */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
              <ArrowLeftRight className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Region Profiles</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Currency, timezone, tax model and compliance by country
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
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
                        <RegionChip code={rKey} size="lg" />
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

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 p-1 rounded-2xl mb-6 w-fit"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        {[
          { id: 'chains', label: 'Chains', icon: Building2, count: chains.length },
          { id: 'onboarding', label: 'Onboarding', icon: Rocket, count: null },
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: active ? 'var(--bg-primary)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== null && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Chain grid ── */}
      {activeTab === 'chains' && (
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
                  color: filterRegion === r ? 'var(--accent-text)' : 'var(--text-secondary)',
                  borderRight: r !== 'AU' ? '1px solid var(--border)' : 'none',
                }}>
                {r === 'ALL' ? 'All' : r}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
          Chains
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredChains.map(chain => {
            const curRegion = chain.region || 'IN';
            const r = REGIONS[curRegion];
            const target = REGIONS[curRegion === 'AU' ? 'IN' : 'AU'];
            const sub = chain.subscriptions?.[0];
            const status = sub?.status || 'trial';
            const statusColor = status === 'active' ? '#16a34a' : status === 'trial' ? '#f59e0b' : '#ef4444';
            const suspended = chain.is_active === false;
            const currentPlan = (chain.plan || sub?.plan_name || 'TRIAL').toUpperCase();
            const planStyle = PLAN_COLORS[currentPlan] || PLAN_COLORS.TRIAL;

            return (
              <div key={chain.id}
                className="rounded-xl border transition-shadow hover:shadow-sm relative overflow-hidden"
                style={{
                  background: 'var(--bg-primary)',
                  borderColor: suspended ? '#ef4444' : 'var(--border)',
                }}>

                {/* Suspended overlay banner */}
                {suspended && (
                  <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center py-1"
                    style={{ background: '#ef4444' }}>
                    <span className="text-white text-[11px] font-bold tracking-widest uppercase">Suspended</span>
                  </div>
                )}

                <div className={`p-5 ${suspended ? 'opacity-50 pt-8' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                      style={{ background: chain.primary_color || r.color }}>
                      {chain.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{chain.name}</h3>
                        <RegionChip code={curRegion} size="sm" />
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${statusColor}14`, color: statusColor }}>
                          {status}
                        </span>
                        {/* Plan badge */}
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold border"
                          style={{ background: planStyle.bg, color: planStyle.color, borderColor: planStyle.border }}>
                          {currentPlan}
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
                <div className={`px-5 py-3 border-t space-y-2 ${suspended ? 'opacity-50' : ''}`}
                  style={{ borderColor: 'var(--border)' }}>

                  {/* Region + switch row */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {r.label} · {r.currency} · {r.timezone.split('/').pop().replace('_', ' ')}
                    </span>
                    <button
                      onClick={() => setRegionModal({ chain, targetRegion: curRegion === 'AU' ? 'IN' : 'AU', abn: chain.abn || '', acn: chain.acn || '' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                      <ArrowLeftRight className="w-3 h-3" />
                      Switch to {target.label}
                    </button>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex items-center gap-2 flex-wrap">

                    {/* Impersonate */}
                    <button
                      onClick={() => impersonateMutation.mutate(chain.id)}
                      disabled={impersonateMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                      }}>
                      <LogIn className="w-3 h-3" />
                      Login As
                    </button>

                    {/* Reset owner login (support recovery) */}
                    <button
                      onClick={() => setResetConfirm(chain)}
                      disabled={resetLoginMutation.isPending}
                      title="Reset & unlock the chain owner's login"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                      style={{ borderColor: '#f59e0b4d', background: '#f59e0b14', color: '#f59e0b' }}>
                      <KeyRound className="w-3 h-3" />
                      Reset Login
                    </button>

                    {/* Transfer ownership */}
                    <button
                      onClick={() => setTransferModal({ chain, mode: 'existing', user_id: '', full_name: '', email: '', phone: '' })}
                      title="Transfer chain ownership to another user"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                      style={{ borderColor: '#64748b4d', background: '#64748b14', color: '#64748b' }}>
                      <ArrowLeftRight className="w-3 h-3" />
                      Transfer
                    </button>

                    {/* Suspend / Activate */}
                    {suspended ? (
                      <button
                        onClick={() => statusMutation.mutate({ id: chain.id, action: 'activate' })}
                        disabled={statusMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                        style={{ borderColor: '#16a34a4d', background: '#16a34a14', color: '#16a34a' }}>
                        <PlayCircle className="w-3 h-3" />
                        Activate
                      </button>
                    ) : (
                      <button
                        onClick={() => statusMutation.mutate({ id: chain.id, action: 'suspend' })}
                        disabled={statusMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                        style={{ borderColor: '#ef44444d', background: '#ef444414', color: '#ef4444' }}>
                        <PauseCircle className="w-3 h-3" />
                        Suspend
                      </button>
                    )}

                    {/* Soft-delete (archive) — requires sa.chains.delete */}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteConfirm({ chain, reason: '' })}
                        title="Archive (soft-delete) this chain — reversible"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                        style={{ borderColor: '#ef44444d', background: '#ef444414', color: '#ef4444' }}>
                        <Trash2 className="w-3 h-3" />
                        Archive
                      </button>
                    )}

                    {/* Plan change */}
                    <div className="relative" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setPlanDropdown(planDropdown === chain.id ? null : chain.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80"
                        style={{ background: planStyle.bg, color: planStyle.color, borderColor: planStyle.border }}>
                        {currentPlan} ▾
                      </button>
                      {planDropdown === chain.id && (
                        <div className="absolute bottom-full mb-1 left-0 z-20 rounded-lg border shadow-lg overflow-hidden"
                          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', minWidth: 130 }}>
                          {PLANS.map(p => {
                            const ps = PLAN_COLORS[p];
                            return (
                              <button key={p}
                                onClick={() => planMutation.mutate({ id: chain.id, plan: p })}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:opacity-80 transition-colors"
                                style={{ background: p === currentPlan ? ps.bg : 'transparent', color: ps.color }}>
                                <span className="w-2 h-2 rounded-full" style={{ background: ps.color }} />
                                {p}
                                {p === currentPlan && <CheckCircle className="w-3 h-3 ml-auto" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <button
                      onClick={() => setNotesModal({ chain, text: chain.metadata?.internal_notes || '' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      title="Internal notes">
                      <StickyNote className="w-3 h-3" />
                      Notes
                      {chain.metadata?.internal_notes && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />
                      )}
                    </button>

                    {/* View Outlets — P1 */}
                    <button
                      onClick={() => navigate(`/chain/${chain.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80 ml-auto"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        color: 'var(--accent)',
                      }}>
                      <ChevronRight className="w-3 h-3" />
                      View Outlets
                    </button>
                  </div>
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
      )}

      {/* ── Onboarding Tab ── */}
      {activeTab === 'onboarding' && (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Onboarding Progress</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Track each restaurant's setup wizard completion</p>
            </div>
            <button
              onClick={() => refetchOnboarding()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {/* Stats row */}
          {!onboardingLoading && onboardingData.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Total Chains', value: onboardingData.length, accent: 'var(--accent)' },
                { label: 'Setup Complete', value: onboardingData.filter(c => c.setup_completed).length, accent: '#16a34a' },
                { label: 'In Progress / Not Started', value: onboardingData.filter(c => !c.setup_completed).length, accent: '#f59e0b' },
              ].map(stat => (
                <div key={stat.label} className="rounded-2xl p-4 border"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                  <div className="text-2xl font-bold" style={{ color: stat.accent }}>{stat.value}</div>
                  <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          {onboardingLoading ? (
            <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="animate-spin mr-2" size={20} /> Loading onboarding data...
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Restaurant', 'Plan', 'Status', 'Wizard Step', 'Days Since Signup', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {onboardingData.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>No chains found</td></tr>
                  ) : onboardingData.map((chain) => (
                    <tr key={chain.id} className="transition-colors hover:bg-white/[0.03]" style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{chain.name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{chain.contact_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                          {chain.plan || 'TRIAL'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {chain.setup_completed ? (
                          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#16a34a' }}>
                            <CheckCircle size={13} /> Complete
                          </span>
                        ) : chain.wizard_step > 1 ? (
                          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#f59e0b' }}>
                            <Clock size={13} /> In Progress
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Not Started</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {chain.setup_completed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#16a34a' }}>
                            <Check size={13} /> 7/7
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5,6,7].map(s => (
                                <div key={s} className="w-3 h-3 rounded-full"
                                  style={{ background: s < (chain.wizard_step||1) ? 'var(--accent)' : s === (chain.wizard_step||1) ? '#f59e0b' : 'var(--border)' }} />
                              ))}
                            </div>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{chain.wizard_step || 1}/7</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {chain.days_since_signup === 0 ? 'Today' : `${chain.days_since_signup}d ago`}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            if (window.confirm(`Reset wizard for "${chain.name}"? This will require them to redo the setup.`)) {
                              resetWizardMutation.mutate(chain.id);
                            }
                          }}
                          className="text-xs hover:underline"
                          style={{ color: '#ef4444' }}
                        >
                          Reset Wizard
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Reset Owner Login: confirm ── */}
      {resetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-sm p-5 border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-5 h-5" style={{ color: '#f59e0b' }} />
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Reset owner login?</h3>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              This sets a new temporary password for <b>{resetConfirm.name}</b>'s owner and unlocks the account.
              You'll get a one-time password to give them — they should change it after logging in.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button
                onClick={() => { const c = resetConfirm; setResetConfirm(null); resetLoginMutation.mutate(c.id); }}
                disabled={resetLoginMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: '#f59e0b' }}>
                {resetLoginMutation.isPending ? 'Resetting…' : 'Reset login'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Owner Login: one-time result ── */}
      {resetResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-sm p-5 border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>Login reset for {resetResult.chainName}</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Give this to <b>{resetResult.owner_email}</b>. It's shown once — copy it now.
            </p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <code className="flex-1 text-sm font-mono break-all" style={{ color: 'var(--text-primary)' }}>{resetResult.temp_password}</code>
              <button onClick={() => { try { navigator.clipboard.writeText(resetResult.temp_password); toast.success('Copied'); } catch { /* noop */ } }}
                className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--accent)' }} title="Copy">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button onClick={() => setResetResult(null)}
              className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Done</button>
          </div>
        </div>
      )}

      {/* ── Transfer Ownership Modal ── */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-md p-5 border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Transfer ownership</h3>
              <button onClick={() => setTransferModal(null)} style={{ color: 'var(--text-secondary)' }}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Reassign the owner of <b>{transferModal.chain.name}</b>. The current owner becomes a manager.
            </p>
            <div className="flex gap-2 mb-3">
              {[['existing', 'Existing user ID'], ['new', 'New owner']].map(([m, label]) => (
                <button key={m} onClick={() => setTransferModal(p => ({ ...p, mode: m }))}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={transferModal.mode === m
                    ? { background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)' }
                    : { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                  {label}
                </button>
              ))}
            </div>
            {transferModal.mode === 'existing' ? (
              <input value={transferModal.user_id} onChange={e => setTransferModal(p => ({ ...p, user_id: e.target.value }))}
                placeholder="New owner's user ID (UUID)"
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none mb-3"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            ) : (
              <div className="space-y-2 mb-3">
                {[['full_name', 'Full name'], ['email', 'Email'], ['phone', 'Phone']].map(([k, ph]) => (
                  <input key={k} value={transferModal[k]} onChange={e => setTransferModal(p => ({ ...p, [k]: e.target.value }))}
                    placeholder={ph}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setTransferModal(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button
                disabled={transferMutation.isPending || (transferModal.mode === 'existing' ? !transferModal.user_id.trim() : !(transferModal.full_name.trim() && transferModal.email.trim() && transferModal.phone.trim()))}
                onClick={() => {
                  const body = transferModal.mode === 'existing'
                    ? { new_owner_user_id: transferModal.user_id.trim() }
                    : { new_owner: { full_name: transferModal.full_name.trim(), email: transferModal.email.trim(), phone: transferModal.phone.trim() } };
                  transferMutation.mutate({ id: transferModal.chain.id, body });
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#64748b' }}>
                {transferMutation.isPending ? 'Transferring…' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer result (one-time temp password for a new owner) ── */}
      {transferResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-sm p-5 border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-primary)' }}>Ownership transferred</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              <b>{transferResult.chainName}</b> — owner is now <b>{transferResult.new_owner}</b> (was {transferResult.previous_owner}).
            </p>
            {transferResult.temp_password && (
              <>
                <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>One-time password for the new owner — copy it now:</p>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <code className="flex-1 text-sm font-mono break-all" style={{ color: 'var(--text-primary)' }}>{transferResult.temp_password}</code>
                  <button onClick={() => { try { navigator.clipboard.writeText(transferResult.temp_password); toast.success('Copied'); } catch { /* noop */ } }}
                    className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--accent)' }} title="Copy"><Copy className="w-4 h-4" /></button>
                </div>
              </>
            )}
            <button onClick={() => setTransferResult(null)}
              className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Done</button>
          </div>
        </div>
      )}

      {/* ── Archive (soft-delete) confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-sm p-5 border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Trash2 className="w-5 h-5" style={{ color: '#ef4444' }} />
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Archive {deleteConfirm.chain.name}?</h3>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              The chain is hidden and its users can't log in. This is reversible — you can restore it from “Deleted chains”.
            </p>
            <input value={deleteConfirm.reason} onChange={e => setDeleteConfirm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none mb-4"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={() => deleteMutation.mutate({ id: deleteConfirm.chain.id, reason: deleteConfirm.reason })}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: '#ef4444' }}>
                {deleteMutation.isPending ? 'Archiving…' : 'Archive chain'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deleted chains (restore) ── */}
      {canDelete && deletedChains.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[1500]">
          <button onClick={() => setShowDeleted(s => !s)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border shadow-lg"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Trash2 className="w-3.5 h-3.5" /> Deleted chains ({deletedChains.length})
          </button>
          {showDeleted && (
            <div className="mt-2 w-80 max-h-80 overflow-auto rounded-xl border shadow-2xl p-2" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
              {deletedChains.map(dc => (
                <div key={dc.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{dc.name}</p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {dc.deleted_at ? new Date(dc.deleted_at).toLocaleDateString() : ''}{dc.reason ? ` · ${dc.reason}` : ''}
                    </p>
                  </div>
                  <button onClick={() => restoreMutation.mutate(dc.id)} disabled={restoreMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 disabled:opacity-50"
                    style={{ borderColor: '#16a34a4d', background: '#16a34a14', color: '#16a34a' }}>
                    <RotateCcw className="w-3 h-3" /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notes Modal ── */}
      {notesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-md overflow-hidden shadow-xl border"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Internal Notes</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{notesModal.chain.name}</p>
              </div>
              <button onClick={() => setNotesModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                rows={5}
                placeholder="Add internal notes about this chain..."
                value={notesModal.text}
                onChange={e => setNotesModal(p => ({ ...p, text: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2 resize-none"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                  '--tw-ring-color': 'var(--accent)',
                }} />
              <div className="flex gap-3">
                <button onClick={() => setNotesModal(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  Cancel
                </button>
                <button
                  onClick={() => notesMutation.mutate({ id: notesModal.chain.id, notes: notesModal.text })}
                  disabled={notesMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: 'var(--accent)' }}>
                  {notesMutation.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Region Switch Modal ── */}
      {regionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="rounded-xl w-full max-w-md overflow-hidden shadow-xl border"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                  Switch to {REGIONS[regionModal.targetRegion].label}
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

              {regionModal.targetRegion === 'AU' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                      ABN (Australian Business Number) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      placeholder="e.g. 12 345 678 901"
                      value={regionModal.abn}
                      onChange={e => setRegionModal(p => ({ ...p, abn: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                      ACN (Australian Company Number) <span className="ml-1 opacity-60">optional</span>
                    </label>
                    <input
                      placeholder="e.g. 123 456 789"
                      value={regionModal.acn}
                      onChange={e => setRegionModal(p => ({ ...p, acn: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
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
                { key: 'name',       placeholder: 'Restaurant Chain Name', type: 'text' },
                { key: 'owner_name', placeholder: 'Owner Full Name',       type: 'text' },
                { key: 'email',      placeholder: 'Owner Email',           type: 'email' },
                { key: 'phone',      placeholder: 'Phone',                 type: 'text' },
                { key: 'city',       placeholder: 'City',                  type: 'text' },
                { key: 'password',   placeholder: 'Initial Password',      type: 'password' },
              ].map(f => (
                <input key={f.key} type={f.type} placeholder={f.placeholder}
                  value={formData[f.key]}
                  onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
              ))}

              <div>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Region</p>
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
                      <div className="flex justify-center mb-1.5"><RegionChip code={r} /></div>
                      <div>{REGIONS[r].label}</div>
                      <div className="text-[10px] mt-0.5 opacity-60">{REGIONS[r].currency} · {REGIONS[r].compliance}</div>
                    </button>
                  ))}
                </div>
              </div>

              {formData.region === 'AU' && (
                <div className="space-y-3">
                  <input placeholder="ABN (Australian Business Number)" type="text"
                    value={formData.abn}
                    onChange={e => setFormData(p => ({ ...p, abn: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                  <input placeholder="ACN (Australian Company Number)" type="text"
                    value={formData.acn}
                    onChange={e => setFormData(p => ({ ...p, acn: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none transition-shadow focus:ring-2"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' }} />
                </div>
              )}

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

function LiveStatCard({ icon, label, value, color }) {
  const tint = (pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border"
      style={{ background: tint(4), borderColor: tint(13) }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: tint(9), color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold leading-tight" style={{ color }}>{value}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      </div>
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
          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}>
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
