import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import {
  Tag, Plus, Trash2, Edit3, Copy, Zap, Clock, CheckCircle2,
  Percent, Gift, ShoppingBag, ToggleLeft, ToggleRight, Search,
  Calendar, Target, Hash
} from 'lucide-react';

const TYPE_CONFIG = {
  percentage: { label: 'Percentage Off', icon: <Percent className="w-4 h-4" />, color: 'text-brand-400 bg-brand-500/20' },
  flat: { label: 'Flat Discount', icon: <Tag className="w-4 h-4" />, color: 'text-emerald-400 bg-emerald-500/20' },
  bogo: { label: 'Buy 1 Get 1', icon: <Gift className="w-4 h-4" />, color: 'text-purple-400 bg-purple-500/20' },
  buy_x_get_y: { label: 'Buy X Get Y', icon: <ShoppingBag className="w-4 h-4" />, color: 'text-orange-400 bg-orange-500/20' },
};

/**
 * M11: Discounts & Promotions Management Page
 */
export default function DiscountsPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id || user?.outlets?.[0]?.id;
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('active');

  const [form, setForm] = useState({
    name: '', code: '', type: 'percentage', value: '', min_order_value: '', max_discount: '',
    start_date: '', end_date: '', auto_apply: false, is_active: true, max_uses: '',
    channels: ['pos', 'online'],
  });

  const { data: discounts, isLoading } = useQuery({
    queryKey: ['discounts', outletId],
    queryFn: () => api.get(`/discounts?outlet_id=${outletId}`).then(r => r.data || r),
    enabled: !!outletId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => editingDiscount
      ? api.put(`/discounts/${editingDiscount.id}`, { ...data, outlet_id: outletId })
      : api.post('/discounts', { ...data, outlet_id: outletId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      toast.success(editingDiscount ? 'Discount updated' : 'Discount created');
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/discounts/${id}?outlet_id=${outletId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      toast.success('Discount removed');
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.put(`/discounts/${id}`, { is_active, outlet_id: outletId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      toast.success('Status updated');
    },
  });

  const resetForm = () => {
    setShowModal(false);
    setEditingDiscount(null);
    setForm({ name: '', code: '', type: 'percentage', value: '', min_order_value: '', max_discount: '', start_date: '', end_date: '', auto_apply: false, is_active: true, max_uses: '', channels: ['pos', 'online'] });
  };

  const openEdit = (d) => {
    setEditingDiscount(d);
    setForm({
      name: d.name, code: d.code || '', type: d.type, value: d.value, min_order_value: d.min_order_value || '',
      max_discount: d.max_discount || '', start_date: d.start_date?.split('T')[0] || '',
      end_date: d.end_date?.split('T')[0] || '', auto_apply: d.auto_apply, is_active: d.is_active,
      max_uses: d.max_uses || '', channels: d.channels || ['pos', 'online'],
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.value) return toast.error('Name and value required');
    createMutation.mutate({
      ...form,
      value: Number(form.value),
      min_order_value: form.min_order_value ? Number(form.min_order_value) : 0,
      max_discount: form.max_discount ? Number(form.max_discount) : null,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
    });
  };

  const filtered = useMemo(() => {
    let list = Array.isArray(discounts) ? discounts : [];
    const now = new Date();
    if (tab === 'active') list = list.filter(d => d.is_active && (!d.end_date || new Date(d.end_date) > now));
    else if (tab === 'expired') list = list.filter(d => d.end_date && new Date(d.end_date) <= now);
    else if (tab === 'inactive') list = list.filter(d => !d.is_active);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.code?.toLowerCase().includes(q));
    }
    return list;
  }, [discounts, tab, search]);

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3"><Tag className="w-7 h-7 text-brand-400" /> Discounts & Promotions</h1>
          <p className="text-sm text-surface-400 mt-1">Manage coupon codes, happy hours, and auto-discounts</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Promotion</button>
      </div>

      {/* Tabs & Search */}
      <div className="flex items-center gap-4">
        <div className="flex bg-surface-800 rounded-xl p-1">
          {['active', 'expired', 'inactive', 'all'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${tab === t ? 'bg-brand-500 text-white' : 'text-surface-400 hover:text-white'}`}>{t}</button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-10 w-full" placeholder="Search promotions..." />
        </div>
      </div>

      {/* Discount Cards */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {isLoading ? (
          <div className="col-span-full text-center py-12 text-surface-500">Loading promotions...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 text-surface-500">
            <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No promotions found</p>
          </div>
        ) : filtered.map((d) => {
          const conf = TYPE_CONFIG[d.type] || TYPE_CONFIG.percentage;
          const isExpired = d.end_date && new Date(d.end_date) < new Date();
          return (
            <div key={d.id} className={`bg-surface-900 rounded-2xl border border-surface-800 p-5 transition-all hover:border-surface-700 ${isExpired ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`p-2 rounded-xl ${conf.color}`}>{conf.icon}</span>
                  <div>
                    <h3 className="text-white font-bold text-sm">{d.name}</h3>
                    <p className="text-xs text-surface-400">{conf.label}</p>
                  </div>
                </div>
                <button onClick={() => toggleMutation.mutate({ id: d.id, is_active: !d.is_active })} className="text-surface-400 hover:text-brand-400 transition-colors">
                  {d.is_active ? <ToggleRight className="w-6 h-6 text-brand-400" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-surface-400">Value</span>
                  <span className="text-lg font-black text-brand-400">
                    {d.type === 'percentage' ? `${d.value}%` : `₹${d.value}`}
                  </span>
                </div>
                {d.code && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-400">Code</span>
                    <span className="font-mono font-bold text-xs bg-surface-800 px-2 py-1 rounded text-brand-400 flex items-center gap-1">
                      <Hash className="w-3 h-3" /> {d.code}
                    </span>
                  </div>
                )}
                {d.min_order_value > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-surface-400">Min Order</span>
                    <span className="text-xs text-surface-300">₹{d.min_order_value}</span>
                  </div>
                )}
                {d.auto_apply && (
                  <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg w-fit">
                    <Zap className="w-3 h-3" /> Auto-applied
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-surface-800">
                <button onClick={() => openEdit(d)} className="flex-1 py-2 rounded-xl bg-surface-800 text-surface-300 text-xs font-bold hover:bg-surface-700 transition-all flex items-center justify-center gap-1"><Edit3 className="w-3 h-3" /> Edit</button>
                <button onClick={() => deleteMutation.mutate(d.id)} className="py-2 px-3 rounded-xl bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={resetForm} title={editingDiscount ? 'Edit Promotion' : 'New Promotion'} size="md">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" placeholder="Happy Hour 20%" />
            </div>
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Coupon Code</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="input w-full font-mono" placeholder="HAPPY20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Type *</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input w-full">
                <option value="percentage">Percentage</option>
                <option value="flat">Flat Amount</option>
                <option value="bogo">BOGO</option>
                <option value="buy_x_get_y">Buy X Get Y</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Value *</label>
              <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="input w-full" placeholder={form.type === 'percentage' ? '20' : '100'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Min Order Value</label>
              <input type="number" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} className="input w-full" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Max Discount</label>
              <input type="number" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} className="input w-full" placeholder="No limit" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">End Date</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="input w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-surface-400 font-bold mb-1 block">Max Uses</label>
              <input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} className="input w-full" placeholder="Unlimited" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.auto_apply} onChange={(e) => setForm({ ...form, auto_apply: e.target.checked })} className="w-4 h-4 rounded border-surface-600" />
                <span className="text-sm text-surface-300 font-medium flex items-center gap-1"><Zap className="w-4 h-4 text-brand-400" /> Auto-apply</span>
              </label>
            </div>
          </div>
          <button onClick={handleSubmit} className="btn-primary w-full py-3 mt-2">{editingDiscount ? 'Update' : 'Create'} Promotion</button>
        </div>
      </Modal>
    </div>
  );
}
