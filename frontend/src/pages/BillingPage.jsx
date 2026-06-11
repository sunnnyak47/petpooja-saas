import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { DollarSign, TrendingUp, Users, CreditCard, CheckCircle, Clock, XCircle, Gauge, AlertTriangle, PlayCircle, Layers, Plus, Pencil, FileText, MailWarning, X } from 'lucide-react';
import { useCurrency, formatCurrencyStatic } from '../hooks/useCurrency';

const PLAN_COLORS = {
  trial:      { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Trial',      border: 'border-l-blue-400',   dot: 'bg-blue-400' },
  starter:    { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'Starter',    border: 'border-l-green-400',  dot: 'bg-green-400' },
  pro:        { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Pro',        border: 'border-l-purple-400', dot: 'bg-purple-400' },
  enterprise: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Enterprise', border: 'border-l-orange-400', dot: 'bg-orange-400' },
};

const STATUS_COLORS = {
  active:    { icon: CheckCircle, text: 'text-green-400',  label: 'Active' },
  trial:     { icon: Clock,       text: 'text-blue-400',   label: 'Trial' },
  suspended: { icon: XCircle,     text: 'text-red-400',    label: 'Suspended' },
  cancelled: { icon: XCircle,     text: 'text-gray-400',   label: 'Cancelled' },
};

const STAT_ICON_COLORS = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400' },
  amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
};

// Region presets for the plan form (P4 — region-correctness for IN / AU).
const REGION_PRESETS = {
  IN: { currency: 'INR', tax_label: 'GST', tax_percent: 18 },
  AU: { currency: 'AUD', tax_label: 'GST', tax_percent: 10 },
};

// Status badge styling for usage-based invoices.
const INVOICE_STATUS_STYLES = {
  draft:   { bg: 'bg-gray-500/10',   text: 'text-gray-400',   label: 'Draft' },
  issued:  { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Issued' },
  paid:    { bg: 'bg-green-500/10',  text: 'text-green-400',  label: 'Paid' },
  overdue: { bg: 'bg-red-500/10',    text: 'text-red-400',    label: 'Overdue' },
  void:    { bg: 'bg-gray-500/10',   text: 'text-gray-400',   label: 'Void' },
};

const REGION_FLAG = (region) => (region === 'AU' ? '🇦🇺 AU' : '🇮🇳 IN');

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

const EMPTY_PLAN = {
  code: '', name: '', description: '',
  region: 'IN', currency: 'INR',
  txn_fee_percent: 0, flat_fee_per_txn: 0,
  channels: [], free_txns_monthly: 0,
  base_monthly_fee: 0, monthly_min_fee: 0, monthly_cap_fee: '',
  tax_percent: 18, tax_label: 'GST',
  max_outlets: '', max_users: '',
  is_active: true, sort_order: 0,
};

// Labeled form field wrapper (module-level to keep its identity stable).
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Plan create/edit modal ───────────────────────────────────────────────────
function PlanModal({ plan, onClose, onSubmit, isSubmitting }) {
  // Seed form from an existing plan (edit) or sensible defaults (create).
  const [form, setForm] = useState(() => {
    if (!plan) return { ...EMPTY_PLAN };
    return {
      code: plan.code ?? '',
      name: plan.name ?? '',
      description: plan.description ?? '',
      region: plan.region ?? 'IN',
      currency: plan.currency ?? 'INR',
      txn_fee_percent: Number(plan.txn_fee_percent ?? 0),
      flat_fee_per_txn: Number(plan.flat_fee_per_txn ?? 0),
      channels: Array.isArray(plan.channels) ? plan.channels : [],
      free_txns_monthly: Number(plan.free_txns_monthly ?? 0),
      base_monthly_fee: Number(plan.base_monthly_fee ?? 0),
      monthly_min_fee: Number(plan.monthly_min_fee ?? 0),
      monthly_cap_fee: plan.monthly_cap_fee == null ? '' : Number(plan.monthly_cap_fee),
      tax_percent: Number(plan.tax_percent ?? 0),
      tax_label: plan.tax_label ?? 'GST',
      max_outlets: plan.max_outlets == null ? '' : Number(plan.max_outlets),
      max_users: plan.max_users == null ? '' : Number(plan.max_users),
      is_active: plan.is_active ?? true,
      sort_order: Number(plan.sort_order ?? 0),
    };
  });

  const isEdit = !!plan;
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  // Apply region presets without clobbering values the user has explicitly tuned.
  const handleRegionChange = (region) => {
    const preset = REGION_PRESETS[region] || REGION_PRESETS.IN;
    setForm(f => {
      const prevPreset = REGION_PRESETS[f.region] || REGION_PRESETS.IN;
      return {
        ...f,
        region,
        // Only override fields that still match the previous region's preset.
        currency: f.currency === prevPreset.currency ? preset.currency : f.currency,
        tax_label: f.tax_label === prevPreset.tax_label ? preset.tax_label : f.tax_label,
        tax_percent: Number(f.tax_percent) === prevPreset.tax_percent ? preset.tax_percent : f.tax_percent,
      };
    });
  };

  const planSymbol = form.currency === 'AUD' ? 'A$' : '₹';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.code.trim()) { toast.error('Plan code is required'); return; }
    if (!form.name.trim()) { toast.error('Plan name is required'); return; }
    const num = (v) => Number(v) || 0;
    const intOrNull = (v) => (v === '' || v == null ? null : parseInt(v, 10));
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      region: form.region,
      currency: form.currency,
      txn_fee_percent: num(form.txn_fee_percent),
      flat_fee_per_txn: num(form.flat_fee_per_txn),
      channels: Array.isArray(form.channels) ? form.channels : [],
      free_txns_monthly: parseInt(form.free_txns_monthly, 10) || 0,
      base_monthly_fee: num(form.base_monthly_fee),
      monthly_min_fee: num(form.monthly_min_fee),
      monthly_cap_fee: form.monthly_cap_fee === '' ? null : num(form.monthly_cap_fee),
      tax_percent: num(form.tax_percent),
      tax_label: form.tax_label?.trim() || '',
      max_outlets: intOrNull(form.max_outlets),
      max_users: intOrNull(form.max_users),
      is_active: !!form.is_active,
      sort_order: parseInt(form.sort_order, 10) || 0,
    };
    onSubmit(payload);
  };

  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div className="rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Layers className="w-4 h-4 text-indigo-400" />
            {isEdit ? `Edit Plan — ${plan.name}` : 'New Billing Plan'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
            style={{ color: 'var(--text-secondary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code *">
              <input value={form.code} onChange={e => set('code', e.target.value)} maxLength={50}
                disabled={isEdit}
                placeholder="e.g. pro_in"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none disabled:opacity-50"
                style={inputStyle} />
            </Field>
            <Field label="Name *">
              <input value={form.name} onChange={e => set('name', e.target.value)} maxLength={100}
                placeholder="e.g. Pro"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          </div>

          <Field label="Description">
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Region">
              <select value={form.region} onChange={e => handleRegionChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="IN">🇮🇳 India (IN)</option>
                <option value="AU">🇦🇺 Australia (AU)</option>
              </select>
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={e => set('currency', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle}>
                <option value="INR">INR (₹)</option>
                <option value="AUD">AUD (A$)</option>
              </select>
            </Field>
            <Field label="Sort Order">
              <input type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label={`Base Monthly Fee (${planSymbol})`}>
              <input type="number" min="0" step="0.01" value={form.base_monthly_fee} onChange={e => set('base_monthly_fee', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label={`Monthly Min Fee (${planSymbol})`}>
              <input type="number" min="0" step="0.01" value={form.monthly_min_fee} onChange={e => set('monthly_min_fee', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label={`Monthly Cap Fee (${planSymbol})`}>
              <input type="number" min="0" step="0.01" value={form.monthly_cap_fee} onChange={e => set('monthly_cap_fee', e.target.value)}
                placeholder="None"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Txn Fee %">
              <input type="number" min="0" max="100" step="0.01" value={form.txn_fee_percent} onChange={e => set('txn_fee_percent', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label={`Flat Fee / Txn (${planSymbol})`}>
              <input type="number" min="0" step="0.01" value={form.flat_fee_per_txn} onChange={e => set('flat_fee_per_txn', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="Free Txns / Month">
              <input type="number" min="0" value={form.free_txns_monthly} onChange={e => set('free_txns_monthly', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          </div>

          <Field label="Channels (comma-separated)">
            <input value={form.channels.join(', ')}
              onChange={e => set('channels', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g. pos, online, qr"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
          </Field>

          <div className="grid grid-cols-4 gap-4">
            <Field label="Tax Label">
              <input value={form.tax_label} onChange={e => set('tax_label', e.target.value)} maxLength={20}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="Tax %">
              <input type="number" min="0" max="100" step="0.01" value={form.tax_percent} onChange={e => set('tax_percent', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="Max Outlets">
              <input type="number" min="0" value={form.max_outlets} onChange={e => set('max_outlets', e.target.value)}
                placeholder="∞"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="Max Users">
              <input type="number" min="0" value={form.max_users} onChange={e => set('max_users', e.target.value)}
                placeholder="∞"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500" />
            Plan is active
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { symbol } = useCurrency();
  const qc = useQueryClient();

  // Plan modal state: null = closed, {} create, {plan} edit.
  const [planModal, setPlanModal] = useState(null);
  const [invoiceStatus, setInvoiceStatus] = useState('');

  const {
    data,
    isLoading,
    isError: chainsError,
    refetch: refetchChains,
  } = useQuery({
    queryKey: ['saas-chains'],
    queryFn: () => api.get('/superadmin/chains'),
  });

  const {
    data: revenueData,
    isError: revenueError,
    refetch: refetchRevenue,
  } = useQuery({
    queryKey: ['saas-revenue'],
    queryFn: () => api.get('/superadmin/revenue'),
  });

  // Usage-based billing (Phase 4): metered overview + manual rollup trigger.
  const { data: usageOverview, refetch: refetchOverview } = useQuery({
    queryKey: ['billing-admin-overview'],
    queryFn: () => api.get('/billing/admin/overview').then(r => r.data?.data),
    staleTime: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/billing/admin/generate').then(r => r.data),
    onSuccess: (res) => {
      toast.success(res?.message || 'Invoices generated');
      refetchOverview();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Rollup failed'),
  });

  // ── Billing plans (Phase 4) ───────────────────────────────────────────────
  const {
    data: plans = [],
    isLoading: plansLoading,
    isError: plansError,
  } = useQuery({
    queryKey: ['billing-admin-plans'],
    queryFn: () => api.get('/billing/admin/plans').then(r => r.data?.data ?? []),
    staleTime: 60_000,
  });

  const savePlanMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      (id
        ? api.patch(`/billing/admin/plans/${id}`, payload)
        : api.post('/billing/admin/plans', payload)
      ).then(r => r.data),
    onSuccess: (res, vars) => {
      toast.success(res?.message || (vars.id ? 'Plan updated' : 'Plan created'));
      qc.invalidateQueries({ queryKey: ['billing-admin-plans'] });
      setPlanModal(null);
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to save plan'),
  });

  // ── Usage-based invoices (Phase 4) ────────────────────────────────────────
  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    isError: invoicesError,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ['billing-admin-invoices', invoiceStatus],
    queryFn: () => {
      const params = {};
      if (invoiceStatus) params.status = invoiceStatus;
      return api.get('/billing/admin/invoices', { params }).then(r => r.data?.data ?? []);
    },
    staleTime: 30_000,
  });

  const dunningMutation = useMutation({
    mutationFn: () => api.post('/billing/admin/dunning/run').then(r => r.data),
    onSuccess: (res) => {
      toast.success(res?.message || 'Dunning pass completed');
      refetchInvoices();
      refetchOverview();
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Dunning run failed'),
  });

  const handleRunDunning = () => {
    if (!window.confirm('Run a dunning pass now? This will chase overdue usage-based invoices.')) return;
    dunningMutation.mutate();
  };

  const ov = usageOverview;
  const ovCur = (n) => `${symbol}${Number(n || 0).toLocaleString()}`;

  const rawData = data?.data;
  const chains = Array.isArray(rawData) ? rawData
    : Array.isArray(rawData?.chains) ? rawData.chains
    : [];

  // Compute summary stats
  const totalChains   = chains.length;
  const activeChains  = chains.filter(c => c.status === 'active').length;
  const trialChains   = chains.filter(c => c.status === 'trial' || !c.status).length;
  const totalOutlets  = chains.reduce((s, c) => s + (c._count?.outlets || 0), 0);

  const PLAN_PRICES = { trial: 0, starter: 999, pro: 2499, enterprise: 4999 };
  const apiMrr = revenueData?.data?.mrr ?? revenueData?.data?.monthly_recurring_revenue;
  const mrr = apiMrr ?? chains.reduce((s, c) => s + (PLAN_PRICES[c.subscription_plan] || 0), 0);

  const stats = [
    { label: 'Total Chains',  value: totalChains,  icon: Users,       accent: 'blue' },
    { label: 'Active Chains', value: activeChains, icon: CheckCircle, accent: 'green' },
    { label: 'Trial Chains',  value: trialChains,  icon: Clock,       accent: 'amber' },
    { label: 'Est. MRR',      value: `${symbol}${mrr.toLocaleString()}`, icon: DollarSign, accent: 'purple' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          SaaS Revenue
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Subscription plans, billing status & monthly recurring revenue
        </p>
      </div>

      {/* Stats load failure — surface an error instead of showing blank/zero stats */}
      {(chainsError || revenueError) && (
        <div className="rounded-xl p-4 flex items-center justify-between gap-4"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: '#f87171' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Couldn’t load revenue stats. Figures below may be incomplete.</span>
          </div>
          <button
            onClick={() => { if (chainsError) refetchChains(); if (revenueError) refetchRevenue(); }}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            Retry
          </button>
        </div>
      )}

      {/* Usage-based billing — metered overview (Phase 4) */}
      {ov && (
        <div className="rounded-xl p-5"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Gauge className="w-4 h-4 text-indigo-400" /> Usage-Based Billing
              <span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>({ov.period})</span>
            </h2>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              <PlayCircle className="w-3.5 h-3.5" />
              {generateMutation.isPending ? 'Generating…' : 'Run Monthly Billing'}
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Metered Fees', value: ovCur(ov.metered_fee_total), icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10' },
              { label: 'Gross Volume', value: ovCur(ov.gross_volume), icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { label: 'Transactions', value: Number(ov.txn_count).toLocaleString(), icon: Gauge, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Invoiced', value: `${ovCur(ov.invoiced_total)} (${ov.invoice_count})`, icon: CreditCard, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
              { label: 'Overdue', value: `${ovCur(ov.overdue_total)} (${ov.overdue_count})`, icon: AlertTriangle, color: ov.overdue_count > 0 ? 'text-red-400' : 'text-gray-400', bg: ov.overdue_count > 0 ? 'bg-red-500/10' : 'bg-gray-500/10' },
            ].map(m => (
              <div key={m.label} className="rounded-lg p-3.5" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.bg}`}>
                    <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                  </div>
                </div>
                <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing Plans (Phase 4) */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Layers className="w-4 h-4 text-indigo-400" /> Billing Plans
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Region-aware usage-based pricing plans (IN / AU).
            </p>
          </div>
          <button
            onClick={() => setPlanModal({})}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            <Plus className="w-3.5 h-3.5" /> New Plan
          </button>
        </div>

        {plansLoading ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
            Loading plans…
          </div>
        ) : plansError ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
            Failed to load plans.
          </div>
        ) : plans.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
            No billing plans yet. Click “New Plan” to create one.
          </div>
        ) : (
          <div style={{ background: 'var(--bg-primary)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Plan', 'Region', 'Base / mo', 'Txn Fee', 'Free Txns', 'Tax', 'Limits', 'Status', ''].map((h, i) => (
                    <th key={h || `c${i}`}
                      className={`px-5 py-3 text-xs font-medium uppercase tracking-wider ${i >= 2 && i <= 6 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans.map(p => {
                  const cur = p.currency || 'INR';
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-5 py-3.5">
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{p.code}</p>
                      </td>
                      <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>
                        {REGION_FLAG(p.region)} · {cur}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrencyStatic(p.base_monthly_fee, cur)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {Number(p.txn_fee_percent)}% + {formatCurrencyStatic(p.flat_fee_per_txn, cur)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {Number(p.free_txns_monthly).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {p.tax_label} {Number(p.tax_percent)}%
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {p.max_outlets == null ? '∞' : p.max_outlets} outlets · {p.max_users == null ? '∞' : p.max_users} users
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => setPlanModal({ plan: p })}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-white/[0.06]"
                          style={{ color: 'var(--accent)' }}>
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage-Based Invoices (Phase 4) */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <FileText className="w-4 h-4 text-indigo-400" /> Usage-Based Invoices
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Metered usage invoices generated from transaction volume.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={invoiceStatus} onChange={e => setInvoiceStatus(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            <button onClick={handleRunDunning} disabled={dunningMutation.isPending}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
              <MailWarning className="w-3.5 h-3.5" />
              {dunningMutation.isPending ? 'Running…' : 'Run Dunning'}
            </button>
          </div>
        </div>

        {invoicesLoading ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
            Loading invoices…
          </div>
        ) : invoicesError ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
            Failed to load invoices.
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
            No usage-based invoices found.
          </div>
        ) : (
          <div style={{ background: 'var(--bg-primary)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Invoice #', 'Chain', 'Period', 'Txns', 'Total', 'Status', 'Due'].map((h, i) => (
                    <th key={h}
                      className={`px-5 py-3 text-xs font-medium uppercase tracking-wider ${i === 3 || i === 4 ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const cfg = INVOICE_STATUS_STYLES[inv.status] || INVOICE_STATUS_STYLES.draft;
                  const cur = inv.currency || 'INR';
                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-5 py-3.5 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {inv.head_office?.name || <span style={{ opacity: 0.4 }}>—</span>}
                        </p>
                        {inv.head_office?.contact_email && (
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{inv.head_office.contact_email}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>{inv.billing_period}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                        {Number(inv.txn_count).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrencyStatic(inv.total, cur)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>{fmtDate(inv.due_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => {
          const colors = STAT_ICON_COLORS[s.accent];
          return (
            <div
              key={s.label}
              className="rounded-xl p-5"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className="text-3xl font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {s.value}
                  </p>
                  <p
                    className="text-xs font-medium uppercase tracking-wider mt-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {s.label}
                  </p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors.bg}`}>
                  <s.icon className={`w-[18px] h-[18px] ${colors.text}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Plan Distribution */}
      <div>
        <h2
          className="text-xs font-medium uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          Plan Distribution
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(PLAN_PRICES).map(([plan, price]) => {
            const count = chains.filter(c => (c.subscription_plan || 'trial') === plan).length;
            const cfg = PLAN_COLORS[plan] || PLAN_COLORS.trial;
            return (
              <div
                key={plan}
                className={`rounded-xl p-5 border-l-4 ${cfg.border} ${cfg.bg}`}
              >
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
                <p
                  className="text-3xl font-semibold mt-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {count}
                </p>
                <p
                  className="text-xs font-medium mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {price === 0 ? 'Free' : `${symbol}${price}/mo`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div
          className="px-5 py-3.5"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
        >
          <h2
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            All Chains
          </h2>
        </div>

        {isLoading ? (
          <div
            className="p-10 text-center text-sm"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}
          >
            Loading...
          </div>
        ) : chains.length === 0 ? (
          <div
            className="p-10 text-center text-sm"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}
          >
            No chains found
          </div>
        ) : (
          <div style={{ background: 'var(--bg-primary)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Chain', 'Email', 'Region', 'Outlets', 'Plan', 'Status', 'MRR'].map(h => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-medium uppercase tracking-wider ${h === 'MRR' ? 'text-right' : 'text-left'}`}
                      style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chains.map(c => {
                  const plan = c.subscription_plan || 'trial';
                  const status = c.status || 'trial';
                  const planCfg = PLAN_COLORS[plan] || PLAN_COLORS.trial;
                  const statusCfg = STATUS_COLORS[status] || STATUS_COLORS.trial;
                  const StatusIcon = statusCfg.icon;
                  const revenue = PLAN_PRICES[plan] || 0;
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                            style={{ background: 'var(--accent)' }}
                          >
                            {c.name?.[0]?.toUpperCase() || 'C'}
                          </div>
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {c.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>
                        {c.owner_email || <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                      <td className="px-5 py-3.5" style={{ color: 'var(--text-secondary)' }}>
                        {c.region === 'AU' ? '🇦🇺 AU' : '🇮🇳 IN'}
                      </td>
                      <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {c._count?.outlets || 0}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${planCfg.bg} ${planCfg.text}`}>
                          {planCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusCfg.text}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td
                        className="px-5 py-3.5 text-right font-medium tabular-nums"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {revenue === 0
                          ? <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                          : `${c.region === 'AU' ? 'A$' : '₹'}${revenue}`
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {planModal && (
        <PlanModal
          plan={planModal.plan || null}
          isSubmitting={savePlanMutation.isPending}
          onClose={() => setPlanModal(null)}
          onSubmit={(payload) => savePlanMutation.mutate({ id: planModal.plan?.id, payload })}
        />
      )}
    </div>
  );
}
