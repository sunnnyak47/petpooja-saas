import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import {
  Users, Crown, Star, UserX, Gift, Send, Phone, Mail, Calendar,
  TrendingUp, Search, Plus, ChevronRight, Award, Megaphone,
  Heart, Repeat, BarChart2, X, ChevronDown, ChevronUp, Coins,
  Edit2, Trash2, Eye, RefreshCw, MessageCircle, Smartphone, Zap,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtPts = (n) => Number(n || 0).toLocaleString('en-IN');
const SEGMENT_META = {
  new:     { label: 'New',     color: 'bg-blue-500/20 text-blue-400',    icon: Star },
  regular: { label: 'Regular', color: 'bg-green-500/20 text-green-400',  icon: Repeat },
  vip:     { label: 'VIP',     color: 'bg-yellow-500/20 text-yellow-400', icon: Crown },
  lapsed:  { label: 'Lapsed',  color: 'bg-red-500/20 text-red-400',      icon: UserX },
};
const SEGMENT_BADGE = ({ segment }) => {
  const m = SEGMENT_META[segment] || SEGMENT_META.new;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${m.color}`}>
      <Icon className="w-3 h-3" />{m.label}
    </span>
  );
};

const TAB_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: BarChart2 },
  { id: 'customers', label: 'Customers',  icon: Users },
  { id: 'loyalty',   label: 'Loyalty',    icon: Gift },
  { id: 'campaigns', label: 'Campaigns',  icon: Megaphone },
];

// ─── modals ───────────────────────────────────────────────────────────────────
function CustomerModal({ customer, outletId, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!customer;
  const [form, setForm] = useState({
    full_name: customer?.full_name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    gender: customer?.gender || '',
    date_of_birth: customer?.date_of_birth ? customer.date_of_birth.split('T')[0] : '',
    anniversary: customer?.anniversary ? customer.anniversary.split('T')[0] : '',
    dietary_preference: customer?.dietary_preference || '',
    notes: customer?.notes || '',
  });

  const mut = useMutation({
    mutationFn: (d) => isEdit ? api.patch(`/customers/${customer.id}`, d) : api.post('/customers', d),
    onSuccess: () => {
      toast.success(isEdit ? 'Customer updated!' : 'Customer added!');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['crm-dashboard'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Full Name</label>
            <input className="input w-full" value={form.full_name} onChange={set('full_name')} placeholder="Customer name" />
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input w-full" value={form.phone} onChange={set('phone')} placeholder="+919876543210" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input w-full" value={form.email} onChange={set('email')} type="email" placeholder="email@example.com" />
          </div>
          <div>
            <label className="label">Gender</label>
            <select className="input w-full" value={form.gender} onChange={set('gender')}>
              <option value="">Select</option>
              <option>male</option><option>female</option><option>other</option>
            </select>
          </div>
          <div>
            <label className="label">Dietary Preference</label>
            <select className="input w-full" value={form.dietary_preference} onChange={set('dietary_preference')}>
              <option value="">None</option>
              <option>veg</option><option>non-veg</option><option>vegan</option><option>jain</option>
            </select>
          </div>
          <div>
            <label className="label">Date of Birth 🎂</label>
            <input className="input w-full" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
          </div>
          <div>
            <label className="label">Anniversary 💍</label>
            <input className="input w-full" type="date" value={form.anniversary} onChange={set('anniversary')} />
          </div>
          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea className="input w-full resize-none" rows={2} value={form.notes} onChange={set('notes')} placeholder="Any special preferences..." />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary flex-1"
            disabled={mut.isPending || !form.phone}
            onClick={() => mut.mutate(form)}
          >
            {mut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdjustPointsModal({ customer, outletId, onClose }) {
  const qc = useQueryClient();
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');

  const mut = useMutation({
    mutationFn: (d) => api.post(`/customers/${customer.id}/loyalty/adjust`, d),
    onSuccess: () => {
      toast.success('Points adjusted!');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['crm-dashboard'] });
      qc.invalidateQueries({ queryKey: ['loyalty-history', customer.id] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold">Adjust Points — {customer.full_name || customer.phone}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-surface-400 mb-4">
          Current balance: <span className="text-warning-400 font-bold">{fmtPts(customer.loyalty_points?.current_balance)} pts</span>
        </p>
        <label className="label">Points (use negative to deduct)</label>
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
            {mut.isPending ? 'Saving…' : 'Adjust'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoyaltyHistoryModal({ customer, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['loyalty-history', customer.id],
    queryFn: () => api.get(`/customers/${customer.id}/loyalty/history?limit=50`).then(r => r.data),
  });

  const txns = data?.data?.data || [];
  const summary = data?.data?.summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold">{customer.full_name || customer.phone} — Loyalty History</h2>
            <p className="text-sm text-surface-400 mt-0.5">
              Balance: <span className="text-warning-400 font-bold">{fmtPts(summary?.current_balance || customer.loyalty_points?.current_balance)} pts</span>
              &nbsp;·&nbsp;Earned: {fmtPts(summary?.total_earned)} · Redeemed: {fmtPts(summary?.total_redeemed)}
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? <p className="text-center text-surface-400 py-8">Loading…</p> :
           txns.length === 0 ? <p className="text-center text-surface-400 py-8">No transactions yet</p> :
           txns.map(tx => (
            <div key={tx.id} className="flex items-center justify-between px-4 py-3 bg-surface-800 rounded-xl">
              <div>
                <p className="text-sm font-medium">{tx.description || tx.type}</p>
                <p className="text-xs text-surface-500">
                  {tx.outlet?.name} · {new Date(tx.created_at).toLocaleDateString('en-IN')}
                  {tx.order?.order_number ? ` · ${tx.order.order_number}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${tx.points > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.points > 0 ? '+' : ''}{fmtPts(tx.points)} pts
                </p>
                <p className="text-xs text-surface-500">Balance: {fmtPts(tx.balance_after)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CampaignModal({ outletId, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    type: 'sms',
    target_segment: 'all',
    message: '',
    schedule_at: '',
  });

  const VARS = ['{name}', '{phone}', '{points}'];

  const mut = useMutation({
    mutationFn: (d) => api.post('/customers/campaigns', d),
    onSuccess: (res) => {
      toast.success(`Campaign sent to ${res.data?.data?.total_recipients || 0} customers!`);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const insertVar = (v) => setForm(f => ({ ...f, message: f.message + v }));

  const charCount = form.message.length;
  const smsCount = Math.ceil(charCount / 160) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg">New Campaign</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Campaign Name *</label>
            <input className="input w-full" value={form.name} onChange={set('name')} placeholder="e.g. Weekend Special Offer" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Channel</label>
              <select className="input w-full" value={form.type} onChange={set('type')}>
                <option value="sms">📱 SMS</option>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="email">📧 Email</option>
                <option value="push">🔔 Push Notification</option>
              </select>
            </div>
            <div>
              <label className="label">Target Audience</label>
              <select className="input w-full" value={form.target_segment} onChange={set('target_segment')}>
                <option value="all">All Customers</option>
                <option value="new">New</option>
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
                <option value="lapsed">Lapsed (win-back)</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Message *</label>
              <div className="flex gap-1">
                {VARS.map(v => (
                  <button key={v} onClick={() => insertVar(v)}
                    className="px-2 py-0.5 text-xs bg-brand-500/20 text-brand-400 rounded hover:bg-brand-500/30 transition-colors">
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
            <p className="text-xs text-surface-500 mt-1">{charCount} chars · {smsCount} SMS credit{smsCount !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <label className="label">Schedule (optional)</label>
            <input className="input w-full" type="datetime-local" value={form.schedule_at} onChange={set('schedule_at')} />
            <p className="text-xs text-surface-500 mt-1">Leave blank to send immediately</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            disabled={mut.isPending || !form.name || !form.message}
            onClick={() => mut.mutate({ ...form, outlet_id: outletId })}
          >
            <Send className="w-4 h-4" />
            {mut.isPending ? 'Sending…' : form.schedule_at ? 'Schedule' : 'Send Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── tabs ─────────────────────────────────────────────────────────────────────
function DashboardTab({ outletId }) {
  const qc = useQueryClient();
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
      toast.success(`Birthday messages sent to ${res.data?.data?.sent || 0} customers!`);
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const d = data?.data || {};
  const segments = d.segments || {};
  const loyaltyStats = d.loyalty_stats || {};
  const loyaltyCfg = d.loyalty_config || {};
  const topSpenders = d.top_spenders || [];
  const birthdayList = bdays?.data || [];
  const recentTxns = d.recent_transactions || [];

  const segCards = [
    { key: 'vip',     label: 'VIP',     icon: Crown,   color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { key: 'regular', label: 'Regular', icon: Repeat,  color: 'text-green-400',  bg: 'bg-green-500/10' },
    { key: 'new',     label: 'New',     icon: Star,    color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    { key: 'lapsed',  label: 'Lapsed',  icon: UserX,   color: 'text-red-400',    bg: 'bg-red-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card text-center">
          <Users className="w-7 h-7 text-brand-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{d.total_customers || 0}</p>
          <p className="text-xs text-surface-500 mt-1">Total Customers</p>
        </div>
        <div className="card text-center">
          <Coins className="w-7 h-7 text-warning-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{fmtPts(loyaltyStats.total_points_outstanding)}</p>
          <p className="text-xs text-surface-500 mt-1">Points Outstanding</p>
        </div>
        <div className="card text-center">
          <Gift className="w-7 h-7 text-green-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{fmtPts(loyaltyStats.total_points_earned)}</p>
          <p className="text-xs text-surface-500 mt-1">Total Points Earned</p>
        </div>
        <div className="card text-center">
          <TrendingUp className="w-7 h-7 text-purple-400 mx-auto mb-2" />
          <p className="text-2xl font-black">{fmtPts(loyaltyStats.total_points_redeemed)}</p>
          <p className="text-xs text-surface-500 mt-1">Total Points Redeemed</p>
        </div>
      </div>

      {/* Segments */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {segCards.map(({ key, label, icon: Icon, color, bg }) => (
          <div key={key} className={`card flex items-center gap-3 ${bg}`}>
            <Icon className={`w-8 h-8 ${color} shrink-0`} />
            <div>
              <p className={`text-xl font-black ${color}`}>{segments[key] || 0}</p>
              <p className="text-xs text-surface-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Loyalty config */}
      <div className="card">
        <h3 className="font-bold mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-warning-400" />Loyalty Programme Config</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-surface-400 text-xs mb-1">Earn Rate</p>
            <p className="font-bold text-warning-400">{loyaltyCfg.earn_rate} pt per ₹{loyaltyCfg.earn_per_amount}</p>
          </div>
          <div>
            <p className="text-surface-400 text-xs mb-1">Redemption Value</p>
            <p className="font-bold text-green-400">1 pt = ₹{loyaltyCfg.redeem_value}</p>
          </div>
          <div>
            <p className="text-surface-400 text-xs mb-1">Min Redemption</p>
            <p className="font-bold">{loyaltyCfg.min_redemption} pts</p>
          </div>
          <div>
            <p className="text-surface-400 text-xs mb-1">Auto Segment Update</p>
            <p className="font-bold text-green-400">Active ✓</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Spenders */}
        <div className="lg:col-span-2 card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Crown className="w-4 h-4 text-yellow-400" />Top Spenders</h3>
          <div className="space-y-2">
            {topSpenders.slice(0, 8).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-800 transition-colors">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i < 3 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-surface-700 text-surface-400'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{c.full_name || c.phone}</p>
                  <p className="text-xs text-surface-500">{c.total_visits} visits</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{fmt(c.total_spend)}</p>
                  <p className="text-xs text-warning-400">{fmtPts(c.loyalty_points?.current_balance)} pts</p>
                </div>
                <SEGMENT_BADGE segment={c.segment} />
              </div>
            ))}
          </div>
        </div>

        {/* Birthdays */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2"><Heart className="w-4 h-4 text-pink-400" />Birthdays (Next 7 Days)</h3>
            {birthdayList.length > 0 && (
              <button
                onClick={() => birthdayMut.mutate({ outlet_id: outletId })}
                disabled={birthdayMut.isPending}
                className="px-3 py-1 text-xs bg-pink-500/20 text-pink-400 rounded-lg hover:bg-pink-500/30 transition-colors flex items-center gap-1"
              >
                <Send className="w-3 h-3" />{birthdayMut.isPending ? '…' : 'Send Wishes'}
              </button>
            )}
          </div>
          {birthdayList.length === 0 ? (
            <p className="text-surface-500 text-sm text-center py-6">No upcoming birthdays 🎂</p>
          ) : (
            <div className="space-y-2">
              {birthdayList.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-pink-500/5">
                  <span className="text-xl">🎂</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.full_name || c.phone}</p>
                    <p className="text-xs text-surface-500">{c.phone}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent loyalty transactions */}
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Gift className="w-4 h-4 text-brand-400" />Recent Loyalty Activity</h3>
        <div className="space-y-2">
          {recentTxns.length === 0 ? <p className="text-surface-500 text-sm text-center py-4">No recent activity</p> :
            recentTxns.map(tx => (
              <div key={tx.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-800">
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${tx.type === 'earn' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {tx.type === 'earn' ? '+' : '-'}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{tx.customer?.full_name || tx.customer?.phone || 'Customer'}</p>
                    <p className="text-xs text-surface-500">{tx.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${tx.type === 'earn' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.points > 0 ? '+' : ''}{fmtPts(tx.points)} pts
                  </p>
                  <p className="text-xs text-surface-500">{new Date(tx.created_at).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function CustomersTab({ outletId }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [adjustCustomer, setAdjustCustomer] = useState(null);
  const [historyCustomer, setHistoryCustomer] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, segment],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (segment) params.set('segment', segment);
      return api.get(`/customers?${params}`).then(r => r.data);
    },
    keepPreviousData: true,
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`),
    onSuccess: () => { toast.success('Customer deleted'); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: (e) => toast.error(e.response?.data?.message || e.message),
  });

  const customers = data?.data?.data || [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input className="input pl-9 w-full" placeholder="Search name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} />
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
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-700">
              <th className="text-left py-3 px-4 text-surface-400 font-medium">Customer</th>
              <th className="text-left py-3 px-4 text-surface-400 font-medium">Segment</th>
              <th className="text-right py-3 px-4 text-surface-400 font-medium">Visits</th>
              <th className="text-right py-3 px-4 text-surface-400 font-medium">Total Spend</th>
              <th className="text-right py-3 px-4 text-surface-400 font-medium">Points</th>
              <th className="text-right py-3 px-4 text-surface-400 font-medium">Last Visit</th>
              <th className="text-center py-3 px-4 text-surface-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-surface-400">Loading…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-surface-400">No customers found</td></tr>
            ) : customers.map(c => (
              <tr key={c.id} className="border-b border-surface-800 hover:bg-surface-800/50 transition-colors">
                <td className="py-3 px-4">
                  <p className="font-medium">{c.full_name || '—'}</p>
                  <p className="text-xs text-surface-500">{c.phone}</p>
                </td>
                <td className="py-3 px-4"><SEGMENT_BADGE segment={c.segment} /></td>
                <td className="py-3 px-4 text-right">{c.total_visits}</td>
                <td className="py-3 px-4 text-right font-medium">{fmt(c.total_spend)}</td>
                <td className="py-3 px-4 text-right">
                  <span className="text-warning-400 font-bold">{fmtPts(c.loyalty_points?.current_balance)}</span>
                </td>
                <td className="py-3 px-4 text-right text-surface-400 text-xs">
                  {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => setHistoryCustomer(c)} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Loyalty History">
                      <Gift className="w-4 h-4 text-warning-400" />
                    </button>
                    <button onClick={() => setAdjustCustomer(c)} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Adjust Points">
                      <Coins className="w-4 h-4 text-green-400" />
                    </button>
                    <button onClick={() => setEditCustomer(c)} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Edit">
                      <Edit2 className="w-4 h-4 text-brand-400" />
                    </button>
                    <button onClick={() => { if (confirm('Delete this customer?')) deleteMut.mutate(c.id); }} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors" title="Delete">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAddOpen && <CustomerModal outletId={outletId} onClose={() => setIsAddOpen(false)} />}
      {editCustomer && <CustomerModal customer={editCustomer} outletId={outletId} onClose={() => setEditCustomer(null)} />}
      {adjustCustomer && <AdjustPointsModal customer={adjustCustomer} outletId={outletId} onClose={() => setAdjustCustomer(null)} />}
      {historyCustomer && <LoyaltyHistoryModal customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />}
    </div>
  );
}

function LoyaltyTab({ outletId }) {
  const { data } = useQuery({
    queryKey: ['crm-dashboard', outletId],
    queryFn: () => api.get(`/customers/crm/dashboard?outlet_id=${outletId}`).then(r => r.data),
  });

  const cfg = data?.data?.loyalty_config || {};
  const stats = data?.data?.loyalty_stats || {};

  const { data: customersData } = useQuery({
    queryKey: ['customers-loyalty'],
    queryFn: () => api.get('/customers?limit=100').then(r => r.data),
  });
  const customers = customersData?.data?.data || [];
  const withPoints = customers.filter(c => c.loyalty_points?.current_balance > 0)
    .sort((a, b) => b.loyalty_points.current_balance - a.loyalty_points.current_balance);

  return (
    <div className="space-y-6">
      {/* Programme overview */}
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-warning-400" />Programme Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-surface-800 rounded-xl">
              <div>
                <p className="text-xs text-surface-400 mb-1">Earning Rule</p>
                <p className="font-bold text-warning-400 text-lg">{cfg.earn_rate} point per ₹{cfg.earn_per_amount} spent</p>
              </div>
              <Gift className="w-8 h-8 text-warning-400/40" />
            </div>
            <div className="flex items-center justify-between p-4 bg-surface-800 rounded-xl">
              <div>
                <p className="text-xs text-surface-400 mb-1">Redemption Value</p>
                <p className="font-bold text-green-400 text-lg">1 point = ₹{cfg.redeem_value} off</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400/40" />
            </div>
            <div className="flex items-center justify-between p-4 bg-surface-800 rounded-xl">
              <div>
                <p className="text-xs text-surface-400 mb-1">Minimum to Redeem</p>
                <p className="font-bold text-lg">{cfg.min_redemption} points (≥ ₹{(cfg.min_redemption * cfg.redeem_value).toFixed(0)} discount)</p>
              </div>
              <Award className="w-8 h-8 text-brand-400/40" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 content-start">
            <div className="card bg-surface-800 text-center">
              <p className="text-2xl font-black text-warning-400">{fmtPts(stats.total_points_outstanding)}</p>
              <p className="text-xs text-surface-500 mt-1">Outstanding Balance</p>
              <p className="text-xs text-surface-600">≈ {fmt((stats.total_points_outstanding || 0) * (cfg.redeem_value || 0))} liability</p>
            </div>
            <div className="card bg-surface-800 text-center">
              <p className="text-2xl font-black text-green-400">{fmtPts(stats.total_points_earned)}</p>
              <p className="text-xs text-surface-500 mt-1">Total Earned</p>
            </div>
            <div className="card bg-surface-800 text-center">
              <p className="text-2xl font-black text-red-400">{fmtPts(stats.total_points_redeemed)}</p>
              <p className="text-xs text-surface-500 mt-1">Total Redeemed</p>
            </div>
            <div className="card bg-surface-800 text-center">
              <p className="text-2xl font-black text-purple-400">
                {stats.total_points_earned > 0 ? ((stats.total_points_redeemed / stats.total_points_earned) * 100).toFixed(1) : 0}%
              </p>
              <p className="text-xs text-surface-500 mt-1">Redemption Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Crown className="w-4 h-4 text-yellow-400" />Points Leaderboard</h3>
        {withPoints.length === 0 ? (
          <p className="text-surface-500 text-sm text-center py-6">No loyalty points earned yet</p>
        ) : (
          <div className="space-y-2">
            {withPoints.slice(0, 15).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-800 transition-colors">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black ${
                  i === 0 ? 'bg-yellow-500/30 text-yellow-400' :
                  i === 1 ? 'bg-gray-400/20 text-gray-300' :
                  i === 2 ? 'bg-orange-500/20 text-orange-400' :
                  'bg-surface-700 text-surface-400'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{c.full_name || c.phone}</p>
                  <p className="text-xs text-surface-500">{c.phone} · {c.total_visits} visits</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-warning-400">{fmtPts(c.loyalty_points?.current_balance)} pts</p>
                  <p className="text-xs text-surface-500">≈ {fmt(c.loyalty_points?.current_balance * (cfg.redeem_value || 0.25))}</p>
                </div>
                <SEGMENT_BADGE segment={c.segment} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignsTab({ outletId }) {
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['campaigns', outletId],
    queryFn: () => api.get(`/customers/campaigns?outlet_id=${outletId}&limit=50`).then(r => r.data),
  });

  const campaigns = data?.data?.data || [];

  const TYPE_ICON = { sms: Smartphone, whatsapp: MessageCircle, email: Mail, push: Zap };
  const STATUS_COLOR = { sent: 'text-green-400', scheduled: 'text-blue-400', draft: 'text-surface-400', failed: 'text-red-400' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold">Marketing Campaigns</h3>
          <p className="text-sm text-surface-400">SMS, WhatsApp & email campaigns to your customer segments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-ghost flex items-center gap-2"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setIsNewOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />New Campaign
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-2xl font-black">{campaigns.length}</p>
          <p className="text-xs text-surface-400 mt-1">Total Campaigns</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-black text-green-400">{campaigns.filter(c => c.status === 'sent').length}</p>
          <p className="text-xs text-surface-400 mt-1">Sent</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-black">{campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0).toLocaleString()}</p>
          <p className="text-xs text-surface-400 mt-1">Total Delivered</p>
        </div>
      </div>

      {/* Campaign list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="card text-center py-10 text-surface-400">Loading…</div>
        ) : campaigns.length === 0 ? (
          <div className="card text-center py-16">
            <Megaphone className="w-12 h-12 text-surface-600 mx-auto mb-3" />
            <p className="text-surface-400">No campaigns yet. Create your first one!</p>
          </div>
        ) : campaigns.map(camp => {
          const Icon = TYPE_ICON[camp.type] || Smartphone;
          const isOpen = expandedId === camp.id;
          const deliveryRate = camp.total_recipients > 0
            ? Math.round((camp.delivered_count / camp.total_recipients) * 100)
            : 0;

          return (
            <div key={camp.id} className="card">
              <div
                className="flex items-start gap-4 cursor-pointer"
                onClick={() => setExpandedId(isOpen ? null : camp.id)}
              >
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="font-bold truncate">{camp.name}</p>
                    <span className={`text-xs font-bold capitalize ${STATUS_COLOR[camp.status] || 'text-surface-400'}`}>
                      {camp.status}
                    </span>
                    {camp.target_segment && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-surface-700 text-surface-300 capitalize">
                        {camp.target_segment === 'all' ? 'All customers' : camp.target_segment}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-surface-400 mt-1 truncate">{camp.message_template}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                    <span>{camp.total_recipients} recipients</span>
                    <span>·</span>
                    <span>{camp.delivered_count} delivered ({deliveryRate}%)</span>
                    <span>·</span>
                    <span>{camp.sent_at ? new Date(camp.sent_at).toLocaleString('en-IN') : `Scheduled: ${new Date(camp.scheduled_at).toLocaleString('en-IN')}`}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${deliveryRate === 100 ? 'bg-green-400' : deliveryRate > 0 ? 'bg-yellow-400' : 'bg-surface-500'}`} />
                  {isOpen ? <ChevronUp className="w-4 h-4 text-surface-400" /> : <ChevronDown className="w-4 h-4 text-surface-400" />}
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 pt-4 border-t border-surface-700">
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
                    <div>
                      <p className="text-lg font-black">{camp.total_recipients}</p>
                      <p className="text-xs text-surface-400">Recipients</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-green-400">{camp.delivered_count}</p>
                      <p className="text-xs text-surface-400">Delivered</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-red-400">{camp.failed_count || 0}</p>
                      <p className="text-xs text-surface-400">Failed</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${deliveryRate}%` }} />
                  </div>
                  <p className="text-xs text-surface-500 mt-2">{deliveryRate}% delivery rate</p>

                  <div className="mt-4 p-3 bg-surface-800 rounded-xl">
                    <p className="text-xs text-surface-400 mb-1">Message Template</p>
                    <p className="text-sm">{camp.message_template}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isNewOpen && <CampaignModal outletId={outletId} onClose={() => setIsNewOpen(false)} />}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function CRMPage() {
  const { user } = useSelector(s => s.auth);
  const outletId = user?.outlet_id;
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Users className="w-7 h-7 text-brand-400" />Loyalty &amp; CRM
          </h1>
          <p className="text-surface-400 text-sm mt-1">Customer relationships, loyalty points &amp; marketing campaigns</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl w-fit">
        {TAB_ITEMS.map(({ id, label, icon: Icon }) => (
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

      {/* Tab content */}
      {tab === 'dashboard' && <DashboardTab outletId={outletId} />}
      {tab === 'customers' && <CustomersTab outletId={outletId} />}
      {tab === 'loyalty'   && <LoyaltyTab   outletId={outletId} />}
      {tab === 'campaigns' && <CampaignsTab  outletId={outletId} />}
    </div>
  );
}
