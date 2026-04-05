import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { Search, Phone, Crown, UserCheck, UserX, Plus, Gift, Trash2, Loader, Eye, ShoppingBag, Calendar, User, Send } from 'lucide-react';

const SEGMENT_STYLES = {
  new: { badge: 'badge-info' },
  regular: { badge: 'badge-success' },
  vip: { badge: 'bg-purple-600/20 text-purple-400 badge' },
  lapsed: { badge: 'badge-danger' },
};

export default function CustomersPage() {
  const { user } = useSelector(s => s.auth);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState('profile'); // profile | loyalty
  const [formData, setFormData] = useState({ full_name: '', phone: '', email: '', gender: '', dietary_preference: '', notes: '' });
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);
  const [campaignData, setCampaignData] = useState({ name: '', type: 'sms', target_segment: 'all', message: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get(`/customers?limit=50${search ? `&search=${search}` : ''}`).then(r => r.data),
  });

  const { data: customerDetail } = useQuery({
    queryKey: ['customerDetail', selectedCustomer?.id],
    queryFn: () => api.get(`/customers/${selectedCustomer.id}`).then(r => r.data),
    enabled: !!selectedCustomer?.id && isDetailOpen,
  });

  const addMutation = useMutation({
    mutationFn: (d) => api.post('/customers', d),
    onSuccess: () => {
      toast.success('Customer added!');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsAddOpen(false);
      setFormData({ full_name: '', phone: '', email: '', gender: '', dietary_preference: '', notes: '' });
    },
    onError: (e) => toast.error(e.message || 'Failed to add customer'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      toast.success('Customer deleted');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsDeleteOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to delete customer'),
  });

  const customers = data?.items || data || [];

  return (
    <div className="space-y-4 animate-fade-in relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Customers Management</h1>
        <div className="flex gap-2">
           <button onClick={() => setIsCampaignOpen(true)} className="btn-surface font-bold gap-2">
             <Gift className="w-4 h-4 text-brand-400" /> Marketing Campaign
           </button>
           <button onClick={() => setIsAddOpen(true)} className="btn-primary" id="btn-add-customer">
             <Plus className="w-4 h-4" /> Add Customer
           </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
        <input className="input pl-10" placeholder="Search by name, phone, email..." value={search} onChange={e => setSearch(e.target.value)} id="customer-search" />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-surface-500 uppercase border-b border-surface-700/50">
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Segment</th>
              <th className="px-4 py-3 text-left">Orders</th>
              <th className="px-4 py-3 text-left">Loyalty</th>
              <th className="px-4 py-3 text-left">Last Visit</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700/50">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse"><td colSpan={7} className="px-4 py-4"><div className="h-4 bg-surface-700 rounded w-full" /></td></tr>
              ))
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-surface-500">No customers found</td></tr>
            ) : (
              customers.map(c => {
                const seg = SEGMENT_STYLES[c.segment] || SEGMENT_STYLES.new;
                return (
                  <tr key={c.id} className="hover:bg-surface-800/50 group transition-colors cursor-pointer" onClick={() => { setSelectedCustomer(c); setIsDetailOpen(true); }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/30 to-brand-700/30 flex items-center justify-center text-brand-400 font-semibold text-sm">
                          {c.full_name?.charAt(0)?.toUpperCase() || '#'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{c.full_name || 'Unknown'}</p>
                          <p className="text-xs text-surface-500">{c.email || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-surface-300"><Phone className="w-3 h-3" /> {c.phone}</div>
                    </td>
                    <td className="px-4 py-3"><span className={seg.badge}>{c.segment || 'new'}</span></td>
                    <td className="px-4 py-3 text-sm text-surface-300">{c._count?.orders || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Gift className="w-3 h-3 text-warning-400" />
                        <span className="text-sm font-medium text-warning-400">{c.loyalty_points?.current_balance || 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-surface-500">{c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('en-IN') : 'Never'}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setSelectedCustomer(c); setIsDetailOpen(true); }}
                          className="p-1.5 text-surface-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors" title="View Details">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setSelectedCustomer(c); setIsDeleteOpen(true); }}
                          className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Customer Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Customer" size="md">
        <form onSubmit={e => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Full Name</label>
            <input type="text" className="input w-full" placeholder="e.g. John Doe" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Phone Number *</label>
            <input required type="tel" className="input w-full" placeholder="e.g. 9876543210" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Email <span className="text-surface-500 font-normal">(Optional)</span></label>
            <input type="email" className="input w-full" placeholder="e.g. john@example.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">Gender</label>
              <select className="input w-full" value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })}>
                <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-300 mb-1">Diet Preference</label>
              <select className="input w-full" value={formData.dietary_preference} onChange={e => setFormData({ ...formData, dietary_preference: e.target.value })}>
                <option value="">—</option><option value="veg">Vegetarian</option><option value="non_veg">Non-Veg</option><option value="vegan">Vegan</option><option value="jain">Jain</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1">Notes</label>
            <textarea className="input w-full min-h-[60px] resize-none" placeholder="Any special notes..." value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
          </div>
          <div className="pt-4 border-t border-surface-700/50 flex gap-3">
            <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={addMutation.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {addMutation.isPending && <Loader className="w-4 h-4 animate-spin" />}
              {addMutation.isPending ? 'Saving...' : 'Add Customer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Customer Profile" size="md">
        {selectedCustomer && (
          <div className="space-y-5">
            {/* Profile Header */}
            <div className="flex items-center gap-4">
              <span className={(SEGMENT_STYLES[selectedCustomer.segment] || SEGMENT_STYLES.new).badge}>
                {selectedCustomer.segment || 'new'}
              </span>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-surface-800">
               <button onClick={() => setActiveDetailTab('profile')} className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${activeDetailTab === 'profile' ? 'border-brand-500 text-white' : 'border-transparent text-surface-500'}`}>Profile</button>
               <button onClick={() => setActiveDetailTab('loyalty')} className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${activeDetailTab === 'loyalty' ? 'border-brand-500 text-white' : 'border-transparent text-surface-500'}`}>Loyalty History</button>
            </div>

            {activeDetailTab === 'profile' ? (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                   {/* ... stats code ... */}
                </div>
              </>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                 {customerDetail?.loyalty_transactions?.length === 0 ? (
                    <p className="text-center py-10 text-surface-500">No transactions yet</p>
                 ) : (
                    customerDetail?.loyalty_transactions?.map(tx => (
                       <div key={tx.id} className="flex justify-between items-center bg-surface-800/40 p-3 rounded-xl border border-surface-800">
                          <div>
                             <p className="text-xs font-bold text-white capitalize">{tx.type} Point</p>
                             <p className="text-[10px] text-surface-500">{new Date(tx.created_at).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                             <p className={`text-sm font-black ${tx.points > 0 ? 'text-success-400' : 'text-red-400'}`}>{tx.points > 0 ? '+' : ''}{tx.points}</p>
                             <p className="text-[10px] text-surface-600">Balance: {tx.balance_after}</p>
                          </div>
                       </div>
                    ))
                 )}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-700/30 rounded-xl p-3 text-center">
                <ShoppingBag className="w-4 h-4 text-brand-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{selectedCustomer._count?.orders || customerDetail?.total_orders || 0}</p>
                <p className="text-[10px] text-surface-500">Orders</p>
              </div>
              <div className="bg-surface-700/30 rounded-xl p-3 text-center">
                <Gift className="w-4 h-4 text-warning-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-warning-400">{selectedCustomer.loyalty_points?.current_balance || customerDetail?.loyalty_points?.current_balance || 0}</p>
                <p className="text-[10px] text-surface-500">Loyalty Pts</p>
              </div>
              <div className="bg-surface-700/30 rounded-xl p-3 text-center">
                <Calendar className="w-4 h-4 text-info-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-white mt-0.5">{selectedCustomer.last_visit_at ? new Date(selectedCustomer.last_visit_at).toLocaleDateString('en-IN') : 'Never'}</p>
                <p className="text-[10px] text-surface-500">Last Visit</p>
              </div>
            </div>

            {/* Extra Details */}
            {(customerDetail?.gender || customerDetail?.dietary_preference || customerDetail?.notes) && (
              <div className="bg-surface-700/30 rounded-xl p-3 space-y-2">
                {customerDetail.gender && <p className="text-xs text-surface-400">Gender: <span className="text-white capitalize">{customerDetail.gender}</span></p>}
                {customerDetail.dietary_preference && <p className="text-xs text-surface-400">Diet: <span className="text-white capitalize">{customerDetail.dietary_preference}</span></p>}
                {customerDetail.notes && <p className="text-xs text-surface-400">Notes: <span className="text-white">{customerDetail.notes}</span></p>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Campaign Modal */}
      <Modal isOpen={isCampaignOpen} onClose={() => setIsCampaignOpen(false)} title="New Marketing Campaign" size="md">
         <form onSubmit={e => {
            e.preventDefault();
            api.post(`/customers/campaigns?outlet_id=${user?.outlet_id}`, campaignData)
               .then(() => {
                  toast.success('Campaign sent!');
                  setIsCampaignOpen(false);
               });
         }} className="space-y-4">
            <div>
               <label className="block text-sm font-medium text-surface-300 mb-1">Campaign Name</label>
               <input type="text" className="input w-full" placeholder="e.g. Weekend Special" value={campaignData.name} onChange={e => setCampaignData({...campaignData, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1">Channel</label>
                  <select className="input w-full" value={campaignData.type} onChange={e => setCampaignData({...campaignData, type: e.target.value})}>
                     <option value="sms">SMS</option>
                     <option value="email">Email</option>
                     <option value="whatsapp">WhatsApp</option>
                  </select>
               </div>
               <div>
                  <label className="block text-sm font-medium text-surface-300 mb-1">Target Segment</label>
                  <select className="input w-full" value={campaignData.target_segment} onChange={e => setCampaignData({...campaignData, target_segment: e.target.value})}>
                     <option value="all">All Customers</option>
                     <option value="regular">Regulars</option>
                     <option value="vip">VIPs Only</option>
                     <option value="lapsed">Lapsed Customers</option>
                  </select>
               </div>
            </div>
            <div>
               <label className="block text-sm font-medium text-surface-300 mb-1">Message Content</label>
               <textarea className="input w-full min-h-[100px] resize-none" placeholder="Enter message here..." value={campaignData.message} onChange={e => setCampaignData({...campaignData, message: e.target.value})} />
               <p className="text-[10px] text-surface-500 mt-1 uppercase font-black tracking-widest">Est. Cost: ₹{(customers.length * 0.15).toFixed(2)}</p>
            </div>
            <button type="submit" className="btn-primary w-full py-3 gap-2">
               <Send className="w-4 h-4" /> Send Broadcast
            </button>
         </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate(selectedCustomer?.id)}
        title="Delete Customer"
        message={`Delete "${selectedCustomer?.full_name || selectedCustomer?.phone}"? This action cannot be undone.`}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
