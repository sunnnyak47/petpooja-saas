import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  ShoppingBag, CheckCircle, XCircle, Clock, Truck, RefreshCw,
  AlertCircle, BarChart2, Settings, ChevronRight, Play, Pause,
  FileText, CreditCard, Building, MapPin, Store, Zap, Globe,
  Phone, Mail, X, ChevronDown, ChevronUp, Package, Users,
  TrendingUp, IndianRupee, Send, Shield,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const STATUS_META = {
  draft:          { label: 'Draft',           color: 'text-surface-400',  bg: 'bg-surface-700',       icon: FileText },
  docs_submitted: { label: 'Submitted',        color: 'text-blue-400',     bg: 'bg-blue-500/20',       icon: Send },
  under_review:   { label: 'Under Review',     color: 'text-yellow-400',   bg: 'bg-yellow-500/20',     icon: Clock },
  verified:       { label: 'Verified ✓',       color: 'text-green-400',    bg: 'bg-green-500/20',      icon: CheckCircle },
  live:           { label: 'LIVE on ONDC',     color: 'text-emerald-400',  bg: 'bg-emerald-500/20',    icon: Globe },
  suspended:      { label: 'Suspended',        color: 'text-red-400',      bg: 'bg-red-500/20',        icon: XCircle },
};

const ORDER_STATUS = {
  pending:    { label: 'Pending',    color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  accepted:   { label: 'Accepted',  color: 'text-blue-400',   bg: 'bg-blue-500/20' },
  preparing:  { label: 'Preparing', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  ready:      { label: 'Ready',     color: 'text-green-400',  bg: 'bg-green-500/20' },
  picked_up:  { label: 'Picked Up', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  rejected:   { label: 'Rejected',  color: 'text-red-400',    bg: 'bg-red-500/20' },
  cancelled:  { label: 'Cancelled', color: 'text-surface-400',bg: 'bg-surface-700' },
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const TABS = [
  { id: 'onboarding', label: 'Onboarding',    icon: Store },
  { id: 'orders',     label: 'Orders',         icon: ShoppingBag },
  { id: 'analytics',  label: 'Analytics',      icon: BarChart2 },
];

// ─── onboarding steps ────────────────────────────────────────────────────────
const STEPS = [
  { id: 'store',    label: 'Store Info',    icon: Store },
  { id: 'docs',     label: 'Documents',     icon: FileText },
  { id: 'bank',     label: 'Bank Details',  icon: CreditCard },
  { id: 'delivery', label: 'Delivery',      icon: Truck },
  { id: 'hours',    label: 'Hours',         icon: Clock },
  { id: 'review',   label: 'Review & Go Live', icon: CheckCircle },
];

function StepBar({ current, profile }) {
  const statusIdx = { draft: 0, docs_submitted: 2, under_review: 2, verified: 5, live: 5, suspended: 5 };
  const completedUpto = statusIdx[profile?.status || 'draft'] || 0;

  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto">
      {STEPS.map((s, i) => {
        const done = i < completedUpto || (profile?.status === 'live' || profile?.status === 'verified');
        const active = s.id === current;
        const Icon = s.icon;
        return (
          <div key={s.id} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap
              ${active ? 'bg-brand-500 text-white' : done ? 'text-green-400' : 'text-surface-500'}`}>
              {done && !active ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              {s.label}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-surface-600 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── onboarding tab ──────────────────────────────────────────────────────────
function OnboardingTab({ outletId }) {
  const qc = useQueryClient();
  const [step, setStep] = useState('store');

  const { data, isLoading } = useQuery({
    queryKey: ['ondc-profile', outletId],
    queryFn: () => api.get(`/ondc/profile?outlet_id=${outletId}`).then(r => r.data),
  });

  const profile = data?.data;

  const [form, setForm] = useState({});
  useEffect(() => {
    if (profile) setForm({
      store_name: profile.store_name || '',
      store_description: profile.store_description || '',
      store_category: profile.store_category || 'both',
      cuisine_types: profile.cuisine_types || '',
      fssai_number: profile.fssai_number || '',
      fssai_expiry: profile.fssai_expiry ? profile.fssai_expiry.split('T')[0] : '',
      gstin: profile.gstin || '',
      pan: profile.pan || '',
      bank_account_name: profile.bank_account_name || '',
      bank_account_number: profile.bank_account_number || '',
      bank_ifsc: profile.bank_ifsc || '',
      bank_name: profile.bank_name || '',
      service_radius_km: profile.service_radius_km || '5',
      min_order_value: profile.min_order_value || '0',
      delivery_enabled: profile.delivery_enabled ?? true,
      pickup_enabled: profile.pickup_enabled ?? true,
      prep_time_minutes: profile.prep_time_minutes || 30,
      auto_accept: profile.auto_accept ?? false,
      tnc_accepted: profile.tnc_accepted ?? false,
      operating_hours: profile.operating_hours || defaultHours(),
    });
  }, [profile]);

  const set = (k) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: val }));
  };

  const saveMut = useMutation({
    mutationFn: (d) => api.patch('/ondc/profile', { ...d, outlet_id: outletId }),
    onSuccess: () => { toast.success('Saved!'); qc.invalidateQueries({ queryKey: ['ondc-profile'] }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const submitMut = useMutation({
    mutationFn: () => api.post('/ondc/profile/submit', { outlet_id: outletId }),
    onSuccess: () => {
      toast.success('Submitted for ONDC review! Verification usually takes 3-5 business days.');
      qc.invalidateQueries({ queryKey: ['ondc-profile'] });
      setStep('review');
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const toggleLiveMut = useMutation({
    mutationFn: (live) => api.post('/ondc/profile/toggle-live', { outlet_id: outletId, live }),
    onSuccess: (_, live) => {
      toast.success(live ? '🚀 Your store is now LIVE on ONDC!' : 'Store taken offline');
      qc.invalidateQueries({ queryKey: ['ondc-profile'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const simulateMut = useMutation({
    mutationFn: () => api.post('/ondc/simulate-order', { outlet_id: outletId }),
    onSuccess: () => { toast.success('Test order simulated! Check the Orders tab.'); qc.invalidateQueries({ queryKey: ['ondc-orders'] }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const save = () => saveMut.mutate(form);

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  const statusMeta = STATUS_META[profile?.status || 'draft'];
  const StatusIcon = statusMeta.icon;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl ${statusMeta.bg}`}>
        <StatusIcon className={`w-8 h-8 ${statusMeta.color} shrink-0`} />
        <div className="flex-1">
          <p className={`font-black text-lg ${statusMeta.color}`}>{statusMeta.label}</p>
          <p className="text-sm text-surface-400">
            {profile?.status === 'draft' && 'Complete all sections below and submit to go live on ONDC network.'}
            {profile?.status === 'under_review' && 'Our team is verifying your documents. Usually takes 3-5 business days.'}
            {profile?.status === 'verified' && 'Your store is verified! Click Go Live to start accepting ONDC orders.'}
            {profile?.status === 'live' && `Live as ${profile?.subscriber_id || 'ONDC seller'}. Orders are flowing in!`}
          </p>
          {profile?.bpp_id && <p className="text-xs text-surface-500 mt-1">Provider: {profile.subscriber_id}</p>}
        </div>
        {profile?.status === 'verified' && (
          <button className="btn-primary flex items-center gap-2" onClick={() => toggleLiveMut.mutate(true)} disabled={toggleLiveMut.isPending}>
            <Play className="w-4 h-4" />Go Live
          </button>
        )}
        {profile?.status === 'live' && (
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-white/10 text-sm font-medium hover:bg-white/20 transition-colors flex items-center gap-2"
              onClick={() => simulateMut.mutate()}
              disabled={simulateMut.isPending}
            >
              <Zap className="w-4 h-4 text-yellow-400" />{simulateMut.isPending ? 'Simulating…' : 'Simulate Order'}
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors flex items-center gap-2"
              onClick={() => toggleLiveMut.mutate(false)}
              disabled={toggleLiveMut.isPending}
            >
              <Pause className="w-4 h-4" />Pause
            </button>
          </div>
        )}
      </div>

      <StepBar current={step} profile={profile} />

      {/* Step: Store Info */}
      {step === 'store' && (
        <div className="card space-y-4">
          <h3 className="font-bold text-lg">Store Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Store / Restaurant Name *</label>
              <input className="input w-full" value={form.store_name || ''} onChange={set('store_name')} placeholder="e.g. Spice Garden Restaurant" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Store Description</label>
              <textarea className="input w-full resize-none" rows={3} value={form.store_description || ''} onChange={set('store_description')} placeholder="Describe your restaurant, specialty dishes, ambiance…" />
            </div>
            <div>
              <label className="label">Store Category *</label>
              <select className="input w-full" value={form.store_category || 'both'} onChange={set('store_category')}>
                <option value="pure_veg">Pure Vegetarian 🟢</option>
                <option value="non_veg">Non-Vegetarian 🔴</option>
                <option value="both">Both Veg & Non-Veg</option>
              </select>
            </div>
            <div>
              <label className="label">Cuisine Types (comma separated)</label>
              <input className="input w-full" value={form.cuisine_types || ''} onChange={set('cuisine_types')} placeholder="North Indian, Chinese, Italian" />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button className="btn-primary" onClick={() => { save(); setStep('docs'); }}>Save & Next</button>
          </div>
        </div>
      )}

      {/* Step: Documents */}
      {step === 'docs' && (
        <div className="card space-y-4">
          <h3 className="font-bold text-lg">Legal Documents</h3>
          <div className="p-4 bg-blue-500/10 rounded-xl text-sm text-blue-300 flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>All documents are required for ONDC seller verification. Ensure details match your business registration.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">FSSAI Licence Number *</label>
              <input className="input w-full" value={form.fssai_number || ''} onChange={set('fssai_number')} placeholder="e.g. 12343567890123" maxLength={14} />
            </div>
            <div>
              <label className="label">FSSAI Expiry Date *</label>
              <input className="input w-full" type="date" value={form.fssai_expiry || ''} onChange={set('fssai_expiry')} />
            </div>
            <div>
              <label className="label">GSTIN *</label>
              <input className="input w-full" value={form.gstin || ''} onChange={set('gstin')} placeholder="e.g. 29ABCDE1234F1Z5" maxLength={15} />
            </div>
            <div>
              <label className="label">PAN Number *</label>
              <input className="input w-full" value={form.pan || ''} onChange={set('pan')} placeholder="e.g. ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }} />
            </div>
          </div>
          <div className="flex gap-3 justify-between">
            <button className="btn-ghost" onClick={() => setStep('store')}>Back</button>
            <button className="btn-primary" onClick={() => { save(); setStep('bank'); }}>Save & Next</button>
          </div>
        </div>
      )}

      {/* Step: Bank */}
      {step === 'bank' && (
        <div className="card space-y-4">
          <h3 className="font-bold text-lg">Bank Account for Settlement</h3>
          <div className="p-4 bg-yellow-500/10 rounded-xl text-sm text-yellow-300 flex gap-3">
            <Shield className="w-5 h-5 shrink-0 mt-0.5" />
            <p>Payments from ONDC orders will be settled to this account within T+2 business days.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Account Holder Name *</label>
              <input className="input w-full" value={form.bank_account_name || ''} onChange={set('bank_account_name')} placeholder="As per bank records" />
            </div>
            <div>
              <label className="label">Bank Name *</label>
              <input className="input w-full" value={form.bank_name || ''} onChange={set('bank_name')} placeholder="e.g. HDFC Bank" />
            </div>
            <div>
              <label className="label">Account Number *</label>
              <input className="input w-full" value={form.bank_account_number || ''} onChange={set('bank_account_number')} placeholder="e.g. 50100123456789" />
            </div>
            <div>
              <label className="label">IFSC Code *</label>
              <input className="input w-full" value={form.bank_ifsc || ''} onChange={set('bank_ifsc')} placeholder="e.g. HDFC0001234" maxLength={11} style={{ textTransform: 'uppercase' }} />
            </div>
          </div>
          <div className="flex gap-3 justify-between">
            <button className="btn-ghost" onClick={() => setStep('docs')}>Back</button>
            <button className="btn-primary" onClick={() => { save(); setStep('delivery'); }}>Save & Next</button>
          </div>
        </div>
      )}

      {/* Step: Delivery */}
      {step === 'delivery' && (
        <div className="card space-y-4">
          <h3 className="font-bold text-lg">Delivery & Order Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Service Radius (km) *</label>
              <input className="input w-full" type="number" min="1" max="50" value={form.service_radius_km || '5'} onChange={set('service_radius_km')} />
              <p className="text-xs text-surface-500 mt-1">Orders beyond this distance will not be shown to customers</p>
            </div>
            <div>
              <label className="label">Minimum Order Value (₹)</label>
              <input className="input w-full" type="number" min="0" value={form.min_order_value || '0'} onChange={set('min_order_value')} />
            </div>
            <div>
              <label className="label">Default Prep Time (minutes)</label>
              <select className="input w-full" value={form.prep_time_minutes || 30} onChange={set('prep_time_minutes')}>
                {[10, 15, 20, 25, 30, 40, 45, 60].map(t => <option key={t} value={t}>{t} minutes</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={!!form.delivery_enabled} onChange={set('delivery_enabled')} />
                <div>
                  <p className="font-medium text-sm">Enable Delivery</p>
                  <p className="text-xs text-surface-500">Accept delivery orders on ONDC</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={!!form.pickup_enabled} onChange={set('pickup_enabled')} />
                <div>
                  <p className="font-medium text-sm">Enable Pickup</p>
                  <p className="text-xs text-surface-500">Allow customers to pick up from your outlet</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={!!form.auto_accept} onChange={set('auto_accept')} />
                <div>
                  <p className="font-medium text-sm">Auto-Accept Orders</p>
                  <p className="text-xs text-surface-500">Orders auto-confirmed without manual review</p>
                </div>
              </label>
            </div>
          </div>
          <div className="flex gap-3 justify-between">
            <button className="btn-ghost" onClick={() => setStep('bank')}>Back</button>
            <button className="btn-primary" onClick={() => { save(); setStep('hours'); }}>Save & Next</button>
          </div>
        </div>
      )}

      {/* Step: Hours */}
      {step === 'hours' && (
        <div className="card space-y-4">
          <h3 className="font-bold text-lg">Operating Hours</h3>
          <div className="space-y-3">
            {DAYS.map(day => {
              const hours = (form.operating_hours || {})[day] || { open: '09:00', close: '22:00', closed: false };
              const setHours = (field) => (e) => {
                const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                setForm(f => ({
                  ...f,
                  operating_hours: {
                    ...(f.operating_hours || {}),
                    [day]: { ...hours, [field]: val },
                  },
                }));
              };
              return (
                <div key={day} className="flex items-center gap-4 px-4 py-3 bg-surface-800 rounded-xl">
                  <span className="w-10 font-bold text-sm">{DAY_LABELS[day]}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!hours.closed} onChange={e => setHours('closed')({ target: { checked: !e.target.checked } })} />
                    Open
                  </label>
                  {!hours.closed ? (
                    <>
                      <input type="time" value={hours.open} onChange={setHours('open')} className="input text-sm py-1 px-2 w-32" />
                      <span className="text-surface-500 text-sm">to</span>
                      <input type="time" value={hours.close} onChange={setHours('close')} className="input text-sm py-1 px-2 w-32" />
                    </>
                  ) : (
                    <span className="text-surface-500 text-sm">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 justify-between">
            <button className="btn-ghost" onClick={() => setStep('delivery')}>Back</button>
            <button className="btn-primary" onClick={() => { save(); setStep('review'); }}>Save & Next</button>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className="card space-y-5">
          <h3 className="font-bold text-lg">Review & Submit</h3>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {[
              ['Store Name',       form.store_name],
              ['Category',         form.store_category],
              ['FSSAI',            form.fssai_number],
              ['GSTIN',            form.gstin],
              ['PAN',              form.pan],
              ['Bank Account',     form.bank_account_number ? `****${form.bank_account_number.slice(-4)}` : '—'],
              ['IFSC',             form.bank_ifsc],
              ['Service Radius',   `${form.service_radius_km} km`],
              ['Prep Time',        `${form.prep_time_minutes} min`],
              ['Auto Accept',      form.auto_accept ? 'Yes' : 'No'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2 bg-surface-800 rounded-xl">
                <span className="text-surface-400">{k}</span>
                <span className="font-medium">{v || '—'}</span>
              </div>
            ))}
          </div>

          {/* TnC */}
          <div className="p-4 bg-surface-800 rounded-xl space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 w-4 h-4 rounded" checked={!!form.tnc_accepted} onChange={set('tnc_accepted')} />
              <p className="text-sm text-surface-300">
                I agree to the <span className="text-brand-400 underline cursor-pointer">ONDC Seller Terms & Conditions</span> and confirm that all business information provided is accurate and complete. I understand that false information may lead to account suspension.
              </p>
            </label>
          </div>

          {profile?.status === 'live' || profile?.status === 'verified' ? (
            <div className="p-4 bg-green-500/10 rounded-xl text-green-400 font-medium flex items-center gap-3">
              <CheckCircle className="w-5 h-5" />
              Your store is {profile.status === 'live' ? 'LIVE on ONDC' : 'verified and ready to go live'}!
            </div>
          ) : profile?.status === 'under_review' ? (
            <div className="p-4 bg-yellow-500/10 rounded-xl text-yellow-400 font-medium flex items-center gap-3">
              <Clock className="w-5 h-5" />
              Submitted for review. Verification in progress…
            </div>
          ) : (
            <div className="flex gap-3 justify-between">
              <button className="btn-ghost" onClick={() => setStep('hours')}>Back</button>
              <button
                className="btn-primary flex items-center gap-2"
                disabled={!form.tnc_accepted || submitMut.isPending}
                onClick={() => { save(); setTimeout(() => submitMut.mutate(), 500); }}
              >
                <Send className="w-4 h-4" />
                {submitMut.isPending ? 'Submitting…' : 'Submit for ONDC Review'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step nav pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {STEPS.map(s => (
          <button key={s.id} onClick={() => setStep(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${step === s.id ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'}`}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── orders tab ───────────────────────────────────────────────────────────────
function OrderCard({ order, onAccept, onReject, onStatusUpdate }) {
  const [expanded, setExpanded] = useState(order.status === 'pending');
  const [prepTime, setPrepTime] = useState(30);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const meta = ORDER_STATUS[order.status] || ORDER_STATUS.pending;
  const items = Array.isArray(order.items) ? order.items : [];

  const timeAgo = (d) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };

  return (
    <div className={`card border-l-4 ${order.status === 'pending' ? 'border-yellow-500 shadow-yellow-500/10 shadow-lg' : 'border-transparent'}`}>
      <div className="flex items-start gap-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${meta.bg} ${meta.color} shrink-0`}>{meta.label}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold">#{order.ondc_order_id?.split('_').pop() || order.id.split('-')[0]}</p>
            <span className="text-xs text-surface-500">via {order.bap_id || 'ONDC Network'}</span>
          </div>
          <p className="text-sm text-surface-300 mt-0.5">
            {order.customer_name || 'Customer'} · {order.customer_phone}
          </p>
          <p className="text-xs text-surface-500 mt-1 truncate">{order.delivery_address || 'Pickup'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-black text-lg">{fmt(order.grand_total)}</p>
          <p className="text-xs text-surface-500">{timeAgo(order.created_at)}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-surface-400 mt-1 shrink-0" /> : <ChevronDown className="w-4 h-4 text-surface-400 mt-1 shrink-0" />}
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-surface-700 space-y-4">
          {/* Items */}
          <div>
            <p className="text-xs font-bold text-surface-400 mb-2">ORDER ITEMS</p>
            <div className="space-y-1">
              {items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.quantity}× {item.name}</span>
                  <span className="font-medium">{fmt(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-surface-700 mt-2 pt-2 space-y-1 text-sm">
              <div className="flex justify-between text-surface-400"><span>Items</span><span>{fmt(order.items_total)}</span></div>
              {order.delivery_fee > 0 && <div className="flex justify-between text-surface-400"><span>Delivery</span><span>{fmt(order.delivery_fee)}</span></div>}
              {order.taxes > 0 && <div className="flex justify-between text-surface-400"><span>Tax</span><span>{fmt(order.taxes)}</span></div>}
              <div className="flex justify-between font-black text-base"><span>Total</span><span>{fmt(order.grand_total)}</span></div>
            </div>
          </div>

          {/* Payment info */}
          <div className="flex gap-4 text-sm">
            <span className={`px-3 py-1 rounded-full font-medium text-xs ${order.payment_status === 'PAID' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {order.payment_status} · {order.payment_method}
            </span>
          </div>

          {/* Actions */}
          {order.status === 'pending' && (
            <div className="space-y-3">
              {!showReject ? (
                <div className="flex gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <select className="input text-sm py-2 w-36" value={prepTime} onChange={e => setPrepTime(Number(e.target.value))}>
                      {[10, 15, 20, 25, 30, 40, 45, 60].map(t => <option key={t} value={t}>{t} min prep</option>)}
                    </select>
                    <button
                      onClick={() => onAccept(order.id, prepTime)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />Accept
                    </button>
                  </div>
                  <button
                    onClick={() => setShowReject(true)}
                    className="px-4 py-2 bg-red-500/20 text-red-400 font-bold rounded-xl hover:bg-red-500/30 transition-colors flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />Reject
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <select className="input w-full text-sm" value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
                    <option value="">Select rejection reason…</option>
                    <option value="Item not available">Item not available</option>
                    <option value="Restaurant busy">Restaurant too busy</option>
                    <option value="Outside delivery area">Outside delivery area</option>
                    <option value="Technical issue">Technical issue</option>
                    <option value="Closed for the day">Closed for the day</option>
                  </select>
                  <div className="flex gap-2">
                    <button className="btn-ghost flex-1" onClick={() => setShowReject(false)}>Cancel</button>
                    <button
                      disabled={!rejectReason}
                      onClick={() => onReject(order.id, rejectReason)}
                      className="flex-1 py-2 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                    >
                      Confirm Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status progression */}
          {['accepted', 'preparing', 'ready'].includes(order.status) && (
            <div className="flex gap-2">
              {order.status === 'accepted' && (
                <button onClick={() => onStatusUpdate(order.id, 'preparing')}
                  className="btn-primary flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4" />Mark Preparing
                </button>
              )}
              {order.status === 'preparing' && (
                <button onClick={() => onStatusUpdate(order.id, 'ready')}
                  className="px-4 py-2 bg-green-500/20 text-green-400 font-bold rounded-xl hover:bg-green-500/30 transition-colors flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4" />Mark Ready
                </button>
              )}
              {order.status === 'ready' && (
                <button onClick={() => onStatusUpdate(order.id, 'picked_up')}
                  className="px-4 py-2 bg-purple-500/20 text-purple-400 font-bold rounded-xl hover:bg-purple-500/30 transition-colors flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4" />Mark Picked Up
                </button>
              )}
            </div>
          )}

          {order.rejection_reason && (
            <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
              Rejection reason: {order.rejection_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OrdersTab({ outletId }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ondc-orders', outletId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50', outlet_id: outletId });
      if (statusFilter) params.set('status', statusFilter);
      return api.get(`/ondc/orders?${params}`).then(r => r.data);
    },
    refetchInterval: 15000, // poll every 15s for new orders
  });

  const orders = data?.data?.data || [];
  const pending = orders.filter(o => o.status === 'pending');

  const acceptMut = useMutation({
    mutationFn: ({ id, prep }) => api.post(`/ondc/orders/${id}/accept`, { prep_time_minutes: prep }),
    onSuccess: () => { toast.success('Order accepted!'); qc.invalidateQueries({ queryKey: ['ondc-orders'] }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/ondc/orders/${id}/reject`, { reason }),
    onSuccess: () => { toast.success('Order rejected'); qc.invalidateQueries({ queryKey: ['ondc-orders'] }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/ondc/orders/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated!'); qc.invalidateQueries({ queryKey: ['ondc-orders'] }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-xl font-bold animate-pulse">
              <AlertCircle className="w-4 h-4" />
              {pending.length} order{pending.length > 1 ? 's' : ''} need attention!
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <select className="input w-40 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Orders</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="picked_up">Picked Up</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={() => refetch()} className="p-2 rounded-xl bg-surface-800 hover:bg-surface-700 transition-colors">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-20">
          <ShoppingBag className="w-14 h-14 text-surface-600 mx-auto mb-4" />
          <p className="text-surface-400 font-medium">No ONDC orders yet</p>
          <p className="text-surface-500 text-sm mt-1">Go live on ONDC to start receiving orders from Paytm, Magicpin & more</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onAccept={(id, prep) => acceptMut.mutate({ id, prep })}
              onReject={(id, reason) => rejectMut.mutate({ id, reason })}
              onStatusUpdate={(id, status) => statusMut.mutate({ id, status })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── analytics tab ────────────────────────────────────────────────────────────
function AnalyticsTab({ outletId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ondc-analytics', outletId],
    queryFn: () => api.get(`/ondc/analytics?outlet_id=${outletId}`).then(r => r.data),
  });

  const stats = data?.data || {};
  const statusBreakdown = stats.status_breakdown || {};
  const bapBreakdown = stats.bap_breakdown || [];

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  const total = stats.total_orders || 0;
  const completed = (statusBreakdown.picked_up || 0);
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card text-center">
          <ShoppingBag className="w-6 h-6 text-brand-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{total}</p>
          <p className="text-xs text-surface-400 mt-1">Total Orders</p>
        </div>
        <div className="card text-center">
          <IndianRupee className="w-6 h-6 text-green-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{fmt(stats.total_revenue)}</p>
          <p className="text-xs text-surface-400 mt-1">Total Revenue</p>
        </div>
        <div className="card text-center">
          <TrendingUp className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{completionRate}%</p>
          <p className="text-xs text-surface-400 mt-1">Completion Rate</p>
        </div>
        <div className="card text-center">
          <Users className="w-6 h-6 text-purple-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{bapBreakdown.length}</p>
          <p className="text-xs text-surface-400 mt-1">Buyer Apps</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="card">
          <h3 className="font-bold mb-4">Order Status Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(ORDER_STATUS).map(([key, meta]) => {
              const count = statusBreakdown[key] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={`font-medium ${meta.color}`}>{meta.label}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
                    <div className={`h-full ${meta.bg} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BAP breakdown */}
        <div className="card">
          <h3 className="font-bold mb-4">Orders by Buyer App</h3>
          {bapBreakdown.length === 0 ? (
            <p className="text-surface-500 text-sm text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-3">
              {bapBreakdown.map(b => (
                <div key={b.bap} className="flex items-center justify-between px-4 py-3 bg-surface-800 rounded-xl">
                  <div>
                    <p className="font-medium text-sm">{b.bap}</p>
                    <p className="text-xs text-surface-500">{b.orders} orders</p>
                  </div>
                  <p className="font-bold">{fmt(b.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ONDC benefits card */}
      <div className="card bg-gradient-to-r from-brand-900/50 to-purple-900/30 border border-brand-500/20">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Globe className="w-5 h-5 text-brand-400" />Why ONDC?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0"><IndianRupee className="w-4 h-4 text-green-400" /></div>
            <div><p className="font-bold">Zero Commission</p><p className="text-surface-400 text-xs mt-1">vs 18-25% on Swiggy/Zomato. Keep 100% of your earnings.</p></div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0"><Users className="w-4 h-4 text-blue-400" /></div>
            <div><p className="font-bold">Government Backed</p><p className="text-surface-400 text-xs mt-1">Reach customers on Paytm, Magicpin, PhonePe & more apps.</p></div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0"><Shield className="w-4 h-4 text-yellow-400" /></div>
            <div><p className="font-bold">Own Your Data</p><p className="text-surface-400 text-xs mt-1">Direct customer relationships, no platform lock-in.</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function defaultHours() {
  const h = {};
  DAYS.forEach(d => { h[d] = { open: '09:00', close: '22:00', closed: false }; });
  return h;
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function ONDCPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const [tab, setTab] = useState('onboarding');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
          <Globe className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black">ONDC Seller Hub</h1>
          <p className="text-surface-400 text-sm">Open Network for Digital Commerce — sell across Paytm, Magicpin, PhonePe & more. Zero commission.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-brand-500 text-white shadow' : 'text-surface-400 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'onboarding' && <OnboardingTab outletId={outletId} />}
      {tab === 'orders'     && <OrdersTab     outletId={outletId} />}
      {tab === 'analytics'  && <AnalyticsTab  outletId={outletId} />}
    </div>
  );
}
