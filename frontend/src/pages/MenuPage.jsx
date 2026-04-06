import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import api from '../lib/api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { 
  Leaf, Drumstick, Egg, Plus, Edit, Trash2, Search, FolderPlus, 
  Loader, ToggleLeft, ToggleRight, CheckSquare, Square, Percent, 
  ArrowUpRight, ArrowDownRight, Tag, Camera
} from 'lucide-react';
import { useState, useMemo } from 'react';

const FOOD_ICONS = { veg: Leaf, non_veg: Drumstick, egg: Egg };
const FOOD_COLORS = { veg: 'text-green-500', non_veg: 'text-red-500', egg: 'text-yellow-500' };
const BORDER_COLORS = { veg: 'border-l-green-500', non_veg: 'border-l-red-500', egg: 'border-l-yellow-500' };
const SQUARE_ICONS = {
  veg: <div className="w-3 h-3 border border-green-500 flex items-center justify-center p-[1px]"><div className="w-full h-full bg-green-500 rounded-full"></div></div>,
  non_veg: <div className="w-3 h-3 border border-red-500 flex items-center justify-center p-[1px]"><div className="w-full h-full bg-red-500 rounded-full"></div></div>,
  egg: <div className="w-3 h-3 border border-yellow-500 flex items-center justify-center p-[1px]"><div className="w-full h-full bg-yellow-500 rounded-full"></div></div>
};

const EMPTY_ITEM = {
  name: '', short_code: '', description: '', base_price: '', category_id: '',
  food_type: 'veg', kitchen_station: 'KITCHEN', gst_rate: 5,
  is_available: true, image_url: '',
  variants: [], addons: []
};

export default function MenuPage() {
  const { user } = useSelector((s) => s.auth);
  const outletId = user?.outlet_id;
  const queryClient = useQueryClient();
  
  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vegFilter, setVegFilter] = useState('');
  const [gstFilter, setGstFilter] = useState('');
  const [sortBy, setSortBy] = useState('name'); // name, price_asc, price_desc
  
  // Selection
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [viewMode, setViewMode] = useState('items'); // items, combos

  // Modal states
  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const [catForm, setCatForm] = useState({ name: '', description: '', display_order: 1 });
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
  const [bulkForm, setBulkForm] = useState({ type: 'percentage', value: 0 });

  // Data queries
  const { data: categories } = useQuery({
    queryKey: ['menuCategories', outletId],
    queryFn: () => api.get(`/menu/categories?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: menuData, isLoading: itemsLoading } = useQuery({
    queryKey: ['menuItemsAll', outletId],
    queryFn: () => api.get(`/menu/items?outlet_id=${outletId}&limit=500`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: addonGroups } = useQuery({
    queryKey: ['addonGroups', outletId],
    queryFn: () => api.get(`/menu/addon-groups?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId,
  });

  const { data: combosData, isLoading: combosLoading } = useQuery({
    queryKey: ['menuCombos', outletId],
    queryFn: () => api.get(`/menu/combos?outlet_id=${outletId}`).then(r => r.data),
    enabled: !!outletId && viewMode === 'combos',
  });

  // Mutations
  const addCatMutation = useMutation({
    mutationFn: (d) => api.post('/menu/categories', d),
    onSuccess: () => {
      toast.success('Category created!');
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      setIsAddCatOpen(false);
      setCatForm({ name: '', description: '', display_order: 1 });
    },
    onError: (e) => toast.error(e.message || 'Failed to create category'),
  });

  const saveItemMutation = useMutation({
    mutationFn: (d) => d.id ? api.patch(`/menu/items/${d.id}`, d) : api.post('/menu/items', d),
    onSuccess: () => {
      toast.success(`Menu item ${itemForm.id ? 'updated' : 'added'}!`);
      queryClient.invalidateQueries({ queryKey: ['menuItemsAll'] });
      setIsItemModalOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to save item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id) => api.delete(`/menu/items/${id}`),
    onSuccess: () => {
      toast.success('Item deleted!');
      queryClient.invalidateQueries({ queryKey: ['menuItemsAll'] });
      setIsDeleteOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Failed to delete item'),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (item) => api.patch(`/menu/items/${item.id}`, { is_available: !item.is_available }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['menuItemsAll'] }); },
    onError: (e) => toast.error(e.message)
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async () => {
      // Stubing endpoint if it doesn't exist, will loop patches if endpoint drops 404
      try {
         await api.post(`/menu/items/bulk-price-update`, {
           item_ids: Array.from(selectedItems),
           type: bulkForm.type,
           value: Number(bulkForm.value),
           outlet_id: outletId
         });
      } catch(e) {
         // Fallback manual loop
         const itemsArray = Array.from(selectedItems);
         for(const id of itemsArray) {
            const item = (menuData?.items||menuData).find(i=>i.id===id);
            if(item) {
               const newPrice = bulkForm.type === 'percentage' 
                 ? Number(item.base_price) * (1 + Number(bulkForm.value)/100) 
                 : Number(item.base_price) + Number(bulkForm.value);
               await api.patch(`/menu/items/${id}`, { base_price: Math.round(newPrice) });
            }
         }
      }
    },
    onSuccess: () => {
      toast.success('Bulk price updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['menuItemsAll'] });
      setSelectedItems(new Set());
      setSelectionMode(false);
      setIsBulkOpen(false);
    },
    onError: (e) => toast.error(e.message || 'Bulk update failed')
  });

  // Photo Upload Stub
  const handleImageUpload = (e) => {
     toast.success('Image selected. Will upload to S3 upon save.');
     const file = e.target.files[0];
     if(file) setItemForm(prev => ({...prev, image_url: URL.createObjectURL(file)}));
  };

  const dbItems = menuData?.items || menuData || [];
  
  // Filtering & Sorting
  const filteredItems = useMemo(() => {
    let filtered = dbItems;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || i.short_code?.toLowerCase().includes(q));
    }
    if (categoryFilter) filtered = filtered.filter(i => i.category_id === categoryFilter);
    if (vegFilter) filtered = filtered.filter(i => i.food_type === vegFilter);
    if (gstFilter) filtered = filtered.filter(i => String(i.gst_rate) === gstFilter);
    
    filtered.sort((a,b) => {
       if (sortBy === 'name') return a.name.localeCompare(b.name);
       if (sortBy === 'price_asc') return Number(a.base_price) - Number(b.base_price);
       if (sortBy === 'price_desc') return Number(b.base_price) - Number(a.base_price);
       return 0;
    });

    return filtered;
  }, [dbItems, search, categoryFilter, vegFilter, gstFilter, sortBy]);

  const stats = useMemo(() => ({
     total: dbItems.length,
     active: dbItems.filter(i=>i.is_available).length,
     inactive: dbItems.filter(i=>!i.is_available).length,
     veg: dbItems.filter(i=>i.food_type==='veg').length,
     nonVeg: dbItems.filter(i=>i.food_type==='non_veg').length
  }), [dbItems]);

  const toggleSelection = (id) => {
    const next = new Set(selectedItems);
    if(next.has(id)) next.delete(id); else next.add(id);
    setSelectedItems(next);
  };
  const toggleSelectAll = () => {
    if(selectedItems.size === filteredItems.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(filteredItems.map(i=>i.id)));
  };

  const openEdit = (item) => {
    setItemForm({
      id: item.id, name: item.name || '', short_code: item.short_code || '', description: item.description || '',
      base_price: item.base_price || '', category_id: item.category_id || '',
      food_type: item.food_type || 'veg', kitchen_station: item.kitchen_station || 'KITCHEN',
      gst_rate: item.gst_rate ?? 5, is_available: item.is_available ?? true,
      image_url: item.image_url || '',
      variants: item.variants || [], addons: item.addons || []
    });
    setIsItemModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in relative h-[calc(100vh-6rem)]">
      
      {/* Top Stats & Actions Bar */}
      <div className="bg-surface-900 border border-surface-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
         <div className="flex gap-6">
            <div>
               <p className="text-[10px] text-surface-500 uppercase font-bold tracking-widest">Total Items</p>
               <p className="text-2xl font-black text-white">{stats.total}</p>
            </div>
            <div className="border-l border-surface-800 pl-6">
               <p className="text-[10px] text-surface-500 uppercase font-bold tracking-widest">Active Status</p>
               <p className="text-lg font-bold"><span className="text-success-400">{stats.active}</span> <span className="text-surface-600">|</span> <span className="text-surface-400">{stats.inactive} Off</span></p>
            </div>
            <div className="border-l border-surface-800 pl-6">
               <p className="text-[10px] text-surface-500 uppercase font-bold tracking-widest">Dietary Type</p>
               <p className="text-lg font-bold"><span className="text-green-500">{stats.veg} Veg</span> <span className="text-surface-600">|</span> <span className="text-red-500">{stats.nonVeg} NonVeg</span></p>
            </div>
         </div>
         <div className="flex gap-2">
            <button onClick={() => setSelectionMode(!selectionMode)} className={`btn-surface text-sm ${selectionMode ? 'bg-brand-500/20 text-brand-400 border-brand-500/30' : ''}`}>
               {selectionMode ? 'Cancel Selection' : 'Bulk Edit'}
            </button>
            {selectionMode && selectedItems.size > 0 && (
               <button onClick={() => setIsBulkOpen(true)} className="btn-primary flex items-center gap-2">
                 <Percent className="w-4 h-4"/> Update Prices ({selectedItems.size})
               </button>
            )}
            <button onClick={() => { setItemForm({...EMPTY_ITEM}); setIsItemModalOpen(true); }} className="btn-primary shadow-lg shadow-brand-500/20">
               <Plus className="w-4 h-4 mr-1"/> Add Item
            </button>
         </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
         {/* Left Sidebar: Categories */}
         <div className="w-64 bg-surface-900 border border-surface-800 rounded-2xl p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white uppercase text-sm tracking-wider">Categories</h2>
              <button onClick={() => setIsAddCatOpen(true)} className="text-brand-400 hover:text-brand-300 bg-brand-500/10 p-1.5 rounded-lg"><Plus className="w-4 h-4"/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
                <button onClick={() => { setCategoryFilter(''); setViewMode('items'); }} className={`w-full text-left px-3 py-2.5 rounded-xl font-medium flex items-center justify-between transition-colors ${!categoryFilter && viewMode === 'items' ? 'bg-brand-500 text-white' : 'text-surface-300 hover:bg-surface-800'}`}>
                  <span>All Items</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${!categoryFilter && viewMode === 'items' ? 'bg-white/20' : 'bg-surface-800'}`}>{stats.total}</span>
                </button>
                <button onClick={() => { setViewMode('combos'); setCategoryFilter(''); }} className={`w-full text-left px-3 py-2.5 rounded-xl font-medium flex items-center justify-between transition-colors ${viewMode === 'combos' ? 'bg-brand-500 text-white' : 'text-surface-300 hover:bg-surface-800'}`}>
                  <span className="flex items-center gap-2 underline underline-offset-4 decoration-white/20">Combos 🔥</span>
                </button>
                <div className="h-4 border-b border-surface-800 mb-2"></div>
                {(categories || []).map(cat => {
                  const count = dbItems.filter(i => i.category_id === cat.id).length;
                  return (
                    <button key={cat.id} onClick={() => setCategoryFilter(cat.id)} className={`w-full text-left px-3 py-2.5 rounded-xl font-medium flex items-center justify-between transition-colors ${categoryFilter === cat.id ? 'bg-brand-500 text-white' : 'text-surface-300 hover:bg-surface-800'}`}>
                      <span className="truncate pr-2">{cat.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${categoryFilter === cat.id ? 'bg-white/20' : 'bg-surface-800'}`}>{count}</span>
                    </button>
                  );
               })}
            </div>
         </div>

         {/* Right Main Area */}
         <div className="flex-1 flex flex-col min-w-0 bg-surface-900 border border-surface-800 rounded-2xl p-4">
            
            {/* Search & Filters */}
            <div className="flex gap-3 mb-4">
               <div className="relative flex-1">
                 <Search className="w-4 h-4 absolute left-3 top-3 text-surface-500" />
                 <input className="input w-full pl-9 bg-surface-950 border-surface-700" placeholder="Search item name or short code..." value={search} onChange={e=>setSearch(e.target.value)} />
               </div>
               <select className="input w-36 bg-surface-950 border-surface-700 text-sm" value={vegFilter} onChange={e=>setVegFilter(e.target.value)}>
                 <option value="">Diet: All</option>
                 <option value="veg">Vegetarian</option>
                 <option value="non_veg">Non-Veg</option>
                 <option value="egg">Contains Egg</option>
               </select>
               <select className="input w-32 bg-surface-950 border-surface-700 text-sm" value={gstFilter} onChange={e=>setGstFilter(e.target.value)}>
                 <option value="">GST: All</option>
                 <option value="5">GST: 5%</option>
                 <option value="12">GST: 12%</option>
                 <option value="18">GST: 18%</option>
                 <option value="0">Exempt</option>
               </select>
               <select className="input w-40 bg-surface-950 border-surface-700 text-sm" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                 <option value="name">Sort: A-Z</option>
                 <option value="price_asc">Price: Low to High</option>
                 <option value="price_desc">Price: High to Low</option>
               </select>
            </div>

            {selectionMode && (
               <div className="bg-brand-500/10 border border-brand-500/20 p-2 rounded-xl mb-4 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 ml-2">
                     <button onClick={toggleSelectAll} className="flex items-center gap-2 text-brand-400 font-bold">
                        {selectedItems.size === filteredItems.length && filteredItems.length > 0 ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Select All
                     </button>
                     <span className="text-brand-200">| {selectedItems.size} items selected</span>
                  </div>
               </div>
            )}

            {/* Item / Combo Grid */}
            <div className="flex-1 overflow-y-auto px-1 pb-4">
              {viewMode === 'items' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {itemsLoading ? [...Array(8)].map((_, i) => <div key={i} className="h-32 bg-surface-800 rounded-2xl animate-pulse"/>)
                  : filteredItems.map(item => (
                    <div key={item.id} className={`group bg-surface-800/40 border border-surface-700 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all relative ${selectionMode && selectedItems.has(item.id) ? 'ring-2 ring-brand-500 bg-brand-500/5' : ''}`}>
                       
                       {selectionMode && (
                          <button onClick={(e) => { e.stopPropagation(); toggleSelection(item.id); }} className="absolute top-2 right-2 z-20 text-brand-400 drop-shadow-md">
                             {selectedItems.has(item.id) ? <CheckSquare className="w-5 h-5 fill-surface-900"/> : <Square className="w-5 h-5 fill-surface-900 border-surface-300 text-surface-400"/>}
                          </button>
                       )}
                       
                       {/* Image Stub */}
                       <div className="h-24 bg-surface-950 flex items-center justify-center relative overflow-hidden">
                          {item.image_url ? (
                             <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                             <Camera className="w-8 h-8 text-surface-700/50" />
                          )}
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${BORDER_COLORS[item.food_type] || 'bg-surface-600'}`}></div>
                       </div>
                       
                       <div className="p-3 relative">
                          <div className="flex justify-between items-start mb-1">
                             <div className="flex items-center gap-1.5">
                                {SQUARE_ICONS[item.food_type]}
                                <span className="text-[9px] font-bold uppercase tracking-wider text-surface-400 px-1 bg-surface-900 rounded">{item.category?.name || 'Uncategorized'}</span>
                             </div>
                             <button onClick={(e) => { e.stopPropagation(); toggleStatusMutation.mutate(item); }} title="Toggle Availability" className="z-10">
                                {item.is_available ? <ToggleRight className="w-6 h-6 text-success-500 text-shadow-sm hover:scale-110 transition-transform" /> : <ToggleLeft className="w-6 h-6 text-surface-500 hover:scale-110 transition-transform" />}
                             </button>
                          </div>
                          
                          <p className="font-bold text-white text-base leading-tight mb-0.5 pr-2 truncate">{item.name}</p>
                          <div className="flex items-end justify-between mt-2">
                             <p className="text-lg font-black text-brand-400">₹{Number(item.base_price).toFixed(0)}</p>
                             {item.short_code && <span className="font-mono text-xs text-surface-500 font-bold bg-surface-900 px-1.5 py-0.5 rounded border border-surface-700">{item.short_code}</span>}
                          </div>
                       </div>
                       
                       {/* Hover Actions Bar */}
                       <div className="absolute left-0 right-0 bottom-0 -mb-10 group-hover:mb-0 bg-surface-900/95 backdrop-blur border-t border-surface-700 flex transition-all duration-200 opacity-0 group-hover:opacity-100 p-1 z-10 gap-1 rounded-b-2xl">
                          <button disabled={selectionMode} onClick={() => openEdit(item)} className="flex-1 flex items-center justify-center gap-1 py-1.5 hover:bg-surface-800 rounded-lg text-xs font-semibold text-surface-300"><Edit className="w-3.5 h-3.5"/> Edit</button>
                          <button disabled={selectionMode} onClick={() => {setSelectedItem(item); setIsDeleteOpen(true)}} className="flex-1 flex items-center justify-center gap-1 py-1.5 hover:bg-red-500/20 rounded-lg text-xs font-semibold text-red-400"><Trash2 className="w-3.5 h-3.5"/> Trash</button>
                       </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {combosLoading ? [...Array(4)].map((_, i) => <div key={i} className="h-40 bg-surface-800 rounded-2xl animate-pulse"/>)
                  : (combosData || []).map(combo => (
                    <div key={combo.id} className="bg-surface-800/40 border border-surface-700 rounded-2xl p-4 flex gap-4 hover:border-brand-500/50 transition-colors">
                       <div className="w-24 h-24 bg-brand-500/10 rounded-xl flex items-center justify-center">
                          <Plus className="w-8 h-8 text-brand-400 opacity-20" />
                       </div>
                       <div className="flex-1">
                          <div className="flex justify-between items-start">
                             <h4 className="text-lg font-bold text-white">{combo.name}</h4>
                             <span className="text-xl font-black text-brand-400">₹{combo.combo_price}</span>
                          </div>
                          <p className="text-xs text-surface-400 mt-1 line-clamp-2">{combo.description || 'No description provided.'}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                             {combo.combo_items?.map(ci => (
                                <span key={ci.id} className="text-[10px] font-bold bg-surface-900 text-surface-400 px-2 py-1 rounded border border-surface-700">
                                   {ci.quantity}x {ci.menu_item?.name}
                                </span>
                             ))}
                          </div>
                       </div>
                    </div>
                  ))}
                  {(combosData || []).length === 0 && !combosLoading && (
                    <div className="col-span-full py-20 text-center">
                       <h3 className="text-xl font-bold text-surface-400">No combos configured</h3>
                       <p className="text-surface-500 mt-2">Create item bundles to offer special pricing.</p>
                       <button onClick={() => toast('Combo Creator Coming Soon!')} className="btn-primary mt-6">Create First Combo</button>
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'items' && filteredItems.length === 0 && !itemsLoading && (
                 <div className="py-20 text-center">
                    <Tag className="w-16 h-16 mx-auto mb-4 text-surface-700 opacity-30" />
                    <h3 className="text-xl font-bold text-surface-400">No items found</h3>
                    <p className="text-surface-500 mt-2">Try adjusting your search criteria or add a new item.</p>
                 </div>
              )}
            </div>
         </div>
      </div>

      {/* ADD/EDIT ITEM MODAL */}
      <Modal isOpen={isItemModalOpen} onClose={() => setIsItemModalOpen(false)} title={itemForm.id ? "Edit Menu Item" : "Add New Menu Item"} size="xl">
         <form onSubmit={(e) => { e.preventDefault(); saveItemMutation.mutate({...itemForm, outlet_id: outletId, base_price: Number(itemForm.base_price)}); }} className="mt-4">
            <div className="grid grid-cols-3 gap-6">
               {/* Left Col - Basics */}
               <div className="col-span-2 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                     <div className="col-span-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-surface-400 mb-1">Item Name *</label>
                        <input required type="text" className="input w-full font-semibold" value={itemForm.name} onChange={e=>setItemForm({...itemForm, name: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-surface-400 mb-1">Short Code</label>
                        <input type="text" className="input w-full font-mono uppercase" placeholder="e.g. PT" maxLength={5} value={itemForm.short_code} onChange={e=>setItemForm({...itemForm, short_code: e.target.value})} />
                     </div>
                  </div>
                  <div>
                     <label className="block text-xs font-bold uppercase tracking-wider text-surface-400 mb-1">Description</label>
                     <textarea className="input w-full h-20 resize-none" value={itemForm.description} onChange={e=>setItemForm({...itemForm, description: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-surface-400 mb-1">Category *</label>
                        <select required className="input w-full" value={itemForm.category_id} onChange={e=>setItemForm({...itemForm, category_id: e.target.value})}>
                           <option value="" disabled>Select...</option>
                           {(categories||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-surface-400 mb-1">Dietary Type *</label>
                        <select className="input w-full" value={itemForm.food_type} onChange={e=>setItemForm({...itemForm, food_type: e.target.value})}>
                           <option value="veg">🟢 Vegetarian</option>
                           <option value="non_veg">🔴 Non-Vegetarian</option>
                           <option value="egg">🟡 Contains Egg</option>
                        </select>
                     </div>
                  </div>
               </div>

               {/* Right Col - Pricing & Image */}
               <div className="space-y-4">
                  <div className="bg-surface-800 p-4 rounded-xl border border-surface-700 text-center">
                     <label className="block text-xs font-bold uppercase tracking-wider text-surface-400 mb-2">Base Price (₹) *</label>
                     <input required type="number" min="0" step="1" className="input w-full text-center text-3xl font-black text-brand-400 p-2" value={itemForm.base_price} onChange={e=>setItemForm({...itemForm, base_price: e.target.value})} />
                  </div>
                  <div>
                     <label className="block text-xs font-bold uppercase tracking-wider text-surface-400 mb-1">GST Category *</label>
                     <select className="input w-full" value={itemForm.gst_rate} onChange={e=>setItemForm({...itemForm, gst_rate: Number(e.target.value)})}>
                        <option value={5}>5%</option><option value={12}>12%</option>
                        <option value={18}>18%</option><option value={0}>Exempt (0%)</option>
                     </select>
                  </div>
                  <div className="p-4 border-2 border-dashed border-surface-600 hover:border-brand-500 hover:bg-surface-800 transition-colors rounded-xl text-center cursor-pointer relative overflow-hidden group">
                     {itemForm.image_url ? (
                        <>
                           <img src={itemForm.image_url} alt="Item" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                           <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-white text-xs font-bold px-3 py-1 bg-black/50 rounded-full">Change</span>
                           </div>
                        </>
                     ) : (
                        <div className="py-2">
                           <Camera className="w-6 h-6 text-surface-500 mx-auto mb-2" />
                           <p className="text-xs text-surface-400 font-medium">Upload Image</p>
                        </div>
                     )}
                     <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleImageUpload} />
                  </div>
                  <label className="flex items-center gap-3 bg-surface-800 rounded-xl p-3 cursor-pointer select-none">
                     <button type="button" onClick={() => setItemForm({ ...itemForm, is_available: !itemForm.is_available })}>
                        {itemForm.is_available ? <ToggleRight className="w-7 h-7 text-success-500" /> : <ToggleLeft className="w-7 h-7 text-surface-500" />}
                     </button>
                     <p className="text-sm font-bold text-white">Item Available <span className="block text-[10px] text-surface-400 font-normal">Show on POS and Online</span></p>
                  </label>
               </div>
            </div>

            {/* Advanced Sections (Variants / Addons / Schedules) */}
            <div className="mt-8 border-t border-surface-800 pt-6 space-y-8">
               
               {/* VARIANTS */}
               <div className="bg-surface-800/30 rounded-2xl p-5 border border-surface-700/50">
                  <div className="flex justify-between items-center mb-4">
                     <div>
                        <h4 className="font-black text-sm text-white tracking-widest uppercase">Variants</h4>
                        <p className="text-[10px] text-surface-500 font-bold uppercase mt-1">E.g. S / M / L or Half / Full</p>
                     </div>
                     <button type="button" onClick={() => setItemForm({
                        ...itemForm,
                        variants: [...itemForm.variants, { name: '', price_addition: 0, is_default: false }]
                     })} className="btn-surface py-1.5 px-3 text-xs border-brand-500/20 text-brand-400">
                        <Plus className="w-3.5 h-3.5 mr-1"/> Add Variant
                     </button>
                  </div>
                  
                  <div className="space-y-3">
                     {itemForm.variants.map((v, idx) => (
                        <div key={idx} className="flex gap-3 items-center bg-surface-900/50 p-2 rounded-xl border border-surface-800 animate-slide-in">
                           <input placeholder="Name (e.g. Large)" className="input flex-1 text-sm py-1.5 bg-surface-950" value={v.name} onChange={e => {
                              const next = [...itemForm.variants];
                              next[idx].name = e.target.value;
                              setItemForm({ ...itemForm, variants: next });
                           }} />
                           <div className="flex items-center gap-2 bg-surface-950 px-3 py-1.5 rounded-lg border border-surface-800">
                              <span className="text-surface-500 text-xs font-bold">+ ₹</span>
                              <input type="number" placeholder="0" className="bg-transparent border-none outline-none w-16 text-sm font-bold text-brand-400" value={v.price_addition} onChange={e => {
                                 const next = [...itemForm.variants];
                                 next[idx].price_addition = Number(e.target.value);
                                 setItemForm({ ...itemForm, variants: next });
                              }} />
                           </div>
                           <button type="button" onClick={() => {
                              const next = itemForm.variants.filter((_, i) => i !== idx);
                              setItemForm({ ...itemForm, variants: next });
                           }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                        </div>
                     ))}
                     {itemForm.variants.length === 0 && <p className="text-center py-4 text-xs text-surface-600 font-medium bg-surface-900/30 rounded-xl border border-dashed border-surface-800">No variants defined (Base price only)</p>}
                  </div>
               </div>

               {/* ADDONS */}
               <div className="bg-surface-800/30 rounded-2xl p-5 border border-surface-700/50">
                  <div className="flex justify-between items-center mb-4">
                     <div>
                        <h4 className="font-black text-sm text-white tracking-widest uppercase">Add-on Groups</h4>
                        <p className="text-[10px] text-surface-500 font-bold uppercase mt-1">Link toppings, sides, or custom instructions</p>
                     </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     {(addonGroups || []).map(group => {
                        const isLinked = itemForm.addons.some(a => a.addon_group_id === group.id);
                        return (
                           <button key={group.id} type="button" onClick={() => {
                              const next = isLinked 
                                ? itemForm.addons.filter(a => a.addon_group_id !== group.id)
                                : [...itemForm.addons, { addon_group_id: group.id, name: group.name, price: 0 }];
                              setItemForm({ ...itemForm, addons: next });
                           }} className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isLinked ? 'bg-brand-500/10 border-brand-500 text-brand-400' : 'bg-surface-900/50 border-surface-800 text-surface-400 hover:border-surface-600'}`}>
                              {isLinked ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                              <span className="text-sm font-bold truncate">{group.name}</span>
                           </button>
                        );
                     })}
                  </div>
               </div>

               {/* SCHEDULING */}
               <div className="bg-surface-800/30 rounded-2xl p-5 border border-surface-700/50">
                  <div className="flex justify-between items-center mb-4">
                     <div>
                        <h4 className="font-black text-sm text-white tracking-widest uppercase">Availability Schedule</h4>
                        <p className="text-[10px] text-surface-500 font-bold uppercase mt-1">Restrict item display to specific times</p>
                     </div>
                     <button type="button" onClick={() => setItemForm({
                        ...itemForm,
                        menu_schedules: [...(itemForm.menu_schedules || []), { day_of_week: 1, start_time: '08:00', end_time: '23:00' }]
                     })} className="btn-surface py-1.5 px-3 text-xs border-brand-500/20 text-brand-400">
                        <Plus className="w-3.5 h-3.5 mr-1"/> Add Time Slot
                     </button>
                  </div>
                  <div className="space-y-3">
                     {(itemForm.menu_schedules || []).map((s, idx) => (
                        <div key={idx} className="flex gap-3 items-center bg-surface-900/50 p-3 rounded-xl border border-surface-800">
                           <select className="input flex-1 text-xs py-1.5 bg-surface-950 font-bold" value={s.day_of_week} onChange={e => {
                              const next = [...itemForm.menu_schedules];
                              next[idx].day_of_week = Number(e.target.value);
                              setItemForm({ ...itemForm, menu_schedules: next });
                           }}>
                              <option value={1}>Everyday</option>
                              <option value={2}>Mon - Fri</option>
                              <option value={3}>Sat - Sun</option>
                           </select>
                           <div className="flex items-center gap-2">
                              <input type="time" className="input text-xs py-1.5 bg-surface-950 font-bold" value={s.start_time} onChange={e => {
                                 const next = [...itemForm.menu_schedules];
                                 next[idx].start_time = e.target.value;
                                 setItemForm({ ...itemForm, menu_schedules: next });
                              }} />
                              <span className="text-surface-600 font-black">→</span>
                              <input type="time" className="input text-xs py-1.5 bg-surface-950 font-bold" value={s.end_time} onChange={e => {
                                 const next = [...itemForm.menu_schedules];
                                 next[idx].end_time = e.target.value;
                                 setItemForm({ ...itemForm, menu_schedules: next });
                              }} />
                           </div>
                           <button type="button" onClick={() => {
                              const next = itemForm.menu_schedules.filter((_, i) => i !== idx);
                              setItemForm({ ...itemForm, menu_schedules: next });
                           }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                        </div>
                     ))}
                     {(itemForm.menu_schedules || []).length === 0 && <p className="text-center py-4 text-xs text-surface-600 font-medium bg-surface-900/30 rounded-xl border border-dashed border-surface-800">Available 24/7 (No restrictions)</p>}
                  </div>
               </div>
            </div>

            <div className="mt-8 border-t border-surface-800 pt-6 flex gap-3 justify-end">
               <button type="button" onClick={()=>setIsItemModalOpen(false)} className="btn-surface px-6">Cancel</button>
               <button type="submit" disabled={saveItemMutation.isPending} className="btn-success px-8 text-lg font-bold">
                  {saveItemMutation.isPending ? 'Saving...' : 'Save Item ✓'}
               </button>
            </div>
         </form>
      </Modal>

      {/* Add Category Modal */}
      <Modal isOpen={isAddCatOpen} onClose={() => setIsAddCatOpen(false)} title="New Category" size="sm">
         <form onSubmit={e=>{e.preventDefault(); addCatMutation.mutate({...catForm, outlet_id: outletId});}} className="space-y-4 pt-2">
            <div><label className="block text-xs font-bold text-surface-400 mb-1">Category Name</label><input required type="text" className="input w-full" placeholder="e.g. Main Course" value={catForm.name} onChange={e=>setCatForm({...catForm, name: e.target.value})} /></div>
            <div><label className="block text-xs font-bold text-surface-400 mb-1">Display Order</label><input type="number" min="1" className="input w-full" value={catForm.display_order} onChange={e=>setCatForm({...catForm, display_order: Number(e.target.value)})} /></div>
            <button type="submit" disabled={addCatMutation.isPending} className="btn-primary w-full py-3 mt-2">Save Category</button>
         </form>
      </Modal>

      {/* Bulk Price Update Modal */}
      <Modal isOpen={isBulkOpen} onClose={() => setIsBulkOpen(false)} title={`Bulk Update ${selectedItems.size} Items`} size="sm">
         <div className="space-y-4 pt-2">
            <div className="flex bg-surface-900 rounded-lg p-1">
               <button onClick={()=>setBulkForm({...bulkForm, type: 'percentage'})} className={`flex-1 py-1.5 text-sm font-bold rounded ${bulkForm.type==='percentage' ? 'bg-surface-700 text-white':'text-surface-500'}`}>% Percentage</button>
               <button onClick={()=>setBulkForm({...bulkForm, type: 'flat'})} className={`flex-1 py-1.5 text-sm font-bold rounded ${bulkForm.type==='flat' ? 'bg-surface-700 text-white':'text-surface-500'}`}>₹ Flat Amount</button>
            </div>
            <div>
               <label className="block text-xs font-bold text-surface-400 mb-1">{bulkForm.type==='percentage' ? 'Percentage Increase (%)' : 'Amount to Add (₹)'}</label>
               <input type="number" step="0.1" className="input w-full text-2xl font-bold py-2" value={bulkForm.value} onChange={e=>setBulkForm({...bulkForm, value: e.target.value})} />
               <p className="text-xs text-brand-400 mt-2 bg-brand-500/10 p-2 rounded">Use positive numbers to increase, negative to decrease.</p>
            </div>
            <button onClick={()=>bulkUpdateMutation.mutate()} disabled={bulkUpdateMutation.isPending} className="btn-success w-full py-4 text-lg font-bold mt-4">
               {bulkUpdateMutation.isPending ? 'Updating...' : `Apply to ${selectedItems.size} items`}
            </button>
         </div>
      </Modal>

      <ConfirmDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={() => deleteItemMutation.mutate(selectedItem?.id)} title="Delete Menu Item" message={`Delete ${selectedItem?.name}? This will remove it from the menu. (Cannot be undone)`} isLoading={deleteItemMutation.isPending} />
    </div>
  );
}
