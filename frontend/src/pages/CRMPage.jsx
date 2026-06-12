import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '../hooks/useCurrency';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { isValidPhone, isValidEmail, PHONE_MAXLEN, phonePlaceholder } from '../lib/validation';
import {
  Users, Crown, Star, UserX, Gift, Send, Mail, Calendar,
  TrendingUp, Search, Plus, Award, Megaphone, Settings,
  Repeat, BarChart2, X, ChevronDown, ChevronUp, Coins,
  Edit2, Trash2, RefreshCw, MessageCircle, Smartphone, Zap,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Activity,
  Heart,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtPts = (n) => Number(n || 0).toLocaleString();

const SEGMENT_META = {
  new:     { label: 'New',     cls: 'bg-blue-500/15 text-blue-500',    icon: Star },
  regular: { label: 'Regular', cls: 'bg-emerald-500/15 text-emerald-500', icon: Repeat },
  vip:     { label: 'VIP',     cls: 'bg-amber-500/15 text-amber-500',  icon: Crown },
  lapsed:  { label: 'Lapsed',  cls: 'bg-red-500/15 text-red-500',      icon: UserX },
};

function SegmentBadge({ segment }) {
  const m = SEGMENT_META[segment] || SEGMENT_META.new;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${m.cls}`}>
      <Icon className="w-3 h-3" />{m.label}
    </span>
  );
}

const TAB_ITEMS = [
  { id: 'dashboard', label: 'Overview',   icon: BarChart2 },
  { id: 'customers', label: 'Customers',  icon: Users },
  { id: 'loyalty',   label: 'Loyalty',    icon: Gift },
  { id: 'campaigns', label: 'Campaigns',  icon: Megaphone },
  { id: 'settings',  label: 'Settings',   icon: Settings },
];

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent = 'var(--accent)' }) {
  return (
    <div className="card flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        {title}
      </h3>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--bg-secondary)' }}>
        <Icon className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} />
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</p>
      {action}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children, maxWidth = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={`card w-full ${maxWidth} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors">
            <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CustomerModal({ customer, outletId, onClose }) {
  const qc = useQueryClient();
  const { isAU } = useCurrency();
  const isEdit = !!customer;
  const [form, setForm] = useState({
    full_name:           customer?.full_name || '',
    phone:               customer?.phone || '',
    email:               customer?.email || '',
    gender:              customer?.gender || '',
    date_of_birth:       customer?.date_of_birth ? customer.date_of_birth.split('T')[0] : '',
    anniversary:         customer?.anniversary   ? customer.anniversary.split('T')[0]   : '',
    dietary_preference:  customer?.dietary_preference || '',
    notes:               customer?.notes || '',
  });

  const mut = useMutation({
    mutationFn: (d) => isEdit
      ? api.patch(`/customers/${customer.id}`, d)
      : api.post('/customers', d),
    onSuccess: () => {
      toast.success(isEdit ? 'Customer updated' : 'Customer added');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['crm-dashboard'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.phone || !isValidPhone(form.phone)) return toast.error('Please enter a valid phone number');
    if (form.email && !isValidEmail(form.email)) return toast.error('Please enter a valid email address');
    // Backend Joi allows null but not '' for optional fields — strip empty strings to null.
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );
    mut.mutate(payload);
  };

  return (
    <ModalShell title={isEdit ? 'Edit Customer' : 'Add Customer'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Full Name</label>
          <input className="input w-full" value={form.full_name} onChange={set('full_name')} placeholder="Customer name" />
        </div>
        <div>
          <label className="label">Phone *</label>
          <input className="input w-full" maxLength={PHONE_MAXLEN} value={form.phone} onChange={set('phone')} placeholder={phonePlaceholder(isAU ? 'AU' : 'IN')} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input w-full" value={form.email} onChange={set('email')} type="email" placeholder="email@example.com" />
        </div>
        <div>
          <label className="label">Gender</label>
          <select className="input w-full" value={form.gender} onChange={set('gender')}>
            <option value="">Select</option>
            <option>male</option>
            <option>female</option>
            <option>other</option>
          </select>
        </div>
        <div>
          <label className="label">Dietary Preference</label>
          <select className="input w-full" value={form.dietary_preference} onChange={set('dietary_preference')}>
            <option value="">None</option>
            <option value="veg">veg</option><option value="non_veg">non-veg</option><option value="vegan">vegan</option><option value="jain">jain</option>
          </select>
        </div>
        <div>
          <label className="label">Date of Birth</label>
          <input className="input w-full" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
        </div>
        <div>
          <label className="label">Anniversary</label>
          <input className="input w-full" type="date" value={form.anniversary} onChange={set('anniversary')} />
        </div>
        <div className="col-span-2">
          <label className="label">Notes</label>
          <textarea className="input w-full resize-none" rows={2} value={form.notes} onChange={set('notes')} placeholder="Special preferences or notes" />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary flex-1"
          disabled={mut.isPending || !form.phone}
          onClick={handleSave}
        >
          {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
        </button>
      </div>
    </ModalShell>
  );
}

function AdjustPointsModal({ customer, outletId, onClose }) {
  const qc = useQueryClient();
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: (d) => api.post(`/customers/${customer.id}/loyalty/adjust`, d),
    onSuccess: () => {
      toast.success('Points adjusted');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['crm-dashboard'] });
      qc.invalidateQueries({ queryKey: ['loyalty-history', customer.id] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  return (
    <ModalShell title={`Adjust Points — ${customer.full_name || customer.phone}`} onClose={onClose} maxWidth="max-w-sm">
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Current balance:{' '}
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {fmtPts(customer.loyalty_points?.current_balance)} pts
        </span>
      </p>
      <label className="label">Points (negative to deduct)</label>
      <input className="input w-full mb-3" type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="e.g. 100 or -50" />
      <label className="label">Reason</label>
      <input className="input w-full mb-5" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Birthday bonus" />
      <div className="flex gap-3">
        <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary flex-1"
          disabled={mut.isPending || !points}
          onClick={() => mut.mutate({ points: parseInt(points), reason, outlet_id: outletId })}
        >
          {mut.isPending ? 'Saving…' : 'Apply Adjustment'}
        </button>
      </div>
    </ModalShell>
  );
}

function LoyaltyHistoryModal({ customer, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['loyalty-history', customer.id],
    queryFn: () => api.get(`/customers/${customer.id}/loyalty/history?limit=50`).then(r => r.data),
  });

  const txns    = data?.transactions || [];
  const summary = data?.summary;

  return (
    <ModalShell title={`${customer.full_name || customer.phone} — Loyalty History`} onClose={onClose} maxWidth="max-w-xl">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-center">
        {[
          { label: 'Balance', value: fmtPts(summary?.current_balance ?? customer.loyalty_points?.current_balance), color: 'var(--accent)' },
          { label: 'Earned',  value: fmtPts(summary?.total_earned),   color: '#16a34a' },
          { label: 'Redeemed',value: fmtPts(summary?.total_redeemed), color: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="rounded-xl py-3 px-2" style={{ background: 'var(--bg-secondary)' }}>
            <p className="text-base font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
        ) : txns.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No transactions yet</p>
        ) : txns.map(tx => (
          <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${tx.points > 0 ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                {tx.points > 0
                  ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                  : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tx.description || tx.type}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {tx.outlet?.name} · {new Date(tx.created_at).toLocaleDateString()}
                  {tx.order?.order_number ? ` · ${tx.order.order_number}` : ''}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-semibold text-sm ${tx.points > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {tx.points > 0 ? '+' : ''}{fmtPts(tx.points)} pts
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Bal: {fmtPts(tx.balance_after)}</p>
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

function CampaignModal({ outletId, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name:            '',
    type:            'sms',
    target_segment:  'all',
    message:         '',
    schedule_at:     '',
  });

  const VARS = ['{name}', '{phone}', '{points}'];

  const mut = useMutation({
    mutationFn: (d) => api.post('/customers/campaigns', d),
    onSuccess: (res) => {
      toast.success(`Campaign sent to ${res.data?.total_recipients || 0} customers`);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const insertVar = (v) => setForm(f => ({ ...f, message: f.message + v }));
  const charCount = form.message.length;
  const smsCount  = Math.ceil(charCount / 160) || 0;

  const CHANNEL_ICONS = { sms: Smartphone, whatsapp: MessageCircle, email: Mail, push: Zap };
  const ChannelIcon = CHANNEL_ICONS[form.type] || Smartphone;

  return (
    <ModalShell title="New Campaign" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Campaign Name *</label>
          <input className="input w-full" value={form.name} onChange={set('name')} placeholder="e.g. Weekend Special Offer" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Channel</label>
            <select className="input w-full" value={form.type} onChange={set('type')}>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </div>
          <div>
            <label className="label">Target Audience</label>
            <select className="input w-full" value={form.target_segment} onChange={set('target_segment')}>
              <option value="all">All Customers</option>
              <option value="new">New</option>
              <option value="regular">Regular</option>
              <option value="vip">VIP</option>
              <option value="lapsed">Lapsed</option>
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Message *</label>
            <div className="flex items-center gap-1">
              <span className="text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>Insert:</span>
              {VARS.map(v => (
                <button key={v} onClick={() => insertVar(v)}
                  className="px-2 py-0.5 text-xs rounded font-mono transition-colors"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="input w-full resize-none"
            rows={4}
            value={form.message}
            onChange={set('message')}
            placeholder="Hi {name}, enjoy 20% off this weekend! Use code WEEKEND20. Valid till Sunday."
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {charCount} chars · {smsCount} SMS credit{smsCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div>
          <label className="label">Schedule (optional)</label>
          <input className="input w-full" type="datetime-local" value={form.schedule_at} onChange={set('schedule_at')} />
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Leave blank to send immediately</p>
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          disabled={mut.isPending || !form.name || !form.message}
          onClick={() => mut.mutate({ ...form, schedule_at: form.schedule_at || null, outlet_id: outletId })}
        >
          <ChannelIcon className="w-4 h-4" />
          {mut.isPending ? 'Sending…' : form.schedule_at ? 'Schedule' : 'Send Now'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ outletId, onEditConfig }) {
  const qc = useQueryClient();
  const { format, symbol } = useCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ['crm-dashboard', outletId],
    queryFn: () => api.get(`/customers/crm/dashboard?outlet_id=${outletId}`).then(r => r.data),
  });

  const { data: bdays } = useQuery({
    queryKey: ['birthdays'],
    queryFn: () => api.get('/customers/crm/birthdays?days=7').then(r => r.data),
  });

  const birthdayMut = useMutation({
    mutationFn: (d) => api.post('/customers/crm/birthday-campaign', d),
    onSuccess: (res) => {
      toast.success(`Birthday messages sent to ${res.data?.sent || 0} customers`);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  );

  const d            = data?.data || {};
  const segments     = d.segments || {};
  const loyaltyStats = d.loyalty_stats || {};
  const loyaltyCfg   = { earn_rate: 1, earn_per_amount: 10, redeem_value: 1, min_redemption: 100, ...(d.loyalty_config || {}) };
  const topSpenders  = d.top_spenders || [];
  const birthdayList = bdays?.data || [];
  const recentTxns   = d.recent_transactions || [];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers"    value={d.total_customers || 0}                   icon={Users}     accent="var(--accent)" />
        <StatCard label="Points Outstanding" value={fmtPts(loyaltyStats.total_points_outstanding)} icon={Coins}     accent="#d97706" />
        <StatCard label="Points Earned"      value={fmtPts(loyaltyStats.total_points_earned)}     icon={ArrowUpRight}   accent="#16a34a" />
        <StatCard label="Points Redeemed"    value={fmtPts(loyaltyStats.total_points_redeemed)}   icon={ArrowDownRight} accent="#7c3aed" />
      </div>

      {/* Segments */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'vip',     label: 'VIP',     icon: Crown,  accent: '#d97706' },
          { key: 'regular', label: 'Regular', icon: Repeat, accent: '#16a34a' },
          { key: 'new',     label: 'New',     icon: Star,   accent: 'var(--accent)' },
          { key: 'lapsed',  label: 'Lapsed',  icon: UserX,  accent: '#dc2626' },
        ].map(({ key, label, icon: Icon, accent }) => (
          <StatCard key={key} label={label} value={segments[key] || 0} icon={Icon} accent={accent} />
        ))}
      </div>

      {/* Loyalty config panel */}
      <div className="card">
        <SectionHeader
          title="Programme Configuration"
          icon={Zap}
          action={onEditConfig && (
            <button onClick={onEditConfig}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Earn Rate',         value: `${loyaltyCfg.earn_rate} pt / ${symbol}${loyaltyCfg.earn_per_amount}` },
            { label: 'Redemption Value',  value: `1 pt = ${symbol}${loyaltyCfg.redeem_value}` },
            { label: 'Min to Redeem',     value: `${loyaltyCfg.min_redemption} pts` },
            { label: 'Status',            value: loyaltyCfg.enabled !== false ? 'Active' : 'Disabled',
              valueColor: loyaltyCfg.enabled !== false ? '#16a34a' : '#dc2626' },
          ].map(item => (
            <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
              <p className="text-sm font-semibold" style={{ color: item.valueColor || 'var(--text-primary)' }}>
                {item.value}
                {item.label === 'Status' && loyaltyCfg.enabled !== false && (
                  <CheckCircle2 className="inline w-3.5 h-3.5 ml-1 text-emerald-500" />
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Spenders */}
        <div className="lg:col-span-2 card">
          <SectionHeader title="Top Spenders" icon={Crown} />
          {topSpenders.length === 0 ? (
            <EmptyState icon={Users} text="No spend data yet" />
          ) : (
            <div className="space-y-1">
              {topSpenders.slice(0, 8).map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-800 transition-colors">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i < 3 ? 'bg-amber-500/20 text-amber-500' : 'bg-surface-700 text-surface-400'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.full_name || c.phone}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.total_visits} visits</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{format(c.total_spend)}</p>
                    <p className="text-xs" style={{ color: '#d97706' }}>{fmtPts(c.loyalty_points?.current_balance)} pts</p>
                  </div>
                  <SegmentBadge segment={c.segment} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Birthdays */}
        <div className="card">
          <SectionHeader
            title="Birthdays — Next 7 Days"
            icon={Calendar}
            action={birthdayList.length > 0 && (
              <button
                onClick={() => birthdayMut.mutate({
                  outlet_id: outletId,
                  message_template: 'Happy Birthday {name}! 🎉 Celebrate with us — enjoy a special treat on your next visit. With love, the team.',
                })}
                disabled={birthdayMut.isPending}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                <Send className="w-3 h-3" />
                {birthdayMut.isPending ? 'Sending…' : 'Send Wishes'}
              </button>
            )}
          />
          {birthdayList.length === 0 ? (
            <EmptyState icon={Calendar} text="No birthdays in the next 7 days" />
          ) : (
            <div className="space-y-2">
              {birthdayList.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--bg-secondary)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                    <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.full_name || c.phone}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.phone}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent loyalty activity */}
      <div className="card">
        <SectionHeader title="Recent Loyalty Activity" icon={Activity} />
        {recentTxns.length === 0 ? (
          <EmptyState icon={Activity} text="No recent loyalty activity" />
        ) : (
          <div className="space-y-1">
            {recentTxns.map(tx => (
              <div key={tx.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    tx.type === 'earn' ? 'bg-emerald-500/15' : 'bg-red-500/15'
                  }`}>
                    {tx.type === 'earn'
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                      : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {tx.customer?.full_name || tx.customer?.phone || 'Customer'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{tx.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold text-sm ${tx.type === 'earn' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {tx.points > 0 ? '+' : ''}{fmtPts(tx.points)} pts
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(tx.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customers Tab ────────────────────────────────────────────────────────────
function CustomersTab({ outletId }) {
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [search,          setSearch]          = useState('');
  const [segment,         setSegment]         = useState('');
  const [isAddOpen,       setIsAddOpen]       = useState(false);
  const [editCustomer,    setEditCustomer]    = useState(null);
  const [adjustCustomer,  setAdjustCustomer]  = useState(null);
  const [historyCustomer, setHistoryCustomer] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, segment],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '100' });
      if (search)  p.set('search', search);
      if (segment) p.set('segment', segment);
      return api.get(`/customers?${p}`).then(r => r.data);
    },
    keepPreviousData: true,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`),
    onSuccess: () => { toast.success('Customer removed'); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError:   (e) => toast.error(e.response?.data?.message || e.message),
  });

  const customers = data?.data?.data || [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <input className="input pl-9 w-full" placeholder="Search name, phone, email…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={segment} onChange={e => setSegment(e.target.value)}>
          <option value="">All Segments</option>
          <option value="new">New</option>
          <option value="regular">Regular</option>
          <option value="vip">VIP</option>
          <option value="lapsed">Lapsed</option>
        </select>
        <button className="btn-primary flex items-center gap-2" onClick={() => setIsAddOpen(true)}>
          <Plus className="w-4 h-4" />Add Customer
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Customer', 'Segment', 'Visits', 'Total Spend', 'Points', 'Last Visit', ''].map(h => (
                <th key={h} className={`py-3 px-4 font-medium text-xs uppercase tracking-wide ${h === '' || h === 'Visits' || h === 'Total Spend' || h === 'Points' || h === 'Last Visit' ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--text-secondary)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>No customers found</td></tr>
            ) : customers.map((c, i) => (
              <tr key={c.id}
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                className="hover:bg-surface-800/40 transition-colors">
                <td className="py-3 px-4">
                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.full_name || '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.phone}</p>
                </td>
                <td className="py-3 px-4"><SegmentBadge segment={c.segment} /></td>
                <td className="py-3 px-4 text-right" style={{ color: 'var(--text-primary)' }}>{c.total_visits}</td>
                <td className="py-3 px-4 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{format(c.total_spend)}</td>
                <td className="py-3 px-4 text-right font-semibold" style={{ color: '#d97706' }}>
                  {fmtPts(c.loyalty_points?.current_balance)}
                </td>
                <td className="py-3 px-4 text-right text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setHistoryCustomer(c)}
                      className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Loyalty History">
                      <Gift className="w-4 h-4" style={{ color: '#d97706' }} />
                    </button>
                    <button onClick={() => setAdjustCustomer(c)}
                      className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Adjust Points">
                      <Coins className="w-4 h-4 text-emerald-500" />
                    </button>
                    <button onClick={() => setEditCustomer(c)}
                      className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Edit">
                      <Edit2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    </button>
                    <button onClick={() => { if (confirm('Remove this customer?')) deleteMut.mutate(c.id); }}
                      className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAddOpen       && <CustomerModal outletId={outletId} onClose={() => setIsAddOpen(false)} />}
      {editCustomer    && <CustomerModal customer={editCustomer} outletId={outletId} onClose={() => setEditCustomer(null)} />}
      {adjustCustomer  && <AdjustPointsModal customer={adjustCustomer} outletId={outletId} onClose={() => setAdjustCustomer(null)} />}
      {historyCustomer && <LoyaltyHistoryModal customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />}
    </div>
  );
}

// ─── Loyalty Tab ──────────────────────────────────────────────────────────────
function LoyaltyTab({ outletId }) {
  const { format } = useCurrency();

  const { data } = useQuery({
    queryKey: ['crm-dashboard', outletId],
    queryFn: () => api.get(`/customers/crm/dashboard?outlet_id=${outletId}`).then(r => r.data),
  });

  const cfg   = data?.data?.loyalty_config || {};
  const stats = data?.data?.loyalty_stats  || {};

  const { data: customersData } = useQuery({
    queryKey: ['customers-loyalty'],
    queryFn: () => api.get('/customers?limit=100').then(r => r.data),
  });
  const customers  = customersData?.data?.data || [];
  const withPoints = customers
    .filter(c => c.loyalty_points?.current_balance > 0)
    .sort((a, b) => b.loyalty_points.current_balance - a.loyalty_points.current_balance);

  const redemptionRate = stats.total_points_earned > 0
    ? ((stats.total_points_redeemed / stats.total_points_earned) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Programme rules */}
      <div className="card">
        <SectionHeader title="Programme Rules" icon={Zap} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: 'Earning Rule',
              value: `${cfg.earn_rate} pt per ${format(cfg.earn_per_amount)} spent`,
              icon: ArrowUpRight,
              accent: '#d97706',
            },
            {
              label: 'Redemption Value',
              value: `1 pt = ${format(cfg.redeem_value)} off`,
              icon: Gift,
              accent: '#16a34a',
            },
            {
              label: 'Min to Redeem',
              value: `${cfg.min_redemption} pts`,
              sub: `≥ ${format((cfg.min_redemption || 0) * (cfg.redeem_value || 0))} discount`,
              icon: Award,
              accent: 'var(--accent)',
            },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${item.accent} 12%, transparent)` }}>
                <item.icon className="w-4 h-4" style={{ color: item.accent }} />
              </div>
              <div>
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
                {item.sub && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.sub}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Outstanding Balance" value={fmtPts(stats.total_points_outstanding)}
          sub={`≈ ${format((stats.total_points_outstanding || 0) * (cfg.redeem_value || 0))} liability`}
          icon={Coins} accent="#d97706" />
        <StatCard label="Total Earned"   value={fmtPts(stats.total_points_earned)}   icon={ArrowUpRight}   accent="#16a34a" />
        <StatCard label="Total Redeemed" value={fmtPts(stats.total_points_redeemed)} icon={ArrowDownRight} accent="#dc2626" />
        <StatCard label="Redemption Rate" value={`${redemptionRate}%`} icon={TrendingUp} accent="#7c3aed" />
      </div>

      {/* Leaderboard */}
      <div className="card">
        <SectionHeader title="Points Leaderboard" icon={Crown} />
        {withPoints.length === 0 ? (
          <EmptyState icon={Award} text="No loyalty points earned yet" />
        ) : (
          <div className="space-y-1">
            {withPoints.slice(0, 15).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-800 transition-colors">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  i === 0 ? 'bg-amber-500/25 text-amber-500' :
                  i === 1 ? 'bg-slate-400/25 text-slate-400' :
                  i === 2 ? 'bg-orange-500/20 text-orange-400' :
                  'bg-surface-700 text-surface-400'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {c.full_name || c.phone}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {c.phone} · {c.total_visits} visits
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm" style={{ color: '#d97706' }}>
                    {fmtPts(c.loyalty_points?.current_balance)} pts
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    ≈ {format(c.loyalty_points?.current_balance * (cfg.redeem_value || 0))}
                  </p>
                </div>
                <SegmentBadge segment={c.segment} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Campaigns Tab ────────────────────────────────────────────────────────────
function CampaignsTab({ outletId }) {
  const [isNewOpen,   setIsNewOpen]   = useState(false);
  const [expandedId,  setExpandedId]  = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['campaigns', outletId],
    queryFn: () => api.get(`/customers/campaigns?outlet_id=${outletId}&limit=50`).then(r => r.data),
  });

  const campaigns = data?.data?.data || [];
  const CHANNEL_ICON = { sms: Smartphone, whatsapp: MessageCircle, email: Mail, push: Zap };
  const STATUS_CFG   = {
    sent:      { cls: 'bg-emerald-500/15 text-emerald-600', label: 'Sent' },
    scheduled: { cls: 'bg-blue-500/15 text-blue-600',       label: 'Scheduled' },
    draft:     { cls: 'bg-surface-700/50 text-surface-400', label: 'Draft' },
    failed:    { cls: 'bg-red-500/15 text-red-500',         label: 'Failed' },
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Marketing Campaigns</h3>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            SMS, WhatsApp and email outreach to customer segments
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-ghost p-2"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setIsNewOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />New Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Campaigns"  value={campaigns.length}                                            icon={Megaphone}  accent="var(--accent)" />
        <StatCard label="Sent"             value={campaigns.filter(c => c.status === 'sent').length}           icon={CheckCircle2} accent="#16a34a" />
        <StatCard label="Total Delivered"  value={campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0).toLocaleString()} icon={Users} accent="#7c3aed" />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="card text-center py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="card">
          <EmptyState icon={Megaphone} text="No campaigns yet — create your first one"
            action={
              <button className="btn-primary text-sm flex items-center gap-2" onClick={() => setIsNewOpen(true)}>
                <Plus className="w-4 h-4" />New Campaign
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(camp => {
            const Icon         = CHANNEL_ICON[camp.type] || Smartphone;
            const statusCfg    = STATUS_CFG[camp.status] || STATUS_CFG.draft;
            const isOpen       = expandedId === camp.id;
            const deliveryRate = camp.total_recipients > 0
              ? Math.round((camp.delivered_count / camp.total_recipients) * 100)
              : 0;

            return (
              <div key={camp.id} className="card" style={{ padding: 0 }}>
                <div className="flex items-start gap-4 p-4 cursor-pointer select-none"
                  onClick={() => setExpandedId(isOpen ? null : camp.id)}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
                    <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{camp.name}</p>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </span>
                      {camp.target_segment && (
                        <span className="px-2 py-0.5 rounded-md text-xs bg-surface-700/50 capitalize"
                          style={{ color: 'var(--text-secondary)' }}>
                          {camp.target_segment === 'all' ? 'All customers' : camp.target_segment}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>{camp.message_template}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>{camp.total_recipients} recipients</span>
                      <span>·</span>
                      <span>{camp.delivered_count} delivered ({deliveryRate}%)</span>
                      <span>·</span>
                      <span>{camp.sent_at
                        ? new Date(camp.sent_at).toLocaleString()
                        : `Scheduled: ${new Date(camp.scheduled_at).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      deliveryRate === 100 ? 'bg-emerald-500' :
                      deliveryRate > 0     ? 'bg-amber-500' : 'bg-surface-500'
                    }`} />
                    {isOpen ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                             : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 pt-0" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="grid grid-cols-3 gap-4 text-center my-4">
                      {[
                        { label: 'Recipients', value: camp.total_recipients, color: 'var(--text-primary)' },
                        { label: 'Delivered',  value: camp.delivered_count,  color: '#16a34a' },
                        { label: 'Failed',     value: camp.failed_count || 0, color: '#dc2626' },
                      ].map(s => (
                        <div key={s.label}>
                          <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryRate}%` }} />
                    </div>
                    <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{deliveryRate}% delivery rate</p>
                    <div className="p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Message Template</p>
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{camp.message_template}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isNewOpen && <CampaignModal outletId={outletId} onClose={() => setIsNewOpen(false)} />}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function LoyaltySettingsTab({ outletId }) {
  const qc = useQueryClient();
  const { symbol } = useCurrency();

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['loyalty-config', outletId],
    queryFn: () => api.get(`/customers/loyalty/config?outlet_id=${outletId}`).then(r => r.data),
  });

  const [form, setForm] = useState(null);
  useEffect(() => { if (cfg && !form) setForm({ ...cfg }); }, [cfg, form]);

  const save = useMutation({
    mutationFn: (body) => api.put('/customers/loyalty/config', { outlet_id: outletId, ...body }),
    onSuccess: () => {
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['loyalty-config', outletId] });
      qc.invalidateQueries({ queryKey: ['crm-dashboard', outletId] });
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message || 'Save failed'),
  });

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="card animate-pulse h-32" style={{ background: 'var(--bg-secondary)' }} />
        ))}
      </div>
    );
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const Field = ({ label, hint, children }) => (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>{hint}</p>}
    </div>
  );

  const NumInput = ({ value, onChange, prefix, suffix, min = 0, step = 1 }) => (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-sm font-medium pointer-events-none" style={{ color: 'var(--text-secondary)' }}>{prefix}</span>}
      <input
        type="number" min={min} step={step} value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className={`input w-full ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-12' : ''}`}
      />
      {suffix && <span className="absolute right-3 text-sm font-medium pointer-events-none" style={{ color: 'var(--text-secondary)' }}>{suffix}</span>}
    </div>
  );

  const sections = [
    {
      title: 'Earning Rules',
      icon: ArrowUpRight,
      accent: '#d97706',
      fields: [
        {
          label: 'Points per spend (earn rate)', suffix: 'pts',
          hint: `Customer earns this many points each time they spend ${symbol}${form.earn_per_amount}.`,
          value: form.earn_rate, onChange: v => set('earn_rate', v),
        },
        {
          label: 'Per spend amount', prefix: symbol, min: 1,
          hint: `e.g. ${form.earn_rate} pts per ${symbol}${form.earn_per_amount}`,
          value: form.earn_per_amount, onChange: v => set('earn_per_amount', v),
        },
        {
          label: 'VIP tier threshold', prefix: symbol,
          hint: 'Lifetime spend required to reach VIP status.',
          value: form.vip_threshold, onChange: v => set('vip_threshold', v),
        },
        {
          label: 'VIP earn multiplier', suffix: '×', step: 0.1,
          hint: 'VIP customers earn this many times the normal rate.',
          value: form.vip_multiplier, onChange: v => set('vip_multiplier', v),
        },
      ],
    },
    {
      title: 'Redemption Rules',
      icon: Gift,
      accent: '#16a34a',
      fields: [
        {
          label: 'Value per point', prefix: symbol, step: 0.01,
          hint: `1 point = ${symbol}${(form.redeem_value || 0).toFixed(2)} discount`,
          value: form.redeem_value, onChange: v => set('redeem_value', v),
        },
        {
          label: 'Minimum points to redeem', suffix: 'pts',
          hint: 'Customer must hold at least this many points before redeeming.',
          value: form.min_redemption, onChange: v => set('min_redemption', v),
        },
        {
          label: 'Max redemption per order', suffix: '%',
          hint: 'Cap on what fraction of an order can be paid with points (e.g. 50%).',
          value: form.max_redemption_pct, onChange: v => set('max_redemption_pct', v),
        },
        {
          label: 'Point expiry', suffix: 'months',
          hint: 'Set to 0 if points never expire.',
          value: form.expiry_months, onChange: v => set('expiry_months', v),
        },
      ],
    },
    {
      title: 'Bonus Points',
      icon: Award,
      accent: 'var(--accent)',
      fields: [
        {
          label: 'Signup bonus', suffix: 'pts',
          hint: 'Awarded when a customer is first added.',
          value: form.signup_bonus, onChange: v => set('signup_bonus', v),
        },
        {
          label: 'Birthday bonus', suffix: 'pts',
          hint: "Awarded automatically on the customer's birthday.",
          value: form.birthday_bonus, onChange: v => set('birthday_bonus', v),
        },
        {
          label: 'Referral bonus', suffix: 'pts',
          hint: 'Awarded when a referred customer places their first order.',
          value: form.referral_bonus, onChange: v => set('referral_bonus', v),
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Programme toggle */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Loyalty Programme</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            When disabled, no points are earned or redeemed at checkout.
          </p>
        </div>
        <button
          type="button"
          onClick={() => set('enabled', !form.enabled)}
          className="relative w-12 h-6 rounded-full transition-colors shrink-0"
          style={{ background: form.enabled ? 'var(--accent)' : 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.enabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'}`} />
        </button>
      </div>

      {/* Settings sections */}
      {sections.map(sec => (
        <div key={sec.title} className="card">
          <SectionHeader title={sec.title} icon={sec.icon} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sec.fields.map(f => (
              <Field key={f.label} label={f.label} hint={f.hint}>
                <NumInput value={f.value} onChange={f.onChange}
                  prefix={f.prefix} suffix={f.suffix}
                  min={f.min ?? 0} step={f.step ?? 1} />
              </Field>
            ))}
          </div>
        </div>
      ))}

      {/* Live preview */}
      <div className="card" style={{ border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 4%, var(--bg-card))' }}>
        <SectionHeader title="Programme Preview" icon={Activity} />
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          A customer spending{' '}
          <span className="font-semibold">{symbol}{form.earn_per_amount * 10}</span> earns{' '}
          <span className="font-semibold" style={{ color: '#d97706' }}>{form.earn_rate * 10} pts</span>
          {' '}— worth{' '}
          <span className="font-semibold" style={{ color: '#16a34a' }}>
            {symbol}{(form.earn_rate * 10 * form.redeem_value).toFixed(2)}
          </span>{' '}in store credit.
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          Effective discount rate: ~{((form.earn_rate * form.redeem_value / form.earn_per_amount) * 100).toFixed(2)}% on every order.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => setForm({ ...cfg })}
          disabled={save.isPending}
          className="btn-ghost px-4 py-2 text-sm font-medium"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="btn-primary px-6 py-2 font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CRMPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            <Heart className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          Loyalty &amp; Rewards
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Customer relationships, loyalty points and marketing campaigns
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {TAB_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === id
              ? { background: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: 'var(--text-secondary)' }
            }
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && <DashboardTab outletId={outletId} onEditConfig={() => setTab('settings')} />}
      {tab === 'customers' && <CustomersTab outletId={outletId} />}
      {tab === 'loyalty'   && <LoyaltyTab   outletId={outletId} />}
      {tab === 'campaigns' && <CampaignsTab  outletId={outletId} />}
      {tab === 'settings'  && <LoyaltySettingsTab outletId={outletId} />}
    </div>
  );
}
