import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Search, Phone, Crown, Plus, Gift, Trash2, Loader2, Eye,
  ShoppingBag, Calendar, User, Send, Star, Cake, Mail,
  Heart, TrendingUp, AlertTriangle, CheckCircle2, X,
} from 'lucide-react';

const SEGMENT_STYLES = {
  new:     'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  regular: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  vip:     'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  lapsed:  'bg-red-500/15 text-red-400 border border-red-500/20',
};

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', gender: '',
  date_of_birth: '', anniversary: '',
  dietary_preference: '', notes: '',
};

// Upcoming birthday check (within 7 days)
function daysUntilBirthday(dob) {
  if (!dob) return null;
  const today = new Date();
  const bday  = new Date(dob);
  bday.setFullYear(today.getFullYear());
  if (bday < today) bday.setFullYear(today.getFullYear() + 1);
  const diff = Math.ceil((bday - today) / (1000 * 60 * 60 * 24));
  return diff <= 7 ? diff : null;
}

export default function CustomersPage() {
  const { user }  = useSelector(s => s.auth);
  const outletId  = user?.outlet_id;
  const qc        = useQueryClient();

  const [search, setSearch]   = useState('');
  const [segFilter, setSegFilter] = useState('');

  const [isAddOpen, setIsAddOpen]         = useState(false);
  const [isEditOpen, setIsEditOpen]       = useState(false);
  const [isDeleteOpen, setIsDeleteOpen]   = useState(false);
  const [isDetailOpen, setIsDetailOpen]   = useState(false);
  const [isCampaignOpen, setCampaignOpen] = useState(false);
  const [selectedCustomer, setSelected]   = useState(null);
  const [detailTab, setDetailTab]         = useState('profile');
  const [formData, setFormData]           = useState({ ...EMPTY_FORM });
  const [campaignData, setCampaignData]   = useState({ name: '', type: 'whatsapp', target_segment: 'all', message: '' });

  // ── Queries ─────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, segFilter],
    queryFn: () => api.get(`/customers?limit=100${search ? `&search=${search}` : ''}${segFilter ? `&segment=${segFilter}` : ''}`).then(r => r.data),
  });

  const { data: customerDetail } = useQuery({
    queryKey: ['customerDetail', selectedCustomer?.id],
    queryFn: () => api.get(`/customers/${selectedCustomer.id}`).then(r => r.data),
    enabled: !!selectedCustomer?.id && isDetailOpen,
  });

  const { data: campaignList } = useQuery({
    queryKey: ['campaigns', outletId],
    queryFn: () => api.get(`/customers/campaigns?outlet_id=${outletId}`).then(r => r.data),
    enabled: isCampaignOpen,
  });

  // ── Mutations ────────────────────────────────────────────────
  const addMut = useMutation({
    mutationFn: d => api.post('/customers', d),
    onSuccess: () => {
      toast.success('Customer added & linked to loyalty program');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setIsAddOpen(false);
      setFormData({ ...EMPTY_FORM });
    },
    onError: e => toast.error(e.response?.data?.message || e.message || 'Failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/customers/${id}`, data),
    onSuccess: () => {
      toast.success('Customer updated');
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customerDetail'] });
      setIsEditOpen(false);
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/customers/${id}`),
    onSuccess: () => {
      toast.success('Customer deleted');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setIsDeleteOpen(false);
    },
    onError: e => toast.error(e.message || 'Failed'),
  });

  const campaignMut = useMutation({
    mutationFn: d => api.post(`/customers/campaigns?outlet_id=${outletId}`, d),
    onSuccess: () => {
      toast.success('Campaign created & broadcast initiated!');
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      setCampaignOpen(false);
      setCampaignData({ name: '', type: 'whatsapp', target_segment: 'all', message: '' });
    },
    onError: e => toast.error(e.response?.data?.message || 'Failed to send campaign'),
  });

  // ── Derived ──────────────────────────────────────────────────
  const customers  = useMemo(() => data?.items || data || [], [data]);
  const campaigns  = useMemo(() => campaignList?.items || campaignList || [], [campaignList]);
  const upcoming   = useMemo(() => customers.filter(c => daysUntilBirthday(c.date_of_birth) !== null), [customers]);

  function openEdit(c) {
    setSelected(c);
    setFormData({
      full_name: c.full_name || '', phone: c.phone || '', email: c.email || '',
      gender: c.gender || '',
      date_of_birth: c.date_of_birth ? c.date_of_birth.slice(0, 10) : '',
      anniversary: c.anniversary ? c.anniversary.slice(0, 10) : '',
      dietary_preference: c.dietary_preference || '', notes: c.notes || '',
    });
    setIsEditOpen(true);
  }

  function openDetail(c) { setSelected(c); setDetailTab('profile'); setIsDetailOpen(true); }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Customer Management</h1>
          <p className="text-surface-500 text-sm">{customers.length} customers · linked to loyalty program</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setCampaignOpen(true)} className="btn-surface gap-2">
            <Send className="w-4 h-4 text-brand-400" /> Marketing Campaign
          </button>
          <button onClick={() => { setFormData({ ...EMPTY_FORM }); setIsAddOpen(true); }} className="btn-primary gap-2">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
      </div>

      {/* Birthday alert */}
      {upcoming.length > 0 && (
        <div className="flex items-center gap-3 bg-pink-500/10 border border-pink-500/20 rounded-2xl px-5 py-3">
          <Cake className="w-5 h-5 text-pink-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-white text-sm">🎂 Upcoming Birthdays!</p>
            <p className="text-xs text-surface-400">
              {upcoming.map(c => `${c.full_name || c.phone} (in ${daysUntilBirthday(c.date_of_birth)}d)`).join(', ')}
            </p>
          </div>
          <button onClick={() => { setCampaignData(d => ({ ...d, target_segment: 'all', name: 'Birthday Special', message: 'Happy Birthday! 🎂 Enjoy a special treat from us today. Visit us to claim your birthday discount!' })); setCampaignOpen(true); }}
            className="text-xs text-pink-400 font-bold border border-pink-500/30 px-3 py-1.5 rounded-lg hover:bg-pink-500/10 transition-all whitespace-nowrap">
            Send Birthday Campaign
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input className="input pl-10 w-full" placeholder="Search by name, phone, email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {['', 'new', 'regular', 'vip', 'lapsed'].map(s => (
            <button key={s} onClick={() => setSegFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${segFilter === s ? 'bg-brand-500 text-white' : 'bg-surface-800 text-surface-400 hover:text-white'}`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs uppercase border-b text-surface-500" style={{ borderColor: 'var(--border)' }}>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">DOB</th>
              <th className="px-4 py-3 text-left">Segment</th>
              <th className="px-4 py-3 text-left">Orders</th>
              <th className="px-4 py-3 text-left">Loyalty Pts</th>
              <th className="px-4 py-3 text-left">Last Visit</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700/40">
            {isLoading
              ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-4"><div className="h-4 rounded bg-surface-800 animate-pulse" /></td></tr>)
              : customers.length === 0
              ? <tr><td colSpan={8} className="px-4 py-12 text-center text-surface-500">No customers found</td></tr>
              : customers.map(c => {
                  const bdays = daysUntilBirthday(c.date_of_birth);
                  return (
                    <tr key={c.id} className="hover:bg-surface-800/40 group transition-colors cursor-pointer" onClick={() => openDetail(c)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-sm flex-shrink-0">
                            {c.full_name?.charAt(0)?.toUpperCase() || '#'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{c.full_name || 'Unknown'}</p>
                            <p className="text-xs text-surface-500">{c.email || c.dietary_preference || ''}</p>
                          </div>
                          {bdays !== null && <Cake className="w-4 h-4 text-pink-400" title={`Birthday in ${bdays} day${bdays !== 1 ? 's' : ''}!`} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-300">
                        <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-surface-500" />{c.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-400">
                        {c.date_of_birth ? new Date(c.date_of_birth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${SEGMENT_STYLES[c.segment] || SEGMENT_STYLES.new}`}>
                          {c.segment === 'vip' && <Crown className="w-3 h-3 inline mr-0.5" />}
                          {c.segment || 'new'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-surface-300">{c._count?.orders || 0}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-amber-400 flex items-center gap-1">
                          <Star className="w-3 h-3" />{c.loyalty_points?.current_balance || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-surface-500">
                        {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('en-IN') : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openDetail(c)} className="p-1.5 text-surface-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(c)} className="p-1.5 text-surface-500 hover:text-white hover:bg-surface-700 rounded-lg transition-colors" title="Edit"><User className="w-4 h-4" /></button>
                          <button onClick={() => { setSelected(c); setIsDeleteOpen(true); }} className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* ══ MODAL: Add Customer ══ */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Customer" size="md">
        <CustomerForm
          formData={formData} setFormData={setFormData}
          onSubmit={d => addMut.mutate(d)}
          loading={addMut.isPending}
          onCancel={() => setIsAddOpen(false)}
          submitLabel="Add Customer"
        />
      </Modal>

      {/* ══ MODAL: Edit Customer ══ */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Customer" size="md">
        <CustomerForm
          formData={formData} setFormData={setFormData}
          onSubmit={d => updateMut.mutate({ id: selectedCustomer?.id, data: d })}
          loading={updateMut.isPending}
          onCancel={() => setIsEditOpen(false)}
          submitLabel="Save Changes"
        />
      </Modal>

      {/* ══ MODAL: Customer Detail ══ */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Customer Profile" size="md">
        {selectedCustomer && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/20 flex items-center justify-center text-brand-400 font-black text-2xl flex-shrink-0">
                {selectedCustomer.full_name?.charAt(0)?.toUpperCase() || '#'}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-white">{selectedCustomer.full_name || 'Unknown'}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-surface-400 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedCustomer.phone}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${SEGMENT_STYLES[selectedCustomer.segment] || SEGMENT_STYLES.new}`}>{selectedCustomer.segment}</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-surface-800">
              {['profile', 'loyalty', 'orders'].map(t => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`px-4 py-2 text-xs font-bold capitalize transition-all border-b-2 ${detailTab === t ? 'border-brand-500 text-white' : 'border-transparent text-surface-500 hover:text-surface-300'}`}>
                  {t}
                </button>
              ))}
            </div>

            {detailTab === 'profile' && (
              <div className="space-y-3">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-800/50 rounded-xl p-3 text-center">
                    <ShoppingBag className="w-4 h-4 text-brand-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{selectedCustomer._count?.orders || 0}</p>
                    <p className="text-[10px] text-surface-500">Orders</p>
                  </div>
                  <div className="bg-surface-800/50 rounded-xl p-3 text-center">
                    <Star className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-amber-400">{selectedCustomer.loyalty_points?.current_balance || 0}</p>
                    <p className="text-[10px] text-surface-500">Loyalty Pts</p>
                  </div>
                  <div className="bg-surface-800/50 rounded-xl p-3 text-center">
                    <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-white">₹{Number(selectedCustomer.total_spend || 0).toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-surface-500">Lifetime</p>
                  </div>
                </div>

                {/* Profile fields */}
                <div className="bg-surface-800/30 rounded-xl p-4 space-y-2 text-sm">
                  {selectedCustomer.email && <div className="flex justify-between"><span className="text-surface-400">Email</span><span className="text-white">{selectedCustomer.email}</span></div>}
                  {selectedCustomer.gender && <div className="flex justify-between"><span className="text-surface-400">Gender</span><span className="text-white capitalize">{selectedCustomer.gender}</span></div>}
                  {selectedCustomer.date_of_birth && (
                    <div className="flex justify-between">
                      <span className="text-surface-400">Birthday</span>
                      <span className="text-white flex items-center gap-1">
                        {new Date(selectedCustomer.date_of_birth).toLocaleDateString('en-IN', { day: '2-digit', month: 'long' })}
                        {daysUntilBirthday(selectedCustomer.date_of_birth) !== null && <Cake className="w-3.5 h-3.5 text-pink-400" />}
                      </span>
                    </div>
                  )}
                  {selectedCustomer.anniversary && <div className="flex justify-between"><span className="text-surface-400">Anniversary</span><span className="text-white">{new Date(selectedCustomer.anniversary).toLocaleDateString('en-IN', { day: '2-digit', month: 'long' })}</span></div>}
                  {selectedCustomer.dietary_preference && <div className="flex justify-between"><span className="text-surface-400">Diet</span><span className="text-white capitalize">{selectedCustomer.dietary_preference}</span></div>}
                  {selectedCustomer.last_visit_at && <div className="flex justify-between"><span className="text-surface-400">Last Visit</span><span className="text-white">{new Date(selectedCustomer.last_visit_at).toLocaleDateString('en-IN')}</span></div>}
                  {selectedCustomer.notes && <div className="flex justify-between"><span className="text-surface-400">Notes</span><span className="text-white text-xs">{selectedCustomer.notes}</span></div>}
                </div>

                <button onClick={() => { setIsDetailOpen(false); openEdit(selectedCustomer); }} className="btn-surface w-full text-sm">Edit Profile</button>
              </div>
            )}

            {detailTab === 'loyalty' && (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                <div className="flex justify-between items-center bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-xs text-surface-400">Current Balance</p>
                    <p className="text-2xl font-black text-amber-400">{selectedCustomer.loyalty_points?.current_balance || 0} pts</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-surface-400">Lifetime Earned</p>
                    <p className="text-sm font-bold text-white">{selectedCustomer.loyalty_points?.total_earned || 0}</p>
                  </div>
                </div>
                {(customerDetail?.loyalty_transactions || []).map(tx => (
                  <div key={tx.id} className="flex justify-between items-center bg-surface-800/30 rounded-xl px-4 py-2">
                    <div>
                      <p className="text-xs font-bold text-white capitalize">{tx.type}</p>
                      <p className="text-[10px] text-surface-500">{new Date(tx.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                    <p className={`text-sm font-black ${tx.points > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tx.points > 0 ? '+' : ''}{tx.points} pts
                    </p>
                  </div>
                ))}
                {(customerDetail?.loyalty_transactions || []).length === 0 && (
                  <p className="text-center py-8 text-surface-500 text-sm">No loyalty transactions yet</p>
                )}
              </div>
            )}

            {detailTab === 'orders' && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {(customerDetail?.orders || []).map(o => (
                  <div key={o.id} className="flex justify-between items-center bg-surface-800/30 rounded-xl px-4 py-2">
                    <div>
                      <p className="text-xs font-bold text-white">#ORD-{String(o.order_number).padStart(5,'0')}</p>
                      <p className="text-[10px] text-surface-500">{new Date(o.created_at).toLocaleDateString('en-IN')}</p>
                    </div>
                    <p className="text-sm font-bold text-white">₹{Number(o.grand_total || 0).toLocaleString('en-IN')}</p>
                  </div>
                ))}
                {(customerDetail?.orders || []).length === 0 && (
                  <p className="text-center py-8 text-surface-500 text-sm">No orders yet</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ══ MODAL: Marketing Campaign ══ */}
      <Modal isOpen={isCampaignOpen} onClose={() => setCampaignOpen(false)} title="Marketing Campaign" size="lg">
        <div className="mt-4 space-y-5">
          {/* Past campaigns */}
          {campaigns.length > 0 && (
            <div className="bg-surface-800/40 rounded-xl p-4">
              <p className="text-xs font-bold text-surface-400 uppercase tracking-widest mb-3">Recent Campaigns</p>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {campaigns.slice(0, 5).map(c => (
                  <div key={c.id} className="flex justify-between items-center text-sm">
                    <span className="text-white font-medium">{c.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-surface-400 text-xs">{c.type} · {c.target_segment}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.status === 'sent' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-700 text-surface-400'}`}>{c.status || 'draft'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New campaign form */}
          <div className="border border-surface-700 rounded-xl p-4 space-y-4">
            <p className="text-sm font-bold text-white">New Campaign</p>
            <div>
              <label className="label">Campaign Name *</label>
              <input className="input w-full" required placeholder="e.g. Weekend Special Offer" value={campaignData.name} onChange={e => setCampaignData(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Channel</label>
                <select className="input w-full" value={campaignData.type} onChange={e => setCampaignData(d => ({ ...d, type: e.target.value }))}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="push">Push Notification</option>
                </select>
              </div>
              <div>
                <label className="label">Target Segment</label>
                <select className="input w-full" value={campaignData.target_segment} onChange={e => setCampaignData(d => ({ ...d, target_segment: e.target.value }))}>
                  <option value="all">All Customers ({customers.length})</option>
                  <option value="new">New Customers</option>
                  <option value="regular">Regulars</option>
                  <option value="vip">VIPs Only</option>
                  <option value="lapsed">Lapsed (Re-engage)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Message *</label>
              <textarea className="input w-full min-h-[90px] resize-none text-sm" required placeholder="Hi {name}! We have a special offer waiting for you…" value={campaignData.message} onChange={e => setCampaignData(d => ({ ...d, message: e.target.value }))} />
              <p className="text-[10px] text-surface-500 mt-1">{campaignData.message.length}/160 chars · Use {'{name}'} for personalisation</p>
            </div>
            <button
              onClick={() => { if (!campaignData.name || !campaignData.message) return toast.error('Fill in name and message'); campaignMut.mutate(campaignData); }}
              disabled={campaignMut.isPending}
              className="btn-primary w-full py-3 gap-2"
            >
              {campaignMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {campaignMut.isPending ? 'Sending…' : 'Launch Campaign'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMut.mutate(selectedCustomer?.id)}
        title="Delete Customer"
        message={`Delete "${selectedCustomer?.full_name || selectedCustomer?.phone}"? This cannot be undone.`}
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}

// ── Reusable customer form ──────────────────────────────────────
function CustomerForm({ formData, setFormData, onSubmit, loading, onCancel, submitLabel }) {
  const set = (key) => e => setFormData(f => ({ ...f, [key]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    const data = { ...formData };
    if (!data.date_of_birth) delete data.date_of_birth;
    if (!data.anniversary)   delete data.anniversary;
    Object.keys(data).forEach(k => data[k] === '' && delete data[k]);
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input w-full" placeholder="Rahul Sharma" value={formData.full_name} onChange={set('full_name')} />
        </div>
        <div>
          <label className="label">Phone *</label>
          <input required className="input w-full" type="tel" placeholder="9876543210" value={formData.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input w-full" type="email" placeholder="rahul@email.com" value={formData.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label">Gender</label>
          <select className="input w-full" value={formData.gender} onChange={set('gender')}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label flex items-center gap-1"><Cake className="w-3 h-3 text-pink-400" /> Date of Birth</label>
          <input className="input w-full" type="date" value={formData.date_of_birth} onChange={set('date_of_birth')} />
          <p className="text-[10px] text-surface-500 mt-0.5">Used for birthday reminders & campaigns</p>
        </div>
        <div>
          <label className="label flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" /> Anniversary</label>
          <input className="input w-full" type="date" value={formData.anniversary} onChange={set('anniversary')} />
        </div>
        <div>
          <label className="label">Diet Preference</label>
          <select className="input w-full" value={formData.dietary_preference} onChange={set('dietary_preference')}>
            <option value="">—</option>
            <option value="veg">Vegetarian</option>
            <option value="non_veg">Non-Veg</option>
            <option value="vegan">Vegan</option>
            <option value="jain">Jain</option>
            <option value="keto">Keto</option>
          </select>
        </div>
        <div>
          <label className="label">Loyalty — auto-enrolled ✓</label>
          <div className="input bg-emerald-500/5 border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 h-10">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Enrolled on save
          </div>
        </div>
      </div>
      <div>
        <label className="label">Notes / Preferences</label>
        <textarea className="input w-full h-16 text-sm py-2 resize-none" placeholder="Allergies, preferences, special notes…" value={formData.notes} onChange={set('notes')} />
      </div>
      <div className="flex gap-3 pt-2 border-t border-surface-700/50">
        <button type="button" onClick={onCancel} className="btn-surface flex-1">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
