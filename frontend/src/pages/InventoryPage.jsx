import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { 
  Package, Search, Plus, Filter, AlertTriangle, 
  ArrowDownCircle, ArrowUpCircle, History, Trash2, Edit2, 
  ChevronDown, X, Info, Scale, ShoppingCart, Truck, BarChart2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function InventoryPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();

  // Tabs
  const [activeTab, setActiveTab] = useState('stock'); // stock | materials | po | wasteland
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | low | out

  // Modals
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [selectedItemForAction, setSelectedItemForAction] = useState(null);
  const [adjustmentType, setAdjustmentType] = useState('add'); // add | reduce

  // Queries
  const { data: stockData, isLoading: loadingStock } = useQuery({
    queryKey: ['inventory', 'stock', outletId, search, filter],
    queryFn: () => api.get(`/inventory/stock?outlet_id=${outletId}&search=${search}${filter!=='all' ? '&low_stock=true' : ''}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: lowStockItems } = useQuery({
    queryKey: ['inventory', 'low-stock', outletId],
    queryFn: () => api.get(`/inventory/low-stock?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
    refetchInterval: 30000
  });

  const { data: itemsData, isLoading: loadingItems } = useQuery({
    queryKey: ['inventory', 'items', outletId, search],
    queryFn: () => api.get(`/inventory/items?outlet_id=${outletId}&search=${search}`).then(r => r.data),
    enabled: !!outletId && (activeTab === 'materials' || activeTab === 'po')
  });

  const { data: wastageLogs } = useQuery({
    queryKey: ['inventory', 'wastage-logs', outletId],
    queryFn: () => api.get(`/inventory/wastage?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && activeTab === 'wasteland'
  });

  const { data: poData } = useQuery({
    queryKey: ['inventory', 'purchase-orders', outletId],
    queryFn: () => api.get(`/purchase-orders?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && activeTab === 'po'
  });

  const { data: consumptionData } = useQuery({
    queryKey: ['inventory', 'consumption', outletId],
    queryFn: () => api.get(`/inventory/consumption-report?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && activeTab === 'stock'
  });

  const { data: suppliers } = useQuery({
    queryKey: ['inventory', 'suppliers', outletId],
    queryFn: () => api.get(`/suppliers?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && isPOModalOpen
  });

  // Mutations
  const createItemMutation = useMutation({
    mutationFn: (data) => api.post('/inventory/items', data),
    onSuccess: () => {
      toast.success('Inventory item created');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsItemModalOpen(false);
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({id, data}) => api.patch(`/inventory/items/${id}`, data),
    onSuccess: () => {
      toast.success('Inventory item updated');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsItemModalOpen(false);
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id) => api.delete(`/inventory/items/${id}`),
    onSuccess: () => {
      toast.success('Inventory item deleted');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    }
  });

  const adjustStockMutation = useMutation({
    mutationFn: (data) => api.post('/inventory/adjust', { ...data, outlet_id: outletId }),
    onSuccess: () => {
      toast.success('Stock adjusted successfully');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsAdjustModalOpen(false);
    }
  });

  const recordWastageMutation = useMutation({
    mutationFn: (data) => api.post('/inventory/wastage', { ...data, outlet_id: outletId }),
    onSuccess: () => {
      toast.success('Wastage recorded');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsWastageModalOpen(false);
    }
  });

  // Render Helpers
  const items = stockData?.items || [];
  const rawMaterials = itemsData?.items || [];

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white px-2">Inventory Management</h1>
          <p className="text-surface-500 text-sm px-2">Monitor stock levels, manage raw materials & log wastage</p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setIsPOModalOpen(true)} className="btn-surface font-bold gap-2">
                <Truck className="w-4 h-4"/> Create PO
            </button>
            <button onClick={() => { setEditingItem(null); setIsItemModalOpen(true); }} className="btn-brand font-bold gap-2">
                <Plus className="w-4 h-4"/> New Material
            </button>
            <button onClick={() => setIsWastageModalOpen(true)} className="btn-secondary text-red-400 font-bold gap-2 bg-red-400/5 hover:bg-red-400/10 border-red-400/20">
                <AlertTriangle className="w-4 h-4"/> Record Wastage
            </button>
        </div>
      </div>

      {/* Low Stock Banner */}
      {lowStockItems?.length > 0 && activeTab === 'stock' && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-3xl flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 animate-pulse">
                 <AlertTriangle className="w-5 h-5"/>
              </div>
              <div>
                 <p className="text-white font-bold text-sm">⚠️ {lowStockItems.length} items are running low</p>
                 <p className="text-surface-500 text-xs">Consider restocking to avoid kitchen disruptions</p>
              </div>
           </div>
           <button onClick={() => setFilter('low')} className="text-red-400 text-xs font-black uppercase tracking-widest hover:underline">View All</button>
        </div>
      )}

      {/* Tabs & Search */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between bg-surface-900 p-2 rounded-2xl border border-surface-800">
          <div className="flex bg-surface-950 p-1 rounded-xl shadow-inner overflow-x-auto gap-1">
             {[
               { id: 'stock', label: 'Dashboard', icon: Package },
               { id: 'materials', label: 'Raw Materials', icon: Scale },
               { id: 'po', label: 'Purchase Orders', icon: ShoppingCart },
               { id: 'wasteland', label: 'History & Logs', icon: History }
             ].map((t) => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                   className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === t.id ? 'bg-surface-800 text-white shadow-lg' : 'text-surface-500 hover:text-surface-300'}`}>
                   <t.icon className={`w-4 h-4 ${activeTab === t.id ? 'text-brand-400' : ''}`}/> {t.label}
                </button>
             ))}
          </div>

          <div className="flex items-center gap-2">
             <div className="relative flex-1 min-w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input className="input pl-10 h-10 text-sm" placeholder="Search items..." value={search} onChange={e=>setSearch(e.target.value)} />
             </div>
             {activeTab === 'stock' && (
                <select className="input h-10 py-1 text-sm font-bold border-surface-800" value={filter} onChange={e=>setFilter(e.target.value)}>
                   <option value="all">All Items</option>
                   <option value="low">Low Stock</option>
                   <option value="out">Out of Stock</option>
                </select>
             )}
          </div>
      </div>

      {/* Content Area */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             {loadingStock ? (
               [...Array(8)].map((_, i) => <div key={i} className="h-44 bg-surface-900 rounded-3xl animate-pulse border border-surface-800"/>)
             ) : items.map(item => (
                <div key={item.id} className="group bg-surface-900 border border-surface-800 rounded-3xl p-5 hover:border-brand-500/50 transition-all relative overflow-hidden flex flex-col">
                   <div className="flex justify-between items-start mb-4">
                      <div className="p-3 bg-surface-950 rounded-2xl border border-surface-800 group-hover:bg-brand-500/10 transition-colors">
                         <Package className="w-5 h-5 text-brand-400"/>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                         item.stock_status === 'OUT' ? 'bg-red-500 text-white animate-pulse' :
                         item.stock_status === 'CRITICAL' ? 'bg-orange-500 text-white' :
                         item.stock_status === 'LOW' ? 'bg-yellow-500 text-black' : 'bg-success-500/10 text-success-400'
                      }`}>
                         {item.stock_status}
                      </div>
                   </div>
                   
                   <h3 className="font-bold text-white text-lg group-hover:text-brand-400 transition-colors truncate">{item.name}</h3>
                   <p className="text-xs text-surface-500 uppercase font-black tracking-widest mt-1 mb-4">{item.category || 'General'}</p>
                   
                   <div className="mt-auto flex items-end justify-between">
                      <div>
                         <p className="text-[10px] text-surface-500 font-bold uppercase mb-0.5">Current Stock</p>
                         <p className="text-2xl font-black text-white">
                            {item.current_stock} <span className="text-xs text-surface-400 font-medium">/ {item.unit}</span>
                         </p>
                      </div>
                      <button onClick={() => { setSelectedItemForAction(item); setIsAdjustModalOpen(true); }} className="w-10 h-10 bg-surface-800 hover:bg-brand-500 hover:text-white rounded-xl flex items-center justify-center text-surface-400 transition-all shadow-md">
                         <Plus className="w-5 h-5"/>
                      </button>
                   </div>

                   {/* Progress bar to threshold */}
                   <div className="absolute bottom-0 left-0 h-1 bg-surface-800 w-full overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${item.stock_status==='OK' ? 'bg-success-500' : 'bg-red-500'}`} 
                         style={{ width: `${Math.min(100, (item.current_stock / (item.min_threshold * 2 || 10)) * 100)}%` }}></div>
                   </div>
                </div>
             ))}
             {items.length === 0 && !loadingStock && (
               <div className="col-span-full py-20 flex flex-col items-center justify-center text-surface-600 bg-surface-900/50 rounded-3xl border border-dashed border-surface-800">
                   <Package className="w-12 h-12 mb-4 opacity-20"/>
                   <p className="font-bold">No inventory items found.</p>
                   <p className="text-sm">Try searching for something else or add a new material.</p>
               </div>
             )}
          </div>
          
          <div className="bg-surface-900 border border-surface-800 rounded-3xl p-6">
              <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                 <BarChart2 className="w-5 h-5 text-brand-400"/> Top Ingredients Consumed (Weekly)
              </h3>
              <div className="h-64 w-full">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={consumptionData || []} layout="vertical" margin={{ left: 20 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                       <XAxis type="number" hide />
                       <YAxis dataKey="name" type="category" stroke="#737373" fontSize={11} width={80} />
                       <Tooltip 
                          contentStyle={{ backgroundColor: '#171717', border: '1px solid #404040', borderRadius: '12px' }}
                          cursor={{ fill: '#262626' }}
                       />
                       <Bar dataKey="quantity" radius={[0, 4, 4, 0]} barSize={20}>
                          {(consumptionData || []).map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                          ))}
                       </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>
          </div>
        </div>
      )}

      {activeTab === 'materials' && (
         <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-surface-950/50 text-surface-500 text-[11px] font-black uppercase tracking-[0.1em] border-b border-surface-800">
                     <tr>
                        <th className="p-5">Material Name</th>
                        <th className="p-5">Category</th>
                        <th className="p-5">Unit</th>
                        <th className="p-5">Base Cost (₹)</th>
                        <th className="p-5">Min Threshold</th>
                        <th className="p-5 text-right">Actions</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/40">
                     {loadingItems ? (
                        [...Array(5)].map((_, i) => <tr key={i} className="animate-pulse"><td colSpan="6" className="p-8 bg-surface-900/30"></td></tr>)
                     ) : rawMaterials.map(rm => (
                        <tr key={rm.id} className="hover:bg-surface-800/30 transition-colors group">
                           <td className="p-5">
                              <div className="font-bold text-white group-hover:text-brand-400 transition-colors">{rm.name}</div>
                              <div className="text-[10px] text-surface-500 font-mono">{rm.sku || rm.id.split('-')[0]}</div>
                           </td>
                           <td className="p-5"><span className="px-2 py-0.5 rounded bg-surface-800 text-[10px] font-bold uppercase text-surface-400">{rm.category}</span></td>
                           <td className="p-5 text-surface-300 font-medium">{rm.unit}</td>
                           <td className="p-5 text-white font-black">₹{rm.cost_per_unit}</td>
                           <td className="p-5 text-surface-300">{rm.min_threshold} {rm.unit}</td>
                           <td className="p-5">
                              <div className="flex justify-end gap-1">
                                 <button onClick={() => { setEditingItem(rm); setIsItemModalOpen(true); }} className="p-2 text-surface-500 hover:text-white hover:rounded-lg transition-all"><Edit2 className="w-4 h-4"/></button>
                                 <button onClick={() => { if(confirm('Delete this material?')) deleteItemMutation.mutate(rm.id); }} className="p-2 text-surface-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><Trash2 className="w-4 h-4"/></button>
                              </div>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      )}

      {activeTab === 'po' && (
         <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-surface-950/50 text-surface-500 text-[11px] font-black uppercase tracking-[0.1em] border-b border-surface-800">
                     <tr>
                        <th className="p-5">PO Number</th>
                        <th className="p-5">Supplier</th>
                        <th className="p-5">Items</th>
                        <th className="p-5">Expected</th>
                        <th className="p-5">Status</th>
                        <th className="p-5 text-right">Actions</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/40">
                     {(poData?.items || []).map(po => (
                        <tr key={po.id} className="hover:bg-surface-800/30 transition-colors">
                           <td className="p-5 font-bold text-white uppercase">{po.po_number}</td>
                           <td className="p-5 text-surface-300">{po.supplier?.name}</td>
                           <td className="p-5 text-brand-400 font-bold">{po._count?.po_items} SKU</td>
                           <td className="p-5 text-surface-400 text-xs">{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : 'N/A'}</td>
                           <td className="p-5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                 po.status === 'received' ? 'bg-success-500/10 text-success-400' : 'bg-brand-500/10 text-brand-400'
                              }`}>{po.status}</span>
                           </td>
                           <td className="p-5 text-right">
                              {po.status === 'draft' && <button onClick={() => api.get(`/purchase-orders/${po.id}/receive`).then(() => queryClient.invalidateQueries())} className="btn-brand text-[10px] py-1 px-3">Receive</button>}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      )}

      {activeTab === 'wasteland' && (
         <div className="bg-surface-900 border border-surface-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-surface-800 flex items-center justify-between">
               <h3 className="font-bold text-white flex items-center gap-2"><History className="w-4 h-4 text-brand-400"/> Recent Wastage Logs</h3>
               <button className="text-[10px] font-black text-surface-500 uppercase tracking-widest hover:text-white transition-colors">Export CSV</button>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left font-medium">
                  <thead className="bg-surface-950/50 text-surface-500 text-[10px] font-black uppercase tracking-[0.1em] border-b border-surface-800">
                     <tr>
                        <th className="p-4">Date & Time</th>
                        <th className="p-4">Item</th>
                        <th className="p-4">Quantity</th>
                        <th className="p-4">Staff</th>
                        <th className="p-4">Reason</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-800/40 text-sm">
                     {(wastageLogs || []).map(log => (
                        <tr key={log.id} className="hover:bg-surface-800/30 transition-colors">
                           <td className="p-4 text-surface-400">{new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                           <td className="p-4 text-white font-bold">{log.inventory_item?.name}</td>
                           <td className="p-4 text-red-400 font-mono">-{log.quantity} {log.inventory_item?.unit}</td>
                           <td className="p-4 text-surface-300">{log.user?.full_name || 'System'}</td>
                           <td className="p-4"><span className="px-2 py-0.5 rounded bg-red-500/5 border border-red-500/10 text-[10px] text-red-300">{log.reason}</span></td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      )}

      {/* Item Modal (Add/Edit) */}
      <Modal isOpen={isItemModalOpen} onClose={() => setIsItemModalOpen(false)} title={editingItem ? 'Edit Raw Material' : 'Define New Material'} size="lg">
         <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            data.cost_per_unit = Number(data.cost_per_unit);
            data.min_threshold = Number(data.min_threshold);
            if(editingItem) updateItemMutation.mutate({ id: editingItem.id, data });
            else createItemMutation.mutate({ ...data, outlet_id: outletId });
         }} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div className="col-span-2">
                  <label className="label">Full Name*</label>
                  <input name="name" defaultValue={editingItem?.name} className="input" placeholder="e.g. Tomato Premium, Buffalo Milk" required />
               </div>
               <div>
                  <label className="label">Short Name / SKU</label>
                  <input name="short_name" defaultValue={editingItem?.short_name} className="input font-mono" placeholder="TOMP" />
               </div>
               <div>
                  <label className="label">Category</label>
                  <select name="category" defaultValue={editingItem?.category || 'Vegetables'} className="input">
                     <option>Vegetables</option>
                     <option>Dairy</option>
                     <option>Meat</option>
                     <option>Groceries</option>
                     <option>Beverages</option>
                     <option>Packaging</option>
                  </select>
               </div>
               <div>
                  <label className="label">Unit*</label>
                  <select name="unit" defaultValue={editingItem?.unit || 'kg'} className="input">
                     <option value="kg">Kilograms (kg)</option>
                     <option value="gm">Grams (gm)</option>
                     <option value="ltr">Liters (ltr)</option>
                     <option value="ml">Milliliters (ml)</option>
                     <option value="pcs">Pieces (pcs)</option>
                     <option value="pkt">Packets (pkt)</option>
                     <option value="box">Boxes (box)</option>
                  </select>
               </div>
               <div>
                  <label className="label">Base Cost Price (₹)*</label>
                  <input name="cost_per_unit" type="number" step="0.01" defaultValue={editingItem?.cost_per_unit} className="input" placeholder="0.00" required />
               </div>
               <div>
                  <label className="label">Min Threshold Alert*</label>
                  <input name="min_threshold" type="number" step="0.1" defaultValue={editingItem?.min_threshold} className="input" placeholder="Alert below this" required />
               </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-surface-800">
               <button type="button" onClick={() => setIsItemModalOpen(false)} className="btn-surface">Cancel</button>
               <button type="submit" disabled={createItemMutation.isPending || updateItemMutation.isPending} className="btn-brand px-10">
                  {createItemMutation.isPending || updateItemMutation.isPending ? 'Saving...' : 'Save Product'}
               </button>
            </div>
         </form>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal isOpen={isAdjustModalOpen} onClose={() => setIsAdjustModalOpen(false)} title="Quick Adjust Stock" size="sm">
         <div className="p-2">
            <div className="flex items-center gap-4 mb-6 bg-surface-950 p-4 rounded-2xl border border-surface-800 shadow-inner">
                <div className="w-12 h-12 bg-brand-500/10 rounded-xl flex items-center justify-center text-brand-400">
                   <Package className="w-6 h-6"/>
                </div>
                <div>
                   <h4 className="font-black text-white">{selectedItemForAction?.name}</h4>
                   <p className="text-xs text-surface-500">Current: {selectedItemForAction?.current_stock} {selectedItemForAction?.unit}</p>
                </div>
            </div>
            <form onSubmit={e => {
               e.preventDefault();
               const formData = new FormData(e.target);
               const qty = Number(formData.get('quantity'));
               adjustStockMutation.mutate({ 
                  item_id: selectedItemForAction.id, 
                  quantity: adjustmentType === 'add' ? qty : -qty,
                  reason: formData.get('reason')
               });
            }} className="space-y-4">
               <div className="flex bg-surface-950 p-1 rounded-xl mb-4">
                  <button type="button" onClick={()=>setAdjustmentType('add')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${adjustmentType==='add' ? 'bg-success-500 text-white shadow-lg' : 'text-surface-500'}`}>+ Stock Add</button>
                  <button type="button" onClick={()=>setAdjustmentType('reduce')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${adjustmentType==='reduce' ? 'bg-red-500 text-white shadow-lg' : 'text-surface-500'}`}>- Stock Deduct</button>
               </div>
               <div>
                  <label className="label">Adjust Quantity</label>
                  <div className="relative">
                     <input name="quantity" type="number" step="0.1" className="input text-center text-xl font-black py-4" placeholder="0.0" required />
                     <div className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-600 font-bold uppercase text-xs">{selectedItemForAction?.unit}</div>
                  </div>
               </div>
               <div>
                  <label className="label">Reason for Change</label>
                  <select name="reason" className="input">
                     <option>Manual Receipt</option>
                     <option>Stock Audit Correction</option>
                     <option>Opening Stock</option>
                     <option>Damaged Goods</option>
                     <option>Return to Vendor</option>
                  </select>
               </div>
               <button type="submit" className="btn-brand w-full py-4 text-lg font-black mt-2">Apply Adjustment</button>
            </form>
         </div>
      </Modal>

      {/* Wastage Modal */}
      <Modal isOpen={isWastageModalOpen} onClose={() => setIsWastageModalOpen(false)} title="Record Material Wastage" size="md">
         <form onSubmit={e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            recordWastageMutation.mutate({ 
               items: [{
                  item_id: formData.get('item_id'),
                  quantity: Number(formData.get('quantity')),
                  reason: formData.get('reason')
               }]
            });
         }} className="space-y-5">
            <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl mb-2">
                <p className="text-xs text-red-400 font-bold flex items-center gap-2 uppercase tracking-widest"><AlertTriangle className="w-3 h-3"/> Warning</p>
                <p className="text-surface-400 text-xs mt-1">Recording wastage will deduct stock permanently and log it in the daily wastage report for auditing.</p>
            </div>
            <div>
               <label className="label">Select Wasted Item*</label>
               <select name="item_id" className="input" required>
                  <option value="">Choose item...</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit} available)</option>)}
               </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="label">Wasted Quantity*</label>
                  <input name="quantity" type="number" step="0.1" className="input" required placeholder="0.0"/>
               </div>
               <div>
                  <label className="label">Unit</label>
                  <input className="input opacity-50" readOnly placeholder="Matches item unit"/>
               </div>
            </div>
            <div>
               <label className="label">Reason / Remark*</label>
               <input name="reason" className="input" placeholder="e.g. Expired, Spilled, Poor Quality" required />
            </div>
            <div className="flex justify-end gap-3 pt-4">
               <button type="button" onClick={()=>setIsWastageModalOpen(false)} className="btn-surface">Discard</button>
               <button type="submit" className="btn-brand bg-red-600 hover:bg-red-500 border-red-600">Log Wastage</button>
            </div>
         </form>
      </Modal>

      {/* Create PO Modal */}
      <Modal isOpen={isPOModalOpen} onClose={() => setIsPOModalOpen(false)} title="Create Purchase Order" size="lg">
         <form onSubmit={e => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const items = JSON.parse(formData.get('items_json') || '[]');
            api.post('/purchase-orders', {
               supplier_id: formData.get('supplier_id'),
               notes: formData.get('notes'),
               expected_date: formData.get('expected_date'),
               items: items
            }).then(() => {
               toast.success('PO Created');
               setIsPOModalOpen(false);
               queryClient.invalidateQueries();
            });
         }} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="label">Supplier*</label>
                  <select name="supplier_id" className="input" required>
                     <option value="">Select supplier...</option>
                     {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name} ({s.contact_person})</option>)}
                  </select>
               </div>
               <div>
                  <label className="label">Expected Delivery</label>
                  <input name="expected_date" type="date" className="input" />
               </div>
            </div>
            
            <div className="bg-surface-950 p-4 rounded-2xl border border-surface-800">
               <p className="text-xs font-black uppercase tracking-widest text-surface-500 mb-3">Order Items (JSON Stub)</p>
               <textarea name="items_json" className="input h-24 font-mono text-xs" placeholder='[{"inventory_item_id": "...", "quantity": 10, "unit_cost": 50}]' />
               <p className="text-[10px] text-surface-600 mt-2 italic">Note: Real item selector would go here in a full UI.</p>
            </div>

            <div>
               <label className="label">Purchase Notes</label>
               <input name="notes" className="input" placeholder="e.g. Urgently needed for weekend rush" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-surface-800">
               <button type="button" onClick={() => setIsPOModalOpen(false)} className="btn-surface">Discard</button>
               <button type="submit" className="btn-brand px-8">Dispatch Order</button>
            </div>
         </form>
      </Modal>

    </div>
  );
}
